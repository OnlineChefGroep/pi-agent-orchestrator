/**
 * agent-dashboard.ts — Rich interactive TUI dashboard for subagent management.
 *
 * Current state (strong iteration on feat/rich-subagent-tui):
 * - Full Component + vim navigation (matchesKey)
 * - Live rich activity (spinners, describeActivity, turns, tokens)
 * - Multi-select (Space) + bulk kill
 * - Real hotkeys: k=kill, s=steer (with editor), Enter=view
 * - Toggleable ? help screen
 * - Rich per-agent metadata (worktree, group/handoff, validation, outputFile)
 * - Themed (premium/retro/plain)
 *
 * Still fully additive. Matches the spirit of OpenCode + Claude Code agent control.
 */

import type { AgentManager } from "../agent-manager.js";
import type { AgentActivity } from "./agent-widget.js";
import {
  describeActivity,
  formatDuration,
  formatTokens,
  formatTurns,
  getDisplayName,
  SPINNER,
} from "./agent-widget.js";
import { getUiStyle } from "../agent-registry.js";
import {
  type Component,
  matchesKey,
  type TUI,
  truncateToWidth,
} from "@mariozechner/pi-tui";
import type { AgentRecord } from "../types.js";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

const MIN_VIEWPORT = 5;
export const DASHBOARD_HEIGHT_PCT = 85;

/** Theme helper (mirrors patterns in conversation-viewer + schedule-menu). */
function getThemeColors() {
  const style = getUiStyle();
  if (style === "plain") {
    return {
      border: "",
      title: "",
      dim: "",
      highlight: "",
      reset: "",
    };
  }
  if (style === "retro") {
    return {
      border: "\x1b[31m",
      title: "\x1b[1;37m",
      dim: "\x1b[2m",
      highlight: "\x1b[1;33m",
      reset: "\x1b[0m",
    };
  }
  // premium
  return {
    border: "\x1b[38;2;255;100;100m",
    title: "\x1b[1;38;2;220;220;220m",
    dim: "\x1b[2m",
    highlight: "\x1b[1;38;2;255;200;100m",
    reset: "\x1b[0m",
  };
}

export interface AgentDashboardOptions {
  manager: AgentManager;
  agentActivity: Map<string, AgentActivity>;
  onViewConversation?: (record: AgentRecord) => Promise<void>;
  onAbort?: (id: string) => boolean;           // returns true if aborted
  onSteer?: (id: string) => Promise<void>;     // menu layer handles prompting + actual steer
  onShowPermissions?: (record: AgentRecord) => Promise<void>;
  onSwarmAction?: (action: string, agentIds: string[]) => Promise<void>;  // create/join/leave/steer swarms
}

export class AgentDashboard implements Component {
  private scrollOffset = 0;
  private selectedIndex = 0;
  private closed = false;
  private agents: AgentRecord[] = [];
  private spinnerFrame = 0; // for live activity animation

