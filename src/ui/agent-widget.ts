/**
 * agent-widget.ts — Persistent widget showing running/completed agents above the editor.
 *
 * Displays a tree of agents with animated spinners, live stats, and activity descriptions.
 * Uses the callback form of setWidget for themed rendering.
 *
 * Performance features:
 * - Dirty checking: skips TUI re-render when agent list structure hasn't changed.
 * - Adaptive refresh: faster interval (200ms) when agents are running,
 *   falls back to animation interval (80ms) when all agents are finished.
 *
 * UI styles: premium (default), retro, plain
 */

import type { AgentManager } from "../agent-manager.js";
import type { AgentActivity, UICtx } from "./agent-ui-types.js";
import { ERROR_STATUSES, renderAgentWidget } from "./agent-widget-renderer.js";

import type { Theme } from "./theme.js";

// ---- Constants ----

/** Fast refresh interval when agents are actively running. */
const ACTIVE_REFRESH_MS = 200;

/** Idle refresh interval when all agents are finished — animates spinner cheaply. */
const IDLE_REFRESH_MS = 1000;

// ---- Widget manager ----

export class AgentWidget {
  private uiCtx: UICtx | undefined;
  private widgetFrame = 0;
  private widgetInterval: ReturnType<typeof setInterval> | undefined;
  /** Current refresh interval in ms (for adaptive tracking). */
  private currentIntervalMs = ACTIVE_REFRESH_MS;
  /** Tracks how many turns each finished agent has survived. Key: agent ID, Value: turns since finished. */
  private finishedTurnAge = new Map<string, number>();
  /** How many extra turns errors/aborted agents linger (completed agents clear after 1 turn). */
  private static readonly ERROR_LINGER_TURNS = 2;

  /** Whether the widget callback is currently registered with the TUI. */
  private widgetRegistered = false;
  /** Cached TUI reference from widget factory callback, used for requestRender(). */
  private tui: any | undefined;
  /** Last status bar text, used to avoid redundant setStatus calls. */
  private lastStatusText: string | undefined;

  // ── Performance: dirty detection ──

  /**
   * Lightweight structural snapshot: agent IDs + statuses.
   * When unchanged, we skip requestRender to avoid TUI-wide re-render.
   */
  private agentSnapshot = "";

  /**
   * True if the snapshot changed during the last update.
   * Reset after each render cycle.
   */
  private dirty = false;

  // ── Performance: spawn batching ──

  /** Debounce timer for coalescing rapid update() calls during spawn bursts. */
  private updateTimer: ReturnType<typeof setTimeout> | undefined;

  /** Minimum gap between consecutive update() calls (16ms ~ 60fps). */
  private static readonly SPAWN_BATCH_MS = 16;

