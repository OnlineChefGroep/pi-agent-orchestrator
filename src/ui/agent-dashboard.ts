
/**
 * agent-dashboard.ts — Rich interactive TUI dashboard for subagent management.
 *
 * Performance notes:
 * - We use debounced requestRender() to avoid lag spikes when many agents are spawned quickly.
 * - refreshAgents() is only called from the timer and explicit action points, not from render().
 * - spinnerFrame is only incremented during actual visible renders.
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

const MIN_VIEWPORT = 8;
export const DASHBOARD_HEIGHT_PCT = 92;

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
  private spinnerFrame = 0;
  private bodyLineCount = 0;
  private bodyFocusLineByAgentId = new Map<string, number>();

  /** Multi-select support */
  private selectedIds = new Set<string>();
  private showHelp = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  /** Debounce mechanism to prevent lag spikes on rapid state changes (e.g. spawning many agents) */
  private renderPending = false;

  constructor(
    private readonly tui: TUI,
    private readonly options: AgentDashboardOptions,
    private readonly done: (result: undefined) => void,
  ) {
    this.refreshAgents();

    const refreshInterval = getDashboardRefreshInterval();
    this.refreshTimer = setInterval(() => {
      if (!this.closed) {
        this.refreshAgents();
        this.requestRender();
      }
    }, refreshInterval);
  }

  /**
   * Debounced render request.
   * Prevents multiple renders in the same microtask when many agents are spawned quickly.
   */
  private requestRender(): void {
    if (this.renderPending || this.closed) return;

    this.renderPending = true;

    queueMicrotask(() => {
      if (!this.closed && this.renderPending) {
        this.tui.requestRender?.();
      }
      this.renderPending = false;
    });
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

  private refreshAgents(): void {
    this.agents = this.options.manager.listAgents();

    if (this.selectedIndex >= this.agents.length) {
      this.selectedIndex = Math.max(0, this.agents.length - 1);
    }

    const currentIds = new Set(this.agents.map(a => a.id));
    for (const id of this.selectedIds) {
      if (!currentIds.has(id)) this.selectedIds.delete(id);
    }
  }

  handleInput(data: string): void {
    const rec = this.agents[this.selectedIndex];
    const viewportHeight = this.getViewportHeight();
    const maxScroll = Math.max(0, this.bodyLineCount - viewportHeight);

    if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.close();
      return;
    }

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
      this.selectedIndex = 0;
      this.scrollOffset = 0;
    } else if (matchesKey(data, "end")) {
      if (this.agents.length === 0) return;
      this.selectedIndex = this.agents.length - 1;
      this.scrollOffset = maxScroll;
    }
    else if (matchesKey(data, "enter") || matchesKey(data, "return")) {
      if (rec && this.options.onViewConversation) {
        this.close();
        void this.options.onViewConversation(rec);
        return;
      }
    }
    else if (matchesKey(data, "space")) {
      if (rec) {
        if (this.selectedIds.has(rec.id)) {
          this.selectedIds.delete(rec.id);
        } else {
          this.selectedIds.add(rec.id);
        }
        this.requestRender();
      }
    }
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
        this.selectedIds.clear();
        this.refreshAgents();
        this.requestRender();
      }
    }
    else if (matchesKey(data, "s") || matchesKey(data, "shift+s")) {
      if (rec && this.options.onSteer) {
        this.close();
        void this.options.onSteer(rec.id);
        return;
      }
    }
    else if (matchesKey(data, "p") || matchesKey(data, "shift+p")) {
      if (rec && this.options.onShowPermissions) {
        this.close();
        void this.options.onShowPermissions(rec);
        return;
      }
    }
    else if (matchesKey(data, "r") || matchesKey(data, "shift+r")) {
      this.refreshAgents();
      this.requestRender();
    }
    else if (matchesKey(data, "?")) {
      this.showHelp = !this.showHelp;
      this.requestRender();
    }
    else if (matchesKey(data, "w") || matchesKey(data, "shift+w")) {
      const targets = this.selectedIds.size > 0
        ? this.agents.filter(a => this.selectedIds.has(a.id))
        : (rec ? [rec] : []);

      if (targets.length > 0 && this.options.onSwarmAction) {
        this.close();
        void this.options.onSwarmAction("create", targets.map(t => t.id));
        return;
      }
    }

    // Only advance spinner when user is actively interacting
    this.spinnerFrame++;
    this.keepSelectedBodyLineVisible();
  }

  private getViewportHeight(): number {
    const rows = this.tui.terminal.rows;
    const maxRows = Math.floor((rows * DASHBOARD_HEIGHT_PCT) / 100);
    return Math.max(MIN_VIEWPORT, maxRows - this.chromeLines());
  }

  private chromeLines(): number {
    return 16;
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
   * Main render method.
   * Note: We no longer call refreshAgents() here to avoid redundant work during rapid state changes.
   */
  render(width: number): string[] {
    const th = getThemeColors();
    const box = getBoxChars();

    // Robust width handling
    const terminalCols =
      (this.tui as any)?.terminal?.columns ??
      process.stdout?.columns ??
      120;

    const requestedWidth = width || terminalCols;
    const safeWidth = Math.max(60, Math.min(requestedWidth, terminalCols - 2));
    const innerW = Math.max(1, safeWidth - 4);

    const state = this.renderState();
    const lines = renderDashboardHeader(safeWidth, th, box, state);

    if (this.showHelp) {
      lines.push(...renderDashboardHelp(innerW, th, box));
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
        width: "98%",
        maxHeight: `${DASHBOARD_HEIGHT_PCT}%`,
      },
    },
  );
}