  /** Multi-select support (Space to toggle) — very powerful for bulk operations */
  private selectedIds = new Set<string>();
  private showHelp = false; // toggled by ?
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly tui: TUI,
    private readonly options: AgentDashboardOptions,
    private readonly done: () => void,
  ) {
    this.refreshAgents();

    // Live reactivity: auto-refresh the view every 750ms while open
    // (makes spinners and activity feel much more alive)
    this.refreshTimer = setInterval(() => {
      if (!this.closed) {
        this.refreshAgents();
        this.tui.requestRender?.();
      }
    }, 750);
  }

  private refreshAgents(): void {
    this.agents = this.options.manager.listAgents();
    // Clamp selection
    if (this.selectedIndex >= this.agents.length) {
      this.selectedIndex = Math.max(0, this.agents.length - 1);
    }
    // Remove any selected IDs that no longer exist (agents finished/cleaned)
    const currentIds = new Set(this.agents.map(a => a.id));
    for (const id of this.selectedIds) {
      if (!currentIds.has(id)) this.selectedIds.delete(id);
    }
  }

  handleInput(data: string): void {
    const maxScroll = Math.max(0, this.agents.length - this.getViewportHeight());
    const wasClosed = this.closed;
    const rec = this.agents[this.selectedIndex];

    if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.closed = true;
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }
      this.done();
      return;
    }

    // Navigation (vim + arrows)
    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      if (this.agents.length === 0) return;
      this.selectedIndex = Math.min(this.agents.length - 1, this.selectedIndex + 1);
      if (this.selectedIndex >= this.scrollOffset + this.getViewportHeight()) {
        this.scrollOffset = this.selectedIndex - this.getViewportHeight() + 1;
      }
    } else if (matchesKey(data, "pageUp") || matchesKey(data, "shift+up")) {
      this.selectedIndex = Math.max(0, this.selectedIndex - this.getViewportHeight());
      this.scrollOffset = Math.max(0, this.scrollOffset - this.getViewportHeight());
    } else if (matchesKey(data, "pageDown") || matchesKey(data, "shift+down")) {
      if (this.agents.length === 0) return;
      this.selectedIndex = Math.min(this.agents.length - 1, this.selectedIndex + this.getViewportHeight());
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + this.getViewportHeight());
    } else if (matchesKey(data, "home")) {
      this.selectedIndex = 0; this.scrollOffset = 0;
    } else if (matchesKey(data, "end")) {
      if (this.agents.length === 0) return;
      this.selectedIndex = this.agents.length - 1; this.scrollOffset = maxScroll;
    }

    // Actions (Claude Code / OpenCode style hotkeys)
    else if (matchesKey(data, "enter") || matchesKey(data, "return")) {
      if (rec && this.options.onViewConversation) {
        this.closed = true;
        this.done();
        void this.options.onViewConversation(rec);
        return;
      }
    } 
    // Multi-select toggle (Space) - foundation for bulk operations
    else if (matchesKey(data, " ")) {
      if (rec) {
        if (this.selectedIds.has(rec.id)) {
          this.selectedIds.delete(rec.id);
        } else {
          this.selectedIds.add(rec.id);
        }
        this.tui.requestRender();
      }
    }
    // Kill / Abort — supports both single and bulk (multi-select)
    else if (matchesKey(data, "k") || matchesKey(data, "K")) {
      const idsToKill = this.selectedIds.size > 0 
        ? Array.from(this.selectedIds) 
        : (rec ? [rec.id] : []);

      let anyAborted = false;
      for (const id of idsToKill) {
        const aborted = this.options.onAbort ? this.options.onAbort(id) : this.options.manager.abort(id);
        if (aborted) anyAborted = true;
      }
      if (anyAborted) {
        this.selectedIds.clear(); // clear selection after bulk action
        this.refreshAgents();
        this.tui.requestRender();
      }
    } 
    else if (matchesKey(data, "s") || matchesKey(data, "S")) {
      // Steer (currently only supports single; multi-steer is advanced)
      if (rec && this.options.onSteer) {
        this.closed = true;
        this.done();
        void this.options.onSteer(rec.id);
        return;
      }
    } else if (matchesKey(data, "p") || matchesKey(data, "P")) {
      // Permissions / tool scope view (very valuable for understanding what the agent can actually do)
      if (rec && this.options.onShowPermissions) {
        this.closed = true;
        this.done();
        void this.options.onShowPermissions(rec);
        return;
      }
    } else if (matchesKey(data, "r") || matchesKey(data, "R")) {
      this.refreshAgents();
      this.tui.requestRender();
    } else if (matchesKey(data, "?")) {
      this.showHelp = !this.showHelp;
      this.tui.requestRender();
    } else if (matchesKey(data, "w") || matchesKey(data, "W")) {
      // Swarm actions (create from selection, join, leave, swarm-steer)
      // This is the core "w" hotkey for the dikke swarm TUI experience
      const targets = this.selectedIds.size > 0 
        ? this.agents.filter(a => this.selectedIds.has(a.id))
        : (rec ? [rec] : []);

      if (targets.length > 0 && this.options.onSwarmAction) {
        this.closed = true;
        this.done();
        // For now we pass the action type + targets; the menu layer can show a nice submenu
        void this.options.onSwarmAction("menu", targets.map(t => t.id));
        return;
      }
    }

    // Advance spinner for live feel on any input
    this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER.length;

    if (!wasClosed && this.closed) {
      this.done();
    }
  }

  private getViewportHeight(): number {
    const rows = this.tui.terminal.rows;
    const maxRows = Math.floor((rows * DASHBOARD_HEIGHT_PCT) / 100);
    return Math.max(MIN_VIEWPORT, maxRows - this.chromeLines());
  }

  private chromeLines(): number {
    return 6; // header + title + footer + padding
  }

  render(width: number): string[] {
    this.refreshAgents();
    this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER.length; // subtle live animation

    const th = getThemeColors();
    const lines: string[] = [];
    const style = getUiStyle();

    const multiInfo = this.selectedIds.size > 0 
      ? ` • ${this.selectedIds.size} selected` 
      : "";
    const title = `${th.title}Agent Dashboard${th.reset}  ${th.dim}(rich TUI — ${style} • ${this.agents.length} agents${multiInfo})${th.reset}`;
    lines.push(title);
    lines.push(`${th.border}${"─".repeat(Math.min(Math.max(50, width - 4), width))}${th.reset}`);

    const vh = this.getViewportHeight();
    const maxScroll = Math.max(0, this.agents.length - vh);
    const start = Math.min(this.scrollOffset, maxScroll);
    const end = Math.min(start + vh, this.agents.length);

    if (this.showHelp) {
      // Beautiful in-component help (no extra callbacks needed)
      lines.push(`${th.title}Keyboard Shortcuts${th.reset}`);
      lines.push(`${th.border}${"─".repeat(Math.min(45, width))}${th.reset}`);
      const helpLines = [
        "↑ / k          Move selection up",
        "↓ / j          Move selection down",
        "PageUp / Shift+↑   Page up",
        "PageDown / Shift+↓ Page down",
        "Home / End     Jump to first/last",
        "",
        "Enter          View full conversation",
        "Space          Toggle multi-select",
        "k / K          Kill selected (or current)",
        "s / S          Steer selected agent",
        "p / P          Show permissions & scope for selected agent",
        "w / W          Swarm actions (create from selection, join to swarm)",
        "r / R          Force refresh",
        "?              Toggle this help",
        "q / Esc        Close dashboard",
      ];
      for (const h of helpLines) {
        lines.push(`${th.dim}${h}${th.reset}`);
      }
      lines.push(`${th.border}${"─".repeat(Math.min(45, width))}${th.reset}`);
      lines.push(`${th.dim}Press ? again to return to agent list${th.reset}`);
    } else if (this.agents.length === 0) {
      lines.push(`${th.dim}No agents in this session. Spawn some with the Agent tool or /agents → Create.${th.reset}`);
    } else {
      let previousSwarmId: string | undefined = undefined;

      for (let i = start; i < end; i++) {
        const rec = this.agents[i];
        const isSel = i === this.selectedIndex;
        const activity = this.options.agentActivity.get(rec.id);

        // Visual swarm grouping header (bigger TUI presence)
        if (rec.swarmId && rec.swarmId !== previousSwarmId) {
          const swarmLabel = `Swarm ${rec.swarmId}`;
          lines.push(`${th.border}${"─".repeat(Math.min(30, width - 4))}${th.reset}`);
          lines.push(`${th.highlight}${swarmLabel}${th.reset}`);
          previousSwarmId = rec.swarmId;
        } else if (!rec.swarmId && previousSwarmId) {
          previousSwarmId = undefined;
        }

        const isMultiSelected = this.selectedIds.has(rec.id);
        const multiMarker = isMultiSelected ? (style === "plain" ? "[x] " : "✓ ") : "";
        const prefix = isSel 
          ? `${th.highlight}▶ ${multiMarker}` 
          : `  ${multiMarker}`;
        const dn = getDisplayName(rec.type);
        const desc = rec.description ? ` — ${rec.description}` : "";

        // Status with color
        let statusStr = rec.status.toUpperCase();
        if (rec.status === "running") statusStr = style === "plain" ? "RUNNING" : `${th.highlight}RUNNING${th.reset}`;
        else if (rec.status === "queued") statusStr = style === "plain" ? "QUEUED" : `${th.dim}QUEUED${th.reset}`;
        else if (rec.status === "completed" || rec.status === "steered") statusStr = style === "plain" ? "DONE" : "DONE";
        else if (rec.status === "stopped" || rec.status === "aborted") statusStr = "STOPPED";

        const dur = formatDuration(rec.startedAt, rec.completedAt);

        // Rich live activity line
        let activityLine = "";
        if (activity && rec.status === "running") {
          const spinner = SPINNER[this.spinnerFrame % SPINNER.length];
          const act = describeActivity(activity.activeTools, activity.responseText);
          const turns = formatTurns(activity.turnCount, activity.maxTurns);
          const toks = activity.lifetimeUsage ? formatTokens(activity.lifetimeUsage.input + activity.lifetimeUsage.output) : "";
          activityLine = ` ${spinner} ${act} ${th.dim}· ${turns} ${toks ? "· " + toks : ""}${th.reset}`;
        } else if (rec.result && (rec.status === "completed" || rec.status === "steered")) {
          const preview = rec.result.slice(0, 80).replace(/\n/g, " ");
          activityLine = ` ${th.dim}${preview}${preview.length >= 80 ? "…" : ""}${th.reset}`;
        } else if (rec.error) {
          activityLine = ` ${th.dim}Error: ${rec.error.slice(0, 60)}${th.reset}`;
        }

        // === SWARM VISUAL ENHANCEMENT (bigger TUI presence) ===
        let swarmPrefix = "";
        if (rec.swarmId) {
          swarmPrefix = style === "plain" ? `[SWARM:${rec.swarmId.slice(-6)}] ` : `${th.highlight}[swarm]${th.reset} `;
        }

        const mainLine = `${prefix}${swarmPrefix}${dn}${desc} ${th.dim}· ${statusStr} · ${dur}${th.reset}`;
        lines.push(truncateToWidth(mainLine, width - 2));

        if (activityLine) {
          lines.push("   " + truncateToWidth(activityLine, width - 6));
        }

        // Extra metadata for selected agent (now richer for swarms)
        if (isSel) {
          const metaParts: string[] = [];
          if (rec.worktree) metaParts.push(`worktree:${rec.worktree.branch}`);
          if (rec.groupId) metaParts.push(`group:${rec.groupId}`);
          if (rec.swarmId) metaParts.push(`swarm:${rec.swarmId}`);
          if (rec.joinMode) metaParts.push(`mode:${rec.joinMode}`);
          if (rec.validationResults && rec.validated === false) metaParts.push("validation:FAILED");
          if (rec.outputFile) metaParts.push("has output file");

          if (metaParts.length > 0) {
            lines.push(`   ${th.dim}[ ${metaParts.join("  ")} ]${th.reset}`);
          }
        }

        // Separator between agents (subtle)
        if (i < end - 1) {
          lines.push(`${th.dim}${"·".repeat(Math.min(20, Math.floor(width / 3)))}${th.reset}`);
        }
      }
    }

    // Footer with real hotkeys (Claude/OpenCode inspired)
    lines.push(`${th.border}${"─".repeat(Math.min(50, width))}${th.reset}`);
    const footer = `${th.dim}Space=toggle  ↑↓/kj  Enter=view  s=steer  k=kill  w=swarm  p=perms  r=refresh  ?=help  q/esc=close${th.reset}`;
    lines.push(footer);

    return lines;
  }
}

/** Launch helper (mirrors viewAgentConversation pattern exactly). */
export async function showAgentDashboard(
  ctx: ExtensionCommandContext,
  manager: AgentManager,
  agentActivity: Map<string, AgentActivity>,
  onViewConversation?: (record: AgentRecord) => Promise<void>,
  onAbort?: (id: string) => boolean,
  onSteer?: (id: string) => Promise<void>,
  onShowPermissions?: (record: AgentRecord) => Promise<void>,
  onSwarmAction?: (action: string, agentIds: string[]) => Promise<void>,
): Promise<void> {
  const { AgentDashboard, DASHBOARD_HEIGHT_PCT } = await import("./agent-dashboard.js");

  await ctx.ui.custom<undefined>(
    (tui, _theme, _keybindings, done) => {
      return new AgentDashboard(tui, { manager, agentActivity, onViewConversation, onAbort, onSteer, onShowPermissions, onSwarmAction }, done);
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "94%",
        maxHeight: `${DASHBOARD_HEIGHT_PCT}%`,
      },
    },
  );
}
