import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import type { AgentManager } from "../agent-manager.js";

type Ctx = ExtensionCommandContext;

import type { OrchestrationMode } from "../agent-registry.js";
import {
  getAnimationStyle,
  getDashboardRefreshInterval,
  getOrchestrationMode,
  getPromptCompressionLevel,
  getUiStyle,
  setAnimationStyle,
  setDashboardRefreshInterval,
  setOrchestrationMode,
  setPromptCompressionLevel,
  setUiStyle,
} from "../agent-registry.js";
import type { SubagentScheduler } from "../schedule.js";
import type { SettingsGetters, SettingsSetters } from "../settings.js";
import { saveAndEmitChanged } from "../settings.js";
import type { JoinMode, PromptCompressionLevel } from "../types.js";
import { buildSettingsSnapshot } from "./settings-snapshot.js";

type SettingsHandlerCtx = {
  ctx: ExtensionCommandContext;
  pi: ExtensionAPI;
  manager: AgentManager;
  getters: SettingsGetters;
  setters: SettingsSetters;
  scheduler: SubagentScheduler;
};

/** Handle the "Max concurrency" setting. */
async function handleMaxConcurrency(h: SettingsHandlerCtx): Promise<void> {
  const val = await h.ctx.ui.input("Max concurrent background agents", String(h.manager.getMaxConcurrent()));
  if (!val) return;
  const n = parseInt(val, 10);
  if (n >= 1) {
    h.manager.setMaxConcurrent(n);
    notifyApplied(h.ctx, h.pi, h.manager, h.getters, `Max concurrency set to ${n}`);
  } else {
    h.ctx.ui.notify("Must be a positive integer.", "warning");
  }
}

/** Handle the "Session limits" setting (max agents + max turns per session). */
async function handleSessionLimits(h: SettingsHandlerCtx): Promise<void> {
  const current = h.manager.getSessionLimits();
  const agentVal = await h.ctx.ui.input(
    "Max agents per session (0 = unlimited)",
    String(current.maxAgentsPerSession ?? 0),
  );
  if (agentVal === undefined) return;
  const turnVal = await h.ctx.ui.input(
    "Max total turns per session (0 = unlimited)",
    String(current.maxTotalTurnsPerSession ?? 0),
  );
  if (turnVal === undefined) return;
  const maxAgents = parseInt(agentVal, 10);
  const maxTurns = parseInt(turnVal, 10);
  if (Number.isNaN(maxAgents) || maxAgents < 0 || Number.isNaN(maxTurns) || maxTurns < 0) {
    h.ctx.ui.notify("Use 0 (unlimited) or a positive integer.", "warning");
    return;
  }
  h.manager.setSessionLimits({
    maxAgentsPerSession: maxAgents === 0 ? undefined : maxAgents,
    maxTotalTurnsPerSession: maxTurns === 0 ? undefined : maxTurns,
  });
  notifyApplied(h.ctx, h.pi, h.manager, h.getters, "Session limits updated");
}

/** Handle the "Default max turns" setting. */
async function handleDefaultMaxTurns(h: SettingsHandlerCtx): Promise<void> {
  const val = await h.ctx.ui.input(
    "Default max turns before wrap-up (0 = unlimited)",
    String(h.getters.getDefaultMaxTurns() ?? 0),
  );
  if (!val) return;
  const n = parseInt(val, 10);
  if (n === 0) {
    h.setters.setDefaultMaxTurns(undefined);
    notifyApplied(h.ctx, h.pi, h.manager, h.getters, "Default max turns set to unlimited");
  } else if (n >= 1) {
    h.setters.setDefaultMaxTurns(n);
    notifyApplied(h.ctx, h.pi, h.manager, h.getters, `Default max turns set to ${n}`);
  } else {
    h.ctx.ui.notify("Must be 0 (unlimited) or a positive integer.", "warning");
  }
}

/** Handle the "Grace turns" setting. */
async function handleGraceTurns(h: SettingsHandlerCtx): Promise<void> {
  const val = await h.ctx.ui.input("Grace turns after wrap-up steer", String(h.getters.getGraceTurns()));
  if (!val) return;
  const n = parseInt(val, 10);
  if (n >= 1) {
    h.setters.setGraceTurns(n);
    notifyApplied(h.ctx, h.pi, h.manager, h.getters, `Grace turns set to ${n}`);
  } else {
    h.ctx.ui.notify("Must be a positive integer.", "warning");
  }
}

