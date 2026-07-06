/**
 * agent-runner.ts — Enterprise Agent Execution Engine
 *
 * Core execution engine that creates sessions, runs agents, collects results.
 * Enhanced with:
 * - Swarm integration (heartbeats, inter-agent messaging)
 * - Resource quotas (token budgets, time limits, tool limits)
 * - Circuit breaker for model calls
 * - Structured error classification
 * - Graceful degradation strategies
 * - Comprehensive telemetry and metrics
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionAPI,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { getPromptCompressionLevel } from "./agent-registry.js";
import { runAdversarialValidation } from "./agent-runner-validator.js";
import {
  type EffectiveConfig,
  getAgentConfig,
  getConfig,
  getMemoryToolNames,
  getReadOnlyMemoryToolNames,
  getToolNamesForType,
} from "./agent-types.js";
import { trackEvent } from "./analytics.js";
import { buildParentContext, extractText } from "./context.js";
import { buildCtxInjection } from "./context-mode-bridge.js";
import { DEFAULT_AGENTS } from "./default-agents.js";
import { detectEnv } from "./env.js";
import { buildEnvFromContext } from "./env-context.js";
import { captureException, setErrorTrackingUser } from "./error-tracking.js";
import { type AgentHandoff, parseHandoff, renderHandoffForParent } from "./handoff.js";
import { type HookRegistry } from "./hooks.js";
import { logger } from "./logger.js";
import { buildMemoryBlock, buildReadOnlyMemoryBlock } from "./memory.js";
import { buildAgentPrompt, type PromptExtras } from "./prompts.js";
import { preloadSkills } from "./skill-loader.js";
import { getSwarmCoordinator } from "./swarm-join.js";
import { emitTelemetry } from "./telemetry.js";
import {
  endAgentSpan,
  endCompactionSpan,
  endToolSpan,
  endTurnSpan,
  startAgentSpan,
  startCompactionSpan,
  startToolSpan,
  startTurnSpan,
} from "./telemetry-otel.js";
import type { SubagentType, ThinkingLevel, ValidationResult } from "./types.js";
import { hasValidators } from "./validators.js";

// ============================================================================
// Constants & Error Types
// ============================================================================

/** Names of tools registered by this extension that subagents must NOT inherit. */
const EXCLUDED_TOOL_NAMES: ReadonlySet<string> = new Set(["Agent", "get_subagent_result", "steer_subagent"]);

/** Default max turns. undefined = unlimited. */
let defaultMaxTurns: number | undefined;

/** Additional turns allowed after the soft limit steer message. */
let graceTurns = 5;

/** Resource quota defaults. */
const DEFAULT_MAX_TOKENS = 500_000;
const DEFAULT_MAX_DURATION_MS = 600_000; // 10 minutes
const DEFAULT_MAX_TOOL_CALLS = 100;

/** Circuit breaker defaults. */
const CB_FAILURE_THRESHOLD = 5;
const CB_RECOVERY_TIMEOUT_MS = 30_000;

export class AgentRunnerError extends Error {
  constructor(
    message: string,
    public readonly code: "depth_exceeded" | "model_unavailable" | "quota_exceeded" | "aborted" | "timeout" | "unknown",
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AgentRunnerError";
  }
}

// ============================================================================
// Configuration
// ============================================================================

export function normalizeMaxTurns(n: number | undefined): number | undefined {
  if (n == null || typeof n !== "number" || Number.isNaN(n) || !Number.isFinite(n) || n === 0) return undefined;
  return Math.max(1, Math.floor(n));
}

export function getDefaultMaxTurns(): number | undefined {
  return defaultMaxTurns;
}

export function setDefaultMaxTurns(n: number | undefined): void {
  defaultMaxTurns = normalizeMaxTurns(n);
}

export function getGraceTurns(): number {
  return graceTurns;
}

export function setGraceTurns(n: number): void {
  graceTurns = Math.max(1, n);
}

// ============================================================================
// Circuit Breaker for Model Calls
// ============================================================================

class ModelCircuitBreaker {
  private failures = 0;
  private lastFailureAt = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureAt > CB_RECOVERY_TIMEOUT_MS) {
        this.state = "half-open";
      } else {
        throw new AgentRunnerError(
          "Model circuit breaker is OPEN — too many consecutive failures",
          "model_unavailable",
          { failures: this.failures, lastFailure: this.lastFailureAt },
        );
      }
    }

    return fn().then(
      (result) => {
        if (this.state === "half-open") {
          this.state = "closed";
        }
        this.failures = 0;
        return result;
      },
      (err) => {
        this.failures++;
        this.lastFailureAt = Date.now();
        if (this.failures >= CB_FAILURE_THRESHOLD) {
          this.state = "open";
        }
        throw err;
      },
    );
  }

  getState(): { state: string; failures: number; lastFailureAt: number } {
    return { state: this.state, failures: this.failures, lastFailureAt: this.lastFailureAt };
  }
}

const globalCircuitBreaker = new ModelCircuitBreaker();

// ============================================================================
// Model Resolution
// ============================================================================

let _cachedRegistry: unknown = null;
let _cachedKeys: Set<string> | null = null;

function getAvailableKeys(registry: { getAvailable?(): Model<Api>[] }): Set<string> | undefined {
  if (registry === _cachedRegistry && _cachedKeys) return _cachedKeys;
  const available = registry.getAvailable?.();
  if (!available) return undefined;
  _cachedKeys = new Set(available.map((m) => `${m.provider}/${m.id}`));
  _cachedRegistry = registry;
  return _cachedKeys;
}

