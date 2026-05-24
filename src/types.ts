/**
 * types.ts — Type definitions for the subagent system.
 */

import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { CompactResult } from "./compaction.js";
import type { LifetimeUsage } from "./usage.js";

export type { ThinkingLevel };

/** Agent type: any string name (built-in defaults or user-defined). */
export type SubagentType = string;

/** Names of the three embedded default agents. */
export const DEFAULT_AGENT_NAMES = ["general-purpose", "Explore", "Plan"] as const;

/** Memory scope for persistent agent memory. */
export type MemoryScope = "user" | "project" | "local";

/** Isolation mode for agent execution. */
export type IsolationMode = "worktree";

/** Unified agent configuration — used for both default and user-defined agents. */
export interface AgentConfig {
  name: string;
  displayName?: string;
  description: string;
  builtinToolNames?: string[];
  /** Tool denylist — these tools are removed even if `builtinToolNames` or extensions include them. */
  disallowedTools?: string[];
  /** true = inherit all, string[] = only listed, false = none */
  extensions: true | string[] | false;
  /** true = inherit all, string[] = only listed, false = none */
  skills: true | string[] | false;
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
  validators?: {
    agentId: string;
    criteria: string[];
  }[];
  /** true = this is an embedded default agent (informational) */
  isDefault?: boolean;
  /** false = agent is hidden from the registry */
  enabled?: boolean;
  /** Where this agent was loaded from */
  source?: "default" | "project" | "global";
  /** true = produce a structured JSON handoff at end of response for chain-of-agents */
  handoff?: boolean;
  /**
   * Maximum age in ms of a previously-built context before it is considered
   * stale and must be rebuilt. 0 (default) means always rebuild — context is
   * never cached across runs. Only relevant when context caching is active.
   */
  contextStalenessMs?: number;
  /** Per-agent override for MAX_MEMORY_LINES. Falls back to global default (200) when not set. */
  maxMemoryLines?: number;
  /** Number of conversation turns to keep fully intact during pruning. Default: DEFAULT_KEEP_TURNS (5). */
  compactionKeepTurns?: number;
  /** Partitioned state: mapping partition name → allowed tool names for that partition. */
  partitionMembership?: Record<string, string[]>;
  /** Enable @onlinechef/context-mode ctx_* tools for sandboxed code execution and search. */
  useContextMode?: boolean;
}

export type JoinMode = 'async' | 'group' | 'smart' | 'swarm';

export interface AgentRecord {
  id: string;
  type: SubagentType;
  description: string;
  status: "queued" | "running" | "completed" | "steered" | "aborted" | "stopped" | "error";
  result?: string;
  error?: string;
  toolUses: number;
  /** Timestamp when the agent was spawned (record created). Never reset. */
  spawnedAt: number;
  /** Timestamp when the agent actually started executing (set in startAgent). */
  startedAt: number;
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
   * Lifetime usage breakdown, accumulated via `message_end` events. Survives
   * compaction. Total = input + output + cacheWrite (cacheRead deliberately
   * excluded — see issue #38). Initialized to zeros at spawn.
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
  /**
   * Timestamp when parent context was last built for this agent.
   * Set during runAgent at the deferred context build point.
   */
  contextBuiltAt?: number;
  /**
   * Inputs needed to build the deferred context. Stored at spawn time
   * so context can be built at the last moment before session creation.
   */
  contextInputs?: { inheritContext: boolean };
  /** Active partition for this agent (first partition from invocation.partitions). */
  activePartition?: string;
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
  /** Short display name, e.g. "haiku" — only set when different from parent. */
  modelName?: string;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  isolated?: boolean;
  inheritContext?: boolean;
  runInBackground?: boolean;
  isolation?: IsolationMode;
  /** Max total subagents that can be spawned recursively from this invocation. undefined = unlimited. */
  taskBudget?: number;
  /** Max nesting depth for recursive subagents. undefined = unlimited (default: 5). */
  levelLimit?: number;
  /** Partitions this agent belongs to — restricts tools to partition memberships. */
  partitions?: string[];
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
  /** Additional agents in a group notification. */
  others?: NotificationDetails[];
  /** Validation status for display. */
  validated?: boolean;
}

export interface EnvInfo {
  isGitRepo: boolean;
  branch: string;
  platform: string;
}

/**
 * A subagent spawn registered to fire on a schedule.
 *
 * Stored at `<cwd>/.pi/subagent-schedules/<sessionId>.json`. Session-scoped:
 * survives `/resume` but resets on `/new`, mirroring pi-chonky-tasks.
 */
export interface ScheduledSubagent {
  id: string;
  /** Unique within store. Defaults to `description`. */
  name: string;
  description: string;
  /** Raw user input — cron expr | "+10m" | ISO | "5m". */
  schedule: string;
  scheduleType: "cron" | "once" | "interval";
  /** Computed at create time for interval/once. */
  intervalMs?: number;

  // spawn params (subset of Agent tool params; no inherit_context, no resume)
  subagent_type: SubagentType;
  prompt: string;
  model?: string;
  thinking?: ThinkingLevel;
  max_turns?: number;
  isolated?: boolean;
  isolation?: IsolationMode;

  // state
  enabled: boolean;
  /** ISO timestamp. */
  createdAt: string;
  lastRun?: string;
  lastStatus?: "success" | "error" | "running";
  /** Refreshed on every fire and on store load. */
  nextRun?: string;
  runCount: number;
}

export interface ScheduleStoreData {
  /** For future migrations. */
  version: 1;
  jobs: ScheduledSubagent[];
}
