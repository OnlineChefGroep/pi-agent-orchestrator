/**
 * output-handler.ts — Entry point for the /agents command.
 *
 * All UI logic lives in focused modules under src/ui/:
 *   agent-dashboard.ts     — rich TUI dashboard
 *   agent-file-helpers.ts  — findAgentFile, getModelLabel
 *   agent-viewer.ts        — viewAgentConversation launcher
 *   agent-list-views.ts    — showAllAgentsList, showRunningAgents
 *   agent-detail.ts        — showAgentDetail, showAgentPermissions
 *   agent-actions.ts       — ejectAgent, disableAgent, enableAgent
 *   agent-wizards.ts       — showCreateWizard, showGenerateWizard, showManualWizard
 *   settings-snapshot.ts   — buildSettingsSnapshot
 *   settings-menu.ts       — showSettings, notifyApplied
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { AgentManager } from "./agent-manager.js";
import { reloadCustomAgents } from "./agent-registry.js";
import { getAllTypes } from "./agent-types.js";
import type { SubagentScheduler } from "./schedule.js";
import { uiCreateOrJoinSwarm } from "./swarm-join.js";
import type { JoinMode } from "./types.js";
import { showAgentDashboard } from "./ui/agent-dashboard.js";
import { showAgentPermissions } from "./ui/agent-detail.js";
import { showAllAgentsList, showRunningAgents } from "./ui/agent-list-views.js";
import type { AgentActivity } from "./ui/agent-ui-types.js";
import { viewAgentConversation } from "./ui/agent-viewer.js";
import { showCreateWizard } from "./ui/agent-wizards.js";
import { showSchedulesMenu } from "./ui/schedule-menu.js";
import { showSettings } from "./ui/settings-menu.js";

/** Dependencies injected into the agents menu so callers don't pass 11 positional args. */
export interface AgentsMenuDeps {
  pi: ExtensionAPI;
  manager: AgentManager;
  scheduler: SubagentScheduler;
  agentActivity: Map<string, AgentActivity>;
  isSchedulingEnabled: () => boolean;
  getDefaultMaxTurns: () => number | undefined;
  getGraceTurns: () => number;
  getDefaultJoinMode: () => JoinMode;
  setDefaultMaxTurns: (n: number | undefined) => void;
  setGraceTurns: (n: number) => void;
  setDefaultJoinMode: (mode: JoinMode) => void;
  setSchedulingEnabled: (b: boolean) => void;
}

/** Re-open the agents menu after a sub-flow completes. */
async function reopenMenu(ctx: ExtensionCommandContext, deps: AgentsMenuDeps): Promise<void> {
  await showAgentsMenu(ctx, deps);
}

/** Build the dashboard callbacks and launch the rich TUI. */
async function launchAgentDashboard(
  ctx: ExtensionCommandContext,
  deps: AgentsMenuDeps,
): Promise<void> {
  const { manager, agentActivity } = deps;

  const viewConv = (rec: import("./types.js").AgentRecord) =>
    viewAgentConversation(ctx, rec, agentActivity);

  const onAbort = (id: string) => manager.abort(id);

  const onSteer = async (id: string) => {
    const record = manager.getRecord(id);
    if (!record) {
      ctx.ui.notify("Agent not found.", "warning");
      return;
    }
    if (record.status !== "running") {
      ctx.ui.notify(`Cannot steer — agent is ${record.status}.`, "warning");
      return;
    }

    const message = await ctx.ui.editor(
      "Steering message (injected into agent conversation)",
      "Continue working on X, but also do Y first. Be careful with Z.",
    );

    if (!message?.trim()) return;

    if (!record.session) {
      if (!record.pendingSteers) record.pendingSteers = [];
      record.pendingSteers.push(message.trim());
      ctx.ui.notify(`Steering message queued for ${id}. Will be delivered when session is ready.`, "info");
    } else {
      try {
        const { steerAgent } = await import("./agent-runner.js");
        await steerAgent(record.session, message.trim());
        ctx.ui.notify(`Steering message sent to ${id}.`, "info");
      } catch (e: any) {
        ctx.ui.notify(`Steer failed: ${e?.message ?? e}`, "error");
      }
    }

    await showAgentDashboard(ctx, manager, agentActivity, viewConv, onAbort, onSteer, onPerms, onSwarm);
  };

  const onPerms = (r: import("./types.js").AgentRecord) => showAgentPermissions(ctx, r);

  const onSwarm = async (action: string, ids: string[]) => {
    if (ids.length === 0) {
      ctx.ui.notify("Select agents first (Space) then press w for swarm actions.", "info");
      return;
    }

    if (action === "menu" || action === "create") {
      const swarmId = uiCreateOrJoinSwarm(ids, "Dashboard Swarm");
      if (swarmId) {
        ctx.ui.notify(`Swarm created: ${swarmId} — ${ids.length} agents joined.`, "info");
      }
    } else {
      ctx.ui.notify(`Swarm action: ${action} on ${ids.length} agents`, "info");
    }

    await showAgentDashboard(ctx, manager, agentActivity, viewConv, onAbort, onSteer, onPerms, onSwarm);
  };

  await showAgentDashboard(ctx, manager, agentActivity, viewConv, onAbort, onSteer, onPerms, onSwarm);
}