function resolveDefaultModel(
  parentModel: Model<Api> | undefined,
  registry: {
    find(provider: string, modelId: string): Model<Api> | undefined;
    getAvailable?(): Model<Api>[];
  },
  configModel?: string,
): Model<Api> | undefined {
  if (configModel) {
    const slashIdx = configModel.indexOf("/");
    if (slashIdx !== -1) {
      const provider = configModel.slice(0, slashIdx);
      const modelId = configModel.slice(slashIdx + 1);

      const availableKeys = getAvailableKeys(registry);
      const isAvailable = (p: string, id: string) => !availableKeys || availableKeys.has(`${p}/${id}`);

      const found = registry.find(provider, modelId);
      if (found && isAvailable(provider, modelId)) return found;
    }
  }
  return parentModel;
}

// ============================================================================
// Types
// ============================================================================

export interface ToolActivity {
  type: "start" | "end";
  toolName: string;
}

export interface ResourceQuotas {
  /** Max total tokens (input + output) before hard stop. */
  maxTokens?: number;
  /** Max execution duration in ms. */
  maxDurationMs?: number;
  /** Max number of tool calls. */
  maxToolCalls?: number;
}

export interface SwarmOptions {
  /** Enable swarm heartbeat reporting. */
  enableHeartbeat?: boolean;
  /** Heartbeat interval in ms (default: 10000). */
  heartbeatIntervalMs?: number;
  /** Enable inter-agent message polling. */
  enableMessaging?: boolean;
  /** Poll interval in ms (default: 5000). */
  messagePollIntervalMs?: number;
}

export interface RunOptions {
  pi: ExtensionAPI;
  agentId?: string;
  model?: Model<Api>;
  maxTurns?: number;
  signal?: AbortSignal;
  isolated?: boolean;
  inheritContext?: boolean;
  thinkingLevel?: ThinkingLevel;
  cwd?: string;
  onToolActivity?: (activity: ToolActivity) => void;
  onTextDelta?: (delta: string, fullText: string) => void;
  onSessionCreated?: (session: AgentSession) => void;
  onTurnEnd?: (turnCount: number) => void;
  onAssistantUsage?: (usage: { input: number; output: number; cacheWrite: number }) => void;
  onCompaction?: (info: { reason: "manual" | "threshold" | "overflow"; tokensBefore: number }) => void;
  skipValidators?: boolean;
  onValidationComplete?: (results: ValidationResult[]) => void;
  currentLevel?: number;
  levelLimit?: number;
  parentConfig?: EffectiveConfig;
  partitions?: readonly string[];
  /**
   * Short correlation id (8 hex chars) shared by every span the agent
   * emits. If absent, `startAgentSpan` simply omits the `correlation.id`
   * attribute. The manager sets this on every spawn so the id is stable
   * across `resumeAgent` calls and is queryable from the agent record.
   */
  correlationId?: string;
  hooks?: HookRegistry;
  spawnedAt?: number;
  onContextBuilt?: (timestamp: number) => void;
  /** Resource quotas for this run. */
  quotas?: ResourceQuotas;
  /** Swarm collaboration options. */
  swarm?: SwarmOptions;
  /** Called when a swarm message is received. */
  onSwarmMessage?: (from: string, payload: unknown) => void;
}

export interface RunResult {
  responseText: string;
  session: AgentSession;
  aborted: boolean;
  steered: boolean;
  validationResults?: ValidationResult[];
  validated?: boolean;
  handoff?: AgentHandoff;
  /** Execution metrics. */
  metrics: RunMetrics;
}

export interface RunMetrics {
  durationMs: number;
  turns: number;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  tokensCacheWrite: number;
  contextBuiltAt?: number;
  latencyToFirstTokenMs?: number;
}

// ============================================================================
// Response Collection
// ============================================================================

function collectResponseText(session: AgentSession) {
  let text = "";
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "message_start") {
      text = "";
    }
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      text += event.assistantMessageEvent.delta;
    }
  });
  return { getText: () => text, unsubscribe };
}

function getLastAssistantText(session: AgentSession): string {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const msg = session.messages[i];
    if (msg.role !== "assistant") continue;
    const text = extractText(msg.content).trim();
    if (text) return text;
  }
  return "";
}

function dispatchResumeEvent(
  event: AgentSessionEvent,
  options: {
    onToolActivity?: (activity: ToolActivity) => void;
    onAssistantUsage?: (usage: { input: number; output: number; cacheWrite: number }) => void;
    onCompaction?: (info: { reason: "manual" | "threshold" | "overflow"; tokensBefore: number }) => void;
  },
): void {
  if (event.type === "tool_execution_start") options.onToolActivity?.({ type: "start", toolName: event.toolName });
  if (event.type === "tool_execution_end") options.onToolActivity?.({ type: "end", toolName: event.toolName });
  if (event.type === "message_end" && event.message.role === "assistant") {
    const msg = event.message as { usage?: { input?: number; output?: number; cacheWrite?: number } };
    const u = msg.usage;
    if (u) options.onAssistantUsage?.({ input: u.input ?? 0, output: u.output ?? 0, cacheWrite: u.cacheWrite ?? 0 });
  }
  if (event.type === "compaction_end" && !event.aborted) {
    options.onCompaction?.({ reason: event.reason, tokensBefore: event.result?.tokensBefore ?? 0 });
  }
}

