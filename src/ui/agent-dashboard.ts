/**
 * agent-dashboard.ts — Rich interactive TUI dashboard for subagent management.
 *
 * Performance architecture (v2):
 * - Adaptive refresh: 200ms when agents are running, 750ms when idle.
 * - Spinner animation: advanced on every timer tick, not just user input.
 * - Dirty flag: tracks structural changes (agent IDs, statuses) to skip
 *   expensive state recomputation when only the spinner ticked.
 * - Memoized theme/box chars: cached until UI style changes.
 * - Coalesced debounce: multiple rapid spawn requests batched with 16ms cap.
 * - Agent snapshot: lightweight structural hash for change detection.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  matchesKey,
  type TUI,
} from "@earendil-works/pi-tui";
import type { AgentManager } from "../agent-manager.js";
import { getDashboardRefreshInterval, getUiStyle } from "../agent-registry.js";
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
import { getAgentTopEntries, renderTopTable, type SortKey, sortEntries } from "./agent-top-renderer.js";
import type { AgentActivity } from "./agent-ui-types.js";
import { RenderMetrics } from "./render-metrics.js";
import {
  type BoxChars,
  type DashboardTheme,
  framedRow,
  getBoxChars,
  getThemeColors,
} from "./theme.js";

const MIN_VIEWPORT = 8;
export const DASHBOARD_HEIGHT_PCT = 92;

/** Fast refresh when agents are running (5 fps). */
const ACTIVE_REFRESH_MS = 200;

/** Fastest possible refresh (10 fps) for very large agent lists. */
const TURBO_REFRESH_MS = 100;

/** Aggressive refresh (6.7 fps) for large agent lists (50+ agents). */
const HIGH_LOAD_REFRESH_MS = 150;

/** Minimum time between render calls, even under pressure (60 fps cap). */
const MIN_RENDER_GAP_MS = 16;

export interface AgentDashboardOptions {
  manager: AgentManager;
  agentActivity: Map<string, AgentActivity>;
  onViewConversation?: (record: AgentRecord) => Promise<void>;
  onAbort?: (id: string) => boolean;
  onSteer?: (id: string) => Promise<void>;
  onShowPermissions?: (record: AgentRecord) => Promise<void>;
  onSwarmAction?: (action: string, agentIds: string[]) => Promise<void>;
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
  private topViewMode = false;
  private topSortKey: SortKey = "tokens";
  private topSortAsc = false;
  private topPage = 0;
  private topPageSize = 12;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  // ── Performance: debounce & rate limiting ──

  /** Debounce state: true while a microtask render is pending. */
  private renderPending = false;

  /** Timestamp of the last actual render for rate limiting. */
  private lastRenderTime = 0;

  /** Debounce timer handle for coalescing multiple rapid state changes. */
  private coalesceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Performance: memoized theme ──

  /** Cached theme colors — recomputed only when UI style changes. */
  private cachedTheme: DashboardTheme | null = null;

  /** Cached box chars — recomputed only when UI style changes. */
  private cachedBoxChars: BoxChars | null = null;

  /** Last known UI style for cache invalidation. */
  private lastUiStyle: string | null = null;

  // ── Performance: dirty detection ──

  /**
   * Lightweight structural snapshot: a hash of agent IDs + statuses.
   * When this changes, we know the agent list or their states changed.
   * When it stays the same, only cosmetic things (spinner, activity text) changed.
   */
  private agentSnapshot = "";

  /**
   * True when the snapshot changed during the last refreshAgents() call.
   * Reset after each render. Used to decide whether full recompute is needed.
   */
  private dirty = true;

  // ── Performance: render timing metrics ──

  /** Render timing tracker for monitoring dashboard render() performance. */
  private renderMetrics = new RenderMetrics("dashboard-render", 50);

  constructor(
    private readonly tui: TUI,
    private readonly options: AgentDashboardOptions,
    private readonly done: (result: undefined) => void,
  ) {
    this.refreshAgents();
    this.startRefreshTimer();
  }

