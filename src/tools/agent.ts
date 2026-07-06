import type { Model, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AgentToolResult, defineTool, getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { AgentManager } from "../agent-manager.js";
import {
  buildTypeListText,
  getDefaultJoinMode,
  getOrchestrationMode,
  isSchedulingEnabled,
  reloadCustomAgents,
} from "../agent-registry.js";
import { getDefaultMaxTurns, normalizeMaxTurns } from "../agent-runner.js";
import { getAgentConfig, getAvailableTypes, resolveType } from "../agent-types.js";
import type { BatchOrchestrator } from "../batch-orchestrator.js";
import { recordDispatchDecision } from "../dispatch-history.js";
import { buildAgentEstimate } from "../estimate.js";
import { resolveAgentInvocationConfig, resolveJoinMode } from "../invocation-config.js";
import { logger } from "../logger.js";
import { resolveModel } from "../model-resolver.js";
import { type OrchestrationDecision, resolveOrchestrationMode } from "../orchestration-dispatch.js";
import { createOutputFilePath, streamToOutputFile, writeInitialEntry } from "../output-file.js";
import {
  buildDetails,
  createActivityTracker,
  formatLifetimeTokens,
  getStatusNote,
  textResult,
} from "../tool-result-helpers.js";
import type { AgentInvocation, AgentRecord, IsolationMode, SubagentType, ThinkingLevel } from "../types.js";
import {
  buildInvocationTags,
  describeActivity,
  formatMs,
  formatTurns,
  getDisplayName,
  getPromptModeLabel,
} from "../ui/agent-format.js";
import type { AgentDetails, UICtx } from "../ui/agent-ui-types.js";
import { getSpinnerFrame } from "../ui/animation.js";
import type { Theme } from "../ui/theme.js";
import { Text } from "../ui/tui-shim.js";
import type { ToolContext } from "./context.js";

// ---- Extracted helpers (testable independently) ----

type AgentResultLike = Pick<AgentToolResult<unknown>, "content"> & { details?: unknown };

type CommonSpawnOptions = {
  description: string;
  model: Model<unknown> | undefined;
  maxTurns: number | undefined;
  isolated: boolean;
  inheritContext: boolean;
  thinking: ThinkingLevel | undefined;
  isolation: IsolationMode | undefined;
  invocation: AgentInvocation;
};

/**
 * Extracts the text from the first `text` content item in a tool result.
 *
 * @param result - Object containing a `content` array of content entries
 * @returns The `.text` of the first content item with `type === 'text'`, or an empty string if none is found
 */
function getFirstTextContent(result: Pick<AgentResultLike, "content">): string {
  const firstText = result.content.find((item): item is TextContent => item.type === "text");
  return firstText?.text ?? "";
}

/**
 * Build the stats line: "haiku · thinking: high · ⟳5≤30 · 3 tool uses · 33.8k tokens"
 *
 * @param d - Agent details whose stats should be formatted
 * @param theme - Theme used to style the separator and stat parts
 * @returns The composed, styled stats string (may be empty when no stats are present)
 */
function buildStatsLine(d: AgentDetails, theme: Theme): string {
  const parts: string[] = [];
  if (d.modelName) parts.push(d.modelName);
  if (d.tags) parts.push(...d.tags);
  if (d.turnCount != null && d.turnCount > 0) {
    parts.push(formatTurns(d.turnCount, d.maxTurns));
  }
  if (d.toolUses > 0) parts.push(`${d.toolUses} tool use${d.toolUses === 1 ? "" : "s"}`);
  if (d.tokens) parts.push(d.tokens);
  return parts.map((p) => theme.fg("dim", p)).join(` ${theme.fg("dim", "·")} `);
}

/**
 * Render the running/streaming state: spinner frame + stats + current activity.
 *
 * @param details - Agent details for the running agent
 * @param theme - Theme used to style the spinner, stats, and activity line
 * @returns A Text instance showing the spinner, stats, and activity
 */
function renderRunningResult(details: AgentDetails, theme: Theme): Text {
  const frame = getSpinnerFrame(details.spinnerFrame ?? 0);
  const s = buildStatsLine(details, theme);
  let line = theme.fg("accent", frame) + (s ? ` ${s}` : "");
  line += `\n${theme.fg("dim", `  ⎿  ${details.activity ?? "thinking…"}`)}`;
  return new Text(line, 0, 0);
}

/**
 * Render the expanded output section for a completed/steered agent result.
 * Shows up to 50 lines of the result text, with a truncation note if more exist.
 *
 * @param result - The agent result whose text content should be expanded
 * @param theme - Theme used to style the output lines and truncation note
 * @returns The expanded output string (may be empty when no text content exists)
 */
function renderExpandedOutput(result: AgentResultLike, theme: Theme): string {
  const resultText = getFirstTextContent(result);
  if (!resultText) return "";

  const allLines = resultText.split("\n");
  const lines = allLines.slice(0, 50);
  const expandedParts: string[] = [];
  for (const l of lines) {
    expandedParts.push(`\n${theme.fg("dim", `  ${l}`)}`);
  }
  let output = expandedParts.join("");
  if (allLines.length > 50) {
    output += `\n${theme.fg("muted", "  ... (use get_subagent_result with verbose for full output)")}`;
  }
  return output;
}

/**
 * Render the completed or steered state: checkmark icon + stats + duration + optional validation badge,
 * followed by either expanded output or a compact "Done" line.
 *
 * @param result - The agent result (used for expanded output text)
 * @param details - Agent details for the completed/steered agent
 * @param opts - Rendering options controlling expanded vs compact view
 * @param theme - Theme used to style all elements
 * @returns A Text instance showing the completion summary
 */
function renderCompletedResult(
  result: AgentResultLike,
  details: AgentDetails,
  opts: { expanded: boolean },
  theme: Theme,
): Text {
  const duration = formatMs(details.durationMs);
  const isSteered = details.status === "steered";
  const icon = isSteered ? theme.fg("warning", "✓") : theme.fg("success", "✓");
  const s = buildStatsLine(details, theme);
  let line = icon + (s ? ` ${s}` : "");
  line += ` ${theme.fg("dim", "·")} ${theme.fg("dim", duration)}`;

  // Validation badge
  if (details.validated !== undefined) {
    line += details.validated ? ` ${theme.fg("success", "✅")}` : ` ${theme.fg("error", "❌")}`;
  }

  if (opts.expanded) {
    line += renderExpandedOutput(result, theme);
  } else {
    const doneText = isSteered ? "Wrapped up (turn limit)" : "Done";
    line += `\n${theme.fg("dim", `  ⎿  ${doneText}`)}`;
  }
  return new Text(line, 0, 0);
}

/**
 * Render the stopped state: stopped icon + stats + "Stopped" label.
 *
 * @param details - Agent details for the stopped agent
 * @param theme - Theme used to style the icon, stats, and label
 * @returns A Text instance showing the stopped summary
 */
function renderStoppedResult(details: AgentDetails, theme: Theme): Text {
  const s = buildStatsLine(details, theme);
  let line = theme.fg("dim", "■") + (s ? ` ${s}` : "");
  line += `\n${theme.fg("dim", "  ⎿  Stopped")}`;
  return new Text(line, 0, 0);
}

/**
 * Render the error or aborted state: error icon + stats + error/abort detail.
 *
 * @param details - Agent details for the errored/aborted agent
 * @param theme - Theme used to style the icon, stats, and detail line
 * @returns A Text instance showing the error or abort summary
 */
function renderErrorResult(details: AgentDetails, theme: Theme): Text {
  const s = buildStatsLine(details, theme);
  let line = theme.fg("error", "✗") + (s ? ` ${s}` : "");

  if (details.status === "error") {
    line += `\n${theme.fg("error", `  ⎿  Error: ${details.error ?? "unknown"}`)}`;
  } else {
    line += `\n${theme.fg("warning", "  ⎿  Aborted (max turns exceeded)")}`;
  }
  return new Text(line, 0, 0);
}

/**
 * Format an agent tool result into a TUI Text block showing status, stats, and optional expanded output.
 *
 * @param result - The agent result containing `content` and optional `details` that drive the rendered output.
 * @param opts - Rendering options: `expanded` shows full (truncated) output lines, `isPartial` treats the result as streaming/partial.
 * @param theme - Theme used to style status, stats, and message lines.
 * @returns A `Text` instance containing the composed, styled representation of the agent result for TUI display.
 */
export function renderAgentResult(
  result: AgentResultLike,
  opts: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Text {
  const details = result.details as AgentDetails | undefined;
  if (!details) {
    return new Text(getFirstTextContent(result), 0, 0);
  }

  // ---- While running (streaming) ----
  if (opts.isPartial || details.status === "running") {
    return renderRunningResult(details, theme);
  }

  // ---- Background agent launched ----
  if (details.status === "background") {
    return new Text(theme.fg("dim", `  ⎿  Running in background (ID: ${details.agentId})`), 0, 0);
  }

  // ---- Completed / Steered ----
  if (details.status === "completed" || details.status === "steered") {
    return renderCompletedResult(result, details, opts, theme);
  }

  // ---- Stopped (user-initiated abort) ----
  if (details.status === "stopped") {
    return renderStoppedResult(details, theme);
  }

  // ---- Error / Aborted (hard max_turns) ----
  return renderErrorResult(details, theme);
}

/**
 * Map a CommonSpawnOptions object into the spawn API shape used by agent manager calls.
 *
 * @param input - Common spawn configuration (model, limits, isolation and invocation metadata)
 * @returns An object containing the normalized spawn fields: description, optional model, optional maxTurns, isolation flags, optional thinkingLevel, optional isolation mode, and the invocation metadata
 */
export function buildSpawnOptions(input: CommonSpawnOptions): {
  description: string;
  model?: Model<unknown>;
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

/**
 * Materialize a non-single `OrchestrationDecision` into actual agent spawns
 * and return a single aggregated `textResult`.
 *
 * Strategy:
 * - Always spawn each member as a background agent (so the existing
 *   batch/swarm/group pipeline handles join coordination). The
 *   BatchOrchestrator routes members by `joinMode` (swarm | group | smart | async).
 * - When the caller's `runInBackground` is true, return immediately with a
 *   summary listing all spawned agent IDs. Members will be delivered via the
 *   normal group/swarm notification path when they complete.
 * - When the caller's `runInBackground` is false, await each member's
 *   `record.promise` and aggregate the results into a single text block.
 *
 * Pure orchestration glue — no I/O, no LLM calls of its own. The dispatcher
 * itself is in `orchestration-dispatch.ts` and is unit-tested independently.
 */
type ActivityTrackerState = ReturnType<typeof createActivityTracker>["state"];

interface OrchestratedDispatchArgs {
  detailBase: {
    displayName: string;
    description: string;
    subagentType: string;
    modelName?: string;
    tags?: string[];
  };
  subagentType: SubagentType;
  displayName: string;
  rawType: string;
  fellBack: boolean;
  runInBackground: boolean;
  effectiveMaxTurns: number | undefined;
  model: Model<unknown> | undefined;
  isolated: boolean;
  inheritContext: boolean;
  thinking: ThinkingLevel | undefined;
  isolation: IsolationMode | undefined;
  agentInvocation: AgentInvocation;
  manager: AgentManager;
  batchOrchestrator: BatchOrchestrator;
  agentActivity: Map<string, ActivityTrackerState>;
  widget: { ensureTimer: () => void; debouncedUpdate: () => void };
  pi: ExtensionAPI;
  piCtx: ExtensionContext;
  toolCallId: string;
}

/**
 * Materialize a non-single `OrchestrationDecision` into actual agent spawns
 * and return a single aggregated `textResult`.
 *
 * Strategy:
 * - Always spawn each member as a background agent (so the existing
 *   batch/swarm/group pipeline handles join coordination). The
 *   BatchOrchestrator routes members by `joinMode` (swarm | group | smart | async).
 *   In foreground mode we `flush()` immediately after the fan-out so
 *   the swarm/group is created before members can complete (the 100ms
 *   debounce would otherwise drop stragglers).
 * - When the caller's `runInBackground` is true, return immediately with a
 *   summary listing all spawned agent IDs. Members will be delivered via the
 *   normal group/swarm notification path when they complete.
 * - When the caller's `runInBackground` is false, await each member's
 *   `record.promise` and aggregate the results into a single text block.
 *
 * Pure orchestration glue — no I/O, no LLM calls of its own. The dispatcher
 * itself is in `orchestration-dispatch.ts` and is unit-tested independently.
 */
async function runOrchestratedDispatch(
  dispatch: Extract<OrchestrationDecision, { kind: "swarm" | "crew" }>,
  args: OrchestratedDispatchArgs,
): Promise<AgentToolResult<unknown>> {
  const members =
    dispatch.kind === "crew"
      ? dispatch.roles.map((r) => ({
          description: r.description,
          prompt: r.prompt,
          role: r.role as string | undefined,
        }))
      : dispatch.agents.map((a) => ({ description: a.description, prompt: a.prompt, role: undefined }));

  const spawned: { id: string; description: string; role?: string }[] = [];
  for (const member of members) {
    const { state: bgState, callbacks: bgCallbacks } = createActivityTracker(args.effectiveMaxTurns);
    const spawnOptions = {
      ...buildSpawnOptions({
        description: member.description,
        model: args.model,
        maxTurns: args.effectiveMaxTurns,
        isolated: args.isolated,
        inheritContext: args.inheritContext,
        thinking: args.thinking,
        isolation: args.isolation,
        invocation: args.agentInvocation,
      }),
      isBackground: true,
      ...bgCallbacks,
    };
    let id: string;
    try {
      id = args.manager.spawn(args.pi, args.piCtx, args.subagentType, member.prompt, spawnOptions);
    } catch (err) {
      // Partial-failure surface: list the IDs we DID spawn, then the error.
      return textResult(
        `Orchestration dispatch failed mid-fanout: ${err instanceof Error ? err.message : String(err)}\n` +
          `Spawned ${spawned.length}/${members.length} before failure: ${spawned.map((s) => s.id).join(", ")}`,
      );
    }
    const record = args.manager.getRecord(id);
    if (record) {
      record.joinMode = dispatch.joinMode;
      record.toolCallId = args.toolCallId;
    }
    args.batchOrchestrator.addToBatch(id, dispatch.joinMode);
    args.agentActivity.set(id, bgState);
    spawned.push({ id, description: member.description, role: member.role });
  }

  args.widget.ensureTimer();
  args.widget.debouncedUpdate();

  // Background mode: fire-and-forget flush (so the swarm/group is created
  // before any member can complete during the 100ms debounce window). Don't
  // await — callers expect the agent IDs to be returned immediately.
  // Foreground mode: flush synchronously below.
  if (args.runInBackground) {
    void args.batchOrchestrator.flush().catch((err) => {
      logger.warn?.(`BatchOrchestrator flush failed after dispatch`, {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    const label = dispatch.kind === "crew" ? "crew" : "swarm";
    const ids = spawned.map((s) => s.id).join(", ");
    return textResult(
      `${label} dispatched in background (${spawned.length} members).\n` +
        `Agent IDs: ${ids}\n` +
        `Join mode: ${dispatch.joinMode}\n\n` +
        `You will be notified when all members complete.`,
      {
        ...args.detailBase,
        toolUses: 0,
        tokens: "",
        durationMs: 0,
        status: "background" as const,
        agentId: spawned[0]?.id ?? "",
      },
    );
  }

  // Foreground mode: finalize the batch synchronously so the swarm/group is
  // live before we start awaiting any member's record.promise — otherwise a
  // fast-finishing member's `onAgentComplete` could miss the swarm/group and
  // end up delivered as an individual nudge.
  await args.batchOrchestrator.flush();

  // Foreground mode: await each member and aggregate.
  // Every spawned id MUST have a record (spawn stores synchronously). If
  // some id is missing it's a bookkeeping bug worth surfacing, not hiding.
  const records = spawned.map((s) => {
    const r = args.manager.getRecord(s.id);
    if (!r) throw new Error(`orchestrated dispatch: missing record for ${s.id}`);
    return r;
  });
  // `AgentRecord.promise` is typed as optional because the agent manager
  // // populates it asynchronously in startAgent. After `manager.spawn`
  // returns, startAgent is scheduled and the promise is set on the next
  // microtask. We assert non-null at this point: if it ever IS null we're
  // already broken and want to surface it.
  const settled = await Promise.allSettled(records.map((r) => r.promise as Promise<string>));
  const aggregate = formatOrchestratedAggregate(args, dispatch, spawned, records, settled);
  return textResult(aggregate);
}

function formatOrchestratedAggregate(
  args: OrchestratedDispatchArgs,
  dispatch: Extract<OrchestrationDecision, { kind: "swarm" | "crew" }>,
  spawned: { id: string; description: string; role?: string }[],
  records: (AgentRecord | undefined)[],
  settled: PromiseSettledResult<string>[],
): string {
  const fallbackNote = args.fellBack
    ? `Note: Unknown agent type "${args.rawType}" — using ${args.displayName}.\n\n`
    : "";
  const label = dispatch.kind === "crew" ? "Crew" : "Swarm";
  const header = `${label} completed (${spawned.length} members, join mode: ${dispatch.joinMode}).\n\n`;
  const sections = spawned.map((s, i) => {
    const r = settled[i];
    const record = records[i];
    let body: string;
    if (r.status === "rejected") {
      body = `Error: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`;
    } else if (record?.status === "error" && record.error) {
      // fulfilled but record has an error — surface it instead of "(no output)".
      body = `Error: ${record.error}`;
    } else if (record?.status === "aborted") {
      body = "(aborted — hit max turns)";
    } else if (record?.status === "stopped") {
      body = "(stopped by user)";
    } else {
      body = (r.value ?? "").trim() || "(no output)";
    }
    const roleTag = s.role ? ` (${s.role})` : "";
    return `### ${s.description}${roleTag}\n${body}`;
  });
  return `${fallbackNote + header + sections.join("\n\n")}\n`;
}

/**
 * Decorates a callbacks object so `afterCreate` is invoked after its existing `onSessionCreated` handler.
 *
 * @param target - An object that may have an `onSessionCreated` callback to wrap
 * @param afterCreate - Callback to run with the session after the original handler (if any) has been called
 */
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

/**
 * Resolve the agent type, model, invocation config, and detail base for the execute callback.
 * Returns the fully resolved config, or an early-return result when model resolution fails
 * (e.g. an invalid model name passed via tool params).
 */
function resolveExecuteConfig(
  params: Record<string, unknown>,
  piCtx: ExtensionContext,
): { config: ExecuteResolvedConfig; earlyReturn?: AgentToolResult<unknown> } {
  const rawType = params.subagent_type as SubagentType;
  const resolved = resolveType(rawType);
  const subagentType = resolved ?? "general-purpose";
  const fellBack = resolved === undefined;
  const displayName = getDisplayName(subagentType);
  const customConfig = getAgentConfig(subagentType);
  const resolvedConfig = resolveAgentInvocationConfig(customConfig, params);

  // Resolve model: tool-call params take priority over agent config defaults.
  // resolveAgentInvocationConfig already handles the priority chain. If the
  // resolved model can't be found, only surface the error to the user when
  // they explicitly requested that model (modelFromParams). Config model
  // resolution failures silently fall back to the parent model.
  let model = piCtx.model;
  let earlyReturn: AgentToolResult<unknown> | undefined;
  if (resolvedConfig.modelInput) {
    const resolvedModel = resolveModel(resolvedConfig.modelInput, piCtx.modelRegistry);
    if (typeof resolvedModel === "string") {
      if (resolvedConfig.modelFromParams) earlyReturn = textResult(resolvedModel);
    } else {
      model = resolvedModel as any;
    }
  }

  const config = buildResolvedConfig(
    params,
    piCtx,
    resolvedConfig,
    customConfig,
    subagentType,
    displayName,
    rawType,
    fellBack,
    model,
  );
  return { config, earlyReturn };
}

/**
 * Build the ExecuteResolvedConfig from resolved parameters.
 * Extracted to keep resolveExecuteConfig readable.
 */
function buildResolvedConfig(
  params: Record<string, unknown>,
  piCtx: ExtensionContext,
  resolvedConfig: ReturnType<typeof resolveAgentInvocationConfig>,
  customConfig: ReturnType<typeof getAgentConfig>,
  subagentType: SubagentType,
  displayName: string,
  rawType: string,
  fellBack: boolean,
  model: Model<unknown> | undefined,
): ExecuteResolvedConfig {
  const thinking = resolvedConfig.thinking;
  const inheritContext = resolvedConfig.inheritContext;
  const runInBackground = resolvedConfig.runInBackground;
  const isolated = resolvedConfig.isolated;
  const isolation = resolvedConfig.isolation;

  const parentModelId = piCtx.model?.id;
  const effectiveModelId = model?.id;
  const modelName =
    effectiveModelId && effectiveModelId !== parentModelId
      ? (model?.name ?? effectiveModelId).replace(/^Claude\s+/i, "").toLowerCase()
      : undefined;
  const effectiveMaxTurns = normalizeMaxTurns(resolvedConfig.maxTurns ?? getDefaultMaxTurns());
  const agentInvocation: AgentInvocation = {
    modelName,
    thinking,
    maxTurns: normalizeMaxTurns(resolvedConfig.maxTurns),
    isolated,
    inheritContext,
    runInBackground,
    isolation,
  };
  const modeLabel = getPromptModeLabel(subagentType);
  const { tags: invocationTags } = buildInvocationTags(agentInvocation);
  const agentTags = modeLabel ? [modeLabel, ...invocationTags] : invocationTags;
  const detailBase = {
    displayName,
    description: params.description as string,
    subagentType,
    modelName,
    tags: agentTags.length > 0 ? agentTags : undefined,
  };

  return {
    detailBase,
    subagentType,
    displayName,
    rawType,
    fellBack,
    runInBackground,
    effectiveMaxTurns,
    model,
    isolated,
    inheritContext,
    thinking,
    isolation,
    agentInvocation,
    customConfig,
  };
}

/**
 * Handle orchestration dispatch (swarm / crew fan-out).
 * Returns the aggregated result when dispatch is non-single, or null when
 * the dispatch resolves to "single" (falling through to background/foreground).
 */
async function handleOrchestrationDispatch(
  params: Record<string, unknown>,
  config: ExecuteResolvedConfig,
  toolCtx: ToolContext,
  piCtx: ExtensionContext,
  toolCallId: string,
): Promise<AgentToolResult<unknown> | null> {
  const { pi, manager, widget, agentActivity, batchOrchestrator } = toolCtx;
  const configuredOrchestrationMode = getOrchestrationMode();
  const dispatch = resolveOrchestrationMode({
    mode: configuredOrchestrationMode,
    prompt: params.prompt as string,
    description: params.description as string,
    subagentType: config.subagentType,
    runInBackground: config.runInBackground,
  });
  recordDispatchDecision({
    kind: dispatch.kind,
    configuredMode: configuredOrchestrationMode,
    source: configuredOrchestrationMode === "auto" ? "auto-heuristic" : "explicit",
    promptLength: (params.prompt as string).length,
    description: (params.description as string) ?? "",
  });
  if (dispatch.kind === "single") return null;

  return await runOrchestratedDispatch(dispatch, {
    detailBase: config.detailBase,
    subagentType: config.subagentType,
    displayName: config.displayName,
    rawType: config.rawType,
    fellBack: config.fellBack,
    runInBackground: config.runInBackground,
    effectiveMaxTurns: config.effectiveMaxTurns,
    model: config.model,
    isolated: config.isolated,
    inheritContext: config.inheritContext,
    thinking: config.thinking,
    isolation: config.isolation,
    agentInvocation: config.agentInvocation,
    manager,
    batchOrchestrator,
    agentActivity,
    widget,
    pi,
    piCtx,
    toolCallId,
  });
}

/**
 * Shared resolved configuration passed through the execute phases.
 * Captures the common fields needed by estimate, schedule, resume,
 * background, and foreground paths so each helper receives a single object.
 */
interface ExecuteResolvedConfig {
  detailBase: {
    displayName: string;
    description: string;
    subagentType: string;
    modelName?: string;
    tags?: string[];
  };
  subagentType: SubagentType;
  displayName: string;
  rawType: string;
  fellBack: boolean;
  runInBackground: boolean;
  effectiveMaxTurns: number | undefined;
  model: Model<unknown> | undefined;
  isolated: boolean;
  inheritContext: boolean;
  thinking: ThinkingLevel | undefined;
  isolation: IsolationMode | undefined;
  agentInvocation: AgentInvocation;
  customConfig: ReturnType<typeof getAgentConfig>;
}

/**
 * Handle the estimate_only path: validate incompatibilities and return a token/turn estimate.
 * Returns null when estimate_only is not requested.
 */
async function handleEstimateOnly(
  params: Record<string, unknown>,
  config: ExecuteResolvedConfig,
): Promise<AgentToolResult<unknown> | null> {
  if (!params.estimate_only) return null;
  if (params.resume) return textResult("Cannot combine `estimate_only` with `resume`.");
  if (params.schedule) return textResult("Cannot combine `estimate_only` with `schedule`.");
  return textResult(
    buildAgentEstimate({
      prompt: params.prompt as string,
      description: params.description as string,
      type: config.subagentType,
      config: config.customConfig,
      inheritContext: config.inheritContext,
      maxTurns: config.effectiveMaxTurns,
    }),
  );
}

/**
 * Handle the schedule path: validate incompatibilities, register a cron job,
 * and return a job-confirmation result. Returns null when no schedule is requested.
 */
async function handleSchedule(
  params: Record<string, unknown>,
  config: ExecuteResolvedConfig,
  scheduler: ToolContext["scheduler"],
): Promise<AgentToolResult<unknown> | null> {
  if (!params.schedule) return null;

  if (!isSchedulingEnabled()) {
    return textResult("Scheduling is disabled in this project. Enable via /agents → Settings → Scheduling.");
  }
  if (params.resume) {
    return textResult("Cannot combine `schedule` with `resume` — schedules create fresh agents.");
  }
  if (params.inherit_context) {
    return textResult(
      "Cannot combine `schedule` with `inherit_context` — there is no parent conversation at fire time.",
    );
  }
  if (params.run_in_background === false) {
    return textResult(
      "Cannot combine `schedule` with `run_in_background: false` — scheduled jobs always run in background.",
    );
  }
  if (!scheduler.isActive()) {
    return textResult("Scheduler is not active in this session yet. Try again after the session has fully started.");
  }
  try {
    const job = await scheduler.addJob({
      name: params.description as string,
      description: params.description as string,
      schedule: params.schedule as string,
      subagent_type: config.subagentType,
      prompt: params.prompt as string,
      model: params.model as string | undefined,
      thinking: config.thinking,
      max_turns: config.effectiveMaxTurns,
      isolated: config.isolated,
      isolation: config.isolation,
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

/**
 * Handle the resume path: look up an existing agent, validate it has a session,
 * and resume execution. Returns null when no resume is requested.
 */
async function handleResume(
  params: Record<string, unknown>,
  config: ExecuteResolvedConfig,
  manager: AgentManager,
  signal: AbortSignal | undefined,
): Promise<AgentToolResult<unknown> | null> {
  if (!params.resume) return null;

  const existing = manager.getRecord(params.resume as string);
  if (!existing) {
    return textResult(`Agent not found: "${params.resume}". It may have been cleaned up.`);
  }
  if (!existing.session) {
    return textResult(`Agent "${params.resume}" has no active session to resume.`);
  }
  const record = await manager.resume(params.resume as string, params.prompt as string, signal);
  if (!record) {
    return textResult(`Failed to resume agent "${params.resume}".`);
  }
  return textResult(
    record.result?.trim() || record.error?.trim() || "No output.",
    buildDetails(config.detailBase, { ...record, startedAt: record.startedAt ?? 0 }),
  );
}

/**
 * Handle the background execution path: spawn a background agent, wire output
 * file streaming and join mode, and return a background-confirmation result.
 */
async function handleBackgroundSpawn(
  params: Record<string, unknown>,
  config: ExecuteResolvedConfig,
  toolCtx: ToolContext,
  piCtx: ExtensionContext,
  toolCallId: string,
): Promise<AgentToolResult<unknown>> {
  const { pi, manager, widget, agentActivity, batchOrchestrator } = toolCtx;
  const { state: bgState, callbacks: bgCallbacks } = createActivityTracker(config.effectiveMaxTurns);

  // Build spawn options upfront so we can mutate the same object after
  // spawn returns — the manager stores this reference internally.
  const spawnOptions = {
    ...buildSpawnOptions({
      description: params.description as string,
      model: config.model,
      maxTurns: config.effectiveMaxTurns,
      isolated: config.isolated,
      inheritContext: config.inheritContext,
      thinking: config.thinking,
      isolation: config.isolation,
      invocation: config.agentInvocation,
    }),
    isBackground: true,
    ...bgCallbacks,
  };

  let id: string;
  try {
    id = manager.spawn(pi, piCtx, config.subagentType, params.prompt as string, spawnOptions);
  } catch (err) {
    return textResult(err instanceof Error ? err.message : String(err));
  }

  // Wire output file streaming now that id is available.
  setupSessionCallbacks(spawnOptions, (session) => {
    const rec = manager.getRecord(id);
    if (rec?.outputFile) {
      rec.outputCleanup = streamToOutputFile(session, rec.outputFile, id, piCtx.cwd);
    }
  });

  // Set output file + join mode synchronously after spawn.
  const joinMode = resolveJoinMode(getDefaultJoinMode(), true);
  const record = manager.getRecord(id);
  if (record && joinMode) {
    record.joinMode = joinMode;
    record.toolCallId = toolCallId;
    record.outputFile = createOutputFilePath(piCtx.cwd, id, piCtx.sessionManager.getSessionId());
    writeInitialEntry(record.outputFile, id, params.prompt as string, piCtx.cwd);
  }

  if (joinMode != null && joinMode !== "async") {
    batchOrchestrator.addToBatch(id, joinMode);
  }

  agentActivity.set(id, bgState);
  widget.ensureTimer();
  widget.debouncedUpdate();

  pi.events.emit("subagents:created", {
    id,
    type: config.subagentType,
    description: params.description,
    isBackground: true,
  });

  return buildBackgroundResult(id, record, config, manager);
}

/**
 * Build the text result for a successfully spawned background agent.
 * Includes agent ID, type, description, output file, and queue position.
 */
function buildBackgroundResult(
  id: string,
  record: AgentRecord | undefined,
  config: ExecuteResolvedConfig,
  manager: AgentManager,
): AgentToolResult<unknown> {
  const isQueued = record?.status === "queued";
  return textResult(
    `Agent ${isQueued ? "queued" : "started"} in background.\n` +
      `Agent ID: ${id}\n` +
      `Type: ${config.displayName}\n` +
      `Description: ${config.detailBase.description}\n` +
      (record?.outputFile ? `Output file: ${record.outputFile}\n` : "") +
      (isQueued ? `Position: queued (max ${manager.getMaxConcurrent()} concurrent)\n` : "") +
      `\nYou will be notified when this agent completes.\n` +
      `Use get_subagent_result to retrieve full results, or steer_subagent to send it messages.\n` +
      `Do not duplicate this agent's work.`,
    { ...config.detailBase, toolUses: 0, tokens: "", durationMs: 0, status: "background" as const, agentId: id },
  );
}

/**
 * Handle the foreground execution path: stream progress via onUpdate,
 * spawn-and-wait, and return the final result.
 */
async function handleForegroundSpawn(
  params: Record<string, unknown>,
  config: ExecuteResolvedConfig,
  toolCtx: ToolContext,
  piCtx: ExtensionContext,
  signal: AbortSignal | undefined,
  onUpdate: ((update: { content: Array<{ type: string; text: string }>; details: unknown }) => void) | undefined,
): Promise<AgentToolResult<unknown>> {
  const { pi, manager, widget, agentActivity } = toolCtx;
  const detailBase = config.detailBase;
  let spinnerFrame = 0;
  const startedAt = Date.now();
  let fgId: string | undefined;

  // fgState is assigned right after createActivityTracker — the closure
  // reads it lazily, so the ref pattern is safe (callback never fires
  // before the next line runs).
  let fgState: ActivityTrackerState;
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

  const tracker = createActivityTracker(config.effectiveMaxTurns, streamUpdate);
  fgState = tracker.state;
  const fgCallbacks = tracker.callbacks;

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
    record = await manager.spawnAndWait(pi, piCtx, config.subagentType, params.prompt as string, {
      ...buildSpawnOptions({
        description: params.description as string,
        model: config.model,
        maxTurns: config.effectiveMaxTurns,
        isolated: config.isolated,
        inheritContext: config.inheritContext,
        thinking: config.thinking,
        isolation: config.isolation,
        invocation: config.agentInvocation,
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

  return buildForegroundResult(record, config, fgState, detailBase);
}

/**
 * Build the final text result for a completed foreground agent.
 * Handles error, completion, and stats formatting.
 */
function buildForegroundResult(
  record: AgentRecord,
  config: ExecuteResolvedConfig,
  fgState: ActivityTrackerState,
  detailBase: ExecuteResolvedConfig["detailBase"],
): AgentToolResult<unknown> {
  const tokenText = formatLifetimeTokens(fgState);
  const details = buildDetails(detailBase, { ...record, startedAt: record.startedAt ?? 0 }, fgState, {
    tokens: tokenText,
  });
  const fallbackNote = config.fellBack
    ? `Note: Unknown agent type "${config.rawType}" — using general-purpose.\n\n`
    : "";

  if (record.status === "error") {
    return textResult(`${fallbackNote}Agent failed: ${record.error}`, details);
  }

  const durationMs = (record.completedAt ?? Date.now()) - (record.startedAt ?? 0);
  const statsParts = [`${record.toolUses} tool uses`];
  if (tokenText) statsParts.push(tokenText);
  return textResult(
    `${fallbackNote}Agent completed in ${formatMs(durationMs)} (${statsParts.join(", ")})${getStatusNote(record.status)}.\n\n` +
      (record.result?.trim() || "No output."),
    details,
  );
}

/**
 * Register and return the "Agent" tool used to launch and control autonomous subagents.
 *
 * The returned tool exposes parameters to configure agent type, prompt, model, thinking level, max turns, background/foreground execution, resuming, isolation, scheduling (when enabled), and estimate-only queries; it renders calls/results with a custom TUI presentation and implements execution paths for estimates, scheduling, resuming, background spawning (with output-file streaming and batching), and foreground streaming with progress updates.
 *
 * @returns The tool definition object for the Agent tool, suitable for registration with the tool system.
 */
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
          "Opt-in only — fire later instead of now. Omit to run immediately (the default, almost always correct). " +
          'Formats: 6-field cron ("0 0 9 * * 1" = 9am Mon), interval ("5m"/"1h"), one-shot ("+10m" or ISO). ' +
          "Forces run_in_background; incompatible with inherit_context and resume. Returns job ID.",
      }),
    ),
  };
  const scheduleParam: Partial<typeof scheduleParamShape> = isSchedulingEnabled() ? scheduleParamShape : {};

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
          description:
            "Set to true to run in background. Returns agent ID immediately. You will be notified on completion.",
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
          description:
            'Set to "worktree" to run the agent in a temporary git worktree (isolated copy of the repo). Changes are saved to a branch on completion.',
        }),
      ),
      ...scheduleParam,
    }),

    // ---- Custom rendering: Claude Code style ----

    renderCall(args, theme) {
      const displayName = args.subagent_type ? getDisplayName(args.subagent_type) : "Agent";
      const desc = args.description ?? "";
      return new Text(
        `▸ ${theme.fg("toolTitle", theme.bold(displayName))}${desc ? `  ${theme.fg("muted", desc)}` : ""}`,
        0,
        0,
      );
    },

    renderResult(result, { expanded, isPartial }, theme) {
      return renderAgentResult(result, { expanded, isPartial }, theme);
    },

    // ---- Execute ----

    execute: async (toolCallId, params, signal, onUpdate, piCtx) => {
      const { widget } = ctx;

      // Ensure we have UI context for widget rendering
      const uiCtx = piCtx && typeof piCtx.ui === "object" ? (piCtx.ui as UICtx) : undefined;
      if (uiCtx) widget.setUICtx(uiCtx);

      // Reload custom agents so new .pi/agents/*.md files are picked up without restart
      await reloadCustomAgents();

      const { config, earlyReturn } = resolveExecuteConfig(params as Record<string, unknown>, piCtx);
      if (earlyReturn) return earlyReturn;

      // Early-return paths (estimate, schedule, resume) — each returns null if not applicable
      const estimateResult = await handleEstimateOnly(params as Record<string, unknown>, config);
      if (estimateResult) return estimateResult;

      const scheduleResult = await handleSchedule(params as Record<string, unknown>, config, ctx.scheduler);
      if (scheduleResult) return scheduleResult;

      const resumeResult = await handleResume(params as Record<string, unknown>, config, ctx.manager, signal);
      if (resumeResult) return resumeResult;

      // Orchestration dispatch: single / swarm / crew fan-out
      const dispatchResult = await handleOrchestrationDispatch(
        params as Record<string, unknown>,
        config,
        ctx,
        piCtx,
        toolCallId,
      );
      if (dispatchResult) return dispatchResult;

      // Background execution
      if (config.runInBackground) {
        return await handleBackgroundSpawn(params as Record<string, unknown>, config, ctx, piCtx, toolCallId);
      }

      // Foreground (synchronous) execution — stream progress via onUpdate
      return await handleForegroundSpawn(
        params as Record<string, unknown>,
        config,
        ctx,
        piCtx,
        signal,
        onUpdate as any,
      );
    },
  });
}
