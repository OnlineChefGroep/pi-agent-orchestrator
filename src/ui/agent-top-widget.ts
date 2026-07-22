/**
 * agent-top-widget.ts — Persistent AGENT TOP strip above the editor.
 *
 * Unlike the old fullscreen `/agents → Agent top` overlay (which replaced the
 * session), this registers a Pi `setWidget` above the editor and only appears
 * while agents are running/queued (plus a short linger for finished ones).
 * The session chat stays fully usable underneath.
 */

import type { AgentManager } from "../agent-manager.js";
import { isShowAgentTopWidget } from "../agent-registry.js";
import type { AgentRecord } from "../types.js";
import {
  getAgentTopEntries,
  renderTopTable,
  type SortKey,
  sortEntries,
} from "./agent-top-renderer.js";
import type { AgentActivity, UICtx } from "./agent-ui-types.js";
import { ERROR_STATUSES } from "./agent-widget-renderer.js";
import { buildSnapshotHash } from "./snapshot-hash.js";
import { getThemeColors } from "./theme.js";
import type { TUI } from "./tui-shim.js";

const ACTIVE_REFRESH_MS = 200;
const IDLE_REFRESH_MS = 1000;
const WIDGET_KEY = "agent-top";
/** Max agent rows in the above-editor strip (keeps the session readable). */
const WIDGET_PAGE_SIZE = 5;
const ERROR_LINGER_TURNS = 2;

export class AgentTopWidget {
  private closed = false;
  private uiCtx: UICtx | undefined;
  private widgetRegistered = false;
  private tui: TUI | undefined;
  private tickTimer: ReturnType<typeof setTimeout> | undefined;
  private currentIntervalMs = ACTIVE_REFRESH_MS;
  private dirty = true;
  private snapshotHash = 0;
  private sortKey: SortKey = "tokens";
  private sortAsc = false;
  private finishedTurnAge = new Map<string, number>();

  constructor(
    private manager: AgentManager,
    private agentActivity: Map<string, AgentActivity>,
  ) {}

  setUICtx(ctx: UICtx): void {
    if (ctx !== this.uiCtx) {
      if (this.uiCtx) {
        this.uiCtx.setWidget(WIDGET_KEY, undefined);
      }
      this.uiCtx = ctx;
      this.widgetRegistered = false;
      this.tui = undefined;
      this.dirty = true;
    }
  }

  ensureTimer(): void {
    if (!this.tickTimer) this.scheduleNextTick(ACTIVE_REFRESH_MS);
  }

  onTurnStart(): void {
    for (const [id, age] of this.finishedTurnAge) {
      this.finishedTurnAge.set(id, age + 1);
    }
    this.dirty = true;
    this.update();
  }

  markFinished(agentId: string): void {
    if (!this.finishedTurnAge.has(agentId)) {
      this.finishedTurnAge.set(agentId, 0);
    }
  }

  /** Force a redraw after settings toggles. */
  forceRefresh(): void {
    this.dirty = true;
    this.update();
  }

  private scheduleNextTick(intervalMs: number): void {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.tickTimer = setTimeout(() => {
      if (!this.uiCtx || this.closed) return;
      this.update();
      if (this.tickTimer !== undefined) {
        this.scheduleNextTick(this.currentIntervalMs);
      }
    }, intervalMs);
  }

  private shouldShowFinished(agentId: string, status: string): boolean {
    const age = this.finishedTurnAge.get(agentId) ?? 0;
    const maxAge = ERROR_STATUSES.has(status) ? ERROR_LINGER_TURNS : 1;
    return age < maxAge;
  }

  private visibleAgents(all: AgentRecord[]): AgentRecord[] {
    const out: AgentRecord[] = [];
    for (let i = 0; i < all.length; i++) {
      const agent = all[i];
      if (agent.status === "running" || agent.status === "queued") {
        out.push(agent);
        continue;
      }
      if (agent.completedAt && this.shouldShowFinished(agent.id, agent.status)) {
        out.push(agent);
      }
    }
    return out;
  }

  private clearWidget(): void {
    if (this.widgetRegistered && this.uiCtx) {
      this.uiCtx.setWidget(WIDGET_KEY, undefined);
    }
    this.widgetRegistered = false;
    this.tui = undefined;
  }

  update(): void {
    if (this.closed || !this.uiCtx) return;

    if (!isShowAgentTopWidget()) {
      this.clearWidget();
      if (this.tickTimer) {
        clearTimeout(this.tickTimer);
        this.tickTimer = undefined;
      }
      return;
    }

    const allAgents = this.manager.listAgents();
    const agents = this.visibleAgents(allAgents);
    const hasActive = agents.some((a) => a.status === "running" || a.status === "queued");

    // Age bookkeeping for removed agents
    const ids = new Set(allAgents.map((a) => a.id));
    for (const [id] of this.finishedTurnAge) {
      if (!ids.has(id)) this.finishedTurnAge.delete(id);
    }

    if (agents.length === 0) {
      this.clearWidget();
      if (this.tickTimer) {
        clearTimeout(this.tickTimer);
        this.tickTimer = undefined;
      }
      return;
    }

    this.currentIntervalMs = hasActive ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS;
    this.ensureTimer();

    const nextHash = buildSnapshotHash(agents);
    if (nextHash !== this.snapshotHash) {
      this.snapshotHash = nextHash;
      this.dirty = true;
    }

    // Animate while active even if structure is unchanged.
    if (!this.dirty && hasActive) this.dirty = true;

    if (!this.dirty && this.widgetRegistered) return;

    if (this.widgetRegistered) {
      this.tui?.requestRender();
      this.dirty = false;
      return;
    }

    this.uiCtx.setWidget(WIDGET_KEY, (tui, _theme) => {
      this.tui = tui;
      return {
        render: () => this.render(tui.terminal.columns),
        invalidate: () => {
          this.widgetRegistered = false;
          this.tui = undefined;
          this.dirty = true;
        },
      };
    }, { placement: "aboveEditor" });
    this.widgetRegistered = true;
    this.dirty = false;
  }

  private render(columns: number): string[] {
    const agents = this.visibleAgents(this.manager.listAgents());
    const entries = sortEntries(
      getAgentTopEntries(agents, this.agentActivity),
      this.sortKey,
      this.sortAsc,
    );
    return renderTopTable(
      entries,
      this.sortKey,
      this.sortAsc,
      0,
      WIDGET_PAGE_SIZE,
      getThemeColors(),
      Math.max(40, columns),
      { mode: "widget" },
    );
  }

  dispose(): void {
    this.closed = true;
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = undefined;
    }
    this.clearWidget();
  }
}
