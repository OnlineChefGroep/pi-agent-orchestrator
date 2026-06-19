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

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { type Component, matchesKey } from "@earendil-works/pi-tui";
import type { AgentManager } from "./agent-manager.js";
import { reloadCustomAgents } from "./agent-registry.js";
import { getAllTypes } from "./agent-types.js";
import type { SubagentScheduler } from "./schedule.js";
import { uiCreateOrJoinSwarm } from "./swarm-join.js";
import type { AgentRecord, JoinMode } from "./types.js";
import { showAgentDashboard } from "./ui/agent-dashboard.js";
import { showAgentPermissions } from "./ui/agent-detail.js";
import { showAllAgentsList, showRunningAgents } from "./ui/agent-list-views.js";
import { getAgentTopEntries, renderTopTable, type SortKey, sortEntries } from "./ui/agent-top-renderer.js";
import type { AgentActivity } from "./ui/agent-ui-types.js";
import { viewAgentConversation } from "./ui/agent-viewer.js";
import { showCreateWizard } from "./ui/agent-wizards.js";
import { showSchedulesMenu } from "./ui/schedule-menu.js";
import { showSettings } from "./ui/settings-menu.js";
import { getThemeColors } from "./ui/theme.js";

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
  const { manager, agentActivity, scheduler } = deps;

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

    const trimmed = message?.trim();
    if (!trimmed) return;

    if (!record.session) {
      if (!record.pendingSteers) record.pendingSteers = [];
      record.pendingSteers.push(trimmed);
      ctx.ui.notify(`Steering message queued for ${id}. Will be delivered when session is ready.`, "info");
    } else {
      try {
        const { steerAgent } = await import("./agent-runner.js");
        await steerAgent(record.session, trimmed);
        ctx.ui.notify(`Steering message sent to ${id}.`, "info");
      } catch (e: any) {
        ctx.ui.notify(`Steer failed: ${e?.message ?? e}`, "error");
      }
    }

    await showAgentDashboard(ctx, manager, agentActivity, scheduler, viewConv, onAbort, onSteer, onPerms, onSwarm);
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

    await showAgentDashboard(ctx, manager, agentActivity, scheduler, viewConv, onAbort, onSteer, onPerms, onSwarm);
  };

  await showAgentDashboard(ctx, manager, agentActivity, scheduler, viewConv, onAbort, onSteer, onPerms, onSwarm);
}

interface TreeNode {
  id: string;
  type: string;
  status: string;
  description: string;
  children: TreeNode[];
}