/** Handle the "Scheduling" enable/disable toggle. */
async function handleScheduling(h: SettingsHandlerCtx): Promise<void> {
  const val = await h.ctx.ui.select("Schedule subagent feature", [
    "enabled — Agent tool accepts a `schedule` param; /agents → Scheduled jobs visible",
    "disabled — `schedule` removed from Agent tool spec (no LLM-context cost); menu hidden",
  ]);
  if (!val) return;
  const enabled = val.startsWith("enabled");
  if (enabled === h.getters.isSchedulingEnabled()) {
    h.ctx.ui.notify(`Scheduling already ${enabled ? "enabled" : "disabled"}.`, "info");
    return;
  }
  h.setters.setSchedulingEnabled(enabled);
  if (!enabled) h.scheduler.stop(); // immediate kill — outstanding fires stop ticking
  notifyApplied(
    h.ctx,
    h.pi,
    h.manager,
    h.getters,
    `Scheduling ${enabled ? "enabled" : "disabled"}. Tool spec change takes effect on next pi session.`,
  );
}

/** Handle the "Tracing" enable/disable toggle. */
async function handleTracing(h: SettingsHandlerCtx): Promise<void> {
  const val = await h.ctx.ui.select("OpenTelemetry span emission", [
    "enabled — agent lifecycle spans are emitted to the configured TracerProvider (default)",
    "disabled — span helpers short-circuit to a shared no-op; no TracerProvider is consulted",
  ]);
  if (!val) return;
  const enabled = val.startsWith("enabled");
  if (enabled === h.getters.isTracingEnabled()) {
    h.ctx.ui.notify(`Tracing already ${enabled ? "enabled" : "disabled"}.`, "info");
    return;
  }
  h.setters.setTracingEnabled(enabled);
  notifyApplied(h.ctx, h.pi, h.manager, h.getters, `Tracing ${enabled ? "enabled" : "disabled"}.`);
}

/** Handle the "Animation Style" selection. */
async function handleAnimationStyle(h: SettingsHandlerCtx): Promise<void> {
  const val = await h.ctx.ui.select("Animation Style", [
    "braille — standard 10-frame spinner (default)",
    "dots — minimal 8-frame dots",
    "lines — classic 4-frame rotating lines",
    "classic — asterisk only (*)",
    "none — no spinner",
  ]);
  if (!val) return;
  const style = val.split(" ")[0] as "braille" | "dots" | "lines" | "classic" | "none";
  setAnimationStyle(style);
  const { setSpinnerStyle } = await import("./animation.js");
  setSpinnerStyle(style);
  notifyApplied(h.ctx, h.pi, h.manager, h.getters, `Animation style set to ${style}`);
}

/** Handle the "UI/UX Style" selection. */
async function handleUiStyle(h: SettingsHandlerCtx): Promise<void> {
  const val = await h.ctx.ui.select("UI/UX Style", [
    "premium — truecolor gradients and rounded connectors (default)",
    "retro — 16-color fallback and straight box lines",
    "plain — minimal markers, plain text with no ANSI styles",
  ]);
  if (!val) return;
  const style = val.split(" ")[0] as "premium" | "retro" | "plain";
  setUiStyle(style);
  notifyApplied(h.ctx, h.pi, h.manager, h.getters, `UI/UX style set to ${style}`);
}

/** Handle the "Dashboard refresh interval" numeric setting. */
async function handleDashboardRefresh(h: SettingsHandlerCtx): Promise<void> {
  const val = await h.ctx.ui.input(
    "Dashboard refresh interval in milliseconds (100-60000)",
    String(getDashboardRefreshInterval()),
  );
  if (!val) return;
  const n = parseInt(val, 10);
  if (n >= 100 && n <= 60000) {
    setDashboardRefreshInterval(n);
    notifyApplied(h.ctx, h.pi, h.manager, h.getters, `Dashboard refresh interval set to ${n}ms`);
  } else {
    h.ctx.ui.notify("Must be between 100 and 60000 milliseconds.", "warning");
  }
}

