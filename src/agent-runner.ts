/**
 * agent-runner.ts — Core execution engine: creates sessions, runs agents, collects results.
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
import { type EffectiveConfig, getAgentConfig, getConfig, getMemoryToolNames, getReadOnlyMemoryToolNames, getToolNamesForType } from "./agent-types.js";
import { buildParentContext, extractText } from "./context.js";
import { buildCtxInjection } from "./context-mode-bridge.js";
import { DEFAULT_AGENTS } from "./default-agents.js";
import { detectEnv } from "./env.js";
import { type AgentHandoff, parseHandoff, renderHandoffForParent } from "./handoff.js";
import { type HookRegistry } from "./hooks.js";
import { logger } from "./logger.js";
import { buildMemoryBlock, buildReadOnlyMemoryBlock } from "./memory.js";
import { buildAgentPrompt, type PromptExtras } from "./prompts.js";
import { preloadSkills } from "./skill-loader.js";
import { emitTelemetry } from "./telemetry.js";
import type { SubagentType, ThinkingLevel, ValidationResult } from "./types.js";
import { buildValidatorPrompt, getAgentDescription, hasValidators, parseValidationResult } from "./validators.js";

/** Names of tools registered by this extension that subagents must NOT inherit. */
const EXCLUDED_TOOL_NAMES: ReadonlySet<string> = new Set([
  "Agent",
  "get_subagent_result",
  "steer_subagent",
]);

/** Default max turns. undefined = unlimited (no turn limit). */
let defaultMaxTurns: number | undefined;

/** Normalize max turns. undefined or 0 = unlimited, otherwise minimum 1. */
export function normalizeMaxTurns(n: number | undefined): number | undefined {
  if (n == null || n === 0) return undefined;
  return Math.max(1, n);
}

/** Get the default max turns value. undefined = unlimited. */
export function getDefaultMaxTurns(): number | undefined { return defaultMaxTurns; }
/** Set the default max turns value. undefined or 0 = unlimited, otherwise minimum 1. */
export function setDefaultMaxTurns(n: number | undefined): void { defaultMaxTurns = normalizeMaxTurns(n); }

/** Additional turns allowed after the soft limit steer message. */
let graceTurns = 5;

/** Get the grace turns value. */
export function getGraceTurns(): number { return graceTurns; }
/** Set the grace turns value (minimum 1). */
export function setGraceTurns(n: number): void { graceTurns = Math.max(1, n); }

/** Cached available model keys per registry to avoid rebuilding Set on every spawn. */
let _cachedRegistry: unknown = null;
let _cachedKeys: Set<string> | null = null;

/**
 * Retrieve (and cache) the set of available model keys from a model registry, formatted as `provider/id`.
 *
 * @param registry - An object that may expose a `getAvailable()` method returning an array of models.
 * @returns A `Set` of model keys in the form `provider/id` when `getAvailable()` returns a list, or `undefined` if the registry does not provide availability information.
 */
function getAvailableKeys(
  registry: { getAvailable?(): Model<Api>[] },
): Set<string> | undefined {
  if (registry === _cachedRegistry && _cachedKeys) return _cachedKeys;
  const available = registry.getAvailable?.();
  if (!available) return undefined;
  _cachedKeys = new Set(available.map((m) => `${m.provider}/${m.id}`));
  _cachedRegistry = registry;
  return _cachedKeys;
}

/**
 * Resolve the effective model for an agent, preferring an explicit `provider/modelId` override when provided.
 *
 * @param parentModel - Fallback model from the parent context used when `configModel` is absent or invalid
 * @param registry - Registry able to locate models and optionally report available models
 * @param configModel - Optional override in the form `"<provider>/<modelId>"`; only used if it matches an available model
 * @returns The `Model<Api>` discovered from `configModel` when valid and available, otherwise `parentModel`
 */
