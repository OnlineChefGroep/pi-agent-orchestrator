/**
 * agent-dashboard.ts — Rich interactive TUI dashboard for subagent management.
 *
 * Current state (strong iteration on feat/rich-subagent-tui):
 * - Full Component + vim navigation (matchesKey)
 * - Live rich activity (spinners, describeActivity, turns, tokens)
 * - Multi-select (Space) + bulk kill
 * - Real hotkeys: Shift+K=kill, s=steer (with editor), Enter=view
 * - Toggleable ? help screen
 * - Rich per-agent metadata (worktree, group/handoff, validation, outputFile)
 * - Themed (premium/retro/plain)
 *
 * Still fully additive. Matches the spirit of OpenCode + Claude Code agent control.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  matchesKey,
  type TUI,
} from "@earendil-works/pi-tui";
import type { AgentManager } from "../agent-manager.js";
import { getDashboardRefreshInterval } from "../agent-registry.js";
import type { AgentRecord } from "../types.js";
import {
  buildDashboardBodyLines,
  type DashboardRenderState,
  renderDashboardDetailPanel,
  renderDashboardEmpty,
  renderDashboardFooter,
  renderDashboardHeader,
  renderDashboardHelp,
} from "./agent-dashboard-renderer.js";
import type { AgentActivity } from "./agent-ui-types.js";
import { framedRow, getBoxChars, getThemeColors } from "./theme.js";

const MIN_VIEWPORT = 5;
export const DASHBOARD_HEIGHT_PCT = 85;

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
  private bodyLineCount = 0;
  private bodyFocusLineByAgentId = new Map<string, number>();

  /** Multi-select support (Space to toggle) — very powerful for bulk operations */
  private selectedIds = new Set<string>();
  private showHelp = false; // toggled by ?
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Create a new AgentDashboard instance.
   * @param tui - The TUI instance for rendering and input handling
   * @param options - Dashboard configuration and callbacks
   * @param done - Callback to invoke when the dashboard is closed
   */

  constructor(
    private readonly tui: TUI,
    private readonly options: AgentDashboardOptions,
    private readonly done: (result: undefined) => void,
  ) {
    this.refreshAgents();

    // Live reactivity: auto-refresh the view at configured interval while open
    // (makes spinners and activity feel much more alive)
    const refreshInterval = getDashboardRefreshInterval();
    this.refreshTimer = setInterval(() => {
      if (!this.closed) {
        this.refreshAgents();
        this.tui.requestRender?.();
      }
    }, refreshInterval);
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.done(undefined);
  }

  /**
   * Refresh the agent list from the manager and update selection bounds.
   */
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

  /**
   * Handle keyboard input for dashboard navigation and actions.
   * @param data - The input character or key sequence
   */
  handleInput(data: string): void {
    const rec = this.agents[this.selectedIndex];
    const viewportHeight = this.getViewportHeight();
    const maxScroll = Math.max(0, this.bodyLineCount - viewportHeight);

    if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.close();
      return;
    }

    // Navigation (vim + arrows)
    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      if (this.agents.length === 0) return;
      this.selectedIndex = Math.min(this.agents.length - 1, this.selectedIndex + 1);
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
        this.close();
        void this.options.onViewConversation(rec);
        return;
      }
    } 
    // Multi-select toggle (Space) - foundation for bulk operations
    else if (matchesKey(data, "space")) {
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
    else if (matchesKey(data, "shift+k")) {
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
    else if (matchesKey(data, "s") || matchesKey(data, "shift+s")) {
      // Steer (currently only supports single; multi-steer is advanced)
      if (rec && this.options.onSteer) {
        this.close();
        void this.options.onSteer(rec.id);
        return;
      }
    } else if (matchesKey(data, "p") || matchesKey(data, "shift+p")) {
      // Permissions / tool scope view (very valuable for understanding what the agent can actually do)
      if (rec && this.options.onShowPermissions) {
        this.close();
        void this.options.onShowPermissions(rec);
        return;
      }
    } else if (matchesKey(data, "r") || matchesKey(data, "shift+r")) {
      this.refreshAgents();
      this.tui.requestRender();
    } else if (matchesKey(data, "?")) {
      this.showHelp = !this.showHelp;
      this.tui.requestRender();
    } else if (matchesKey(data, "w") || matchesKey(data, "shift+w")) {
      const targets = this.selectedIds.size > 0 
        ? this.agents.filter(a => this.selectedIds.has(a.id))
        : (rec ? [rec] : []);

      if (targets.length > 0 && this.options.onSwarmAction) {
        this.close();
        void this.options.onSwarmAction("create", targets.map(t => t.id));
        return;
      }
    }

    // Advance spinner for live feel on any input
    this.spinnerFrame++;
    this.keepSelectedBodyLineVisible();
  }

  /**
   * Calculate the viewport height based on terminal size and dashboard percentage.
   * @returns The number of rows available for agent display
   */
  private getViewportHeight(): number {
    const rows = this.tui.terminal.rows;
    const maxRows = Math.floor((rows * DASHBOARD_HEIGHT_PCT) / 100);
    return Math.max(MIN_VIEWPORT, maxRows - this.chromeLines());
  }

  /**
   * Calculate the number of lines used for chrome (header, footer, etc.).
   * @returns The number of chrome lines
   */
  private chromeLines(): number {
    return 13; // frame + header + detail panel + footer
  }

  private keepSelectedBodyLineVisible(): void {
    const selected = this.agents[this.selectedIndex];
    if (!selected) {
      this.scrollOffset = 0;
      return;
    }
    const line = this.bodyFocusLineByAgentId.get(selected.id);
    if (line === undefined) return;

    const viewportHeight = this.getViewportHeight();
    const maxScroll = Math.max(0, this.bodyLineCount - viewportHeight);
    if (line < this.scrollOffset) {
      this.scrollOffset = line;
    } else if (line >= this.scrollOffset + viewportHeight) {
      this.scrollOffset = line - viewportHeight + 1;
    }
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
  }

  private renderState(): DashboardRenderState {
    return {
      agents: this.agents,
      selectedIndex: this.selectedIndex,
      selectedIds: this.selectedIds,
      frame: this.spinnerFrame,
      agentActivity: this.options.agentActivity,
    };
  }

  /**
   * Render the dashboard UI as an array of strings.
   * @param width - The available width for rendering
   * @returns Array of strings representing the dashboard UI
   */
  render(width: number): string[] {
    this.refreshAgents();
    this.spinnerFrame++;

    const th = getThemeColors();
    const box = getBoxChars();
    const safeWidth = Math.max(40, width);
    const innerW = Math.max(1, safeWidth - 4);
    const state = this.renderState();
    const lines = renderDashboardHeader(safeWidth, th, box, state);

    if (this.showHelp) {
      lines.push(...renderDashboardHelp(innerW, th, box));
      lines.push(...renderDashboardDetailPanel(safeWidth, th, box, state));
      lines.push(...renderDashboardFooter(safeWidth, th, box));
      return lines;
    } else if (this.agents.length === 0) {
      lines.push(...renderDashboardEmpty(innerW, th, box));
    } else {
      const body = buildDashboardBodyLines(innerW, th, box, state);
      this.bodyFocusLineByAgentId = body.focusLineByAgentId;
      this.bodyLineCount = body.lines.length;
      this.keepSelectedBodyLineVisible();
      const vh = this.getViewportHeight();
      const maxScroll = Math.max(0, body.lines.length - vh);
      this.scrollOffset = Math.min(this.scrollOffset, maxScroll);
      const start = Math.min(this.scrollOffset, maxScroll);
      const visible = body.lines.slice(start, start + vh);
      for (const line of visible) lines.push(framedRow(line, innerW, th, box));
      for (let i = visible.length; i < vh; i++) lines.push(framedRow("", innerW, th, box));
    }

    lines.push(...renderDashboardDetailPanel(safeWidth, th, box, state));
    lines.push(...renderDashboardFooter(safeWidth, th, box));
    return lines;
  }

  invalidate(): void {}

  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.closed = true;
  }
}

/**
 * Launch the interactive agent dashboard as an overlay.
 * Mirrors the viewAgentConversation pattern for consistency.
 * 
 * @param ctx - The extension command context
 * @param manager - The agent manager instance
 * @param agentActivity - Map of agent IDs to their activity data
 * @param onViewConversation - Optional callback to view agent conversation
 * @param onAbort - Optional callback to abort an agent
 * @param onSteer - Optional callback to steer an agent
 * @param onShowPermissions - Optional callback to show agent permissions
 * @param onSwarmAction - Optional callback to handle swarm actions
 */
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