/** Handle the "Session spawn limit" numeric setting. */
async function handleSessionSpawnLimit(h: SettingsHandlerCtx): Promise<void> {
  const val = await h.ctx.ui.input("Session max spawns", String(h.manager.getSessionMaxSpawns()));
  if (!val) return;
  const n = parseInt(val, 10);
  if (n >= 1) {
    h.manager.setSessionMaxSpawns(n);
    notifyApplied(h.ctx, h.pi, h.manager, h.getters, `Session spawn limit set to ${n}`);
  } else {
    h.ctx.ui.notify("Must be a positive integer.", "warning");
  }
}

/** Handle the "Session turn limit" numeric setting. */
async function handleSessionTurnLimit(h: SettingsHandlerCtx): Promise<void> {
  const val = await h.ctx.ui.input("Session max turns", String(h.manager.getSessionMaxTurns()));
  if (!val) return;
  const n = parseInt(val, 10);
  if (n >= 1) {
    h.manager.setSessionMaxTurns(n);
    notifyApplied(h.ctx, h.pi, h.manager, h.getters, `Session turn limit set to ${n}`);
  } else {
    h.ctx.ui.notify("Must be a positive integer.", "warning");
  }
}

/** Handle the "Prompt compression" interactive submenu (compare + level selection). */
async function handlePromptCompression(h: SettingsHandlerCtx): Promise<void> {
  // Interactive submenu: shows token previews inline and allows level-by-level
  // comparison. Uses a while loop so that after "📊 Compare" the user returns
  // directly to the compression level selection rather than the full Settings menu.
  while (true) {
    const currentLevel = getPromptCompressionLevel();
    const currentMark = (lvl: string) => (lvl === currentLevel ? " ◀ current" : "");
    const val = await h.ctx.ui.select("Prompt compression level", [
      `minimal — full prompts (~1482 tok, +70%) — max quality${currentMark("minimal")}`,
      `balanced — concise prompts (~873 tok, baseline) — default${currentMark("balanced")}`,
      `aggressive — ultra-short (~487 tok, ~44% less) — max savings${currentMark("aggressive")}`,
      "📊 Compare compression levels — side-by-side token breakdown",
    ]);
    if (!val) return;

    if (val.startsWith("📊")) {
      await showCompressionComparison(h.ctx);
      continue; // re-show compression menu
    }

    const level = val.split(" ")[0] as PromptCompressionLevel;
    if (level === currentLevel) {
      h.ctx.ui.notify(`Prompt compression already set to ${level}.`, "info");
      continue; // re-show menu
    }
    setPromptCompressionLevel(level);
    const savingsLabel =
      level === "aggressive"
        ? " (~386 tok less across all prompt components vs balanced)"
        : level === "minimal"
          ? " (~609 more tok across all prompt components vs balanced)"
          : "";
    notifyApplied(h.ctx, h.pi, h.manager, h.getters, `Prompt compression set to ${level}${savingsLabel}`);
    return;
  }
}