function resolveDefaultModel(
  parentModel: Model<Api> | undefined,
  registry: { find(provider: string, modelId: string): Model<Api> | undefined; getAvailable?(): Model<Api>[] },
  configModel?: string,
): Model<Api> | undefined {
  if (configModel) {
    const slashIdx = configModel.indexOf("/");
    if (slashIdx !== -1) {
      const provider = configModel.slice(0, slashIdx);
      const modelId = configModel.slice(slashIdx + 1);

      const availableKeys = getAvailableKeys(registry);
      const isAvailable = (p: string, id: string) =>
        !availableKeys || availableKeys.has(`${p}/${id}`);

      const found = registry.find(provider, modelId);
      if (found && isAvailable(provider, modelId)) return found;
    }
  }

  return parentModel;
}

/** Info about a tool event in the subagent. */
export interface ToolActivity {
  type: "start" | "end";
  toolName: string;
}

export interface RunOptions {
  /** ExtensionAPI instance — used for pi.exec() instead of execSync. */
  pi: ExtensionAPI;
  /** Manager-assigned id; suffixes session name to disambiguate parallel spawns (e.g. `Explore#a1b2c3d4`). */
  agentId?: string;
  model?: Model<Api>;
  maxTurns?: number;
  signal?: AbortSignal;
  isolated?: boolean;
  inheritContext?: boolean;
  thinkingLevel?: ThinkingLevel;
  /** Override working directory (e.g. for worktree isolation). */
  cwd?: string;
  /** Called on tool start/end with activity info. */
  onToolActivity?: (activity: ToolActivity) => void;
  /** Called on streaming text deltas from the assistant response. */
  onTextDelta?: (delta: string, fullText: string) => void;
  onSessionCreated?: (session: AgentSession) => void;
  /** Called at the end of each agentic turn with the cumulative count. */
  onTurnEnd?: (turnCount: number) => void;
  /**
   * Called once per assistant message_end with that message's usage delta.
   * Lets callers maintain a lifetime accumulator that survives compaction
   * (which replaces session.state.messages and resets stats-derived sums).
   */
  onAssistantUsage?: (usage: { input: number; output: number; cacheWrite: number }) => void;
  /**
   * Called when the session successfully compacts. `tokensBefore` is upstream's
   * pre-compaction context size estimate. Aborted compactions don't fire.
   */
  onCompaction?: (info: { reason: "manual" | "threshold" | "overflow"; tokensBefore: number }) => void;
  /**
   * Set to true to prevent validator recursion.
   * Validators spawned during validation will have this flag set.
   */
  skipValidators?: boolean;
  /**
   * Called when validation completes. Receives all validation results.
   */
  onValidationComplete?: (results: ValidationResult[]) => void;
  /** Current nesting depth of this agent (0 = root). Used for depth-limit enforcement. */
  currentLevel?: number;
  /** Max nesting depth limit for this agent. From invocation.levelLimit. undefined = unlimited. */
  levelLimit?: number;
  /** Parent's effective config for directional permission inheritance. */
  parentConfig?: EffectiveConfig;
  /** Partitions this agent belongs to — restricts tools to partition memberships. */
  partitions?: string[];
  /** Hook registry for lifecycle event dispatch. */
  hooks?: HookRegistry;
  /** Timestamp when the agent record was created (for deferred-context latency logging). */
  spawnedAt?: number;
  /** Called after deferred context is built with the build timestamp. */
  onContextBuilt?: (timestamp: number) => void;
}

export interface RunResult {
  responseText: string;
  session: AgentSession;
  /** True if the agent was hard-aborted (max_turns + grace exceeded). */
  aborted: boolean;
  /** True if the agent was steered to wrap up (hit soft turn limit) but finished in time. */
  steered: boolean;
  /** Validation results if validators were configured and run. */
  validationResults?: ValidationResult[];
  /** Whether all validators passed (undefined if no validators configured). */
  validated?: boolean;
  /** Structured handoff parsed from agent output (only when handoff is enabled). */
  handoff?: AgentHandoff;
}

/**
 * Subscribe to a session and collect the last assistant message text.
 * Returns an object with a `getText()` getter and an `unsubscribe` function.
 */
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

/** Get the last assistant text from the completed session history. */
function getLastAssistantText(session: AgentSession): string {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const msg = session.messages[i];
    if (msg.role !== "assistant") continue;
    const text = extractText(msg.content).trim();
    if (text) return text;
  }
  return "";
}

/**
 * Wire an AbortSignal to abort a session.
 * Returns a cleanup function to remove the listener.
 */