function buildExecutionTree(records: AgentRecord[], format: "text" | "mermaid" | "json"): string {
  if (format === "json") {
    const roots: TreeNode[] = [];
    const map = new Map<string, TreeNode>();
    for (const r of records) {
      map.set(r.id, { id: r.id, type: r.type, status: r.status, description: r.description, children: [] });
    }
    for (const r of records) {
      const node = map.get(r.id)!;
      if (r.parentId && map.has(r.parentId)) {
        map.get(r.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return JSON.stringify(roots, null, 2);
  }

  if (format === "mermaid") {
    const mermaidParts: string[] = ["graph TD\n"];
    for (const r of records) {
      const cleanType = r.type.replace(/"/g, "'");
      mermaidParts.push(`  ${r.id.replace(/-/g, "_")}["[${cleanType}] ${r.id}"]\n`);
      if (r.parentId) {
        mermaidParts.push(`  ${r.parentId.replace(/-/g, "_")} --> ${r.id.replace(/-/g, "_")}\n`);
      }
    }
    return mermaidParts.join("");
  }

  if (format === "text") {
    const roots: AgentRecord[] = [];
    const childrenMap = new Map<string, AgentRecord[]>();
    const nodeMap = new Map<string, AgentRecord>();

    for (const r of records) {
      nodeMap.set(r.id, r);
      if (!r.parentId) {
        roots.push(r);
      } else {
        if (!childrenMap.has(r.parentId)) {
          childrenMap.set(r.parentId, []);
        }
        childrenMap.get(r.parentId)!.push(r);
      }
    }

    let out = "";
    const render = (nodeId: string, indent: string, isLast: boolean) => {
      const r = nodeMap.get(nodeId);
      if (!r) return;
      const branch = indent ? (isLast ? "└─ " : "├─ ") : "";
      out += `${indent}${branch}${r.id} (${r.type}) [${r.status}]\n`;
      const children = childrenMap.get(nodeId) || [];
      for (let i = 0; i < children.length; i++) {
        render(children[i].id, indent + (indent ? (isLast ? "   " : "│  ") : ""), i === children.length - 1);
      }
    };
    for (let i = 0; i < roots.length; i++) {
      render(roots[i].id, "", i === roots.length - 1);
    }
    return out || "No execution tree available.";
  }

  return "";
}

/** TUI component for the live agent top view. */
class AgentsTopComponent implements Component {
  private closed = false;
  private sortKey: SortKey = "tokens";
  private sortAsc = false;
  private page = 0;
  private pageSize = 12;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly tui: { requestRender?: () => void; terminal: { rows: number; columns: number } },
    private readonly manager: AgentManager,
    private readonly activity: Map<string, AgentActivity>,
    private readonly done: (r: undefined) => void,
  ) {
    this.refreshTimer = setInterval(() => {
      if (!this.closed) this.tui.requestRender?.();
    }, 1000);
  }

  handleInput(data: string): void {
    if (matchesKey(data, "q") || matchesKey(data, "escape")) {
      this.close();
      return;
    }
    if (matchesKey(data, "left") || matchesKey(data, "shift+left")) {
      this.page = Math.max(0, this.page - 1);
    } else if (matchesKey(data, "right") || matchesKey(data, "shift+right")) {
      const entries = getAgentTopEntries(this.manager.listAgents(), this.activity);
      const totalPages = Math.max(1, Math.ceil(entries.length / this.pageSize));
      this.page = Math.min(totalPages - 1, this.page + 1);
    } else if (matchesKey(data, "t")) {
      if (this.sortKey === "tokens") this.sortAsc = !this.sortAsc;
      else { this.sortKey = "tokens"; this.sortAsc = false; }
      this.page = 0;
    } else if (matchesKey(data, "r")) {
      if (this.sortKey === "turns") this.sortAsc = !this.sortAsc;
      else { this.sortKey = "turns"; this.sortAsc = false; }
      this.page = 0;
    } else if (matchesKey(data, "d")) {
      if (this.sortKey === "duration") this.sortAsc = !this.sortAsc;
      else { this.sortKey = "duration"; this.sortAsc = false; }
      this.page = 0;
    } else if (matchesKey(data, "u")) {
      if (this.sortKey === "toolUses") this.sortAsc = !this.sortAsc;
      else { this.sortKey = "toolUses"; this.sortAsc = false; }
      this.page = 0;
    } else if (matchesKey(data, "n")) {
      if (this.sortKey === "name") this.sortAsc = !this.sortAsc;
      else { this.sortKey = "name"; this.sortAsc = false; }
      this.page = 0;
    }
  }

  render(width: number): string[] {
    const th = getThemeColors();
    // Simple passthrough theme — real theme injected by the TUI framework
    const entries = sortEntries(getAgentTopEntries(this.manager.listAgents(), this.activity), this.sortKey, this.sortAsc);
    const rows = this.tui.terminal.rows;
    this.pageSize = Math.max(5, rows - 5);
    return renderTopTable(entries, this.sortKey, this.sortAsc, this.page, this.pageSize, th, width);
  }

  invalidate(): void {
    // No-op: this component has no cached theme to invalidate
  }

  dispose(): void {
    if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
    this.closed = true;
  }

  private close(): void {
    this.dispose();
    this.done(undefined);
  }
}

/** Launch the /agents top live stats view. */
async function showAgentsTop(
  ctx: ExtensionCommandContext,
  manager: AgentManager,
  activity: Map<string, AgentActivity>,
): Promise<void> {
  await ctx.ui.custom<undefined>((tui, _theme, _kb, done) => {
    return new AgentsTopComponent(tui, manager, activity, done);
  }, { overlay: true, overlayOptions: { anchor: "center", width: "95%", maxHeight: "80%" } });
}

/**
 * Display the main agents menu with options for dashboard, agent types, scheduling, and settings.
 */
export async function showAgentsMenu(
  ctx: ExtensionCommandContext,
  deps: AgentsMenuDeps,
): Promise<void> {
  await reloadCustomAgents();
  const allNames = getAllTypes();
  const agents = deps.manager.listAgents();

  const options: string[] = [];

  if (agents.length > 0) {
    let running = 0;
    let done = 0;
    for (let i = 0; i < agents.length; i++) {
      const s = agents[i].status;
      if (s === "running" || s === "queued") running++;
      else if (s === "completed" || s === "steered") done++;
    }
    options.push(`Running agents (${agents.length}) — ${running} running, ${done} done`);
  }

  if (agents.length > 0) {
    options.push("Interactive dashboard (hotkeys • live tree • steering)");
    options.push("View execution tree");
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
  options.push("Agent top (live stats — CPU, tokens, turns)");

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
  } else if (choice === "View execution tree") {
    const treeFormat = await ctx.ui.select("Execution Tree Format", [
      "Formatted Text Tree",
      "Mermaid Diagram Graph",
      "Raw JSON Tree"
    ]);
    if (treeFormat) {
      let format: "text" | "mermaid" | "json" = "text";
      if (treeFormat.includes("Mermaid")) format = "mermaid";
      if (treeFormat.includes("JSON")) format = "json";
      
      const treeData = buildExecutionTree(agents, format);
      await ctx.ui.editor(`Execution Tree (${format})`, treeData);
    }
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
  } else if (choice === "Agent top (live stats — CPU, tokens, turns)") {
    await showAgentsTop(ctx, deps.manager, deps.agentActivity);
    await reopenMenu(ctx, deps);
  }
}
