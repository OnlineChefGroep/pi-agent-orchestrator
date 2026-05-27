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


import { defineTool, type ExtensionAPI, type ExtensionContext, getAgentDir } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { AgentManager } from "./agent-manager.js";
import { buildTypeListText, getDefaultJoinMode, isSchedulingEnabled, reloadCustomAgents, setAnimationStyle, setCinematicEnabled, setDashboardRefreshInterval, setDefaultJoinMode, setOrchestrationMode, setSchedulingEnabled, setShowActivityStream, setShowTokenUsage, setShowTurnProgress, setUiStyle } from "./agent-registry.js";
import { getAgentConversation, getDefaultMaxTurns, getGraceTurns, normalizeMaxTurns, setDefaultMaxTurns, setGraceTurns, steerAgent } from "./agent-runner.js";
import { getAgentConfig, getAvailableTypes, resolveType } from "./agent-types.js";
import { BatchOrchestrator } from "./batch-orchestrator.js";
import { registerRpcHandlers } from "./cross-extension-rpc.js";
import { buildAgentEstimate } from "./estimate.js";
import { GroupJoinManager } from "./group-join.js";
import { HookRegistry } from "./hooks.js";
import { resolveAgentInvocationConfig, resolveJoinMode } from "./invocation-config.js";
import { resolveModel } from "./model-resolver.js";
import { createOutputFilePath, streamToOutputFile, writeInitialEntry } from "./output-file.js";
import { showAgentsMenu } from "./output-handler.js";
import { SubagentScheduler } from "./schedule.js";
import { resolveStorePath, ScheduleStore } from "./schedule-store.js";
import { applyAndEmitLoaded } from "./settings.js";
import { SwarmCoordinator, setActiveSwarmCoordinator } from "./swarm-join.js";
import {
  buildDetails, buildNotificationDetails, createActivityTracker, formatLifetimeTokens,
  formatTaskNotification, getStatusNote, textResult,
} from "./tool-result-helpers.js";
import { type AgentInvocation, type AgentRecord, type NotificationDetails, type SubagentType } from "./types.js";
import { buildInvocationTags, describeActivity, formatDuration, formatMs, formatTurns, getDisplayName, getPromptModeLabel } from "./ui/agent-format.js";
import type { AgentActivity, AgentDetails, UICtx } from "./ui/agent-ui-types.js";
import { AgentWidget } from "./ui/agent-widget.js";
import { getSpinnerFrame, setSpinnerStyle } from "./ui/animation.js";
import { createNotificationRenderer } from "./ui/notification-renderer.js";
import { getLifetimeTotal, getSessionContextPercent, } from "./usage.js";

