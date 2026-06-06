import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import type { AgentManager } from "../agent-manager.js";

type Ctx = ExtensionCommandContext;

import {
  getAnimationStyle,
  getDashboardRefreshInterval,
  getOrchestrationMode,getPromptCompressionLevel,
  getUiStyle,
  setAnimationStyle,
  setDashboardRefreshInterval,
  setOrchestrationMode,setPromptCompressionLevel,
  setUiStyle
} from "../agent-registry.js";
import type { SubagentScheduler } from "../schedule.js";
import { saveAndEmitChanged } from "../settings.js";
import type { JoinMode, PromptCompressionLevel } from "../types.js";
import { buildSettingsSnapshot } from "./settings-snapshot.js";

export async function showSettings(
  ctx: ExtensionCommandContext,
  manager: AgentManager,
  pi: ExtensionAPI,
  getDefaultMaxTurns: () => number | undefined,
  getGraceTurns: () => number,
  getDefaultJoinMode: () => JoinMode,
  isSchedulingEnabled: () => boolean,
  setDefaultMaxTurns: (n: number | undefined) => void,
  setGraceTurns: (n: number) => void,
  setDefaultJoinMode: (mode: JoinMode) => void,
  setSchedulingEnabled: (b: boolean) => void,
  scheduler: SubagentScheduler,
): Promise<void> {
  const choice = await ctx.ui.select("Settings", [
    `Max concurrency (current: ${manager.getMaxConcurrent()})`,
    `Session limits (agents: ${manager.getSessionLimits().maxAgentsPerSession ?? "unlimited"}, turns: ${manager.getSessionLimits().maxTotalTurnsPerSession ?? "unlimited"})`,
    `Default max turns (current: ${getDefaultMaxTurns() ?? "unlimited"})`,
    `Grace turns (current: ${getGraceTurns()})`,
    `Join mode (current: ${getDefaultJoinMode()})`,
    `Scheduling (current: ${isSchedulingEnabled() ? "enabled" : "disabled"})`,
    `Animation Style (current: ${getAnimationStyle()})`,
    `UI/UX Style (current: ${getUiStyle()})`,
    `Orchestration mode (current: ${getOrchestrationMode()})`,
    `Dashboard refresh interval (current: ${getDashboardRefreshInterval()}ms)`,
    `Session spawn limit (current: ${manager.getSessionMaxSpawns()})`,
    `Session turn limit (current: ${manager.getSessionMaxTurns()})`,
    `Prompt compression (current: ${getPromptCompressionLevel()})`,
  ]);
  if (!choice) return;

  if (choice.startsWith("Max concurrency")) {
    const val = await ctx.ui.input("Max concurrent background agents", String(manager.getMaxConcurrent()));
    if (val) {
      const n = parseInt(val, 10);
      if (n >= 1) {
        manager.setMaxConcurrent(n);
        notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Max concurrency set to ${n}`);
      } else {
        ctx.ui.notify("Must be a positive integer.", "warning");
      }
    }
  } else if (choice.startsWith("Session limits")) {
    const current = manager.getSessionLimits();
    const agentVal = await ctx.ui.input("Max agents per session (0 = unlimited)", String(current.maxAgentsPerSession ?? 0));
    if (agentVal === undefined) return;
    const turnVal = await ctx.ui.input("Max total turns per session (0 = unlimited)", String(current.maxTotalTurnsPerSession ?? 0));
    if (turnVal === undefined) return;
    const maxAgents = parseInt(agentVal, 10);
    const maxTurns = parseInt(turnVal, 10);
    if (Number.isNaN(maxAgents) || maxAgents < 0 || Number.isNaN(maxTurns) || maxTurns < 0) {
      ctx.ui.notify("Use 0 (unlimited) or a positive integer.", "warning");
    } else {
      manager.setSessionLimits({
        maxAgentsPerSession: maxAgents === 0 ? undefined : maxAgents,
        maxTotalTurnsPerSession: maxTurns === 0 ? undefined : maxTurns,
      });
      notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, "Session limits updated");
    }
  } else if (choice.startsWith("Default max turns")) {
    const val = await ctx.ui.input("Default max turns before wrap-up (0 = unlimited)", String(getDefaultMaxTurns() ?? 0));
    if (val) {
      const n = parseInt(val, 10);
      if (n === 0) {
        setDefaultMaxTurns(undefined);
        notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, "Default max turns set to unlimited");
      } else if (n >= 1) {
        setDefaultMaxTurns(n);
        notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Default max turns set to ${n}`);
      } else {
        ctx.ui.notify("Must be 0 (unlimited) or a positive integer.", "warning");
      }
    }
  } else if (choice.startsWith("Grace turns")) {
    const val = await ctx.ui.input("Grace turns after wrap-up steer", String(getGraceTurns()));
    if (val) {
      const n = parseInt(val, 10);
      if (n >= 1) {
        setGraceTurns(n);
        notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Grace turns set to ${n}`);
      } else {
        ctx.ui.notify("Must be a positive integer.", "warning");
      }
    }
  } else if (choice.startsWith("Join mode")) {
    const val = await ctx.ui.select("Default join mode for background agents", [
      "smart — auto-group 2+ agents in same turn (default)",
      "async — always notify individually",
      "group — always group background agents",
      "swarm — dynamic collaborative group (agents can join at runtime)",
    ]);
    if (val) {
      const mode = val.split(" ")[0] as JoinMode;
      setDefaultJoinMode(mode);
      notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Default join mode set to ${mode}`);
    }
  } else if (choice.startsWith("Scheduling")) {
    const val = await ctx.ui.select(
      "Schedule subagent feature",
      [
        "enabled — Agent tool accepts a `schedule` param; /agents → Scheduled jobs visible",
        "disabled — `schedule` removed from Agent tool spec (no LLM-context cost); menu hidden",
      ],
    );
    if (val) {
      const enabled = val.startsWith("enabled");
      if (enabled === isSchedulingEnabled()) {
        ctx.ui.notify(`Scheduling already ${enabled ? "enabled" : "disabled"}.`, "info");
      } else {
        setSchedulingEnabled(enabled);
        if (!enabled) scheduler.stop();  // immediate kill — outstanding fires stop ticking
        notifyApplied(
          ctx,
          pi,
          manager,
          getDefaultMaxTurns,
          getGraceTurns,
          getDefaultJoinMode,
          isSchedulingEnabled,
          `Scheduling ${enabled ? "enabled" : "disabled"}. Tool spec change takes effect on next pi session.`,
        );
      }
    }
  } else if (choice.startsWith("Animation Style")) {
    const val = await ctx.ui.select("Animation Style", [
      "braille — standard 10-frame spinner (default)",
      "dots — minimal 8-frame dots",
      "lines — classic 4-frame rotating lines",
      "classic — asterisk only (*)",
      "none — no spinner",
    ]);
    if (val) {
      const style = val.split(" ")[0] as "braille" | "dots" | "lines" | "classic" | "none";
      setAnimationStyle(style);
      const { setSpinnerStyle } = await import("./animation.js");
      setSpinnerStyle(style);
      notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Animation style set to ${style}`);
    }
  } else if (choice.startsWith("UI/UX Style")) {
    const val = await ctx.ui.select("UI/UX Style", [
      "premium — truecolor gradients and rounded connectors (default)",
      "retro — 16-color fallback and straight box lines",
      "plain — minimal markers, plain text with no ANSI styles",
      "cinematic — ultra-rich fullscreen Go motion renderer via sidecar",
    ]);
    if (val) {
      const style = val.split(" ")[0] as "premium" | "retro" | "plain" | "cinematic";
      setUiStyle(style);
      notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `UI/UX style set to ${style}`);
    }
  } else if (choice.startsWith("Orchestration mode")) {
    const val = await ctx.ui.select("Orchestration mode", [
      "auto — smart selection based on task complexity (default)",
      "single — one agent at a time",
      "swarm — dynamic collaborative groups",
      "crew — structured team coordination",
    ]);
    if (val) {
      const mode = val.split(" ")[0] as "auto" | "single" | "swarm" | "crew";
      setOrchestrationMode(mode);
      notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Orchestration mode set to ${mode}`);
    }
  } else if (choice.startsWith("Dashboard refresh interval")) {
    const val = await ctx.ui.input("Dashboard refresh interval in milliseconds (100-60000)", String(getDashboardRefreshInterval()));
    if (val) {
      const n = parseInt(val, 10);
      if (n >= 100 && n <= 60000) {
        setDashboardRefreshInterval(n);
        notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Dashboard refresh interval set to ${n}ms`);
      } else {
        ctx.ui.notify("Must be between 100 and 60000 milliseconds.", "warning");
      }
    }
  } else if (choice.startsWith("Session spawn limit")) {
    const val = await ctx.ui.input("Session max spawns", String(manager.getSessionMaxSpawns()));
    if (val) {
      const n = parseInt(val, 10);
      if (n >= 1) {
        manager.setSessionMaxSpawns(n);
        notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Session spawn limit set to ${n}`);
      } else {
        ctx.ui.notify("Must be a positive integer.", "warning");
      }
    }
  } else if (choice.startsWith("Session turn limit")) {
    const val = await ctx.ui.input("Session max turns", String(manager.getSessionMaxTurns()));
    if (val) {
      const n = parseInt(val, 10);
      if (n >= 1) {
        manager.setSessionMaxTurns(n);
        notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Session turn limit set to ${n}`);
      } else {
        ctx.ui.notify("Must be a positive integer.", "warning");
      }
    }
  } else if (choice.startsWith("Prompt compression")) {
    // Interactive submenu: shows token previews inline and allows level-by-level
    // comparison. Uses a while loop so that after "📊 Compare" the user returns
    // directly to the compression level selection rather than the full Settings menu.
    while (true) {
      const currentLevel = getPromptCompressionLevel();
      const currentMark = (lvl: string) => lvl === currentLevel ? " ◀ current" : "";
      const val = await ctx.ui.select("Prompt compression level", [
        `minimal — full prompts (~1482 tok, +70%) — max quality${currentMark("minimal")}`,
        `balanced — concise prompts (~873 tok, baseline) — default${currentMark("balanced")}`,
        `aggressive — ultra-short (~487 tok, ~44% less) — max savings${currentMark("aggressive")}`,
        "📊 Compare compression levels — side-by-side token breakdown",
      ]);
      if (!val) return;

      if (val.startsWith("📊")) {
        await showCompressionComparison(ctx);
        continue;  // re-show compression menu
      }

      const level = val.split(" ")[0] as PromptCompressionLevel;
      if (level === currentLevel) {
        ctx.ui.notify(`Prompt compression already set to ${level}.`, "info");
        continue;  // re-show menu
      }
      setPromptCompressionLevel(level);
      const savingsLabel = level === "aggressive" ? " (~386 tok less across all prompt components vs balanced)" : level === "minimal" ? " (~609 more tok across all prompt components vs balanced)" : "";
      notifyApplied(ctx, pi, manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled, `Prompt compression set to ${level}${savingsLabel}`);
      return;
    }
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

${'─'.repeat(80)}
| Component            | Minimal         | Balanced        | Aggressive         | Savings (agg vs bal) |
|──────────────────────|─────────────────|─────────────────|────────────────────|───────────────────────|
| Handoff prompt       | 2,334 / 584 tok |   971 / 243 tok |    118 /  30 tok  | −87.8% (−213 tok)     |
| Explore readonly     | 1,159 / 290 tok |   802 / 201 tok |    571 / 143 tok  | −28.8% (−58 tok)      |
| Plan readonly        | 1,188 / 297 tok |   831 / 208 tok |    600 / 150 tok  | −27.8% (−58 tok)      |
| Analysis readonly    | 1,244 / 311 tok |   887 / 222 tok |    656 / 164 tok  | −26.0% (−58 tok)      |
|──────────────────────|─────────────────|─────────────────|────────────────────|───────────────────────|
| COMBINED             | 5,925 / 1482 tok| 3,491 / 873 tok |  1,945 / 487 tok  | ~44% (−386 tok)       |
${'─'.repeat(80)}

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
  getDefaultMaxTurns: () => number | undefined,
  getGraceTurns: () => number,
  getDefaultJoinMode: () => JoinMode,
  isSchedulingEnabled: () => boolean,
  successMsg: string,
): void {
  const snapshot = buildSettingsSnapshot(manager, getDefaultMaxTurns, getGraceTurns, getDefaultJoinMode, isSchedulingEnabled);
  const { message, level } = saveAndEmitChanged(
    snapshot,
    successMsg,
    (event, payload) => pi.events.emit(event, payload),
  );
  ctx.ui.notify(message, level);
}
