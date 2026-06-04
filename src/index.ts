import { logger } from "./logger.js";
/**
 * pi-agents — A pi extension providing Claude Code-style autonomous sub-agents.
 *
 * Tools:
 *   Agent             — LLM-callable: spawn a sub-agent
 *   get_subagent_result  — LLM-callable: check background agent status/result
 *   steer_subagent       — LLM-callable: send a steering message to a running agent
 *
 * Commands:
 *   /agents                 — Interactive agent management menu
 */


import { type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { AgentManager } from "./agent-manager.js";
import { isSchedulingEnabled, reloadCustomAgents, setAnimationStyle, setCinematicEnabled, setDashboardRefreshInterval, setDefaultJoinMode, setOrchestrationMode, setSchedulingEnabled, setShowActivityStream, setShowTokenUsage, setShowTurnProgress, setUiStyle } from "./agent-registry.js";
import { setDefaultMaxTurns, setGraceTurns } from "./agent-runner.js";
import { BatchOrchestrator } from "./batch-orchestrator.js";
import { registerAgentsCommand } from "./commands/agents.js";
import { registerHooksCommand } from "./commands/hooks.js";
import { registerRpcHandlers } from "./cross-extension-rpc.js";
import { GroupJoinManager } from "./group-join.js";
import { HookRegistry } from "./hooks.js";
import { SubagentScheduler } from "./schedule.js";
import { resolveStorePath, ScheduleStore } from "./schedule-store.js";
import { applyAndEmitLoaded } from "./settings.js";
import { SwarmCoordinator, setActiveSwarmCoordinator } from "./swarm-join.js";
import {
  buildNotificationDetails, formatTaskNotification,
} from "./tool-result-helpers.js";
import { createAgentTool } from "./tools/agent.js";
import { createGetResultTool } from "./tools/get-result.js";
import { createSteerTool } from "./tools/steer.js";
import { type AgentRecord, type NotificationDetails } from "./types.js";
import type { AgentActivity, UICtx } from "./ui/agent-ui-types.js";
import { AgentWidget } from "./ui/agent-widget.js";
import { setSpinnerStyle } from "./ui/animation.js";
import { createNotificationRenderer } from "./ui/notification-renderer.js";
import { getLifetimeTotal } from "./usage.js";

export default async function (pi: ExtensionAPI) {
  // ---- Register custom notification renderer ----
  pi.registerMessageRenderer<NotificationDetails>(
    "subagent-notification",
    (message, opts, theme) => createNotificationRenderer(theme)(message, opts),
  );

  // Initial load
  await reloadCustomAgents();

  // ---- Agent activity tracking + widget ----
  const agentActivity = new Map<string, AgentActivity>();

  // ---- Cancellable pending notifications ----
  // Holds notifications briefly so get_subagent_result can cancel them
  // before they reach pi.sendMessage (fire-and-forget).
  const pendingNudges = new Map<string, ReturnType<typeof setTimeout>>();
  const NUDGE_HOLD_MS = 200;

  function scheduleNudge(key: string, send: () => void, delay = NUDGE_HOLD_MS) {
    cancelNudge(key);
    pendingNudges.set(key, setTimeout(() => {
      pendingNudges.delete(key);
      try { send(); } catch (err) { logger.debug(`Swallowed error: ${err instanceof Error ? err.message : String(err)}`); }
    }, delay));
  }

  function cancelNudge(key: string) {
    const timer = pendingNudges.get(key);
    if (timer != null) {
      clearTimeout(timer);
      pendingNudges.delete(key);
    }
  }

  // ---- Individual nudge helper (async join mode) ----
  function emitIndividualNudge(record: AgentRecord) {
    if (record.resultConsumed) return;  // re-check at send time

    const notification = formatTaskNotification(record, 500);
    const footer = record.outputFile ? `\nFull transcript available at: ${record.outputFile}` : '';

    pi.sendMessage<NotificationDetails>({
      customType: "subagent-notification",
      content: notification + footer,
      display: true,
      details: buildNotificationDetails(record, 500, agentActivity.get(record.id)),
    }, { deliverAs: "followUp", triggerTurn: true });
  }

  function sendIndividualNudge(record: AgentRecord) {
    agentActivity.delete(record.id);
    widget.markFinished(record.id);
    scheduleNudge(record.id, () => emitIndividualNudge(record));
    widget.update();
  }

  // ---- Group join manager ----
  const groupJoin = new GroupJoinManager(
    (records, partial) => {
      for (const r of records) { agentActivity.delete(r.id); widget.markFinished(r.id); }

      const groupKey = `group:${records.map(r => r.id).join(",")}`;
      scheduleNudge(groupKey, () => {
        // Re-check at send time
        const unconsumed = records.filter(r => !r.resultConsumed);
        if (unconsumed.length === 0) { widget.update(); return; }

        const notifications = unconsumed.map(r => formatTaskNotification(r, 300)).join('\n\n');
        const label = partial
          ? `${unconsumed.length} agent(s) finished (partial — others still running)`
          : `${unconsumed.length} agent(s) finished`;

        const [first, ...rest] = unconsumed;
        const details = buildNotificationDetails(first, 300, agentActivity.get(first.id));
        if (rest.length > 0) {
          details.others = rest.map(r => buildNotificationDetails(r, 300, agentActivity.get(r.id)));
        }

        pi.sendMessage<NotificationDetails>({
          customType: "subagent-notification",
          content: `Background agent group completed: ${label}\n\n${notifications}\n\nUse get_subagent_result for full output.`,
          display: true,
          details,
        }, { deliverAs: "followUp", triggerTurn: true });
      });
      widget.update();
    },
    30_000,
  );

  // ---- Swarm coordinator (dynamic collaborative groups) ----
  // Supports runtime join (the "swarm mode" feature) and provides query APIs
  // for the rich AgentDashboard.
  const swarmJoin = new SwarmCoordinator(
    (records, partial, swarmId) => {
      for (const r of records) { agentActivity.delete(r.id); widget.markFinished(r.id); }

      const swarmKey = `swarm:${swarmId}`;
      scheduleNudge(swarmKey, () => {
        const unconsumed = records.filter(r => !r.resultConsumed);
        if (unconsumed.length === 0) { widget.update(); return; }

        const notifications = unconsumed.map(r => formatTaskNotification(r, 300)).join('\n\n');
        const label = partial
          ? `${unconsumed.length} swarm agent(s) finished (partial — swarm still active)`
          : `Swarm ${swarmId} wave completed`;

        const [first, ...rest] = unconsumed;
        const details = buildNotificationDetails(first, 300, agentActivity.get(first.id));
        if (rest.length > 0) {
          details.others = rest.map(r => buildNotificationDetails(r, 300, agentActivity.get(r.id)));
        }

        pi.sendMessage<NotificationDetails>({
          customType: "subagent-notification",
          content: `Swarm update: ${label}\n\n${notifications}\n\nUse get_subagent_result for full output.`,
          display: true,
          details,
        }, { deliverAs: "followUp", triggerTurn: true });
      });
      widget.update();
    },
    30_000,
  );

  // Make the real coordinator available to the dashboard / output-handler layer
  // so 'w' hotkey actions can actually create and join swarms at runtime.
  setActiveSwarmCoordinator(swarmJoin);

  /** Helper: build event data for lifecycle events from an AgentRecord. */
  function buildEventData(record: AgentRecord) {
    const durationMs = record.completedAt ? record.completedAt - record.startedAt : Date.now() - record.startedAt;
    // All three fields are lifetime-accumulated (Σ over every assistant message_end),
    // so they survive compaction together — input + output ≤ total always.
    // tokens is omitted when nothing was ever produced (e.g. agent errored before
    // any message_end fired), preserving prior payload shape.
    const u = record.lifetimeUsage;
    const total = getLifetimeTotal(u);
    const tokens = total > 0
      ? { input: u.input, output: u.output, total }
      : undefined;
    return {
      id: record.id,
      type: record.type,
      description: record.description,
      result: record.result,
      error: record.error,
      status: record.status,
      toolUses: record.toolUses,
      durationMs,
      tokens,
    };
  }

  // Background completion: route through group join or send individual nudge
  const hookRegistry = new HookRegistry();
  const manager = new AgentManager((record) => {
    // Emit lifecycle event based on terminal status
    const isError = record.status === "error" || record.status === "stopped" || record.status === "aborted";
    const eventData = buildEventData(record);
    if (isError) {
      pi.events.emit("subagents:failed", eventData);
    } else {
      pi.events.emit("subagents:completed", eventData);
    }

    // Persist final record for cross-extension history reconstruction
    pi.appendEntry("subagents:record", {
      id: record.id, type: record.type, description: record.description,
      status: record.status, result: record.result, error: record.error,
      startedAt: record.startedAt, completedAt: record.completedAt,
    });

    // Skip notification if result was already consumed via get_subagent_result
    if (record.resultConsumed) {
      agentActivity.delete(record.id);
      widget.markFinished(record.id);
      widget.update();
      return;
    }

    // If this agent is pending batch finalization (debounce window still open),
    // don't send an individual nudge — batch orchestrator will pick it up retroactively.
    if (batchOrchestrator.isPendingBatchFinalization(record.id)) {
      widget.update();
      return;
    }

    const groupResult = groupJoin.onAgentComplete(record);
    const swarmResult = swarmJoin.onAgentComplete(record);

    if (groupResult === 'pass' && swarmResult === 'pass') {
      sendIndividualNudge(record);
    }
    // 'held' or 'delivered' for either → notification handled by the respective coordinator
    widget.update();
  }, undefined, (record) => {
    // Emit started event when agent transitions to running (including from queue)
    pi.events.emit("subagents:started", {
      id: record.id,
      type: record.type,
      description: record.description,
    });
  }, (record, info) => {
    // Emit compacted event when agent's session compacts (preserves count on record).
    pi.events.emit("subagents:compacted", {
      id: record.id,
      type: record.type,
      description: record.description,
      reason: info.reason,
      tokensBefore: info.tokensBefore,
      compactionCount: record.compactionCount,
    });
  });

  // Attach the global hook registry to the agent manager
  manager.hooks = hookRegistry;

  // Expose hook registry via Symbol.for() global registry for cross-package access.
  // Extensions and other packages can discover and register hooks by reading:
  //   (globalThis as any)[Symbol.for('pi-subagents:hooks')]
  const HOOKS_KEY = Symbol.for("pi-subagents:hooks");
  (globalThis as any)[HOOKS_KEY] = {
    getHandlers: () => hookRegistry.getHandlers(),
    // NO register, NO unregister, NO dispatch
  };

  // Expose manager via Symbol.for() global registry for cross-package access.
  // Standard Node.js pattern for cross-package singletons (used by OpenTelemetry, etc.).
  const MANAGER_KEY = Symbol.for("pi-subagents:manager");
  (globalThis as any)[MANAGER_KEY] = {
    waitForAll: () => manager.waitForAll(),
    hasRunning: () => manager.hasRunning(),
    getRecord: (id: string) => {
      const r = manager.getRecord(id);
      if (!r) return undefined;
      // Only return safe, non-sensitive fields. Truncate description to
      // avoid leaking sensitive context to other extensions in the process.
      return { id: r.id, type: r.type, status: r.status, description: r.description?.slice(0, 200) };
    },
    // NO spawn, NO listAgents (that goes through the Agent tool or API)
    listAgentIds: (type: string) => manager.listAgents().filter(a => a.type === type).map(a => a.id),
  };

  // --- Cross-extension RPC via pi.events ---
  let currentCtx: ExtensionContext | undefined;

  // ---- Subagent scheduler ----
  // Session-scoped: store is constructed inside session_start once sessionId
  // is available. Mirrors pi-chonky-tasks's session-scoped task store —
  // schedules reset on /new, restore on /resume.
  const scheduler = new SubagentScheduler();

  async function startScheduler(ctx: ExtensionContext) {
    try {
      const sessionId = ctx.sessionManager?.getSessionId?.();
      if (!sessionId) return;  // sessionId not yet available — try again on next event
      const path = resolveStorePath(ctx.cwd, sessionId);
      const store = new ScheduleStore(path);
      await scheduler.start(pi, ctx, manager, store);
      pi.events.emit("subagents:scheduler_ready", { sessionId, jobCount: store.list().length });
    } catch (err) {
      // Scheduling is non-essential — log and move on so the rest of the
      // extension keeps working if e.g. .pi/ is unwritable.
      logger.warn("Failed to start scheduler:", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Capture ctx from session_start for RPC spawn handler + start the scheduler.
  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    manager.clearCompleted();
    manager.resetSessionUsage();
    if (isSchedulingEnabled() && !scheduler.isActive()) await startScheduler(ctx);
  });

  pi.on("session_before_switch", () => {
    manager.clearCompleted();
    manager.resetSessionUsage();
    scheduler.stop();
  });

  // TODO: Implement proper authProvider to verify extension identity.
  // Currently all calls authenticate as "legacy" with a shared rate limit bucket.
  const { unsubPing: unsubPingRpc, unsubSpawn: unsubSpawnRpc, unsubStop: unsubStopRpc } = registerRpcHandlers({
    events: pi.events,
    pi,
    getCtx: () => currentCtx,
    manager,
  });

  // Broadcast readiness so extensions loaded after us can discover us
  pi.events.emit("subagents:ready", {});

  // On shutdown, abort all agents immediately and clean up.
  // If the session is going down, there's nothing left to consume agent results.
  pi.on("session_shutdown", async () => {
    unsubSpawnRpc();
    unsubStopRpc();
    unsubPingRpc();
    currentCtx = undefined;
    delete (globalThis as any)[MANAGER_KEY];
    delete (globalThis as any)[HOOKS_KEY];
    scheduler.stop();
    manager.abortAll();
    for (const timer of pendingNudges.values()) clearTimeout(timer);
    pendingNudges.clear();
    batchOrchestrator.dispose();
    manager.dispose();
  });

  // Live widget: show running agents above editor
  const widget = new AgentWidget(manager, agentActivity);

  // ---- Batch orchestrator for smart/group/swarm join modes ----
  const batchOrchestrator = new BatchOrchestrator({
    manager,
    groupJoin,
    swarmJoin,
    onAgentHandled: sendIndividualNudge,
    onWidgetUpdate: () => widget.update(),
  });

  // Track tool calls per turn so we only age the widget once per turn boundary,
  // avoiding premature agent aging during validator retries within a turn.
  let currentTurnToolCount = 0;

  // Grab UI context from first tool execution + clear lingering widget on new turn
  pi.on("tool_execution_start", async (_event, ctx) => {
    const uiCtx = ctx && typeof ctx.ui === 'object' ? (ctx.ui as UICtx) : undefined;
    if (uiCtx) widget.setUICtx(uiCtx);
    currentTurnToolCount++;
    if (currentTurnToolCount === 1) {
      widget.onTurnStart();
    }
  });

  // Reset tool counter at end of each turn
  pi.on("turn_end", () => {
    currentTurnToolCount = 0;
  });


  // Apply persisted settings on startup and emit `subagents:settings_loaded`.
  // Global + project merged; missing → defaults; corrupt file emits a warning
  // to stderr and falls back to defaults.
  applyAndEmitLoaded(
    {
      setMaxConcurrent: (n) => manager.setMaxConcurrent(n),
      setSessionLimits: (limits) => manager.setSessionLimits(limits),
      setDefaultMaxTurns,
      setGraceTurns,
      setDefaultJoinMode,
      setSchedulingEnabled,
      setAnimationStyle: (style) => {
        setAnimationStyle(style);
        setSpinnerStyle(style);
      },
      setUiStyle,
      setCinematicEnabled,
      setShowActivityStream,
      setShowTokenUsage,
      setShowTurnProgress,
      setOrchestrationMode,
      setDashboardRefreshInterval,
      setSessionMaxSpawns: (n) => manager.setSessionMaxSpawns(n),
      setSessionMaxTurns: (n) => manager.setSessionMaxTurns(n),
    },
    (event, payload) => pi.events.emit(event, payload),
  );

  // ---- Tool context — shared dependency bag for extracted tool modules ----
  const toolCtx = {
    pi, manager, widget, agentActivity, batchOrchestrator, scheduler, swarmJoin, hookRegistry,
    sendIndividualNudge, cancelNudge, scheduleNudge,
  };

  // ---- Tools ----
  pi.registerTool(createAgentTool(toolCtx));
  pi.registerTool(createGetResultTool(toolCtx));
  pi.registerTool(createSteerTool(toolCtx));

  registerAgentsCommand(pi, manager, scheduler, agentActivity);
  registerHooksCommand(pi, hookRegistry);
}