export async function showSettings(
  ctx: ExtensionCommandContext,
  manager: AgentManager,
  pi: ExtensionAPI,
  scheduler: SubagentScheduler,
  getters: SettingsGetters,
  setters: SettingsSetters,
): Promise<void> {
  const choice = await ctx.ui.select("Settings", [
    `Max concurrency (current: ${manager.getMaxConcurrent()})`,
    `Session limits (agents: ${manager.getSessionLimits().maxAgentsPerSession ?? "unlimited"}, turns: ${manager.getSessionLimits().maxTotalTurnsPerSession ?? "unlimited"})`,
    `Default max turns (current: ${getters.getDefaultMaxTurns() ?? "unlimited"})`,
    `Grace turns (current: ${getters.getGraceTurns()})`,
    `Coordination (join: ${getters.getDefaultJoinMode()}, orch: ${getOrchestrationMode()})`,
    `Scheduling (current: ${getters.isSchedulingEnabled() ? "enabled" : "disabled"})`,
    `Tracing (current: ${getters.isTracingEnabled() ? "enabled" : "disabled"})`,
    `Animation Style (current: ${getAnimationStyle()})`,
    `UI/UX Style (current: ${getUiStyle()})`,
    `Dashboard refresh interval (current: ${getDashboardRefreshInterval()}ms)`,
    `Session spawn limit (current: ${manager.getSessionMaxSpawns()})`,
    `Session turn limit (current: ${manager.getSessionMaxTurns()})`,
    `Prompt compression (current: ${getPromptCompressionLevel()})`,
  ]);
  if (!choice) return;

  const h: SettingsHandlerCtx = { ctx, pi, manager, getters, setters, scheduler };

  if (choice.startsWith("Max concurrency")) {
    await handleMaxConcurrency(h);
  } else if (choice.startsWith("Session limits")) {
    await handleSessionLimits(h);
  } else if (choice.startsWith("Default max turns")) {
    await handleDefaultMaxTurns(h);
  } else if (choice.startsWith("Grace turns")) {
    await handleGraceTurns(h);
  } else if (choice.startsWith("Coordination")) {
    await showCoordinationMenu(ctx, pi, manager, getters, setters);
  } else if (choice.startsWith("Scheduling")) {
    await handleScheduling(h);
  } else if (choice.startsWith("Tracing")) {
    await handleTracing(h);
  } else if (choice.startsWith("Animation Style")) {
    await handleAnimationStyle(h);
  } else if (choice.startsWith("UI/UX Style")) {
    await handleUiStyle(h);
  } else if (choice.startsWith("Dashboard refresh interval")) {
    await handleDashboardRefresh(h);
  } else if (choice.startsWith("Session spawn limit")) {
    await handleSessionSpawnLimit(h);
  } else if (choice.startsWith("Session turn limit")) {
    await handleSessionTurnLimit(h);
  } else if (choice.startsWith("Prompt compression")) {
    await handlePromptCompression(h);
  }
}

// Inline picker options for the coordination submenu. Keep these as constants
// rather than building the arrays inline so the test fixture and the prod menu
// always quote the exact same set of modes in the exact same order.
const JOIN_MODE_OPTIONS: ReadonlyArray<{ mode: JoinMode; desc: string }> = [
  { mode: "smart", desc: "auto-group 2+ agents in same turn (default)" },
  { mode: "async", desc: "always notify individually" },
  { mode: "group", desc: "always group background agents" },
  { mode: "swarm", desc: "dynamic collaborative group (agents can join at runtime)" },
];

const ORCH_MODE_OPTIONS: ReadonlyArray<{ mode: OrchestrationMode; desc: string }> = [
  { mode: "auto", desc: "smart selection based on task complexity (default)" },
  { mode: "single", desc: "one agent at a time" },
  { mode: "swarm", desc: "dynamic collaborative groups" },
  { mode: "crew", desc: "structured team coordination (planner/executor/reviewer)" },
];

/**
 * Combined inline picker for join mode + orchestration mode. Reached from the
 * single `Coordination` entry in the top-level Settings menu. Both pickers are
 * surfaced in one ctx.ui.select call so users see the live `◀ current` marker
 * on whichever mode is active now, and so toggling either one re-renders the
 * other immediately (each option re-reads the getters/getOrchestrationMode
 * inside the loop). Persists via `notifyApplied` on every accepted change.
 *
 * Cancelling (empty selection) exits the submenu without saving — the top
 * Settings menu re-shows on the caller's next action.
 */
