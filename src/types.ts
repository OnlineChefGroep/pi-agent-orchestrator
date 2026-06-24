/**
 * types.ts — Type definitions for the subagent system.
 */

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { CompactResult } from "./compaction.js";
import type { LifetimeUsage } from "./usage.js";

export type { ThinkingLevel };

/** Agent type: any string name (built-in defaults or user-defined). */
export type SubagentType = string;

/** Lifecycle status of an `AgentRecord`. Drives dashboard grouping, health counts, and cleanup gating. */
export type AgentStatus =
  | "queued"
  | "running"
  | "completed"
  | "steered"
  | "aborted"
  | "stopped"
  | "error";

/** Names of the four embedded default agents. */
export const DEFAULT_AGENT_NAMES = [
    "general-purpose",
    "Explore",
    "Plan",
    "Analysis",
] as const;

/** Memory scope for persistent agent memory. */
export type MemoryScope = "user" | "project" | "local";

/** Isolation mode for agent execution. */
export type IsolationMode = "worktree";

/**
 * Prompt compression level for system prompts.
 * Controls verbosity: `minimal` (full verbose, max quality),
 * `balanced` (concise, default), `aggressive` (ultra-short, max token savings).
 */
export type PromptCompressionLevel = "minimal" | "balanced" | "aggressive";

/** Unified agent configuration — used for both default and user-defined agents. */
export interface AgentConfig {
    name: string;
    displayName?: string;
    description: string;
    builtinToolNames?: readonly string[];
    /** Tool denylist — these tools are removed even if `builtinToolNames` or extensions include them. */
    disallowedTools?: readonly string[];
    /** true = inherit all, string[] = only listed, false = none */
    extensions: true | readonly string[] | false;
    /** true = inherit all, string[] = only listed, false = none */
    skills: true | readonly string[] | false;
    model?: string;
    thinking?: ThinkingLevel;
    maxTurns?: number;
    systemPrompt: string;
    promptMode: "replace" | "append";
    /** Default for spawn: fork parent conversation. undefined = caller decides. */
    inheritContext?: boolean;
    /** Default for spawn: run in background. undefined = caller decides. */
    runInBackground?: boolean;
    /** Default for spawn: no extension tools. undefined = caller decides. */
    isolated?: boolean;
    /** Persistent memory scope — agents with memory get a persistent directory and MEMORY.md */
    memory?: MemoryScope;
    /** Isolation mode — "worktree" runs the agent in a temporary git worktree */
    isolation?: IsolationMode;
    /** Adversarial validators to run after this agent completes */
    validators?: readonly {
        agentId: string;
        criteria: readonly string[];
    }[];
    /** true = this is an embedded default agent (informational) */
    isDefault?: boolean;
    /** false = agent is hidden from the registry */
    enabled?: boolean;
    /** Template version (from frontmatter `version` field). */
    version?: string;
    /** Whether this agent was installed from the template registry. */
    template?: boolean;
    /** Where this agent was loaded from */
    source?: "default" | "project" | "global";
    /** true = produce a structured JSON handoff at end of response for chain-of-agents */
    handoff?: boolean;
    /** Maximum age in ms of a previously-built context before it is considered stale. 0 = always rebuild. */
    contextStalenessMs?: number;
    /** Per-agent override for MAX_MEMORY_LINES. Falls back to global default (200). */
    maxMemoryLines?: number;
    /** Number of conversation turns to keep fully intact during pruning. Default: 5. */
    compactionKeepTurns?: number;
    /** Partitioned state: mapping partition name → allowed tool names for that partition. */
    partitionMembership?: Record<string, readonly string[]>;
    /** Enable @onlinechef/context-mode ctx_* tools for sandboxed code execution and search. */
    useContextMode?: boolean;
    /** Per-agent prompt compression override. Falls back to global setting. */
    promptCompressionLevel?: PromptCompressionLevel;
}

export type JoinMode = "async" | "group" | "smart" | "swarm";