function forwardAbortSignal(session: AgentSession, signal?: AbortSignal): () => void {
  if (!signal) return () => {};
  const onAbort = () => session.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

/**
 * Build the effective prompt, deferring parent-context serialization
 * to the last possible moment before session creation.
 *
 * This is the core of the deferred context engine: by building context
 * just before session.create() rather than at agent-spawn time, queued
 * agents capture the freshest parent state, saving 15-48% tokens that
 * would otherwise be wasted on stale accumulated context while waiting.
 */
function buildEffectivePrompt(
  ctx: ExtensionContext,
  prompt: string,
  options: RunOptions,
): string {
  if (!options.inheritContext) return prompt;

  const parentContext = buildParentContext(ctx);

  const builtAt = Date.now();
  options.onContextBuilt?.(builtAt);

  const spawnedAgo = options.spawnedAt ? builtAt - options.spawnedAt : 0;
  logger.debug("Context built after spawn", { agentId: options.agentId ?? "unknown", spawnedAgo });

  if (!parentContext) return prompt;
  return parentContext + prompt;
}

/**
 * Execute a subagent with the given type and prompt.
 *
 * This is the core agent execution function. It handles:
 * - Model resolution (explicit > config > parent fallback)
 * - Tool permission inheritance from parent agents
 * - Context building (parent context, memory, skills)
 * - Partition-based tool filtering
 * - Depth limiting (prevents runaway agent trees)
 * - Worktree isolation (optional git worktree per agent)
 * - Session creation via ExtensionAPI
 * - Tool call loop with compaction and hooks
 * - Result formatting and notification
 *
 * @param ctx - Extension context (provides API access, session manager, cwd)
 * @param type - Agent type name (e.g. "Explore", "general-purpose", custom name)
 * @param prompt - The user task/prompt for this agent
 * @param options - Execution options (model override, max turns, parent config, etc.)
 * @returns RunResult with conversation, usage stats, and formatted output
 * @throws When depth limit is exceeded or model resolution fails
 */
export async function runAgent(
  ctx: ExtensionContext,
  type: SubagentType,
  prompt: string,
  options: RunOptions,
): Promise<RunResult> {
  const startTime = Date.now();
  const config = getConfig(type, options.parentConfig, options.partitions);
  const agentConfig = getAgentConfig(type);

  // Early exit: check level limit before any work is done
  const currentLevel = options.currentLevel ?? 0;
  const depthLimit = options.levelLimit ?? 5;
  if (currentLevel >= depthLimit) {
    throw new Error(
      `Max agent depth reached (${currentLevel}/${depthLimit})`,
    );
  }

  // Emit telemetry: agent spawned
  emitTelemetry("agent:spawned", {
    type,
    parentType: options.parentConfig ? type : undefined, // If has parent config, there's a parent
    depth: currentLevel,
    budget: options.maxTurns,
  });

  // Resolve working directory: worktree override > parent cwd
  const effectiveCwd = options.cwd ?? ctx.cwd;

  const env = await detectEnv(options.pi, effectiveCwd);

  // Get parent system prompt for append-mode agents
  const parentSystemPrompt = ctx.getSystemPrompt();

  // Build prompt extras (memory, skill preloading)
  const extras: PromptExtras = {};

  // Resolve extensions/skills: isolated overrides to false
  const extensions = options.isolated ? false : config.extensions;
  const skills = options.isolated ? false : config.skills;

  // Skill preloading: when skills is string[], preload their content into prompt
  if (Array.isArray(skills)) {
    const loaded = preloadSkills(skills, effectiveCwd);
    if (loaded.length > 0) {
      extras.skillBlocks = loaded;
    }
  }

  let toolNames = getToolNamesForType(type);

  // Persistent memory: detect write capability and branch accordingly.
  // Account for disallowedTools — a tool in the base set but on the denylist is not truly available.
  if (agentConfig?.memory) {
    const existingNames = new Set(toolNames);
    const denied = agentConfig.disallowedTools ? new Set(agentConfig.disallowedTools) : undefined;
    const effectivelyHas = (name: string) => existingNames.has(name) && !denied?.has(name);
    const hasWriteTools = effectivelyHas("write") || effectivelyHas("edit");

    if (hasWriteTools) {
      // Read-write memory: add any missing memory tool names (read/write/edit)
      const extraNames = getMemoryToolNames(existingNames);
      if (extraNames.length > 0) toolNames = [...toolNames, ...extraNames];
      extras.memoryBlock = buildMemoryBlock(agentConfig.name, agentConfig.memory, effectiveCwd, agentConfig.maxMemoryLines);
    } else {
      // Read-only memory: only add read tool name, use read-only prompt
      const extraNames = getReadOnlyMemoryToolNames(existingNames);
      if (extraNames.length > 0) toolNames = [...toolNames, ...extraNames];
      extras.memoryBlock = buildReadOnlyMemoryBlock(agentConfig.name, agentConfig.memory, effectiveCwd, agentConfig.maxMemoryLines);
    }
  }

  // Apply parent permission inheritance: filter tools to only those the parent can also use.
  // The config.builtinToolNames already reflects the intersection with parent's effective tools.
  const allowedTools = new Set(config.builtinToolNames);
  toolNames = toolNames.filter((t) => allowedTools.has(t));

  // Build system prompt from agent config
  let systemPrompt: string;
  if (agentConfig) {
    systemPrompt = buildAgentPrompt(agentConfig, effectiveCwd, env, parentSystemPrompt, extras);
  } else {
    // Unknown type fallback: spread the canonical general-purpose config (defensive —
    // unreachable in practice since index.ts resolves unknown types before calling runAgent).
    const fallback = DEFAULT_AGENTS.get("general-purpose");
    if (!fallback) throw new Error(`No fallback config available for unknown type "${type}"`);
    systemPrompt = buildAgentPrompt({ ...fallback, name: type }, effectiveCwd, env, parentSystemPrompt, extras);
  }

  // Inject context-mode sandbox tools when @onlinechef/context-mode is installed.
  // Gracefully skips when unavailable — context-mode is an optional peerDependency.
  const ctxInjection = buildCtxInjection();
  if (ctxInjection) {
    systemPrompt = `${systemPrompt}\n\n${ctxInjection.systemPromptAddition}`;
    toolNames = [...toolNames, ...ctxInjection.toolAllowList];
    logger.debug("context-mode tools injected", { agentId: options.agentId ?? "unknown" });
  }

  // When skills is string[], we've already preloaded them into the prompt.
  // Still pass noSkills: true since we don't need the skill loader to load them again.
  const noSkills = skills === false || Array.isArray(skills);

  const agentDir = getAgentDir();

  // Load extensions/skills: true or string[] → load; false → don't.
  // Suppress AGENTS.md/CLAUDE.md and APPEND_SYSTEM.md — upstream's
  // buildSystemPrompt() re-appends both AFTER systemPromptOverride, which
  // would defeat prompt_mode: replace and isolated: true. Parent context, if
  // wanted, reaches the subagent via prompt_mode: append (parentSystemPrompt
  // is embedded in systemPromptOverride) or inherit_context (conversation).
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

  // Resolve model: explicit option > config.model > parent model
  const model = options.model ?? resolveDefaultModel(
    ctx.model, ctx.modelRegistry, agentConfig?.model,
  );

  // Resolve thinking level: explicit option > agent config > undefined (inherit)
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

  // Dispatch blocking hook before session creation
  if (options.hooks) {
    const hookResult = await options.hooks.dispatch(
      "subagent:start",
      options.agentId ?? "unknown",
    );
    if (hookResult === "block") {
      throw new Error("Blocked by hook");
    }
  }

  // Deferred context: build at session.create boundary to capture
  // freshest state, saving 15-48% tokens on queued agents.
  // Context is serialized AFTER all setup (extensions, skills, tools,
  // memory) but BEFORE the session is created, so the gap between
  // serialization and first prompt is minimized.
  const effectivePrompt = buildEffectivePrompt(ctx, prompt, options);

  const { session } = await createAgentSession(sessionOpts);

  const baseSessionName = agentConfig?.name ?? type;
  session.setSessionName(
    options.agentId ? `${baseSessionName}#${options.agentId.slice(0, 8)}` : baseSessionName,
  );

  // Build disallowed tools set from agent config
  const disallowedSet = agentConfig?.disallowedTools
    ? new Set(agentConfig.disallowedTools)
    : undefined;

  // Filter active tools: remove our own tools to prevent nesting,
  // apply extension allowlist if specified, and apply disallowedTools denylist
  if (extensions !== false) {
    const builtinToolNameSet = new Set(toolNames);
    const activeTools = session.getActiveToolNames().filter((t) => {
      if (EXCLUDED_TOOL_NAMES.has(t)) return false;
      if (disallowedSet?.has(t)) return false;
      if (builtinToolNameSet.has(t)) return true;
      if (Array.isArray(extensions)) {
        return extensions.some(ext => t.startsWith(ext) || t.includes(ext));
      }
      return true;
    });
    session.setActiveToolsByName(activeTools);
  } else if (disallowedSet) {
    // Even with extensions disabled, apply denylist to built-in tools
    const activeTools = session.getActiveToolNames().filter(t => !disallowedSet.has(t));
    session.setActiveToolsByName(activeTools);
  }

  // Bind extensions so that session_start fires and extensions can initialize
  // (e.g. loading credentials, setting up state). Placed after tool filtering
  // so extension-provided skills/prompts from extendResourcesFromExtensions()
  // respect the active tool set. All ExtensionBindings fields are optional.
  await session.bindExtensions({
    onError: (err) => {
      options.onToolActivity?.({
        type: "end",
        toolName: `extension-error:${err.extensionPath}`,
      });
    },
  });

  options.onSessionCreated?.(session);

  // Track turns for graceful max_turns enforcement
  let turnCount = 0;
  const maxTurns = normalizeMaxTurns(options.maxTurns ?? agentConfig?.maxTurns ?? defaultMaxTurns);
  let softLimitReached = false;
  let aborted = false;

  let currentMessageText = "";
  const unsubTurns = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "turn_end") {
      options.hooks
        ?.dispatch("turn:end", options.agentId ?? "unknown")
        .catch((err) => { logger.debug(`Hook dispatch error: ${err instanceof Error ? err.message : String(err)}`); });
      turnCount++;
      options.onTurnEnd?.(turnCount);
      if (maxTurns != null) {
        if (!softLimitReached && turnCount >= maxTurns) {
          softLimitReached = true;
          session.steer("You have reached your turn limit. Wrap up immediately — provide your final answer now.");
        } else if (softLimitReached && turnCount >= maxTurns + graceTurns) {
          aborted = true;
          session.abort();
        }
      }
    }
    if (event.type === "turn_start") {
      options.hooks
        ?.dispatch("turn:start", options.agentId ?? "unknown")
        .catch((err) => { logger.debug(`Hook dispatch error: ${err instanceof Error ? err.message : String(err)}`); });
    }
    if (event.type === "message_start") {
      currentMessageText = "";
    }
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      currentMessageText += event.assistantMessageEvent.delta;
      options.onTextDelta?.(event.assistantMessageEvent.delta, currentMessageText);
    }
    if (event.type === "tool_execution_start") {
      options.onToolActivity?.({ type: "start", toolName: event.toolName });
    }
    if (event.type === "tool_execution_end") {
      options.onToolActivity?.({ type: "end", toolName: event.toolName });
    }
    if (event.type === "message_end" && event.message.role === "assistant") {
      const msg = event.message as { usage?: { input?: number; output?: number; cacheWrite?: number } };
      const u = msg.usage;
      if (u) options.onAssistantUsage?.({
        input: u.input ?? 0,
        output: u.output ?? 0,
        cacheWrite: u.cacheWrite ?? 0,
      });
    }
    if (event.type === "compaction_end" && !event.aborted && event.result) {
      options.hooks
        ?.dispatch("compaction:end", options.agentId ?? "unknown", {
          reason: event.reason,
          tokensBefore: event.result.tokensBefore,
        })
        .catch((err) => { logger.debug(`Hook dispatch error: ${err instanceof Error ? err.message : String(err)}`); });
      options.onCompaction?.({ reason: event.reason, tokensBefore: event.result.tokensBefore });
    }
    if (event.type === "compaction_start") {
      options.hooks
        ?.dispatch("compaction:start", options.agentId ?? "unknown", {
          reason: event.reason,
        })
        .catch((err) => { logger.debug(`Hook dispatch error: ${err instanceof Error ? err.message : String(err)}`); });
      // --- Compaction hook point ---
      // Callers can use pruneOldToolOutputs(session.messages, keepTurns) here
      // to pre-prune tool outputs before the upstream LLM summary compaction.
      // The onCompaction callback reports the pre-compaction context size estimate.
    }
  });

  const collector = collectResponseText(session);
  const cleanupAbort = forwardAbortSignal(session, options.signal);

  try {
    // Deferred context: effectivePrompt was built before session creation
    await session.prompt(effectivePrompt);
    options.hooks
      ?.dispatch("subagent:end", options.agentId ?? "unknown")
      .catch((err) => { logger.debug(`Hook dispatch error: ${err instanceof Error ? err.message : String(err)}`); });
  } catch (err) {
    options.hooks
      ?.dispatch("subagent:error", options.agentId ?? "unknown", {
        error: err instanceof Error ? err.message : String(err),
      })
      .catch((err2) => { logger.debug(`Hook dispatch error: ${err2 instanceof Error ? err2.message : String(err2)}`); });
    throw err;
  } finally {
    unsubTurns();
    collector.unsubscribe();
    cleanupAbort();
  }

  let responseText = collector.getText().trim() || getLastAssistantText(session);

  const duration = Date.now() - startTime;

  // ---- Structured handoff parsing (before validators) ----
  let handoff: AgentHandoff | undefined;
  if (agentConfig?.handoff) {
    const parsed = parseHandoff(responseText);
    if (parsed) {
      handoff = parsed;
      responseText = renderHandoffForParent(parsed);
    }
    // Graceful degrade: if parse fails (null), keep original responseText
  }

  // ---- Adversarial validation ----
  let validationResults: ValidationResult[] | undefined;
  let validated: boolean | undefined;

  if (!options.skipValidators && hasValidators(agentConfig)) {
    const validators = agentConfig!.validators!;
    const agentDescription = getAgentDescription(agentConfig);
    const VALIDATION_MAX_RETRIES = 2;
    let retries = 0;

    while (retries <= VALIDATION_MAX_RETRIES) {
      const validatorPromises = validators.map((v) =>
        runAgent(ctx, v.agentId, buildValidatorPrompt(responseText, v.criteria, agentDescription), {
          pi: options.pi,
          model: options.model,
          isolated: true,
          skipValidators: true,
          levelLimit: 0,
          signal: options.signal,
        }).then((result) => parseValidationResult(result.responseText, v.agentId))
          .catch((err) => ({
            agentId: v.agentId,
            passed: false,
            criteria: [],
            summary: `Validator error: ${err instanceof Error ? err.message : String(err)}`,
          })),
      );

      validationResults = await Promise.all(validatorPromises);
      validated = validationResults.every((r) => r.passed);
      
      if (validated || retries >= VALIDATION_MAX_RETRIES) {
        options.onValidationComplete?.(validationResults);
        break;
      }

      // Self-healing: feed the failures back to the agent
      const failedFeedback = validationResults
        .filter((r) => !r.passed)
        .map((r) => {
          const failedCriteria = r.criteria.filter((c) => !c.passed);
          const details = failedCriteria.length > 0
            ? `\n${failedCriteria.map((c) => `  - ${c.criterion}: ${c.feedback}`).join("\n")}`
            : "";
          return `[${r.agentId}] ${r.summary}${details}`;
        })
        .join("\n\n");
        
      const fixPrompt = `Validation failed. Please fix the following issues and provide an updated final response:\n\n${failedFeedback}`;
      
      try {
        responseText = await resumeAgent(session, fixPrompt, {
          onToolActivity: options.onToolActivity,
          onAssistantUsage: options.onAssistantUsage,
          onCompaction: options.onCompaction,
          signal: options.signal,
        });
      } catch {
        // If resume fails (e.g. aborted), break out
        options.onValidationComplete?.(validationResults);
        break;
      }

      retries++;
    }
  }

  // Emit telemetry: agent completed
  emitTelemetry("agent:completed", {
    type,
    duration,
    validatorResults: validationResults?.map(r => ({ passed: r.passed, summary: r.summary })),
  });

  return { responseText, session, aborted, steered: softLimitReached, validationResults, validated, handoff };
}