export async function showCoordinationMenu(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  manager: AgentManager,
  getters: SettingsGetters,
  setters: SettingsSetters,
): Promise<void> {
  const mark = (current: string, candidate: string): string => (candidate === current ? " ◀ current" : "");

  while (true) {
    const curJoin = getters.getDefaultJoinMode();
    const curOrch = getOrchestrationMode();
    const options: string[] = [
      ...JOIN_MODE_OPTIONS.map(({ mode, desc }) => `JOIN: ${mode} — ${desc}${mark(curJoin, mode)}`),
      ...ORCH_MODE_OPTIONS.map(({ mode, desc }) => `ORCH: ${mode} — ${desc}${mark(curOrch, mode)}`),
    ];
    const val = await ctx.ui.select("Coordination (join + orchestration mode)", options);
    if (!val) return;

    if (val.startsWith("JOIN: ")) {
      const mode = val.slice("JOIN: ".length).split(" ")[0] as JoinMode;
      if (mode === curJoin) {
        ctx.ui.notify(`Join mode already ${mode}.`, "info");
        continue;
      }
      setters.setDefaultJoinMode(mode);
      notifyApplied(ctx, pi, manager, getters, `Join mode set to ${mode}`);
      continue;
    }

    if (val.startsWith("ORCH: ")) {
      const mode = val.slice("ORCH: ".length).split(" ")[0] as OrchestrationMode;
      if (mode === curOrch) {
        ctx.ui.notify(`Orchestration mode already ${mode}.`, "info");
        continue;
      }
      setOrchestrationMode(mode);
      notifyApplied(ctx, pi, manager, getters, `Orchestration mode set to ${mode}`);
      continue;
    }

    // Unreachable in tree (we only ever emit JOIN:/ORCH: prefixed options),
    // but if a future refactor breaks the prefix we'd rather show a friendly
    // message than silently no-op.
    ctx.ui.notify("Unexpected coordination option — please report this.", "warning");
  }
}

/**
 * Show a detailed side-by-side comparison of all three compression levels
 * with token estimates per prompt component.
 */
async function showCompressionComparison(ctx: Ctx): Promise<void> {
  const table = `# Prompt Compression — Token Comparison

Estimates based on combined handoff + read-only prompt components.
Env block, bridge section, and agent identity are identical across levels.

${"─".repeat(80)}
| Component            | Minimal         | Balanced        | Aggressive         | Savings (agg vs bal) |
|──────────────────────|─────────────────|─────────────────|────────────────────|───────────────────────|
| Handoff prompt       | 2,334 / 584 tok |   971 / 243 tok |    118 /  30 tok  | −87.8% (−213 tok)     |
| Explore readonly     | 1,159 / 290 tok |   802 / 201 tok |    571 / 143 tok  | −28.8% (−58 tok)      |
| Plan readonly        | 1,188 / 297 tok |   831 / 208 tok |    600 / 150 tok  | −27.8% (−58 tok)      |
| Analysis readonly    | 1,244 / 311 tok |   887 / 222 tok |    656 / 164 tok  | −26.0% (−58 tok)      |
|──────────────────────|─────────────────|─────────────────|────────────────────|───────────────────────|
| COMBINED             | 5,925 / 1482 tok| 3,491 / 873 tok |  1,945 / 487 tok  | ~44% (−386 tok)       |
${"─".repeat(80)}

SCOPE: Affects replace-mode built-in agents (Explore, Plan, Analysis)
       and handoff prompts for all agents with handoff: true.
       Append-mode agents (e.g. general-purpose) only vary in handoff.

PRECEDENCE: Per-agent prompt_compression frontmatter > global setting > balanced

USAGE:
  • aggressive — background/ bulk agents, limited token budgets
  • balanced   — default, good quality/token trade-off
  • minimal    — complex decisions, first-time agent types, debugging

Each aggressive agent spawn saves ~386 tokens vs balanced
across all 4 prompt components (handoff + 3 agent types combined).

Per-agent example: a single Explore at aggressive saves ~271 tokens
(readonly warning: 201→143 tok, handoff: 243→30 tok).
10 Explore agents ≈ ~2,710 tokens saved.
`;
  await ctx.ui.editor("Compression Level Comparison", table);
}

// Persist the current snapshot, emit `subagents:settings_changed`, and surface
// the right toast. Successful saves show info; persistence failures downgrade
// to warning so users aren't silently reverted on restart. Event fires regardless
// of outcome so listeners see the in-memory change.
export function notifyApplied(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  manager: AgentManager,
  getters: SettingsGetters,
  successMsg: string,
): void {
  const snapshot = buildSettingsSnapshot(manager, getters);
  const { message, level } = saveAndEmitChanged(snapshot, successMsg, (event, payload) =>
    pi.events.emit(event, payload),
  );
  ctx.ui.notify(message, level);
}