/**
 * Display the main agents menu with options for dashboard, agent types, scheduling, and settings.
 */
export async function showAgentsMenu(
  ctx: ExtensionCommandContext,
  deps: AgentsMenuDeps,
): Promise<void> {
  reloadCustomAgents();
  const allNames = getAllTypes();
  const agents = deps.manager.listAgents();

  const options: string[] = [];

  if (agents.length > 0) {
    const running = agents.filter(a => a.status === "running" || a.status === "queued").length;
    const done = agents.filter(a => a.status === "completed" || a.status === "steered").length;
    options.push(`Running agents (${agents.length}) — ${running} running, ${done} done`);
  }

  if (agents.length > 0) {
    options.push("Interactive dashboard (hotkeys • live tree • steering)");
  }

  if (allNames.length > 0) {
    options.push(`Agent types (${allNames.length})`);
  }

  if (deps.scheduler.isActive()) {
    const jobCount = deps.scheduler.list().length;
    options.push(`Scheduled jobs (${jobCount})`);
  }

  options.push("Create new agent");
  options.push("Settings");

  const noAgentsMsg = allNames.length === 0 && agents.length === 0
    ? "No agents found. Create specialized subagents that can be delegated to.\n\n" +
      "Each subagent has its own context window, custom system prompt, and specific tools.\n\n" +
      "Try creating: Code Reviewer, Security Auditor, Test Writer, or Documentation Writer.\n\n"
    : "";

  if (noAgentsMsg) {
    ctx.ui.notify(noAgentsMsg, "info");
  }

  const choice = await ctx.ui.select("Agents", options);
  if (!choice) return;

  if (choice.startsWith("Running agents (")) {
    await showRunningAgents(ctx, deps.manager, deps.agentActivity);
    await reopenMenu(ctx, deps);
  } else if (choice === "Interactive dashboard (hotkeys • live tree • steering)") {
    await launchAgentDashboard(ctx, deps);
    await reopenMenu(ctx, deps);
  } else if (choice.startsWith("Agent types (")) {
    await showAllAgentsList(ctx, ctx.modelRegistry);
    await reopenMenu(ctx, deps);
  } else if (choice.startsWith("Scheduled jobs (")) {
    await showSchedulesMenu(ctx, deps.scheduler);
    await reopenMenu(ctx, deps);
  } else if (choice === "Create new agent") {
    await showCreateWizard(ctx, deps.pi, deps.manager);
  } else if (choice === "Settings") {
    await showSettings(
      ctx, deps.manager, deps.pi,
      deps.getDefaultMaxTurns, deps.getGraceTurns, deps.getDefaultJoinMode,
      deps.isSchedulingEnabled, deps.setDefaultMaxTurns, deps.setGraceTurns,
      deps.setDefaultJoinMode, deps.setSchedulingEnabled, deps.scheduler,
    );
    await reopenMenu(ctx, deps);
  }
}