export interface AgentRecord {
    id: string;
    parentId?: string;
    type: SubagentType;
    description: string;
    status: AgentStatus;
    result?: string;
    error?: string;
    toolUses: number;
    /** Timestamp when the agent was spawned (record created). Never reset. */
    spawnedAt: number;
    /** Timestamp when the agent actually started executing (set in startAgent). */
    startedAt?: number;
    completedAt?: number;
    session?: AgentSession;
    abortController?: AbortController;
    promise?: Promise<string>;
    groupId?: string;
    swarmId?: string;
    joinMode?: JoinMode;
    /** Set when result was already consumed via get_subagent_result — suppresses completion notification. */
    resultConsumed?: boolean;
    /** Steering messages queued before the session was ready. */
    pendingSteers?: string[];
    /** Worktree info if the agent is running in an isolated worktree. */
    worktree?: { path: string; branch: string };
    /** Worktree cleanup result after agent completion. */
    worktreeResult?: { hasChanges: boolean; branch?: string };
    /** The tool_use_id from the original Agent tool call. */
    toolCallId?: string;
    /** Path to the streaming output transcript file. */
    outputFile?: string;
    /** Cleanup function for the output file stream subscription. */
    outputCleanup?: () => void;
    /**
     * Lifetime usage breakdown, accumulated via `message_end` events. Survives compaction.
     * Total = input + output + cacheWrite. Initialized to zeros at spawn.
     */
    lifetimeUsage: LifetimeUsage;
    /** Number of times this agent's session has compacted. Initialized to 0 at spawn. */
    compactionCount: number;
    /** Metrics from the most recent compaction (undefined if never compacted). */
    lastCompaction?: CompactResult;
    /** Resolved spawn params, captured for UI display. Fixed at spawn time. */
    invocation?: AgentInvocation;
    /** Validation results if validators were configured */
    validationResults?: ValidationResult[];
    /** Whether all validators passed */
    validated?: boolean;
    /** Current nesting depth (0 = root, 1 = first child, etc.) */
    currentLevel: number;
    /** Number of subagents spawned from this agent so far. */
    totalSpawned: number;
    /** Timestamp when parent context was last built for this agent. */
    contextBuiltAt?: number;
    /** Inputs needed to build the deferred context. Stored at spawn time. */
    contextInputs?: { inheritContext: boolean };
    /** Active partition for this agent (first partition from invocation.partitions). */
    activePartition?: string;
    /**
     * Short (8-hex-char) correlation id shared across the agent's spans +
     * log lines. Generated at spawn time and preserved across
     * `resumeAgent`, so re-running an agent keeps the same id and traces
     * line up in the OTel exporter and the `/agents health` report.
     */
    correlationId?: string;
}

/** Result of a single validator pass. */
export interface ValidationResult {
    agentId: string;
    passed: boolean;
    criteria: ValidationCriterion[];
    summary: string;
}

/** Single criterion result from a validator. */
export interface ValidationCriterion {
    criterion: string;
    passed: boolean;
    feedback: string;
}

export interface AgentInvocation {
    modelName?: string;
    sessionMaxSpawns?: number;
    sessionMaxTurns?: number;
    thinking?: ThinkingLevel;
    maxTurns?: number;
    isolated?: boolean;
    inheritContext?: boolean;
    runInBackground?: boolean;
    isolation?: IsolationMode;
    /** Max total subagents that can be spawned recursively. undefined = unlimited. */
    taskBudget?: number;
    /** Max nesting depth for recursive subagents. undefined = unlimited. */
    levelLimit?: number;
    /** Partitions this agent belongs to — restricts tools to partition memberships. */
    partitions?: readonly string[];
}

/** Details attached to custom notification messages for visual rendering. */
export interface NotificationDetails {
    id: string;
    description: string;
    status: string;
    toolUses: number;
    turnCount: number;
    maxTurns?: number;
    totalTokens: number;
    durationMs: number;
    outputFile?: string;
    error?: string;
    resultPreview: string;
    others?: NotificationDetails[];
    validated?: boolean;
}

export interface EnvInfo {
    isGitRepo: boolean;
    branch: string;
    platform: string;
}

/**
 * Local mirror of the upstream `WorkspaceContext` type proposed in CHEF-100.
 *
 * Lives here (not in src/env-context.ts) because it is a value shape, not
 * a function, and the codebase already groups workspace metadata types
 * together (EnvInfo). When `@earendil-works/pi-coding-agent` ships the
 * type, replace this definition with:
 *
 *   import type { WorkspaceContext } from "@earendil-works/pi-coding-agent";
 *
 * Then delete this block. The discriminated `git` shape mirrors the
 * upstream RFC; `branch: ""` may occur for both detached HEAD and unborn
 * branch (see docs/chef-rfcs/CHEF-100-workspace-context.md).
 */
export interface WorkspaceContext {
    readonly cwd: string;
    readonly git:
        | { readonly isRepo: true; readonly branch: string }
        | { readonly isRepo: false };
    readonly platform: NodeJS.Platform;
}

/**
 * A subagent spawn registered to fire on a schedule.
 */
export interface ScheduledSubagent {
    id: string;
    name: string;
    description: string;
    schedule: string;
    scheduleType: "cron" | "once" | "interval";
    intervalMs?: number;
    subagent_type: SubagentType;
    prompt: string;
    model?: string;
    thinking?: ThinkingLevel;
    max_turns?: number;
    isolated?: boolean;
    isolation?: IsolationMode;
    enabled: boolean;
    createdAt: string;
    lastRun?: string;
    lastStatus?: "success" | "error" | "running";
    nextRun?: string;
    runCount: number;
}

export interface ScheduleStoreData {
    version: 1;
    jobs: ScheduledSubagent[];
}