/**
 * Send a new prompt to an existing session (resume).
 */
export async function resumeAgent(
  session: AgentSession,
  prompt: string,
  options: {
    onToolActivity?: (activity: ToolActivity) => void;
    onAssistantUsage?: (usage: { input: number; output: number; cacheWrite: number }) => void;
    onCompaction?: (info: { reason: "manual" | "threshold" | "overflow"; tokensBefore: number }) => void;
    signal?: AbortSignal;
    /** If true, prepend parent context (deferred — built just before prompt). */
    inheritContext?: boolean;
    /** Required when inheritContext is true. */
    ctx?: ExtensionContext;
  } = {},
): Promise<string> {
  const collector = collectResponseText(session);
  const cleanupAbort = forwardAbortSignal(session, options.signal);

  const unsubEvents = (options.onToolActivity || options.onAssistantUsage || options.onCompaction)
    ? session.subscribe((event: AgentSessionEvent) => {
        if (event.type === "tool_execution_start") options.onToolActivity?.({ type: "start", toolName: event.toolName });
        if (event.type === "tool_execution_end") options.onToolActivity?.({ type: "end", toolName: event.toolName });
        if (event.type === "message_end" && event.message.role === "assistant") {
          const msg = event.message as { usage?: { input?: number; output?: number; cacheWrite?: number } };
          const u = msg.usage;
          if (u) options.onAssistantUsage?.({
            input: u.input ?? 0,
            output: u.output ?? 0,
            cacheWrite: u.cacheWrite ?? 0,
          });
        }
        if (event.type === "compaction_end" && !event.aborted && event.result) {
          options.onCompaction?.({ reason: event.reason, tokensBefore: event.result.tokensBefore });
        }
      })
    : () => {};

  // Deferred context: build parent context just before prompt on resume.
  // Mirrors runAgent's deferred strategy — context is serialized at the last
  // moment so it captures the freshest conversation state.
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

/**
 * Send a steering message to a running subagent.
 * The message will interrupt the agent after its current tool execution.
 */
export async function steerAgent(
  session: AgentSession,
  message: string,
): Promise<void> {
  await session.steer(message);
}

/**
 * Serialize a session's messages into a human-readable conversation transcript.
 *
 * Produces ordered blocks for user messages (`[User]: ...`), assistant messages (`[Assistant]: ...`),
 * assistant-initiated tool calls (`[Tool Calls]:` with indented `Tool: <name>` lines), and tool results
 * (`[Tool Result (<toolName>)]: ...`). Assistant text parts are joined with newlines; tool result text
 * is truncated to 200 characters with `...` when longer. Empty user messages are omitted.
 *
 * @returns The formatted conversation as a single string with message blocks separated by blank lines.
 */
export function getAgentConversation(session: AgentSession): string {
  const parts: string[] = [];

  for (const msg of session.messages) {
    if (msg.role === "user") {
      const text = typeof msg.content === "string"
        ? msg.content
        : extractText(msg.content);
      if (text.trim()) parts.push(`[User]: ${text.trim()}`);
    } else if (msg.role === "assistant") {
      const textParts: string[] = [];
      const toolCalls: string[] = [];
      for (const c of msg.content) {
        if (c.type === "text" && c.text) textParts.push(c.text);
        else if (c.type === "toolCall") toolCalls.push(`  Tool: ${c.name ?? "unknown"}`);
      }
      if (textParts.length > 0) parts.push(`[Assistant]: ${textParts.join("\n")}`);
      if (toolCalls.length > 0) parts.push(`[Tool Calls]:\n${toolCalls.join("\n")}`);
    } else if (msg.role === "toolResult") {
      const text = extractText(msg.content);
      const truncated = text.length > 200 ? `${text.slice(0, 200)}...` : text;
      parts.push(`[Tool Result (${msg.toolName})]: ${truncated}`);
    }
  }

  return parts.join("\n\n");
}
