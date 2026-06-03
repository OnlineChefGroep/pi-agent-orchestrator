import type { Model, TextContent } from "@earendil-works/pi-ai";
import { type AgentToolResult, defineTool, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "@sinclair/typebox";
import { buildTypeListText, getDefaultJoinMode, isSchedulingEnabled, reloadCustomAgents } from "../agent-registry.js";
import { getDefaultMaxTurns, normalizeMaxTurns } from "../agent-runner.js";
import { getAgentConfig, getAvailableTypes, resolveType } from "../agent-types.js";
import { buildAgentEstimate } from "../estimate.js";
import { resolveAgentInvocationConfig, resolveJoinMode } from "../invocation-config.js";
import { resolveModel } from "../model-resolver.js";
import { createOutputFilePath, streamToOutputFile, writeInitialEntry } from "../output-file.js";
import {
  buildDetails, createActivityTracker, formatLifetimeTokens,
  getStatusNote, textResult,
} from "../tool-result-helpers.js";
import type { AgentInvocation, AgentRecord, IsolationMode, SubagentType, ThinkingLevel } from "../types.js";
import { buildInvocationTags, describeActivity, formatMs, formatTurns, getDisplayName, getPromptModeLabel } from "../ui/agent-format.js";
import type { AgentDetails, UICtx } from "../ui/agent-ui-types.js";
import { getSpinnerFrame } from "../ui/animation.js";
import type { Theme } from "../ui/theme.js";
import type { ToolContext } from "./context.js";

// ---- Extracted helpers (testable independently) ----

type AgentResultLike = Pick<AgentToolResult<unknown>, "content"> & { details?: unknown };

type CommonSpawnOptions = {
  description: string;
  model: Model<any> | undefined;
  maxTurns: number | undefined;
  isolated: boolean;
  inheritContext: boolean;
  thinking: ThinkingLevel | undefined;
  isolation: IsolationMode | undefined;
  invocation: AgentInvocation;
};

function getFirstTextContent(result: Pick<AgentResultLike, "content">): string {
  const firstText = result.content.find((item): item is TextContent => item.type === "text");
  return firstText?.text ?? "";
}

/** Render agent result for the TUI — status badge, stats line, expanded output. */
export function renderAgentResult(
  result: AgentResultLike,
  opts: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Text {
  const details = result.details as AgentDetails | undefined;
  if (!details) {
    return new Text(getFirstTextContent(result), 0, 0);
  }

  // Build "haiku · thinking: high · ⟳5≤30 · 3 tool uses · 33.8k tokens" stats string
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
  if (opts.isPartial || details.status === "running") {
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

    if (opts.expanded) {
      const resultText = getFirstTextContent(result);
      if (resultText) {
        const lines = resultText.split("\n").slice(0, 50);
        const expandedParts: string[] = [];
        for (const l of lines) {
          expandedParts.push(`\n${theme.fg("dim", `  ${l}`)}`);
        }
        line += expandedParts.join("");
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
}

/** Build the common spawn option fields shared by background and foreground paths. */
export function buildSpawnOptions(input: CommonSpawnOptions): {
  description: string;
  model?: Model<any>;
  maxTurns?: number;
  isolated: boolean;
  inheritContext: boolean;
  thinkingLevel?: ThinkingLevel;
  isolation?: IsolationMode;
  invocation: AgentInvocation;
} {
  return {
    description: input.description,
    model: input.model,
    maxTurns: input.maxTurns,
    isolated: input.isolated,
    inheritContext: input.inheritContext,
    thinkingLevel: input.thinking,
    isolation: input.isolation,
    invocation: input.invocation,
  };
}

/** Wrap a callbacks object's onSessionCreated to run additional logic after the original. */
export function setupSessionCallbacks(
  target: { onSessionCreated?: (session: any) => void },
  afterCreate: (session: any) => void,
): void {
  const orig = target.onSessionCreated;
  target.onSessionCreated = (session: any) => {
    orig?.(session);
    afterCreate(session);
  };
}

export function createAgentTool(ctx: ToolContext) {
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

  const typeListText = buildTypeListText();

  return defineTool({
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
      return renderAgentResult(result, { expanded, isPartial }, theme);
    },

    // ---- Execute ----

    execute: async (toolCallId, params, signal, onUpdate, piCtx) => {
      const { pi, manager, widget, agentActivity, batchOrchestrator, scheduler } = ctx;

      // Ensure we have UI context for widget rendering
      const uiCtx = piCtx && typeof piCtx.ui === 'object' ? (piCtx.ui as UICtx) : undefined;
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
      let model = piCtx.model;
      if (resolvedConfig.modelInput) {
        const resolvedModel = resolveModel(resolvedConfig.modelInput, piCtx.modelRegistry);
        if (typeof resolvedModel === "string") {
          if (resolvedConfig.modelFromParams) return textResult(resolvedModel);
        } else {
          model = resolvedModel as any;
        }
      }

      const thinking = resolvedConfig.thinking;
      const inheritContext = resolvedConfig.inheritContext;
      const runInBackground = resolvedConfig.runInBackground;
      const isolated = resolvedConfig.isolated;
      const isolation = resolvedConfig.isolation;

      const parentModelId = piCtx.model?.id;
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
          ...buildSpawnOptions({
            description: params.description as string,
            model,
            maxTurns: effectiveMaxTurns,
            isolated,
            inheritContext,
            thinking,
            isolation,
            invocation: agentInvocation,
          }),
          isBackground: true,
          ...bgCallbacks,
        };

        let id: string;
        try {
          id = manager.spawn(pi, piCtx, subagentType, params.prompt, spawnOptions);
        } catch (err) {
          return textResult(err instanceof Error ? err.message : String(err));
        }

        // Wire output file streaming now that id is available.
        // Mutating spawnOptions (same object stored in manager) before the
        // async session callback fires ensures the streaming hook runs when
        // the session is created.
        setupSessionCallbacks(spawnOptions, (session) => {
          const rec = manager.getRecord(id);
          if (rec?.outputFile) {
            rec.outputCleanup = streamToOutputFile(session, rec.outputFile, id, piCtx.cwd);
          }
        });

        // Set output file + join mode synchronously after spawn, before the
        // event loop yields — onSessionCreated is async so this is safe.
        const joinMode = resolveJoinMode(getDefaultJoinMode(), true);
        const record = manager.getRecord(id);
        if (record && joinMode) {
          record.joinMode = joinMode;
          record.toolCallId = toolCallId;
          record.outputFile = createOutputFilePath(piCtx.cwd, id, piCtx.sessionManager.getSessionId());
          writeInitialEntry(record.outputFile, id, params.prompt, piCtx.cwd);
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
      setupSessionCallbacks(fgCallbacks, (session) => {
        for (const a of manager.listAgents()) {
          if (a.session === session) {
            fgId = a.id;
            agentActivity.set(a.id, fgState);
            widget.ensureTimer();
            break;
          }
        }
      });

      // Animate spinner at ~80ms (smooth rotation through 10 braille frames)
      const spinnerInterval = setInterval(() => {
        spinnerFrame++;
        streamUpdate();
      }, 80);

      streamUpdate();

      let record: AgentRecord;
      try {
        record = await manager.spawnAndWait(pi, piCtx, subagentType, params.prompt, {
          ...buildSpawnOptions({
            description: params.description as string,
            model,
            maxTurns: effectiveMaxTurns,
            isolated,
            inheritContext,
            thinking,
            isolation,
            invocation: agentInvocation,
          }),
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
  });
}
