# Pi TypeScript Implementation Patterns

Use these patterns as templates, then align names and imports with the target repository and installed Pi version.

## 1. Thin extension shell

Keep registration in the extension entry point and move domain logic into testable modules.

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createStatusTool } from "./tools/status.js";
import { createRuntimeState } from "./runtime-state.js";

export default function registerExtension(pi: ExtensionAPI): void {
  const state = createRuntimeState();

  pi.registerTool(createStatusTool({ pi, state }));

  pi.on("session_shutdown", async () => {
    await state.dispose();
  });
}
```

Prefer this over a large entry file that owns persistence, orchestration, rendering, and business logic.

## 2. Version-aligned TypeBox import

Use exactly one TypeBox family based on the installed Pi host ABI. Agent Orchestra pins `@sinclair/typebox` (see `package.json`); match that unless you are deliberately migrating.

```ts
// Agent Orchestra and other @sinclair/typebox pins:
import { Type } from "@sinclair/typebox";

// Newer Pi releases after the TypeBox 1.x migration may instead use:
// import { Type } from "typebox";
```

A TypeBox migration changes runtime schema objects, package metadata, lockfiles, tests, and provider validation behavior. Treat it as a compatibility change, not a cleanup edit.

## 3. Tool with cancellation, progress, and bounded output

```ts
import {
  defineTool,
  truncateTail,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export const inspectLogsTool = defineTool({
  name: "inspect_logs",
  label: "Inspect Logs",
  description:
    "Inspect recent service logs. Returns bounded tail output and reports when content was truncated.",
  parameters: Type.Object({
    service: Type.String({ description: "Service identifier." }),
    lines: Type.Optional(
      Type.Integer({ minimum: 1, maximum: 5_000, description: "Requested tail length." }),
    ),
  }),
  async execute(_toolCallId, params, signal, onUpdate, _ctx) {
    if (signal?.aborted) {
      return {
        content: [{ type: "text", text: "Log inspection cancelled before execution." }],
        details: { cancelled: true },
      };
    }

    onUpdate?.({
      content: [{ type: "text", text: `Reading ${params.service} logs...` }],
      details: { phase: "read" },
    });

    const raw = await readServiceLogs(params.service, params.lines ?? 500, signal);
    const truncated = truncateTail(raw, {
      maxBytes: DEFAULT_MAX_BYTES,
      maxLines: DEFAULT_MAX_LINES,
    });

    const suffix = truncated.truncated
      ? `\n\n[Output truncated to ${truncated.outputLines} lines.]`
      : "";

    return {
      content: [{ type: "text", text: truncated.content + suffix }],
      details: {
        service: params.service,
        truncated: truncated.truncated,
        totalLines: truncated.totalLines,
      },
    };
  },
});
```

The domain function `readServiceLogs` should accept the same abort signal and stop its subprocess or I/O operation when cancelled.

## 4. File mutation queue

```ts
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

async function updateConfig(cwd: string, relativePath: string): Promise<void> {
  const root = await realpath(cwd);
  const absolutePath = resolve(root, relativePath.replace(/^@/, ""));

  // Lexical gate: reject traversal (`../../.ssh/config`) and absolute escapes
  // before any target I/O.
  const lexical = relative(root, absolutePath);
  if (lexical.startsWith("..") || isAbsolute(lexical)) {
    throw new Error(`Refusing to mutate path outside project root: ${relativePath}`);
  }

  // Symlink hardening: resolve the real path (or nearest existing ancestor)
  // so a link under cwd cannot escape the project root.
  let resolvedTarget: string;
  try {
    resolvedTarget = await realpath(absolutePath);
  } catch {
    const parent = await realpath(dirname(absolutePath));
    resolvedTarget = resolve(parent, basename(absolutePath));
  }

  const contained = relative(root, resolvedTarget);
  if (contained.startsWith("..") || isAbsolute(contained)) {
    throw new Error(`Refusing to mutate path outside project root: ${relativePath}`);
  }

  await withFileMutationQueue(resolvedTarget, async () => {
    const current = await readFile(resolvedTarget, "utf8");
    const next = transformConfig(current);
    await writeFile(resolvedTarget, next, "utf8");
  });
}
```

Enforce project containment with both a lexical check and `realpath()` before mutating: the queue serializes writes but does not stop a symlink under `cwd` from escaping. Also do not read outside the queue and write inside it. Another tool could mutate the same file between those operations.

## 5. One session per delegated cwd

Agent Orchestra uses the delegated worktree cwd for settings and discovery.

```ts
import {
  createAgentSession,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

export async function createSubagentSession(
  effectiveCwd: string,
  agentDir: string,
): Promise<Awaited<ReturnType<typeof createAgentSession>>["session"]> {
  const sessionManager = SessionManager.inMemory(effectiveCwd);
  const settingsManager = SettingsManager.create(effectiveCwd, agentDir);

  const { session } = await createAgentSession({
    cwd: effectiveCwd,
    agentDir,
    sessionManager,
    settingsManager,
  });

  return session;
}
```

Do not create every subagent against the parent process cwd. That breaks worktree-local `.pi/settings.json`, context discovery, tools, and session semantics.

## 6. Steering and abort flow

```ts
import type { AgentSession } from "@earendil-works/pi-coding-agent";

export async function redirectRunningAgent(
  session: AgentSession,
  message: string,
  parentSignal: AbortSignal,
): Promise<void> {
  if (parentSignal.aborted) {
    await session.abort();
    return;
  }

  const abortChild = (): void => {
    void session.abort();
  };

  parentSignal.addEventListener("abort", abortChild, { once: true });
  try {
    await session.steer(message);
  } finally {
    parentSignal.removeEventListener("abort", abortChild);
  }
}
```

A steering request is not an immediate interruption of an active tool process unless that process itself observes cancellation. Model steering, tool cancellation, and process termination are separate responsibilities.

## 7. Runtime session replacement

```ts
let session = runtime.session;
let unsubscribe = session.subscribe(handleEvent);

await runtime.newSession();

unsubscribe();
session = runtime.session;
// bindExtensions takes ExtensionBindings, not the ExtensionRuntime object.
await session.bindExtensions({
  onError: (err) => reportExtensionError(err),
});
unsubscribe = session.subscribe(handleEvent);
```

Never retain captured session-bound objects after a runtime replacement. Re-read them from the runtime.

## 8. Parse config instead of trusting it

```ts
export function parseBooleanWithDefault(
  value: unknown,
  fallback: boolean,
): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}
```

This is essential for frontmatter and environment-derived values where booleans may arrive as strings.

For larger objects, parse once into a trusted domain type:

```ts
interface ParsedSchedule {
  enabled: boolean;
  expression: string;
}

export function parseSchedule(input: unknown): ParsedSchedule {
  if (!input || typeof input !== "object") {
    throw new Error("Schedule must be an object.");
  }

  const candidate = input as Record<string, unknown>;
  if (typeof candidate.expression !== "string" || candidate.expression.length === 0) {
    throw new Error("Schedule expression is required.");
  }

  return {
    enabled: parseBooleanWithDefault(candidate.enabled, true),
    expression: candidate.expression,
  };
}
```

## 9. Typed fixture factory

```ts
export function makeAgentRecord(
  overrides: Partial<AgentRecord> = {},
): AgentRecord {
  return {
    id: "agent-test",
    type: "Explore",
    description: "Test agent",
    status: "queued",
    toolUses: 0,
    spawnedAt: Date.now(),
    lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
    compactionCount: 0,
    currentLevel: 0,
    totalSpawned: 0,
    ...overrides,
  };
}
```

Keep the base fixture complete and aligned with `AgentRecord` in `src/types.ts`. A `Partial<T>` override is acceptable because the factory returns a complete `T`; casting an incomplete object to `T` is not.

## 10. Exhaustive state handling

```ts
export function statusLabel(status: AgentStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "steered":
      return "Steered";
    case "aborted":
      return "Aborted";
    case "stopped":
      return "Stopped";
    case "error":
      return "Error";
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}
```

This forces new orchestration states to update UI, persistence, and tests.

## 11. ANSI-aware terminal layout

```ts
const label = theme.fg("accent", agent.name);
const row = padAndTruncate(label, availableWidth);
```

Do not use `String.prototype.padEnd`, `.length`, or naive slicing on colored terminal strings. ANSI escape sequences do not consume display columns, while some Unicode glyphs consume more than one.

## 12. Cleanup owner

Every long-lived resource needs one clear owner.

```ts
export class SessionResources {
  readonly #disposers = new Set<() => void | Promise<void>>();
  #disposePromise: Promise<void> | undefined;

  add(dispose: () => void | Promise<void>): void {
    if (this.#disposePromise) {
      throw new Error("Cannot register a resource after disposal started.");
    }
    this.#disposers.add(dispose);
  }

  dispose(): Promise<void> {
    if (!this.#disposePromise) {
      this.#disposePromise = this.#disposeAll();
    }
    return this.#disposePromise;
  }

  async #disposeAll(): Promise<void> {
    const errors: unknown[] = [];
    for (const dispose of [...this.#disposers].reverse()) {
      try {
        await dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.#disposers.clear();

    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to dispose session resources.");
    }
  }
}
```

Register session subscriptions, child sessions, timers, locks, watchers, and telemetry spans with the same lifecycle owner.

## Anti-patterns

| Anti-pattern | Failure mode | Replacement |
| --- | --- | --- |
| `as any` around Pi types | Hides host ABI drift | Complete typed fixtures or adapters |
| Extensionless relative imports | ESM runtime failure | Explicit `.js` specifiers |
| Bundling Pi host packages | Duplicate runtime/type identity | Peer dependency plus dev dependency |
| Mixing TypeBox packages | Validator/schema incompatibility | One version-aligned TypeBox family |
| One global subagent cwd | Wrong project settings and tools | Explicit effective cwd per session |
| Fire-and-forget child session | Leaked agent/tool process | Parent cancellation plus owned cleanup |
| Raw unbounded command output | Context overflow and compaction failure | Truncation plus full-output artifact |
| File read outside mutation queue | Lost concurrent edits | Queue entire read-modify-write window |
| Naive terminal string width | Broken TUI alignment | ANSI/Unicode-aware helpers |
| Persisting render state as domain state | Corrupt or noisy recovery | Separate ephemeral component state |
| Retaining old runtime session references | Calls target invalid session | Rebind and resubscribe after replacement |
| Shadow compaction flags with no runtime wiring | False configurability | Upstream canonical compaction or complete replacement |
