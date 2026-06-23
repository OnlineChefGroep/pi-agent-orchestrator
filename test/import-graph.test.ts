/**
 * Regression guard: zero cycles allowed in the src/ import graph.
 *
 * Background: a `madge --circular` audit on 2026-06 surfaced exactly one circle —
 *
 *     agent-types.ts  ↔  context-mode-bridge.ts
 *
 * — closed by extracting the `CTX_TOOL_NAMES` constant into the new
 * `src/ctx-tool-names.ts` module so neither file imports from the other
 * any more. This test locks the rest of the tree against the same regression
 * by re-invoking `madge` (via the CLI so we don't pull `madge` in as a
 * devDep just for this guard) and asserting the right invariants.
 *
 * Implementation note: we shell out to `npx --yes madge` rather than
 * `import madge from "madge"` so:
 *
 *   1. No new devDep entry in `package.json`; the CLI download is cached
 *      by npx after the first run and stays fast in CI.
 *   2. We never have to learn/track the programmatic API shape (methods vs
 *      properties churned across madge majors; CLI `--json` is stable).
 *   3. Failure output matches exactly what the developer sees with
 *      `npx madge --circular`, so the test failure IS the actionable error.
 *
 * madge CLI shape (verified live):
 *   `npx madge --circular  --json src/`  → top-level cycles ARRAY (`[]` when DAG)
 *   `npx madge              --json src/` → top-level deps MAP keyed by BARE
 *                                         filenames relative to the root you
 *                                         pass — so passing `src/` yields keys
 *                                         like `agent-manager.ts`, NOT
 *                                         `src/agent-manager.ts`. Values are
 *                                         also bare filenames.
 *
 * Because the two output shapes are different, we need two invocations and
 * cache them via beforeAll. npx cold-start + two madge parses can exceed the
 * default 10s hook timeout; the explicit 60s timeout gives enough headroom
 * for a fresh cache.
 */

import { execFileSync } from "node:child_process";
/** Cycles list (path is `src/a.ts → src/b.ts → ... → src/a.ts`). One call: `--circular --json`. */
import { platform } from "node:os";
import { beforeAll, describe, expect, it } from "vitest";

function runMadgeCycles(): readonly (readonly string[])[] {
  const stdout = execFileSync(
    "npx",
    ["--yes", "madge", "--circular", "--extensions", "ts", "--json", "src/"],
    { encoding: "utf8", shell: platform() === "win32" },
  );
  return JSON.parse(stdout) as readonly (readonly string[])[];
}

/** Deps map keyed by BARE filenames within src/. One call: `--json` only. */
function runMadgeDeps(): Readonly<Record<string, readonly string[]>> {
  const stdout = execFileSync(
    "npx",
    ["--yes", "madge", "--extensions", "ts", "--json", "src/"],
    { encoding: "utf8", shell: platform() === "win32" },
  );
  return JSON.parse(stdout) as Readonly<Record<string, readonly string[]>>;
}

describe("src/ import graph", () => {
  let cycles: readonly (readonly string[])[];
  let deps: Readonly<Record<string, readonly string[]>>;

  // Module-level initialization of shared state. Runs once per test file
  // load — equivalent to a beforeAll, but expressed at the closure level so
  // the three tests below reference `cycles` / `deps` directly. If either
  // madge call fails (npx fetch error, tsconfig parse error), vitest surfaces
  // it as a setup error for this file rather than per-test failures.
  //
  // 60s hook timeout: npx cold-start of `madge` plus two madge invocations
  // (each parses the full src/ tree) can take 15-30s on a fresh CI runner.
  beforeAll(
    () => {
      cycles = runMadgeCycles();
      deps = runMadgeDeps();
    },
    60_000,
  );

  it(
    "has no circular imports (regression guard for agent-types ↔ context-mode-bridge cycle)",
    () => {
      if (cycles.length > 0) {
        const formatted = cycles
          .map((cycle) => `  ${cycle.join(" → ")} → ${cycle[0] ?? ""}`)
          .join("\n");
        throw new Error(
          `Circular imports detected in src/:\n${formatted}\n` +
            `Fix: extract the shared dependency into a third, dependency-free module ` +
            `(see src/ctx-tool-names.ts for the previous fix).`,
        );
      }
      expect(cycles).toEqual([]);
    },
    60_000,
  );

  it(
    "agent-types.ts no longer imports from context-mode-bridge.ts in the wrong direction — the historical cycle edge is closed",
    () => {
      // The two historical cycle edges:
      //   1. agent-types.ts → context-mode-bridge.ts (still allowed — it's the
      //      one-way runtime check for `isContextModeAvailable`)
      //   2. context-mode-bridge.ts → agent-types.ts (REMOVED by extracting
      //      CTX_TOOL_NAMES to src/ctx-tool-names.ts)
      //
      // Edge #2 must stay gone forever. Edge #1 is fine and expected, but we
      // also assert it is still present so future cleanup that accidentally
      // removes the runtime check surfaces too.
      //
      // LOOKUP-KEY SHAPE: madge's --json (no --circular) emits keys as BARE
      // filenames within the root you pass, so passing `src/` yields
      // `"context-mode-bridge.ts"` — NOT `"src/context-mode-bridge.ts"`.
      // Values are also bare filenames.

      const bridgeDeps = deps["context-mode-bridge.ts"] ?? [];
      const agentTypesDeps = deps["agent-types.ts"] ?? [];

      expect(bridgeDeps.includes("agent-types.ts")).toBe(false);
      expect(agentTypesDeps.includes("context-mode-bridge.ts")).toBe(true);
    },
    60_000,
  );

  it(
    "ctx-tool-names.ts exists and is dependency-free (canonical leaf for CTX_TOOL_NAMES)",
    () => {
      // ctx-tool-names.ts is the canonical leaf for CTX_TOOL_NAMES — it must
      // stay runtime-isolated so the agent-types ↔ context-mode-bridge cycle
      // never reappears. Asserting the deps array is empty is sufficient: the
      // leaf currently has ZERO imports, so any non-empty result would mean
      // someone added one (local OR external — madge emits both). The leaf
      // genuinely cannot import from agent-types.ts or context-mode-bridge.ts
      // without re-introducing the cycle — that's the property the empty-array
      // assertion actually guards against.
      const ctxToolNameDeps = deps["ctx-tool-names.ts"] ?? [];
      expect(ctxToolNameDeps).toEqual([]);
    },
    60_000,
  );
});