  /**
   * Build a compact hash from agent IDs + statuses.
   */
  private buildSnapshot(agents: { id: string; status: string }[]): string {
    if (agents.length === 0) return "";
    // For small agent counts (< 50), simple string concat is fastest.
    // For larger, we'd use a rolling hash, but widget typically shows few agents.
    let hash = "";
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      hash += `${a.id}:${a.status},`;
    }
    return hash;
  }

  constructor(
    private manager: AgentManager,
    private agentActivity: Map<string, AgentActivity>,
  ) {}

  /** Set the UI context (grabbed from first tool execution). */
  setUICtx(ctx: UICtx) {
    if (ctx !== this.uiCtx) {
      // UICtx changed — the widget registered on the old context is gone.
      // Force re-registration on next update().
      this.uiCtx = ctx;
      this.widgetRegistered = false;
      this.tui = undefined;
      this.lastStatusText = undefined;
    }
  }

  /**
   * Called on each new turn (tool_execution_start).
   * Ages finished agents and clears those that have lingered long enough.
   */
  onTurnStart() {
    // Age all finished agents
    for (const [id, age] of this.finishedTurnAge) {
      this.finishedTurnAge.set(id, age + 1);
    }
    // Force update on turn boundaries — finished agents might expire
    this.dirty = true;
    this.update();
  }

  /** Ensure the widget update timer is running. */
  ensureTimer() {
    if (!this.widgetInterval) {
      // Start with a moderate interval; update() adapts it dynamically.
      this.widgetInterval = setInterval(() => {
        if (!this.uiCtx) return;
        this.update();
      }, ACTIVE_REFRESH_MS);
    }
  }

  /** Check if a finished agent should still be shown in the widget. */
  private shouldShowFinished(agentId: string, status: string): boolean {
    const age = this.finishedTurnAge.get(agentId) ?? 0;
    const maxAge = ERROR_STATUSES.has(status) ? AgentWidget.ERROR_LINGER_TURNS : 1;
    return age < maxAge;
  }

  /** Record an agent as finished (call when agent completes). */
  markFinished(agentId: string) {
    if (!this.finishedTurnAge.has(agentId)) {
      this.finishedTurnAge.set(agentId, 0);
    }
  }

  private renderWidget(tui: any, theme: Theme): string[] {
    return renderAgentWidget({
      agents: this.manager.listAgents(),
      agentActivity: this.agentActivity,
      frame: this.widgetFrame,
      shouldShowFinished: (agentId, status) => this.shouldShowFinished(agentId, status),
      theme,
      tui,
    });
  }

  /**
   * Debounced update: coalesces rapid calls (e.g. bulk spawns) into a single
   * update after 16ms. Falls back to immediate update when the timer is not
   * already pending — ensures the widget still updates promptly for the
   * first spawn, while batching subsequent ones.
   *
   * Usage: call from spawn paths where multiple agents may be created in
   * quick succession (background spawns, swarm joins, group joins).
   */
  debouncedUpdate(): void {
    if (!this.uiCtx) return;
    if (this.updateTimer) {
      // Timer already pending — will fire after window expires
      return;
    }
    // First call: immediate update to show the first agent promptly.
    // Then schedule a coalesced update to catch any subsequent spawns.
    this.update();
    this.updateTimer = setTimeout(() => {
      this.updateTimer = undefined;
      this.update();
    }, AgentWidget.SPAWN_BATCH_MS);
  }

  /** Force an immediate widget update. */
  update() {
    if (!this.uiCtx) return;
    // Clear any pending debounce timer — we're updating now.
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = undefined;
    }
    const allAgents = this.manager.listAgents();

    // Build structural snapshot to detect real changes.
    const snapshot = this.buildSnapshot(allAgents);
    const snapshotChanged = snapshot !== this.agentSnapshot;
    if (snapshotChanged) {
      this.agentSnapshot = snapshot;
      this.dirty = true;
      // Adapt refresh interval based on agent activity level.
      // Running agents: fast polling (200ms) to catch state transitions.
      // Idle/finished: slow polling (1000ms) — dirty check makes each tick cheap.
      const hasRunning = allAgents.some(a => a.status === "running" || a.status === "queued");
      const targetInterval = hasRunning ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS;
      if (this.currentIntervalMs !== targetInterval) {
        this.currentIntervalMs = targetInterval;
        clearInterval(this.widgetInterval);
        this.widgetInterval = setInterval(() => {
          if (!this.uiCtx) return;
          this.update();
        }, targetInterval);
      }
    }

    // Lightweight existence checks — full categorization happens in renderWidget()
    let runningCount = 0;
    let queuedCount = 0;
    let hasFinished = false;
    for (const a of allAgents) {
      if (a.status === "running") { runningCount++; }
      else if (a.status === "queued") { queuedCount++; }
      else if (a.completedAt && this.shouldShowFinished(a.id, a.status)) { hasFinished = true; }
    }
    const hasActive = runningCount > 0 || queuedCount > 0;

    // Nothing to show — clear widget
    if (!hasActive && !hasFinished) {
      if (this.widgetRegistered) {
        this.uiCtx.setWidget("agents", undefined);
        this.widgetRegistered = false;
        this.tui = undefined;
      }
      if (this.lastStatusText !== undefined) {
        this.uiCtx.setStatus("subagents", undefined);
        this.lastStatusText = undefined;
      }
      if (this.widgetInterval) { clearInterval(this.widgetInterval); this.widgetInterval = undefined; }
      // Clean up stale entries
      for (const [id] of this.finishedTurnAge) {
        if (!allAgents.some(a => a.id === id)) this.finishedTurnAge.delete(id);
      }
      this.dirty = false;
      return;
    }

    // Status bar — only call setStatus when the text actually changes
    let newStatusText: string | undefined;
    if (hasActive) {
      const statusParts: string[] = [];
      if (runningCount > 0) statusParts.push(`${runningCount} running`);
      if (queuedCount > 0) statusParts.push(`${queuedCount} queued`);
      const total = runningCount + queuedCount;
      newStatusText = `${statusParts.join(", ")} agent${total === 1 ? "" : "s"}`;
    }
    if (newStatusText !== this.lastStatusText) {
      this.uiCtx.setStatus("subagents", newStatusText);
      this.lastStatusText = newStatusText;
    }

    // Always advance spinner for smooth animation.
    this.widgetFrame++;

    // Dirty check: skip TUI re-render when only the spinner frame advanced.
    // On turn boundaries and structural changes, we always re-render.
    if (!this.dirty && this.widgetRegistered) {
      return; // Nothing changed — don't trigger TUI re-render
    }

    // Register widget callback once; subsequent updates use requestRender()
    // which re-invokes render() without replacing the component (avoids layout thrashing).
    if (this.widgetRegistered) {
      // Widget already registered — just request a re-render of existing components.
      this.tui?.requestRender();
      this.dirty = false;
    } else {
      this.uiCtx.setWidget("agents", (tui, theme) => {
        this.tui = tui;
        return {
          render: () => this.renderWidget(tui, theme),
          invalidate: () => {
            // Theme changed — force re-registration so factory captures fresh theme.
            this.widgetRegistered = false;
            this.tui = undefined;
          },
        };
      }, { placement: "aboveEditor" });
      this.widgetRegistered = true;
      this.dirty = false;
    }
  }

  dispose() {
    
    if (this.widgetInterval) {
      clearInterval(this.widgetInterval);
      this.widgetInterval = undefined;
    }
    if (this.uiCtx) {
      this.uiCtx.setWidget("agents", undefined);
      this.uiCtx.setStatus("subagents", undefined);
    }
    this.widgetRegistered = false;
    this.tui = undefined;
    this.lastStatusText = undefined;
  }
}