  // ════════════════════════════════════════════════════════════════
  // Adaptive Refresh Timer
  // ════════════════════════════════════════════════════════════════

  /**
   * Compute the optimal refresh interval based on current agent state.
   * - 100+ agents: TURBO_REFRESH_MS (100ms) — high throughput, rapid state changes
   * - 50-99 agents: HIGH_LOAD_REFRESH_MS (150ms) — balanced for medium-large lists
   * - Running/queued agents: ACTIVE_REFRESH_MS (200ms) — captures state transitions
   * - Idle with < 50 agents: getDashboardRefreshInterval() (750ms) — low overhead
   */
  private computeRefreshInterval(): number {
    const count = this.agents.length;
    if (count >= 100) return TURBO_REFRESH_MS;
    if (count >= 50) return HIGH_LOAD_REFRESH_MS;
    if (this.hasRunningAgents()) return ACTIVE_REFRESH_MS;
    return getDashboardRefreshInterval();
  }

  /**
   * Start (or restart) the refresh timer with an adaptive interval.
   * Interval adapts to agent count and activity level.
   */
  private startRefreshTimer(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);

    const interval = this.computeRefreshInterval();

    this.refreshTimer = setInterval(() => {
      if (this.closed) return;

      // Always advance spinner for smooth animation even without user input.
      this.spinnerFrame++;
      this.refreshAgents();

      // Only re-render if something actually changed or we're in active/turbo mode.
      if (this.dirty || this.spinnerFrame % 3 === 0) {
        this.requestRender();
      }

      // Adapt interval: if agent count or activity changed significantly, restart.
      const newInterval = this.computeRefreshInterval();
      if (newInterval !== interval) {
        this.startRefreshTimer();
      }
    }, interval);
  }

  private hasRunningAgents(): boolean {
    return this.agents.some((a) => a.status === "running" || a.status === "queued");
  }

  // ════════════════════════════════════════════════════════════════
  // Debounced & Rate-Limited Render Requests
  // ════════════════════════════════════════════════════════════════

  /**
   * Coalesced render request with rate limiting.
   *
   * - First call in a burst: schedules via queueMicrotask (fires after current
   *   synchronous work completes, batching all concurrent spawns).
   * - Subsequent calls within 16ms of the last render: coalesced via setTimeout
   *   so we never render more than ~60 fps.
   * - Duplicate calls while pending: ignored (renderPending guard).
   */
  private requestRender(): void {
    if (this.closed) return;

    const now = Date.now();
    const elapsed = now - this.lastRenderTime;

    // Rate limit: don't render more often than every 16ms.
    if (this.lastRenderTime > 0 && elapsed < MIN_RENDER_GAP_MS) {
      // Coalesce: schedule one render after the rate limit window expires.
      if (!this.coalesceTimer && !this.renderPending) {
        this.coalesceTimer = setTimeout(() => {
          this.coalesceTimer = null;
          this.lastRenderTime = 0; // force allow
          this.requestRender();
        }, MIN_RENDER_GAP_MS - elapsed);
      }
      return;
    }

    // Already pending — skip.
    if (this.renderPending) return;

    this.renderPending = true;

    queueMicrotask(() => {
      this.renderPending = false;
      if (this.closed) return;
      this.lastRenderTime = Date.now();
      this.tui.requestRender?.();
    });
  }

  // ════════════════════════════════════════════════════════════════
  // Lifecycle
  // ════════════════════════════════════════════════════════════════

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
    }
    this.done(undefined);
  }

  // ════════════════════════════════════════════════════════════════
  // State Management
  // ════════════════════════════════════════════════════════════════

  /**
   * Refresh agent list and detect structural changes.
   * Sets `this.dirty` when agent IDs or statuses changed.
   */
  private refreshAgents(): void {
    this.agents = this.options.manager.listAgents();

    // Build lightweight structural snapshot.
    const snapshot = this.buildSnapshot();

    if (snapshot !== this.agentSnapshot) {
      this.agentSnapshot = snapshot;
      this.dirty = true;

      // Clamp selection when agents were removed.
      if (this.selectedIndex >= this.agents.length) {
        this.selectedIndex = Math.max(0, this.agents.length - 1);
      }

      // Purge selected IDs that no longer exist.
      const currentIds = new Set(this.agents.map((a) => a.id));
      for (const id of this.selectedIds) {
        if (!currentIds.has(id)) this.selectedIds.delete(id);
      }
    }
  }

  /**
   * Build a compact structural hash from agent IDs + statuses.
   * Only changes when agents are added, removed, or change status.
   */
  private buildSnapshot(): string {
    // For small agent counts (< 50), this is extremely fast.
    // For larger counts, we'd use a rolling hash, but listAgents()
    // already does the heavy sort — this is trivial in comparison.
    let hash = "";
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      hash += `${a.id}:${a.status},`;
    }
    return hash;
  }

  // ════════════════════════════════════════════════════════════════
  // Memoized Theme
  // ════════════════════════════════════════════════════════════════

  /** Get theme colors, recomputing only when UI style changes. */
  private getTheme(): DashboardTheme {
    const currentStyle = getUiStyle();
    if (this.cachedTheme && this.lastUiStyle === currentStyle) {
      return this.cachedTheme;
    }
    this.cachedTheme = getThemeColors();
    this.lastUiStyle = currentStyle;
    return this.cachedTheme;
  }

  /** Get box characters, recomputing only when UI style changes. */
  private getBox(): BoxChars {
    const currentStyle = getUiStyle();
    if (this.cachedBoxChars && this.lastUiStyle === currentStyle) {
      return this.cachedBoxChars;
    }
    this.cachedBoxChars = getBoxChars();
    return this.cachedBoxChars;
  }

  // ════════════════════════════════════════════════════════════════
  // Input Handling
  // ════════════════════════════════════════════════════════════════

  handleInput(data: string): void {
    const rec = this.agents[this.selectedIndex];
    const viewportHeight = this.getViewportHeight();
    const maxScroll = Math.max(0, this.bodyLineCount - viewportHeight);

    if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.close();
      return;
    }

    // Navigation — vim + arrows
    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.dirty = true;
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      if (this.agents.length === 0) return;
      this.selectedIndex = Math.min(this.agents.length - 1, this.selectedIndex + 1);
      this.dirty = true;
    } else if (matchesKey(data, "pageUp") || matchesKey(data, "shift+up")) {
      this.selectedIndex = Math.max(0, this.selectedIndex - this.getViewportHeight());
      this.scrollOffset = Math.max(0, this.scrollOffset - this.getViewportHeight());
      this.dirty = true;
    } else if (matchesKey(data, "pageDown") || matchesKey(data, "shift+down")) {
      if (this.agents.length === 0) return;
      this.selectedIndex = Math.min(this.agents.length - 1, this.selectedIndex + viewportHeight);
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + viewportHeight);
      this.dirty = true;
    } else if (matchesKey(data, "home")) {
      this.selectedIndex = 0;
      this.scrollOffset = 0;
      this.dirty = true;
    } else if (matchesKey(data, "end")) {
      if (this.agents.length === 0) return;
      this.selectedIndex = this.agents.length - 1;
      this.scrollOffset = maxScroll;
      this.dirty = true;
    }

    // Actions
    else if (matchesKey(data, "enter") || matchesKey(data, "return")) {
      if (rec && this.options.onViewConversation) {
        this.close();
        void this.options.onViewConversation(rec);
        return;
      }
    } else if (matchesKey(data, "space")) {
      if (rec) {
        if (this.selectedIds.has(rec.id)) {
          this.selectedIds.delete(rec.id);
        } else {
          this.selectedIds.add(rec.id);
        }
        this.dirty = true;
        this.requestRender();
      }
    } else if (matchesKey(data, "shift+k")) {
      const idsToKill = this.selectedIds.size > 0
        ? Array.from(this.selectedIds)
        : rec ? [rec.id] : [];

      let anyAborted = false;
      for (const id of idsToKill) {
        const aborted = this.options.onAbort
          ? this.options.onAbort(id)
          : this.options.manager.abort(id);
        if (aborted) anyAborted = true;
      }
      if (anyAborted) {
        this.selectedIds.clear();
        this.refreshAgents();
        this.requestRender();
      }
    } else if (matchesKey(data, "s") || matchesKey(data, "shift+s")) {
      if (rec && this.options.onSteer) {
        this.close();
        void this.options.onSteer(rec.id);
        return;
      }
    } else if (matchesKey(data, "p") || matchesKey(data, "shift+p")) {
      if (rec && this.options.onShowPermissions) {
        this.close();
        void this.options.onShowPermissions(rec);
        return;
      }
    } else if (matchesKey(data, "r") || matchesKey(data, "shift+r")) {
      this.refreshAgents();
      this.requestRender();
    } else if (matchesKey(data, "?")) {
      this.showHelp = !this.showHelp;
      this.dirty = true;
      this.requestRender();
    } else if (matchesKey(data, "t") || matchesKey(data, "shift+t")) {
      this.topViewMode = !this.topViewMode;
      if (this.topViewMode) this.topPage = 0;
      this.dirty = true;
      this.requestRender();
    } else if (matchesKey(data, "w") || matchesKey(data, "shift+w")) {
      const targets = this.selectedIds.size > 0
        ? this.agents.filter((a) => this.selectedIds.has(a.id))
        : rec ? [rec] : [];

      if (targets.length > 0 && this.options.onSwarmAction) {
        this.close();
        void this.options.onSwarmAction("create", targets.map((t) => t.id));
        return;
      }
    }

    // ── Top view mode ─────────────────────────────────────────────
    else if (this.topViewMode) {
      // Sort keys: t=tokens, r=turns, d=duration, u=toolUses, n=name
      if (matchesKey(data, "t")) {
        if (this.topSortKey === "tokens") this.topSortAsc = !this.topSortAsc;
        else { this.topSortKey = "tokens"; this.topSortAsc = false; }
        this.topPage = 0;
        this.requestRender();
      } else if (matchesKey(data, "r")) {
        if (this.topSortKey === "turns") this.topSortAsc = !this.topSortAsc;
        else { this.topSortKey = "turns"; this.topSortAsc = false; }
        this.topPage = 0;
        this.requestRender();
      } else if (matchesKey(data, "d")) {
        if (this.topSortKey === "duration") this.topSortAsc = !this.topSortAsc;
        else { this.topSortKey = "duration"; this.topSortAsc = false; }
        this.topPage = 0;
        this.requestRender();
      } else if (matchesKey(data, "u")) {
        if (this.topSortKey === "toolUses") this.topSortAsc = !this.topSortAsc;
        else { this.topSortKey = "toolUses"; this.topSortAsc = false; }
        this.topPage = 0;
        this.requestRender();
      } else if (matchesKey(data, "l")) {
        if (this.topSortKey === "lastSeen") this.topSortAsc = !this.topSortAsc;
        else { this.topSortKey = "lastSeen"; this.topSortAsc = false; }
        this.topPage = 0;
        this.requestRender();
      } else if (matchesKey(data, "n")) {
        if (this.topSortKey === "name") this.topSortAsc = !this.topSortAsc;
        else { this.topSortKey = "name"; this.topSortAsc = false; }
        this.topPage = 0;
        this.requestRender();
      }
      // Page navigation
      else if (matchesKey(data, "left") || matchesKey(data, "shift+left")) {
        this.topPage = Math.max(0, this.topPage - 1);
        this.requestRender();
      } else if (matchesKey(data, "right") || matchesKey(data, "shift+right")) {
        const entries = sortEntries(getAgentTopEntries(this.agents, this.options.agentActivity), this.topSortKey, this.topSortAsc);
        const totalPages = Math.max(1, Math.ceil(entries.length / this.getViewportHeight()));
        this.topPage = Math.min(totalPages - 1, this.topPage + 1);
        this.requestRender();
      }
    }

    // Spinner: advance on user input for responsive feel.
    this.spinnerFrame++;
    this.keepSelectedBodyLineVisible();
  }

  // ════════════════════════════════════════════════════════════════
  // Layout Helpers
  // ════════════════════════════════════════════════════════════════

  private getViewportHeight(): number {
    const rows = this.tui.terminal.rows;
    const maxRows = Math.floor((rows * DASHBOARD_HEIGHT_PCT) / 100);
    return Math.max(MIN_VIEWPORT, maxRows - this.chromeLines());
  }

  /**
   * Dynamically compute chrome lines based on terminal height.
   * Small terminals get proportionally less chrome; large terminals get more.
   * - Very small (< 30 rows): 10 lines (minimal chrome)
   * - Small (30-50 rows): 13 lines
   * - Normal (50-80 rows): 16 lines
   * - Large (> 80 rows): 19 lines
   */
  private chromeLines(): number {
    const rows = this.tui.terminal.rows;
    if (rows < 30) return 10;
    if (rows < 50) return 13;
    if (rows < 80) return 16;
    return 19;
  }

  private keepSelectedBodyLineVisible(): void {
    const selected = this.agents[this.selectedIndex];
    if (!selected) { this.scrollOffset = 0; return; }
    const line = this.bodyFocusLineByAgentId.get(selected.id);
    if (line === undefined) return;

    const vh = this.getViewportHeight();
    const maxScroll = Math.max(0, this.bodyLineCount - vh);
    if (line < this.scrollOffset) {
      this.scrollOffset = line;
    } else if (line >= this.scrollOffset + vh) {
      this.scrollOffset = line - vh + 1;
    }
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));
  }

  // ════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════

  private renderState(): DashboardRenderState {
    return {
      agents: this.agents,
      selectedIndex: this.selectedIndex,
      selectedIds: this.selectedIds,
      frame: this.spinnerFrame,
      agentActivity: this.options.agentActivity,
    };
  }

  render(width: number): string[] {
    const renderStart = performance.now();

    // Use memoized theme/box chars (only recomputed on UI style change).
    const th = this.getTheme();
    const box = this.getBox();

    // Robust width handling
    const terminalCols =
      (this.tui as any)?.terminal?.columns ??
      process.stdout?.columns ??
      120;

    const requestedWidth = width || terminalCols;
    const safeWidth = Math.max(60, Math.min(requestedWidth, terminalCols - 2));
    const innerW = Math.max(1, safeWidth - 4);

    const state = this.renderState();
    const lines = renderDashboardHeader(safeWidth, th, box, state, this.options.manager);

    if (this.showHelp) {
      lines.push(...renderDashboardHelp(innerW, th, box));
    } else if (this.agents.length === 0) {
      lines.push(...renderDashboardEmpty(innerW, th, box));
    } else if (this.topViewMode) {
      // Top view: render the agent stats table instead of the list
      const vh = this.getViewportHeight();
      this.topPageSize = Math.max(5, vh);
      const entries = sortEntries(getAgentTopEntries(this.agents, this.options.agentActivity), this.topSortKey, this.topSortAsc);
      lines.push(...renderTopTable(entries, this.topSortKey, this.topSortAsc, this.topPage, this.topPageSize, th, safeWidth, "t: back to list"));
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

    lines.push(...renderDashboardDetailPanel(safeWidth, th, box, state, this.options.manager));
    lines.push(...renderDashboardFooter(safeWidth, th, box, this.options.agentActivity));

    // Reset dirty flag after a full render.
    this.dirty = false;

    // Record render timing.
    this.renderMetrics.record(performance.now() - renderStart);

    return lines;
  }

  /** Get render performance metrics snapshot. */
  getRenderMetrics() {
    return this.renderMetrics.snapshot();
  }

  invalidate(): void {
    // Invalidate theme cache when the framework calls this (e.g. style change).
    this.cachedTheme = null;
    this.cachedBoxChars = null;
    this.lastUiStyle = null;
    this.dirty = true;
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
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
      return new AgentDashboard(
        tui,
        { manager, agentActivity, onViewConversation, onAbort, onSteer, onShowPermissions, onSwarmAction },
        done,
      );
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