export default function (pi: ExtensionAPI) {
  // ---- Register custom notification renderer ----
  pi.registerMessageRenderer<NotificationDetails>(
    "subagent-notification",
    (message, opts, theme) => createNotificationRenderer(theme)(message, opts),
  );

  // Initial load
  reloadCustomAgents();

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
      try { send(); } catch { /* ignore stale completion side-effect errors */ }
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
      // Only return safe, non-sensitive fields
      return { id: r.id, type: r.type, status: r.status, description: r.description };
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
      console.warn("[pi-subagents] Failed to start scheduler:", err);
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

  const typeListText = buildTypeListText();

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

  // ---- Agent tool ----

  // Schedule param + its guideline are gated on `schedulingEnabled` (read once
  // at registration; flipping the setting later requires next pi session for
  // the schema to update). Defining the shape once and spreading it via Partial
  // preserves Type.Object's inference when present and produces a
  // `schedule`-free schema when absent — zero LLM-context cost in disabled mode.
  const scheduleParamShape = {
    schedule: Type.Optional(
      Type.String({
        description:
          'Opt-in only — fire later instead of now. Omit to run immediately (the default, almost always correct). ' +
          'Formats: 6-field cron ("0 0 9 * * 1" = 9am Mon), interval ("5m"/"1h"), one-shot ("+10m" or ISO). ' +
          'Forces run_in_background; incompatible with inherit_context and resume. Returns job ID.',
      }),
    ),
  };
  const scheduleParam: Partial<typeof scheduleParamShape> =
    isSchedulingEnabled() ? scheduleParamShape : {};

  const scheduleGuideline = isSchedulingEnabled()
    ? `\n- Use \`schedule\` only when the user explicitly asked for scheduled / recurring / delayed execution (e.g. "every Monday", "in an hour"). Don't auto-schedule from vague intent like "monitor X" — run once now or ask.`
    : "";

  pi.registerTool(defineTool({
    name: "Agent",
    label: "Agent",
    description: `Launch a new agent to handle complex, multi-step tasks autonomously.

The Agent tool launches specialized agents that autonomously handle complex tasks. Each agent type has specific capabilities and tools available to it.

Available agent types:
${typeListText}

Guidelines:
- For parallel work, use run_in_background: true on each agent. Foreground calls run sequentially — only one executes at a time.
- Use Explore for codebase searches and code understanding.
- Use Plan for architecture and implementation planning.
- Use general-purpose for complex tasks that need file editing.
- Provide clear, detailed prompts so the agent can work autonomously.
- Agent results are returned as text — summarize them for the user.
- Use run_in_background for work you don't need immediately. You will be notified when it completes.
- Use resume with an agent ID to continue a previous agent's work.
- Use steer_subagent to send mid-run messages to a running background agent.
- Use model to specify a different model (as "provider/modelId", or fuzzy e.g. "haiku", "sonnet").
- Use thinking to control extended thinking level.
- Use inherit_context if the agent needs the parent conversation history.
- Use isolation: "worktree" to run the agent in an isolated git worktree (safe parallel file modifications).${scheduleGuideline}`,
    parameters: Type.Object({
      prompt: Type.String({
        description: "The task for the agent to perform.",
      }),
      description: Type.String({
        description: "A short (3-5 word) description of the task (shown in UI).",
      }),
      subagent_type: Type.String({
        description: `The type of specialized agent to use. Available types: ${getAvailableTypes().join(", ")}. Custom agents from .pi/agents/*.md (project) or ${getAgentDir()}/agents/*.md (global) are also available.`,
      }),
      model: Type.Optional(
        Type.String({
          description:
            'Optional model override. Accepts "provider/modelId" or fuzzy name (e.g. "haiku", "sonnet"). Omit to use the agent type\'s default.',
        }),
      ),
      thinking: Type.Optional(
        Type.String({
          description: "Thinking level: off, minimal, low, medium, high, xhigh. Overrides agent default.",
        }),
      ),
      max_turns: Type.Optional(
        Type.Number({
          description: "Maximum number of agentic turns before stopping. Omit for unlimited (default).",
          minimum: 1,
        }),
      ),
      run_in_background: Type.Optional(
        Type.Boolean({
          description: "Set to true to run in background. Returns agent ID immediately. You will be notified on completion.",
        }),
      ),
      resume: Type.Optional(
        Type.String({
          description: "Optional agent ID to resume from. Continues from previous context.",
        }),
      ),
      isolated: Type.Optional(
        Type.Boolean({
          description: "If true, agent gets no extension/MCP tools — only built-in tools.",
        }),
      ),
      inherit_context: Type.Optional(
        Type.Boolean({
          description: "If true, fork parent conversation into the agent. Default: false (fresh context).",
        }),
      ),
      estimate_only: Type.Optional(
        Type.Boolean({
          description: "If true, return a rough token/turn estimate without spawning or resuming an agent.",
        }),
      ),
      isolation: Type.Optional(
        Type.Literal("worktree", {
          description: 'Set to "worktree" to run the agent in a temporary git worktree (isolated copy of the repo). Changes are saved to a branch on completion.',
        }),
      ),
      ...scheduleParam,
    }),

    // ---- Custom rendering: Claude Code style ----

    renderCall(args, theme) {
      const displayName = args.subagent_type ? getDisplayName(args.subagent_type) : "Agent";
      const desc = args.description ?? "";
      return new Text(`▸ ${theme.fg("toolTitle", theme.bold(displayName))}${desc ? `  ${theme.fg("muted", desc)}` : ""}`, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as AgentDetails | undefined;
      if (!details) {
        const text = result.content[0]?.type === "text" ? result.content[0].text : "";
        return new Text(text, 0, 0);
      }

      // Helper: build "haiku · thinking: high · ⟳5≤30 · 3 tool uses · 33.8k tokens" stats string
      const stats = (d: AgentDetails) => {
        const parts: string[] = [];
        if (d.modelName) parts.push(d.modelName);
        if (d.tags) parts.push(...d.tags);
        if (d.turnCount != null && d.turnCount > 0) {
          parts.push(formatTurns(d.turnCount, d.maxTurns));
        }
        if (d.toolUses > 0) parts.push(`${d.toolUses} tool use${d.toolUses === 1 ? "" : "s"}`);
        if (d.tokens) parts.push(d.tokens);
        return parts.map(p => theme.fg("dim", p)).join(` ${theme.fg("dim", "·")} `);
      };

      // ---- While running (streaming) ----
      if (isPartial || details.status === "running") {
        const frame = getSpinnerFrame(details.spinnerFrame ?? 0);
        const s = stats(details);
        let line = theme.fg("accent", frame) + (s ? ` ${s}` : "");
        line += `\n${theme.fg("dim", `  ⎿  ${details.activity ?? "thinking…"}`)}`;
        return new Text(line, 0, 0);
      }

      // ---- Background agent launched ----
      if (details.status === "background") {
        return new Text(theme.fg("dim", `  ⎿  Running in background (ID: ${details.agentId})`), 0, 0);
      }

      // ---- Completed / Steered ----
      if (details.status === "completed" || details.status === "steered") {
        const duration = formatMs(details.durationMs);
        const isSteered = details.status === "steered";
        const icon = isSteered ? theme.fg("warning", "✓") : theme.fg("success", "✓");
        const s = stats(details);
        let line = icon + (s ? ` ${s}` : "");
        line += ` ${theme.fg("dim", "·")} ${theme.fg("dim", duration)}`;

        // Validation badge
        if (details.validated !== undefined) {
          line += details.validated
            ? ` ${theme.fg("success", "✅")}`
            : ` ${theme.fg("error", "❌")}`;
        }

        if (expanded) {
          const resultText = result.content[0]?.type === "text" ? result.content[0].text : "";
          if (resultText) {
            const lines = resultText.split("\n").slice(0, 50);
            for (const l of lines) {
              line += `\n${theme.fg("dim", `  ${l}`)}`;
            }
            if (resultText.split("\n").length > 50) {
              line += `\n${theme.fg("muted", "  ... (use get_subagent_result with verbose for full output)")}`;
            }
          }
        } else {
          const doneText = isSteered ? "Wrapped up (turn limit)" : "Done";
          line += `\n${theme.fg("dim", `  ⎿  ${doneText}`)}`;
        }
        return new Text(line, 0, 0);
      }

      // ---- Stopped (user-initiated abort) ----
      if (details.status === "stopped") {
        const s = stats(details);
        let line = theme.fg("dim", "■") + (s ? ` ${s}` : "");
        line += `\n${theme.fg("dim", "  ⎿  Stopped")}`;
        return new Text(line, 0, 0);
      }

      // ---- Error / Aborted (hard max_turns) ----
      const s = stats(details);
      let line = theme.fg("error", "✗") + (s ? ` ${s}` : "");

      if (details.status === "error") {
        line += `\n${theme.fg("error", `  ⎿  Error: ${details.error ?? "unknown"}`)}`;
      } else {
        line += `\n${theme.fg("warning", "  ⎿  Aborted (max turns exceeded)")}`;
      }

      return new Text(line, 0, 0);
    },

    // ---- Execute ----

    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      // Ensure we have UI context for widget rendering
      const uiCtx = ctx && typeof ctx.ui === 'object' ? (ctx.ui as UICtx) : undefined;
      if (uiCtx) widget.setUICtx(uiCtx);

      // Reload custom agents so new .pi/agents/*.md files are picked up without restart
      reloadCustomAgents();

      const rawType = params.subagent_type as SubagentType;
      const resolved = resolveType(rawType);
      const subagentType = resolved ?? "general-purpose";
      const fellBack = resolved === undefined;

      const displayName = getDisplayName(subagentType);

      // Get agent config (if any)
      const customConfig = getAgentConfig(subagentType);

      const resolvedConfig = resolveAgentInvocationConfig(customConfig, params);

      // Resolve model from agent config first; tool-call params only fill gaps.
      let model = ctx.model;
      if (resolvedConfig.modelInput) {
        const resolved = resolveModel(resolvedConfig.modelInput, ctx.modelRegistry);
        if (typeof resolved === "string") {
          if (resolvedConfig.modelFromParams) return textResult(resolved);
          // config-specified: silent fallback to parent
        } else {
          model = resolved;
        }
      }

      const thinking = resolvedConfig.thinking;
      const inheritContext = resolvedConfig.inheritContext;
      const runInBackground = resolvedConfig.runInBackground;
      const isolated = resolvedConfig.isolated;
      const isolation = resolvedConfig.isolation;

      const parentModelId = ctx.model?.id;
      const effectiveModelId = model?.id;
      const modelName = effectiveModelId && effectiveModelId !== parentModelId
        ? (model?.name ?? effectiveModelId).replace(/^Claude\s+/i, "").toLowerCase()
        : undefined;
      const effectiveMaxTurns = normalizeMaxTurns(resolvedConfig.maxTurns ?? getDefaultMaxTurns());
      const agentInvocation: AgentInvocation = {
        modelName,
        thinking,
        // Explicit value only — the default fallback would just add noise.
        // Normalize so `0` (unlimited) doesn't surface as a misleading "max turns: 0".
        maxTurns: normalizeMaxTurns(resolvedConfig.maxTurns),
        isolated,
        inheritContext,
        runInBackground,
        isolation,
      };
      // Tool-result render shows the mode label too; viewer's header already does.
      const modeLabel = getPromptModeLabel(subagentType);
      const { tags: invocationTags } = buildInvocationTags(agentInvocation);
      const agentTags = modeLabel ? [modeLabel, ...invocationTags] : invocationTags;
      const detailBase = {
        displayName,
        description: params.description,
        subagentType,
        modelName,
        tags: agentTags.length > 0 ? agentTags : undefined,
      };

      if (params.estimate_only) {
        if (params.resume) return textResult("Cannot combine `estimate_only` with `resume`.");
        if (params.schedule) return textResult("Cannot combine `estimate_only` with `schedule`.");
        return textResult(buildAgentEstimate({
          prompt: params.prompt as string,
          description: params.description as string,
          type: subagentType,
          config: customConfig,
          inheritContext,
          maxTurns: effectiveMaxTurns,
        }));
      }

      // ---- Schedule: register a job, don't spawn now ----
      if (params.schedule) {
        if (!isSchedulingEnabled()) {
          return textResult("Scheduling is disabled in this project. Enable via /agents → Settings → Scheduling.");
        }
        if (params.resume) {
          return textResult("Cannot combine `schedule` with `resume` — schedules create fresh agents.");
        }
        if (params.inherit_context) {
          return textResult("Cannot combine `schedule` with `inherit_context` — there is no parent conversation at fire time.");
        }
        if (params.run_in_background === false) {
          return textResult("Cannot combine `schedule` with `run_in_background: false` — scheduled jobs always run in background.");
        }
        if (!scheduler.isActive()) {
          return textResult("Scheduler is not active in this session yet. Try again after the session has fully started.");
        }
        try {
          const job = await scheduler.addJob({
            name: params.description as string,
            description: params.description as string,
            schedule: params.schedule as string,
            subagent_type: subagentType,
            prompt: params.prompt as string,
            model: params.model as string | undefined,
            thinking: thinking,
            max_turns: effectiveMaxTurns,
            isolated: isolated,
            isolation: isolation,
          });
          const next = scheduler.getNextRun(job.id);
          return textResult(
            `Scheduled "${job.name}" (id: ${job.id}, type: ${job.scheduleType}). ` +
            `Next run: ${next ?? "(unknown)"}. ` +
            `Manage via /agents → Scheduled jobs.`,
          );
        } catch (err) {
          return textResult(err instanceof Error ? err.message : String(err));
        }
      }

      // Resume existing agent
      if (params.resume) {
        const existing = manager.getRecord(params.resume);
        if (!existing) {
          return textResult(`Agent not found: "${params.resume}". It may have been cleaned up.`);
        }
        if (!existing.session) {
          return textResult(`Agent "${params.resume}" has no active session to resume.`);
        }
        const record = await manager.resume(params.resume, params.prompt, signal);
        if (!record) {
          return textResult(`Failed to resume agent "${params.resume}".`);
        }
        return textResult(
          record.result?.trim() || record.error?.trim() || "No output.",
          buildDetails(detailBase, record),
        );
      }

      // Background execution
      if (runInBackground) {
        const { state: bgState, callbacks: bgCallbacks } = createActivityTracker(effectiveMaxTurns);

        // Build spawn options upfront so we can mutate the same object after
        // spawn returns — the manager stores this reference internally.
        const spawnOptions = {
          description: params.description,
          model,
          maxTurns: effectiveMaxTurns,
          isolated,
          inheritContext,
          thinkingLevel: thinking,
          isBackground: true,
          isolation,
          invocation: agentInvocation,
          ...bgCallbacks,
        };

        let id: string;
        try {
          id = manager.spawn(pi, ctx, subagentType, params.prompt, spawnOptions);
        } catch (err) {
          return textResult(err instanceof Error ? err.message : String(err));
        }

        // Wire output file streaming now that id is available.
        // Mutating spawnOptions (same object stored in manager) before the
        // async session callback fires ensures the streaming hook runs when
        // the session is created.
        const origBgOnSession = spawnOptions.onSessionCreated!;
        spawnOptions.onSessionCreated = (session: any) => {
          origBgOnSession(session);
          const rec = manager.getRecord(id);
          if (rec?.outputFile) {
            rec.outputCleanup = streamToOutputFile(session, rec.outputFile, id, ctx.cwd);
          }
        };

        // Set output file + join mode synchronously after spawn, before the
        // event loop yields — onSessionCreated is async so this is safe.
        const joinMode = resolveJoinMode(getDefaultJoinMode(), true);
        const record = manager.getRecord(id);
        if (record && joinMode) {
          record.joinMode = joinMode;
          record.toolCallId = toolCallId;
          record.outputFile = createOutputFilePath(ctx.cwd, id, ctx.sessionManager.getSessionId());
          writeInitialEntry(record.outputFile, id, params.prompt, ctx.cwd);
        }

        if (joinMode == null || joinMode === 'async') {
          // Foreground/no join mode or explicit async — not part of any batch
        } else {
          // smart / group / swarm — add to current batch (orchestrator routes by joinMode)
          batchOrchestrator.addToBatch(id, joinMode);
        }

        agentActivity.set(id, bgState);
        widget.ensureTimer();
        widget.update();

        // Emit created event
        pi.events.emit("subagents:created", {
          id,
          type: subagentType,
          description: params.description,
          isBackground: true,
        });

        const isQueued = record?.status === "queued";
        return textResult(
          `Agent ${isQueued ? "queued" : "started"} in background.\n` +
          `Agent ID: ${id}\n` +
          `Type: ${displayName}\n` +
          `Description: ${params.description}\n` +
          (record?.outputFile ? `Output file: ${record.outputFile}\n` : "") +
          (isQueued ? `Position: queued (max ${manager.getMaxConcurrent()} concurrent)\n` : "") +
          `\nYou will be notified when this agent completes.\n` +
          `Use get_subagent_result to retrieve full results, or steer_subagent to send it messages.\n` +
          `Do not duplicate this agent's work.`,
          { ...detailBase, toolUses: 0, tokens: "", durationMs: 0, status: "background" as const, agentId: id },
        );
      }

      // Foreground (synchronous) execution — stream progress via onUpdate
      let spinnerFrame = 0;
      const startedAt = Date.now();
      let fgId: string | undefined;

      const streamUpdate = () => {
        const details: AgentDetails = {
          ...detailBase,
          toolUses: fgState.toolUses,
          tokens: formatLifetimeTokens(fgState),
          turnCount: fgState.turnCount,
          maxTurns: fgState.maxTurns,
          durationMs: Date.now() - startedAt,
          status: "running",
          activity: describeActivity(fgState.activeTools, fgState.responseText),
          spinnerFrame,
        };
        onUpdate?.({
          content: [{ type: "text", text: `${fgState.toolUses} tool uses...` }],
          details: details as any,
        });
      };

      const { state: fgState, callbacks: fgCallbacks } = createActivityTracker(effectiveMaxTurns, streamUpdate);

      // Wire session creation to register in widget
      const origOnSession = fgCallbacks.onSessionCreated;
      fgCallbacks.onSessionCreated = (session: any) => {
        origOnSession(session);
        for (const a of manager.listAgents()) {
          if (a.session === session) {
            fgId = a.id;
            agentActivity.set(a.id, fgState);
            widget.ensureTimer();
            break;
          }
        }
      };

      // Animate spinner at ~80ms (smooth rotation through 10 braille frames)
      const spinnerInterval = setInterval(() => {
        spinnerFrame++;
        streamUpdate();
      }, 80);

      streamUpdate();

      let record: AgentRecord;
      try {
        record = await manager.spawnAndWait(pi, ctx, subagentType, params.prompt, {
          description: params.description,
          model,
          maxTurns: effectiveMaxTurns,
          isolated,
          inheritContext,
          thinkingLevel: thinking,
          isolation,
          invocation: agentInvocation,
          signal,
          ...fgCallbacks,
        });
      } catch (err) {
        clearInterval(spinnerInterval);
        return textResult(err instanceof Error ? err.message : String(err));
      }

      clearInterval(spinnerInterval);

      // Clean up foreground agent from widget
      if (fgId) {
        agentActivity.delete(fgId);
        widget.markFinished(fgId);
      }

      // Get final token count
      const tokenText = formatLifetimeTokens(fgState);

      const details = buildDetails(detailBase, record, fgState, { tokens: tokenText });

      const fallbackNote = fellBack
        ? `Note: Unknown agent type "${rawType}" — using general-purpose.\n\n`
        : "";

      if (record.status === "error") {
        return textResult(`${fallbackNote}Agent failed: ${record.error}`, details);
      }

      const durationMs = (record.completedAt ?? Date.now()) - record.startedAt;
      const statsParts = [`${record.toolUses} tool uses`];
      if (tokenText) statsParts.push(tokenText);
      return textResult(
        `${fallbackNote}Agent completed in ${formatMs(durationMs)} (${statsParts.join(", ")})${getStatusNote(record.status)}.\n\n` +
        (record.result?.trim() || "No output."),
        details,
      );
    },
  }));

  // ---- get_subagent_result tool ----

  pi.registerTool(defineTool({
    name: "get_subagent_result",
    label: "Get Agent Result",
    description:
      "Check status and retrieve results from a background agent. Use the agent ID returned by Agent with run_in_background.",
    parameters: Type.Object({
      agent_id: Type.String({
        description: "The agent ID to check.",
      }),
      wait: Type.Optional(
        Type.Boolean({
          description: "If true, wait for the agent to complete before returning. Default: false.",
        }),
      ),
      verbose: Type.Optional(
        Type.Boolean({
          description: "If true, include the agent's full conversation (messages + tool calls). Default: false.",
        }),
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const record = manager.getRecord(params.agent_id);
      if (!record) {
        return textResult(`Agent not found: "${params.agent_id}". It may have been cleaned up.`);
      }

      // Wait for completion if requested.
      // Pre-mark resultConsumed BEFORE awaiting: onComplete fires inside .then()
      // (attached earlier at spawn time) and always runs before this await resumes.
      // Setting the flag here prevents a redundant follow-up notification.
      if (params.wait && record.status === "running" && record.promise) {
        record.resultConsumed = true;
        cancelNudge(params.agent_id);
        await record.promise;
      }

      const displayName = getDisplayName(record.type);
      const duration = formatDuration(record.startedAt, record.completedAt);
      const tokens = formatLifetimeTokens(record);
      const contextPercent = getSessionContextPercent(record.session);
      const statsParts = [`Tool uses: ${record.toolUses}`];
      if (tokens) statsParts.push(tokens);
      if (contextPercent !== null) statsParts.push(`Context: ${Math.round(contextPercent)}%`);
      if (record.compactionCount) statsParts.push(`Compactions: ${record.compactionCount}`);
      statsParts.push(`Duration: ${duration}`);

      let output =
        `Agent: ${record.id}\n` +
        `Type: ${displayName} | Status: ${record.status} | ${statsParts.join(" | ")}\n` +
        `Description: ${record.description}\n\n`;

      if (record.status === "running") {
        output += "Agent is still running. Use wait: true or check back later.";
      } else if (record.status === "error") {
        output += `Error: ${record.error}`;
      } else {
        output += record.result?.trim() || "No output.";
      }

      // Mark result as consumed — suppresses the completion notification
      if (record.status !== "running" && record.status !== "queued") {
        record.resultConsumed = true;
        cancelNudge(params.agent_id);
      }

      // Verbose: include full conversation
      if (params.verbose && record.session) {
        const conversation = getAgentConversation(record.session);
        if (conversation) {
          output += `\n\n--- Agent Conversation ---\n${conversation}`;
        }
      }

      return textResult(output);
    },
  }));

  // ---- steer_subagent tool ----

  pi.registerTool(defineTool({
    name: "steer_subagent",
    label: "Steer Agent",
    description:
      "Send a steering message to a running agent. The message will interrupt the agent after its current tool execution " +
      "and be injected into its conversation, allowing you to redirect its work mid-run. Only works on running agents.",
    parameters: Type.Object({
      agent_id: Type.String({
        description: "The agent ID to steer (must be currently running).",
      }),
      message: Type.String({
        description: "The steering message to send. This will appear as a user message in the agent's conversation.",
      }),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const record = manager.getRecord(params.agent_id);
      if (!record) {
        return textResult(`Agent not found: "${params.agent_id}". It may have been cleaned up.`);
      }
      if (record.status !== "running") {
        return textResult(`Agent "${params.agent_id}" is not running (status: ${record.status}). Cannot steer a non-running agent.`);
      }
      if (!record.session) {
        // Session not ready yet — queue the steer for delivery once initialized
        if (!record.pendingSteers) record.pendingSteers = [];
        record.pendingSteers.push(params.message);
        pi.events.emit("subagents:steered", { id: record.id, message: params.message });
        return textResult(`Steering message queued for agent ${record.id}. It will be delivered once the session initializes.`);
      }

      try {
        await steerAgent(record.session, params.message);
        hookRegistry
          .dispatch("subagent:steer", record.id, { message: params.message })
          .catch(() => {});
        pi.events.emit("subagents:steered", { id: record.id, message: params.message });
        const tokens = formatLifetimeTokens(record);
        const contextPercent = getSessionContextPercent(record.session);
        const stateParts: string[] = [];
        if (tokens) stateParts.push(tokens);
        stateParts.push(`${record.toolUses} tool ${record.toolUses === 1 ? "use" : "uses"}`);
        if (contextPercent !== null) stateParts.push(`context ${Math.round(contextPercent)}% full`);
        if (record.compactionCount) stateParts.push(`${record.compactionCount} compaction${record.compactionCount === 1 ? "" : "s"}`);
        return textResult(
          `Steering message sent to agent ${record.id}. The agent will process it after its current tool execution.\n` +
          `Current state: ${stateParts.join(" · ")}`,
        );
      } catch (err) {
        return textResult(`Failed to steer agent: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  }));

  pi.registerCommand("agents", {
    description: "Manage agents",
    handler: async (_args, ctx) => {
      await showAgentsMenu(ctx, {
        pi,
        manager,
        scheduler,
        agentActivity,
        isSchedulingEnabled,
        getDefaultMaxTurns,
        getGraceTurns,
        getDefaultJoinMode,
        setDefaultMaxTurns,
        setGraceTurns,
        setDefaultJoinMode,
        setSchedulingEnabled,
      });
    },
  });

  pi.registerCommand("hooks", {
    description: "Manage hooks",
    handler: async (_args, _ctx) => {
      const handlerMap = hookRegistry.getHandlers();
      const entries = [...handlerMap.entries()].sort(
        ([a], [b]) => a.localeCompare(b),
      );

      if (entries.length === 0) {
        pi.sendMessage({
          customType: "hooks-list",
          content: "No hooks registered.",
          display: true,
        });
        return;
      }

      const lines: string[] = ["## Registered Hooks\n"];
      for (const [event, handlers] of entries) {
        lines.push(`- **${event}**: ${handlers.length} handler${handlers.length === 1 ? "" : "s"}`);
      }
      lines.push(`\n*Total: ${entries.reduce((sum, [, h]) => sum + h.length, 0)} handler(s) across ${entries.length} event(s)*`);

      pi.sendMessage({
        customType: "hooks-list",
        content: lines.join("\n"),
        display: true,
      });
    },
  });
}