function forwardAbortSignal(session: AgentSession, signal?: AbortSignal): () => void {
  if (!signal) return () => {};
  const onAbort = () => session.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

// ============================================================================
// Deferred Context
// ============================================================================

function buildEffectivePrompt(ctx: ExtensionContext, prompt: string, options: RunOptions): string {
  if (!options.inheritContext) return prompt;

  const parentContext = buildParentContext(ctx);
  const builtAt = Date.now();
  options.onContextBuilt?.(builtAt);

  const spawnedAgo = options.spawnedAt ? builtAt - options.spawnedAt : 0;
  logger.debug("Context built after spawn", { agentId: options.agentId ?? "unknown", spawnedAgo });

  if (!parentContext) return prompt;
  return parentContext + prompt;
}

// ----------------------------------------------------------------------------
// runAgent turn/event handling helpers
// ----------------------------------------------------------------------------

interface RunTurnState {
  turnCount: number;
  toolCallCount: number;
  tokensIn: number;
  tokensOut: number;
  tokensCacheWrite: number;
  latencyToFirstToken: number | undefined;
  softLimitReached: boolean;
  aborted: boolean;
  currentMessageText: string;
  toolSpanSeq: number;
  currentTurnSpan: import("@opentelemetry/api").Span | undefined;
  activeToolSpans: Map<string, import("@opentelemetry/api").Span>;
}

function logHookError(err: unknown): void {
  logger.debug(`Hook dispatch error: ${err instanceof Error ? err.message : String(err)}`);
}

function dispatchHookSafe(
  hooks: HookRegistry | undefined,
  name: Parameters<HookRegistry["dispatch"]>[0],
  agentId: string,
  payload?: Record<string, unknown>,
): void {
  hooks?.dispatch(name, agentId, payload).catch(logHookError);
}

function endCurrentTurnSpan(state: RunTurnState): void {
  if (state.currentTurnSpan) {
    endTurnSpan(state.currentTurnSpan);
    state.currentTurnSpan = undefined;
  }
}

function handleTurnEnd(
  state: RunTurnState,
  options: RunOptions,
  session: AgentSession,
  maxTurns: number | undefined,
): void {
  endCurrentTurnSpan(state);
  dispatchHookSafe(options.hooks, "turn:end", options.agentId ?? "unknown");
  state.turnCount++;
  options.onTurnEnd?.(state.turnCount);
  if (maxTurns == null) return;
  if (!state.softLimitReached && state.turnCount >= maxTurns) {
    state.softLimitReached = true;
    session.steer("You have reached your turn limit. Wrap up immediately — provide your final answer now.");
  } else if (state.softLimitReached && state.turnCount >= maxTurns + graceTurns) {
    state.aborted = true;
    session.abort();
  }
}

function handleTurnStart(
  state: RunTurnState,
  options: RunOptions,
  agentCtx: import("@opentelemetry/api").Context,
): void {
  endCurrentTurnSpan(state);
  state.currentTurnSpan = startTurnSpan(options.agentId ?? "unknown", state.turnCount + 1, agentCtx);
  dispatchHookSafe(options.hooks, "turn:start", options.agentId ?? "unknown");
}

function handleMessageStart(state: RunTurnState, startTime: number): void {
  state.currentMessageText = "";
  if (state.latencyToFirstToken === undefined) {
    state.latencyToFirstToken = Date.now() - startTime;
  }
}

function handleMessageUpdate(
  event: Extract<AgentSessionEvent, { type: "message_update" }>,
  state: RunTurnState,
  options: RunOptions,
): void {
  if (event.assistantMessageEvent.type !== "text_delta") return;
  state.currentMessageText += event.assistantMessageEvent.delta;
  options.onTextDelta?.(event.assistantMessageEvent.delta, state.currentMessageText);
}

function handleToolExecutionStart(
  event: Extract<AgentSessionEvent, { type: "tool_execution_start" }>,
  state: RunTurnState,
  options: RunOptions,
  session: AgentSession,
  agentCtx: import("@opentelemetry/api").Context,
  quotas: { maxTokens: number; maxDurationMs: number; maxToolCalls: number },
): boolean {
  state.toolCallCount++;
  const toolSpanKey = `${event.toolName}-${++state.toolSpanSeq}`;
  const toolSpan = startToolSpan(options.agentId ?? "unknown", event.toolName, agentCtx);
  state.activeToolSpans.set(toolSpanKey, toolSpan);

  if (state.toolCallCount > quotas.maxToolCalls) {
    logger.warn(`Tool call quota exceeded`, {
      agentId: options.agentId,
      toolCallCount: state.toolCallCount,
      maxToolCalls: quotas.maxToolCalls,
    });
    session.abort();
    state.aborted = true;
    return false;
  }
  options.onToolActivity?.({ type: "start", toolName: event.toolName });
  return true;
}

function handleToolExecutionEnd(
  event: Extract<AgentSessionEvent, { type: "tool_execution_end" }>,
  state: RunTurnState,
  options: RunOptions,
): void {
  for (const [key, ts] of [...state.activeToolSpans.entries()].reverse()) {
    if (key.startsWith(`${event.toolName}-`)) {
      endToolSpan(ts);
      state.activeToolSpans.delete(key);
      break;
    }
  }
  options.onToolActivity?.({ type: "end", toolName: event.toolName });
}

function handleMessageEnd(
  event: Extract<AgentSessionEvent, { type: "message_end" }>,
  state: RunTurnState,
  options: RunOptions,
): void {
  if (event.message.role !== "assistant") return;
  const msg = event.message as { usage?: { input?: number; output?: number; cacheWrite?: number } };
  const u = msg.usage;
  if (!u) return;
  state.tokensIn += u.input ?? 0;
  state.tokensOut += u.output ?? 0;
  state.tokensCacheWrite += u.cacheWrite ?? 0;
  options.onAssistantUsage?.({ input: u.input ?? 0, output: u.output ?? 0, cacheWrite: u.cacheWrite ?? 0 });
}

function handleCompactionEnd(
  event: Extract<AgentSessionEvent, { type: "compaction_end" }>,
  options: RunOptions,
  agentCtx: import("@opentelemetry/api").Context,
): void {
  if (event.aborted) return;
  const tokensBefore = event.result?.tokensBefore ?? 0;
  options.onCompaction?.({ reason: event.reason, tokensBefore });
  const compactionSpan = startCompactionSpan(options.agentId ?? "unknown", event.reason, tokensBefore, agentCtx);
  endCompactionSpan(compactionSpan);
  dispatchHookSafe(options.hooks, "compaction:end", options.agentId ?? "unknown", {
    reason: event.reason,
    tokensBefore: tokensBefore,
  });
}

function handleCompactionStart(
  event: Extract<AgentSessionEvent, { type: "compaction_start" }>,
  options: RunOptions,
): void {
  dispatchHookSafe(options.hooks, "compaction:start", options.agentId ?? "unknown", { reason: event.reason });
}

// ----------------------------------------------------------------------------
// runAgent setup helpers
// ----------------------------------------------------------------------------

interface AgentSetupInputs {
  type: SubagentType;
  options: RunOptions;
  config: EffectiveConfig;
  agentConfig: ReturnType<typeof getAgentConfig>;
  effectiveCwd: string;
  extensions: false | readonly string[] | true;
  skills: false | readonly string[] | true;
  env: Awaited<ReturnType<typeof detectEnv>>;
  parentSystemPrompt: string;
}

function resolveToolNamesAndExtras(input: AgentSetupInputs): { toolNames: string[]; extras: PromptExtras } {
  const { type, agentConfig, effectiveCwd, skills } = input;
  const extras: PromptExtras = {};

  if (Array.isArray(skills)) {
    const loaded = preloadSkills(skills, effectiveCwd);
    if (loaded.length > 0) extras.skillBlocks = loaded;
  }

  let toolNames = getToolNamesForType(type);

  if (agentConfig?.memory) {
    toolNames = applyMemoryTools(toolNames, agentConfig, effectiveCwd, extras);
  }

  // Parent permission inheritance
  const allowedTools = new Set(input.config.builtinToolNames);
  toolNames = toolNames.filter((t) => allowedTools.has(t));
  return { toolNames, extras };
}

function applyMemoryTools(
  toolNames: string[],
  agentConfig: NonNullable<ReturnType<typeof getAgentConfig>>,
  effectiveCwd: string,
  extras: PromptExtras,
): string[] {
  const existingNames = new Set(toolNames);
  const denied = agentConfig.disallowedTools ? new Set(agentConfig.disallowedTools) : undefined;
  const effectivelyHas = (name: string) => existingNames.has(name) && !denied?.has(name);
  const hasWriteTools = effectivelyHas("write") || effectivelyHas("edit");

  if (hasWriteTools) {
    const extraNames = getMemoryToolNames(existingNames);
    if (extraNames.length > 0) toolNames = [...toolNames, ...extraNames];
    extras.memoryBlock = buildMemoryBlock(
      agentConfig.name,
      agentConfig.memory ?? "project",
      effectiveCwd,
      agentConfig.maxMemoryLines,
    );
  } else {
    const extraNames = getReadOnlyMemoryToolNames(existingNames);
    if (extraNames.length > 0) toolNames = [...toolNames, ...extraNames];
    extras.memoryBlock = buildReadOnlyMemoryBlock(
      agentConfig.name,
      agentConfig.memory ?? "project",
      effectiveCwd,
      agentConfig.maxMemoryLines,
    );
  }
  return toolNames;
}

function buildSystemPromptForAgent(
  type: SubagentType,
  agentConfig: ReturnType<typeof getAgentConfig>,
  effectiveCwd: string,
  env: Awaited<ReturnType<typeof detectEnv>>,
  parentSystemPrompt: string,
  extras: PromptExtras,
): string {
  const compressionLevel = agentConfig?.promptCompressionLevel ?? getPromptCompressionLevel();
  if (agentConfig) {
    return buildAgentPrompt(agentConfig, effectiveCwd, env, parentSystemPrompt, extras, compressionLevel);
  }
  const fallback = DEFAULT_AGENTS.get("general-purpose");
  if (!fallback) {
    throw new AgentRunnerError(`No fallback config available for unknown type "${type}"`, "unknown");
  }
  return buildAgentPrompt({ ...fallback, name: type }, effectiveCwd, env, parentSystemPrompt, extras, compressionLevel);
}

function applyCtxInjection(
  systemPrompt: string,
  toolNames: string[],
  agentId: string | undefined,
): { systemPrompt: string; toolNames: string[] } {
  const ctxInjection = buildCtxInjection();
  if (!ctxInjection) return { systemPrompt, toolNames };
  const nextPrompt = `${systemPrompt}\n\n${ctxInjection.systemPromptAddition}`;
  const nextTools = [...toolNames, ...ctxInjection.toolAllowList];
  logger.debug("context-mode tools injected", { agentId: agentId ?? "unknown" });
  return { systemPrompt: nextPrompt, toolNames: nextTools };
}

interface SwarmIntervals {
  heartbeatInterval: ReturnType<typeof setInterval> | undefined;
  messagePollInterval: ReturnType<typeof setInterval> | undefined;
}

function setupSwarmIntervals(options: RunOptions): SwarmIntervals {
  const swarmCoord = getSwarmCoordinator();
  const result: SwarmIntervals = { heartbeatInterval: undefined, messagePollInterval: undefined };
  if (!swarmCoord || !options.agentId) return result;

  if (options.swarm?.enableHeartbeat) {
    const interval = options.swarm.heartbeatIntervalMs ?? 10_000;
    result.heartbeatInterval = setInterval(() => {
      swarmCoord.heartbeat(options.agentId!);
    }, interval);
  }

  if (options.swarm?.enableMessaging) {
    let lastMessagePoll = 0;
    const interval = options.swarm.messagePollIntervalMs ?? 5_000;
    result.messagePollInterval = setInterval(() => {
      const messages = swarmCoord.pollMessages(options.agentId!, lastMessagePoll);
      for (const msg of messages) {
        lastMessagePoll = Math.max(lastMessagePoll, msg.ts);
        options.onSwarmMessage?.(msg.from, msg.payload);
      }
    }, interval);
  }
  return result;
}

function applyToolFiltering(
  session: AgentSession,
  toolNames: string[],
  extensions: false | readonly string[] | true,
  agentConfig: ReturnType<typeof getAgentConfig>,
): void {
  const disallowedSet = agentConfig?.disallowedTools ? new Set(agentConfig.disallowedTools) : undefined;
  if (extensions !== false) {
    const builtinToolNameSet = new Set(toolNames);
    const activeTools = session.getActiveToolNames().filter((t) => {
      if (EXCLUDED_TOOL_NAMES.has(t)) return false;
      if (disallowedSet?.has(t)) return false;
      if (builtinToolNameSet.has(t)) return true;
      if (Array.isArray(extensions)) {
        return extensions.some((ext) => t.startsWith(ext) || t.includes(ext));
      }
      return true;
    });
    session.setActiveToolsByName(activeTools);
  } else if (disallowedSet) {
    const activeTools = session.getActiveToolNames().filter((t) => !disallowedSet.has(t));
    session.setActiveToolsByName(activeTools);
  }
}

async function dispatchStartHook(
  options: RunOptions,
  type: SubagentType,
  model: Model<Api>,
  quotas: { maxTokens: number; maxDurationMs: number; maxToolCalls: number },
): Promise<void> {
  if (!options.hooks) return;
  const hookResult = await options.hooks.dispatch("subagent:start", options.agentId ?? "unknown", {
    type,
    model: `${model.provider}/${model.id}`,
    quotas,
  });
  if (hookResult === "block") {
    throw new AgentRunnerError("Blocked by hook", "aborted", { hook: "subagent:start" });
  }
}

function checkDepthLimit(options: RunOptions): { currentLevel: number; depthLimit: number } {
  const currentLevel = options.currentLevel ?? 0;
  const depthLimit = options.levelLimit ?? 5;
  if (currentLevel >= depthLimit) {
    throw new AgentRunnerError(`Max agent depth reached (${currentLevel}/${depthLimit})`, "depth_exceeded", {
      currentLevel,
      depthLimit,
    });
  }
  return { currentLevel, depthLimit };
}

function resolveAgentModel(
  ctx: ExtensionContext,
  options: RunOptions,
  agentConfig: ReturnType<typeof getAgentConfig>,
): Model<Api> {
  const model = options.model ?? resolveDefaultModel(ctx.model, ctx.modelRegistry, agentConfig?.model);
  if (!model) {
    throw new AgentRunnerError("No model available for agent execution", "model_unavailable");
  }
  return model;
}

async function buildResourceLoader(
  effectiveCwd: string,
  extensions: false | readonly string[] | true,
  skills: false | readonly string[] | true,
  systemPrompt: string,
  agentDir: string,
): Promise<DefaultResourceLoader> {
  const noSkills = skills === false || Array.isArray(skills);
  const loader = new DefaultResourceLoader({
    cwd: effectiveCwd,
    agentDir,
    noExtensions: extensions === false,
    noSkills,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => systemPrompt,
    appendSystemPromptOverride: () => [],
  });
  await loader.reload();
  return loader;
}

function buildSessionOptions(
  ctx: ExtensionContext,
  effectiveCwd: string,
  agentConfig: ReturnType<typeof getAgentConfig>,
  model: Model<Api>,
  toolNames: string[],
  loader: DefaultResourceLoader,
  options: RunOptions,
  agentDir: string,
): Parameters<typeof createAgentSession>[0] {
  const thinkingLevel = options.thinkingLevel ?? agentConfig?.thinking;
  const sessionOpts: Parameters<typeof createAgentSession>[0] = {
    cwd: effectiveCwd,
    agentDir,
    sessionManager: SessionManager.inMemory(effectiveCwd),
    settingsManager: SettingsManager.create(effectiveCwd, agentDir),
    modelRegistry: ctx.modelRegistry,
    model,
    tools: toolNames,
    resourceLoader: loader,
  };
  if (thinkingLevel) {
    sessionOpts.thinkingLevel = thinkingLevel;
  }
  return sessionOpts;
}

function parseHandoffFromResponse(
  responseText: string,
  agentConfig: ReturnType<typeof getAgentConfig>,
): { responseText: string; handoff: AgentHandoff | undefined } {
  if (!agentConfig?.handoff) return { responseText, handoff: undefined };
  const parsed = parseHandoff(responseText);
  if (!parsed) return { responseText, handoff: undefined };
  return { responseText: renderHandoffForParent(parsed), handoff: parsed };
}

interface AgentRunContext {
  session: AgentSession;
  agentSpan: import("@opentelemetry/api").Span;
  type: SubagentType;
  options: RunOptions;
  turnState: RunTurnState;
  startTime: number;
  activeToolSpans: Map<string, import("@opentelemetry/api").Span>;
  heartbeatInterval: ReturnType<typeof setInterval> | undefined;
  messagePollInterval: ReturnType<typeof setInterval> | undefined;
  unsubTurns: () => void;
  collector: ReturnType<typeof collectResponseText>;
  cleanupAbort: () => void;
}

async function runSessionPrompt(
  session: AgentSession,
  effectivePrompt: string,
  runCtx: AgentRunContext,
): Promise<void> {
  const { options, turnState, agentSpan, type, startTime } = runCtx;
  try {
    await session.prompt(effectivePrompt);
    dispatchHookSafe(options.hooks, "subagent:end", options.agentId ?? "unknown", {
      tokensIn: turnState.tokensIn,
      tokensOut: turnState.tokensOut,
    });
  } catch (err) {
    const errDuration = Date.now() - startTime;
    endAgentSpan(agentSpan, {
      status: "error",
      durationMs: errDuration,
      turns: turnState.turnCount,
      toolCalls: turnState.toolCallCount,
      tokensIn: turnState.tokensIn,
      tokensOut: turnState.tokensOut,
      tokensCacheWrite: turnState.tokensCacheWrite,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { agentType: type });
    options.hooks
      ?.dispatch("subagent:error", options.agentId ?? "unknown", {
        error: err instanceof Error ? err.message : String(err),
      })
      .catch((err2) => {
        logger.debug(`Hook dispatch error: ${err2 instanceof Error ? err2.message : String(err2)}`);
      });
    throw err;
  } finally {
    runCtx.unsubTurns();
    runCtx.collector.unsubscribe();
    runCtx.cleanupAbort();
    endCurrentTurnSpan(turnState);
    for (const ts of runCtx.activeToolSpans.values()) {
      endToolSpan(ts);
    }
    runCtx.activeToolSpans.clear();
    if (runCtx.heartbeatInterval) clearInterval(runCtx.heartbeatInterval);
    if (runCtx.messagePollInterval) clearInterval(runCtx.messagePollInterval);
  }
}

async function runValidationStage(
  session: AgentSession,
  ctx: ExtensionContext,
  responseTextIn: string,
  agentConfig: ReturnType<typeof getAgentConfig>,
  options: RunOptions,
): Promise<{
  responseText: string;
  validationResults: ValidationResult[] | undefined;
  validated: boolean | undefined;
}> {
  if (options.skipValidators || !hasValidators(agentConfig)) {
    return { responseText: responseTextIn, validationResults: undefined, validated: undefined };
  }
  const result = await runAdversarialValidation(
    session,
    ctx,
    responseTextIn,
    agentConfig,
    options.agentId ?? "unknown",
    {
      pi: options.pi,
      model: options.model,
      signal: options.signal,
      hooks: options.hooks,
      onToolActivity: options.onToolActivity,
      onAssistantUsage: options.onAssistantUsage,
      onCompaction: options.onCompaction,
      onValidationComplete: options.onValidationComplete,
      runAgent,
      resumeAgent,
    },
  );
  return {
    responseText: result.responseText,
    validationResults: result.validationResults,
    validated: result.validated,
  };
}

function finalizeAgentRun(
  type: SubagentType,
  options: RunOptions,
  turnState: RunTurnState,
  agentSpan: import("@opentelemetry/api").Span,
  duration: number,
  validationResults: ValidationResult[] | undefined,
  validated: boolean | undefined,
): void {
  emitTelemetry("agent:completed", {
    type,
    duration,
    validatorResults: validationResults?.map((r) => ({ passed: r.passed, summary: r.summary })),
  });

  trackEvent("agent:completed", options.agentId ?? "unknown", {
    type,
    duration,
    aborted: turnState.aborted,
    steered: turnState.softLimitReached,
    validated,
    turnCount: turnState.turnCount,
    toolCallCount: turnState.toolCallCount,
  });

  const finalStatus = turnState.aborted ? "aborted" : turnState.softLimitReached ? "steered" : "completed";
  endAgentSpan(agentSpan, {
    status: finalStatus,
    durationMs: duration,
    turns: turnState.turnCount,
    toolCalls: turnState.toolCallCount,
    tokensIn: turnState.tokensIn,
    tokensOut: turnState.tokensOut,
    tokensCacheWrite: turnState.tokensCacheWrite,
    validated,
  });
}

// ============================================================================
// Main Agent Runner
// ============================================================================

export async function runAgent(
  ctx: ExtensionContext,
  type: SubagentType,
  prompt: string,
  options: RunOptions,
): Promise<RunResult> {
  const startTime = Date.now();
  const quotas = {
    maxTokens: options.quotas?.maxTokens ?? DEFAULT_MAX_TOKENS,
    maxDurationMs: options.quotas?.maxDurationMs ?? DEFAULT_MAX_DURATION_MS,
    maxToolCalls: options.quotas?.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS,
  };

  // Check duration quota early
  const checkDurationQuota = () => {
    if (Date.now() - startTime > quotas.maxDurationMs) {
      throw new AgentRunnerError(`Agent exceeded max duration quota (${quotas.maxDurationMs}ms)`, "timeout", {
        elapsedMs: Date.now() - startTime,
        maxDurationMs: quotas.maxDurationMs,
      });
    }
  };

  const config = getConfig(type, options.parentConfig, options.partitions);
  const agentConfig = getAgentConfig(type);

  // Early exit: check level limit
  const { currentLevel } = checkDepthLimit(options);

  // Telemetry
  emitTelemetry("agent:spawned", {
    type,
    parentType: options.parentConfig ? type : undefined,
    depth: currentLevel,
    budget: options.maxTurns,
  });

  // Analytics (no-op when not configured)
  trackEvent("agent:spawned", options.agentId ?? "unknown", {
    type,
    parentType: options.parentConfig ? type : undefined,
    depth: currentLevel,
    maxTurns: options.maxTurns,
  });

  const effectiveCwd = options.cwd ?? ctx.cwd;
  // CHEF-100 Phase 1 dual-read: consume host workspaceContext when
  // available (zero shell-out), fall back to legacy detectEnv on pre-RFC
  // hosts. See src/env-context.ts and docs/chef-rfcs/CHEF-100-workspace-context.md.
  const env = buildEnvFromContext(options.pi) ?? (await detectEnv(options.pi, effectiveCwd));
  const parentSystemPrompt = ctx.getSystemPrompt();

  // Resolve extensions/skills
  const extensions = options.isolated ? false : config.extensions;
  const skills = options.isolated ? false : config.skills;

  const setupInput: AgentSetupInputs = {
    type,
    options,
    config,
    agentConfig,
    effectiveCwd,
    extensions,
    skills,
    env,
    parentSystemPrompt,
  };
  const { toolNames: baseToolNames, extras } = resolveToolNamesAndExtras(setupInput);
  let toolNames = baseToolNames;

  // Build system prompt
  let systemPrompt = buildSystemPromptForAgent(type, agentConfig, effectiveCwd, env, parentSystemPrompt, extras);

  // Context-mode injection
  const ctxResult = applyCtxInjection(systemPrompt, toolNames, options.agentId);
  systemPrompt = ctxResult.systemPrompt;
  toolNames = ctxResult.toolNames;

  const agentDir = getAgentDir();
  const loader = await buildResourceLoader(effectiveCwd, extensions, skills, systemPrompt, agentDir);

  // Resolve model with circuit breaker
  const model = resolveAgentModel(ctx, options, agentConfig);

  const sessionOpts = buildSessionOptions(ctx, effectiveCwd, agentConfig, model, toolNames, loader, options, agentDir);

  // Set error tracking user context so crashes are attributed to this agent
  setErrorTrackingUser({
    id: options.agentId ?? "unknown",
    agentType: type,
    piVersion: process.env.npm_package_version,
  });

  // Hook: subagent:start
  await dispatchStartHook(options, type, model, quotas);

  const effectivePrompt = buildEffectivePrompt(ctx, prompt, options);

  // Circuit breaker protected session creation
  const { session } = await globalCircuitBreaker.call(() => createAgentSession(sessionOpts));

  const baseSessionName = agentConfig?.name ?? type;
  session.setSessionName(options.agentId ? `${baseSessionName}#${options.agentId.slice(0, 8)}` : baseSessionName);

  // Swarm integration
  const { heartbeatInterval, messagePollInterval } = setupSwarmIntervals(options);

  // Tool filtering
  applyToolFiltering(session, toolNames, extensions, agentConfig);

  await session.bindExtensions({
    onError: (err) => {
      options.onToolActivity?.({
        type: "end",
        toolName: `extension-error:${err.extensionPath}`,
      });
    },
  });

  options.onSessionCreated?.(session);

  // OpenTelemetry span — created after all throwable setup completes.
  // If session creation or hook dispatch throws, no span leaks.
  const { span: agentSpan, ctx: agentCtx } = startAgentSpan(options.agentId ?? "unknown", type, {
    description: agentConfig?.description,
    depth: currentLevel,
    model: `${model.provider}/${model.id}`,
    correlationId: options.correlationId,
  });
  const activeToolSpans = new Map<string, import("@opentelemetry/api").Span>();

  // Turn tracking and quotas
  const maxTurns = normalizeMaxTurns(options.maxTurns ?? agentConfig?.maxTurns ?? defaultMaxTurns);
  const turnState: RunTurnState = {
    turnCount: 0,
    toolCallCount: 0,
    tokensIn: 0,
    tokensOut: 0,
    tokensCacheWrite: 0,
    latencyToFirstToken: undefined,
    softLimitReached: false,
    aborted: false,
    currentMessageText: "",
    toolSpanSeq: 0,
    currentTurnSpan: undefined,
    activeToolSpans,
  };

  const unsubTurns = session.subscribe((event: AgentSessionEvent) => {
    // Quota checks
    checkDurationQuota();
    const totalTokens = turnState.tokensIn + turnState.tokensOut;
    if (totalTokens > quotas.maxTokens) {
      logger.warn(`Token quota exceeded`, { agentId: options.agentId, totalTokens, maxTokens: quotas.maxTokens });
      session.abort();
      turnState.aborted = true;
      return;
    }

    switch (event.type) {
      case "turn_end":
        handleTurnEnd(turnState, options, session, maxTurns);
        break;
      case "turn_start":
        handleTurnStart(turnState, options, agentCtx);
        break;
      case "message_start":
        handleMessageStart(turnState, startTime);
        break;
      case "message_update":
        handleMessageUpdate(event, turnState, options);
        break;
      case "tool_execution_start":
        if (!handleToolExecutionStart(event, turnState, options, session, agentCtx, quotas)) return;
        break;
      case "tool_execution_end":
        handleToolExecutionEnd(event, turnState, options);
        break;
      case "message_end":
        handleMessageEnd(event, turnState, options);
        break;
      case "compaction_end":
        handleCompactionEnd(event, options, agentCtx);
        break;
      case "compaction_start":
        handleCompactionStart(event, options);
        break;
      default:
        break;
    }
  });

  const collector = collectResponseText(session);
  const cleanupAbort = forwardAbortSignal(session, options.signal);

  const runCtx: AgentRunContext = {
    session,
    agentSpan,
    type,
    options,
    turnState,
    startTime,
    activeToolSpans,
    heartbeatInterval,
    messagePollInterval,
    unsubTurns,
    collector,
    cleanupAbort,
  };

  await runSessionPrompt(session, effectivePrompt, runCtx);

  let responseText = collector.getText().trim() || getLastAssistantText(session);
  const duration = Date.now() - startTime;

  // Structured handoff parsing
  const handoffResult = parseHandoffFromResponse(responseText, agentConfig);
  responseText = handoffResult.responseText;
  const handoff = handoffResult.handoff;

  // Adversarial validation (extracted to agent-runner-validator.ts)
  const validation = await runValidationStage(session, ctx, responseText, agentConfig, options);
  responseText = validation.responseText;
  const validationResults = validation.validationResults;
  const validated = validation.validated;

  finalizeAgentRun(type, options, turnState, agentSpan, duration, validationResults, validated);

  const metrics: RunMetrics = {
    durationMs: duration,
    turns: turnState.turnCount,
    toolCalls: turnState.toolCallCount,
    tokensIn: turnState.tokensIn,
    tokensOut: turnState.tokensOut,
    tokensCacheWrite: turnState.tokensCacheWrite,
    latencyToFirstTokenMs: turnState.latencyToFirstToken,
  };

  return {
    responseText,
    session,
    aborted: turnState.aborted,
    steered: turnState.softLimitReached,
    validationResults,
    validated,
    handoff,
    metrics,
  };
}

// ============================================================================
// Resume Agent
// ============================================================================

export async function resumeAgent(
  session: AgentSession,
  prompt: string,
  options: {
    onToolActivity?: (activity: ToolActivity) => void;
    onAssistantUsage?: (usage: { input: number; output: number; cacheWrite: number }) => void;
    onCompaction?: (info: { reason: "manual" | "threshold" | "overflow"; tokensBefore: number }) => void;
    signal?: AbortSignal;
    inheritContext?: boolean;
    ctx?: ExtensionContext;
  } = {},
): Promise<string> {
  const collector = collectResponseText(session);
  const cleanupAbort = forwardAbortSignal(session, options.signal);

  const unsubEvents =
    options.onToolActivity || options.onAssistantUsage || options.onCompaction
      ? session.subscribe((event: AgentSessionEvent) => {
          dispatchResumeEvent(event, options);
        })
      : () => {};

  let effectivePrompt = prompt;
  if (options.inheritContext && options.ctx) {
    const parentContext = buildParentContext(options.ctx);
    if (parentContext) {
      effectivePrompt = parentContext + prompt;
    }
  }

  try {
    await session.prompt(effectivePrompt);
  } finally {
    collector.unsubscribe();
    unsubEvents();
    cleanupAbort();
  }

  return collector.getText().trim() || getLastAssistantText(session);
}

// ============================================================================
// Steering
// ============================================================================

export async function steerAgent(session: AgentSession, message: string): Promise<void> {
  await session.steer(message);
}

// ============================================================================
// Conversation Serialization
// ============================================================================

function formatUserMessage(msg: AgentSession["messages"][number]): string | undefined {
  if (msg.role !== "user") return undefined;
  const text = typeof msg.content === "string" ? msg.content : extractText(msg.content);
  const trimmed = text.trim();
  return trimmed ? `[User]: ${trimmed}` : undefined;
}

function formatAssistantMessage(msg: AgentSession["messages"][number]): string[] {
  if (msg.role !== "assistant") return [];
  const textParts: string[] = [];
  const toolCalls: string[] = [];
  for (const c of msg.content) {
    if (c.type === "text" && c.text) textParts.push(c.text);
    else if (c.type === "toolCall") toolCalls.push(`  Tool: ${c.name ?? "unknown"}`);
  }
  const out: string[] = [];
  if (textParts.length > 0) out.push(`[Assistant]: ${textParts.join("\n")}`);
  if (toolCalls.length > 0) out.push(`[Tool Calls]:\n${toolCalls.join("\n")}`);
  return out;
}

function formatToolResultMessage(msg: AgentSession["messages"][number]): string | undefined {
  if (msg.role !== "toolResult") return undefined;
  const text = extractText(msg.content);
  const truncated = text.length > 200 ? `${text.slice(0, 200)}...` : text;
  return `[Tool Result (${msg.toolName})]: ${truncated}`;
}

function formatConversationMessage(msg: AgentSession["messages"][number]): string[] {
  const userPart = formatUserMessage(msg);
  if (userPart) return [userPart];
  const assistantParts = formatAssistantMessage(msg);
  if (assistantParts.length > 0) return assistantParts;
  const toolResultPart = formatToolResultMessage(msg);
  if (toolResultPart) return [toolResultPart];
  return [];
}

export function getAgentConversation(session: AgentSession): string {
  const parts: string[] = [];
  for (const msg of session.messages) {
    parts.push(...formatConversationMessage(msg));
  }
  return parts.join("\n\n");
}

// ============================================================================
// Utility Exports
// ============================================================================

export { globalCircuitBreaker };
