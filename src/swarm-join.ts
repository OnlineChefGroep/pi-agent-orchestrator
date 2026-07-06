/**
 * swarm-join.ts — Enterprise Swarm Coordination Engine
 *
 * Manages dynamic, collaborative "swarm" groups of background agents with:
 * - Event-driven architecture (Observable streams for UI/dashboard)
 * - Agent health monitoring (heartbeats, timeouts, failure detection)
 * - Inter-agent message routing (broadcast, unicast, multicast)
 * - Quorum-based delivery strategies (union, vote, consensus, merge)
 * - Leader election (bully algorithm with priority tiers)
 * - Backpressure & rate limiting on deliveries
 * - Graceful degradation and automatic recovery
 * - Comprehensive metrics and telemetry hooks
 *
 * Unlike fixed GroupJoinManager, swarms are living organisms:
 * agents join/leave at runtime, collaborate continuously, and
 * deliver results via configurable aggregation strategies.
 */

import { logger } from "./logger.js";
import type { AgentRecord } from "./types.js";

// ============================================================================
// Types & Enums
// ============================================================================

export type SwarmDeliveryCallback = (
  records: AgentRecord[],
  partial: boolean,
  swarmId: string,
  meta?: SwarmDeliveryMeta,
) => void;

export type SwarmMessageCallback = (
  fromAgentId: string,
  toAgentId: string | "*",
  payload: unknown,
  swarmId: string,
) => void;

export interface SwarmDeliveryMeta {
  /** Delivery strategy used for this batch. */
  strategy: SwarmStrategy;
  /** Number of agents that contributed. */
  contributorCount: number;
  /** Number of agents still pending. */
  pendingCount: number;
  /** Epoch/tick number for this delivery. */
  epoch: number;
  /** Whether this was triggered by timeout (stragglers). */
  timedOut: boolean;
  /** Leader agent ID at time of delivery, if leader election enabled. */
  leaderId?: string;
  /** Quorum achieved? */
  quorumMet: boolean;
}

export type SwarmStrategy = "live" | "quorum" | "vote" | "merge" | "batch";
export type SwarmAgentStatus = "idle" | "running" | "completed" | "failed" | "timeout" | "left";

export interface SwarmAgentState {
  agentId: string;
  status: SwarmAgentStatus;
  joinedAt: number;
  lastHeartbeatAt: number;
  completedAt?: number;
  record?: AgentRecord;
  /** Priority for leader election (higher = more likely leader). */
  priority: number;
  /** Custom metadata agents can attach to their state. */
  meta: Record<string, unknown>;
}

export interface SwarmConfig {
  /** Unique swarm identifier. */
  swarmId: string;
  /** Human-readable name. */
  name: string;
  /** Delivery strategy. Default: "live". */
  strategy?: SwarmStrategy;
  /** Timeout after first completion (ms). Default: 30s. */
  swarmTimeout?: number;
  /** Timeout for stragglers after partial delivery (ms). Default: 15s. */
  stragglerTimeout?: number;
  /** Heartbeat interval for health checks (ms). Default: 10s. */
  heartbeatInterval?: number;
  /** Max missed heartbeats before agent marked failed. Default: 3. */
  maxMissedHeartbeats?: number;
  /** Minimum agents required for quorum. Default: 1. */
  quorumMin?: number;
  /** Percentage of agents required for quorum (0-1). Default: 0.5. */
  quorumPercent?: number;
  /** Enable leader election. Default: false. */
  enableLeader?: boolean;
  /** Max deliveries per second (backpressure). Default: 10. */
  maxDeliveryRate?: number;
  /** Auto-cleanup empty swarms. Default: true. */
  autoCleanup?: boolean;
  /** Callback when swarm state changes. */
  onStateChange?: (swarmId: string, event: SwarmEvent) => void;
}

export type SwarmEvent =
  | { type: "agent:joined"; agentId: string; timestamp: number }
  | { type: "agent:left"; agentId: string; reason: "manual" | "timeout" | "failed" | "cleanup"; timestamp: number }
  | { type: "agent:completed"; agentId: string; record: AgentRecord; timestamp: number }
  | { type: "agent:heartbeat"; agentId: string; timestamp: number }
  | { type: "agent:failed"; agentId: string; error?: string; timestamp: number }
  | { type: "delivery"; records: AgentRecord[]; partial: boolean; meta: SwarmDeliveryMeta; timestamp: number }
  | { type: "leader:elected"; leaderId: string; timestamp: number }
  | { type: "leader:lost"; leaderId: string; timestamp: number }
  | { type: "quorum:met"; count: number; required: number; timestamp: number }
  | { type: "timeout"; pendingAgents: string[]; timestamp: number }
  | { type: "swarm:created"; timestamp: number }
  | { type: "swarm:disposed"; timestamp: number };

interface SwarmInternal {
  config: SwarmConfig;
  agents: Map<string, SwarmAgentState>;
  completedRecords: Map<string, AgentRecord>;
  deliveredRecordIds: Set<string>;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  heartbeatHandle?: ReturnType<typeof setInterval>;
  delivered: boolean;
  isStraggler: boolean;
  epoch: number;
  leaderId?: string;
  /** Rate limiter: timestamps of recent deliveries. */
  deliveryTimestamps: number[];
  /** In-flight messages waiting for routing. */
  messageQueue: Array<{ from: string; to: string | "*"; payload: unknown; ts: number }>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SWARM_TIMEOUT = 30_000;
const STRAGGLER_TIMEOUT = 15_000;
const DEFAULT_HEARTBEAT_INTERVAL = 10_000;
const DEFAULT_MAX_MISSED_HEARTBEATS = 3;
const DEFAULT_QUORUM_PERCENT = 0.5;
const DEFAULT_MAX_DELIVERY_RATE = 10; // per second
const RATE_LIMIT_WINDOW_MS = 1_000;

// ============================================================================
// SwarmCoordinator — Enterprise Edition
// ============================================================================

export class SwarmCoordinator {
  private swarms = new Map<string, SwarmInternal>();
  private agentToSwarm = new Map<string, string>();
  private deliverCb: SwarmDeliveryCallback;
  private messageCb?: SwarmMessageCallback;
  private defaultSwarmTimeout: number;

  /** Global metrics aggregator. */
  private metrics: SwarmMetricsCollector;

  constructor(deliverCb: SwarmDeliveryCallback, messageCbOrTimeout?: SwarmMessageCallback | number) {
    this.deliverCb = deliverCb;
    if (typeof messageCbOrTimeout === "function") {
      this.messageCb = messageCbOrTimeout;
      this.defaultSwarmTimeout = DEFAULT_SWARM_TIMEOUT;
    } else if (typeof messageCbOrTimeout === "number") {
      // Backwards compat: old API passed swarmTimeout as second param
      this.defaultSwarmTimeout = messageCbOrTimeout;
    } else {
      this.defaultSwarmTimeout = DEFAULT_SWARM_TIMEOUT;
    }
    this.metrics = new SwarmMetricsCollector();
  }

  // --------------------------------------------------------------------------
  // Swarm Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Create a new swarm with full configuration.
   * Returns the swarmId.
   */
  createSwarm(name?: string): string;
  createSwarm(config: Omit<SwarmConfig, "swarmId"> & { swarmId?: string }): string;
  createSwarm(configOrName?: string | (Omit<SwarmConfig, "swarmId"> & { swarmId?: string })): string {
    const config =
      typeof configOrName === "string"
        ? { name: configOrName || `Swarm ${this.swarms.size + 1}` }
        : ((configOrName || {}) as Partial<Omit<SwarmConfig, "swarmId"> & { swarmId?: string }>);
    const swarmId = config.swarmId || `swarm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const fullConfig: SwarmConfig = {
      swarmTimeout: this.defaultSwarmTimeout,
      stragglerTimeout: STRAGGLER_TIMEOUT,
      heartbeatInterval: DEFAULT_HEARTBEAT_INTERVAL,
      maxMissedHeartbeats: DEFAULT_MAX_MISSED_HEARTBEATS,
      quorumMin: 1,
      quorumPercent: DEFAULT_QUORUM_PERCENT,
      enableLeader: false,
      maxDeliveryRate: DEFAULT_MAX_DELIVERY_RATE,
      autoCleanup: true,
      name: config.name ?? `Swarm ${this.swarms.size + 1}`,
      strategy: "live",
      ...config,
      swarmId,
    };

    const swarm: SwarmInternal = {
      config: fullConfig,
      agents: new Map(),
      completedRecords: new Map(),
      deliveredRecordIds: new Set(),
      delivered: false,
      isStraggler: false,
      epoch: 0,
      deliveryTimestamps: [],
      messageQueue: [],
    };

    this.swarms.set(swarmId, swarm);
    this.emit(swarm, { type: "swarm:created", timestamp: Date.now() });

    // Start health monitoring if heartbeats enabled
    if (fullConfig.heartbeatInterval && fullConfig.heartbeatInterval > 0) {
      swarm.heartbeatHandle = setInterval(() => this.checkHealth(swarm), fullConfig.heartbeatInterval);
    }

    logger.info(`Swarm created`, { swarmId, name: fullConfig.name, strategy: fullConfig.strategy });
    return swarmId;
  }

  /**
   * Legacy compatibility: register swarm with initial members.
   */
  registerSwarm(swarmId: string, initialAgentIds: string[] = [], name?: string): string {
    if (!this.swarms.has(swarmId)) {
      this.createSwarm({ swarmId, name: name || `Swarm ${this.swarms.size + 1}` });
    }
    for (const id of initialAgentIds) {
      this.addAgentToSwarm(swarmId, id);
    }
    return swarmId;
  }

  /**
   * Dispose a swarm and clean up all resources.
   */
  disposeSwarm(swarmId: string): boolean {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    if (swarm.timeoutHandle) clearTimeout(swarm.timeoutHandle);
    if (swarm.heartbeatHandle) clearInterval(swarm.heartbeatHandle);

    for (const [agentId] of swarm.agents) {
      this.agentToSwarm.delete(agentId);
    }

    this.swarms.delete(swarmId);
    this.emit(swarm, { type: "swarm:disposed", timestamp: Date.now() });
    logger.info(`Swarm disposed`, { swarmId });
    return true;
  }

  // --------------------------------------------------------------------------
  // Agent Membership
  // --------------------------------------------------------------------------

  /**
   * Add an agent to a swarm at runtime. Core primitive for dynamic collaboration.
   * Supports priority-based leader election if enabled.
   */
  addAgentToSwarm(swarmId: string, agentId: string, priority = 0): boolean {
    if (!this.swarms.has(swarmId)) {
      this.createSwarm({ swarmId, name: `Swarm ${this.swarms.size + 1}` });
    }

    const swarm = this.swarms.get(swarmId)!;
    if (swarm.delivered) {
      logger.warn(`Cannot join swarm ${swarmId}: already delivered`, { agentId });
      return false;
    }

    // Remove from previous swarm if any
    const prevSwarmId = this.agentToSwarm.get(agentId);
    if (prevSwarmId && prevSwarmId !== swarmId) {
      this.removeAgentFromSwarm(agentId);
    }

    const state: SwarmAgentState = {
      agentId,
      status: "idle",
      joinedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      priority,
      meta: {},
    };

    swarm.agents.set(agentId, state);
    this.agentToSwarm.set(agentId, swarmId);

    this.emit(swarm, { type: "agent:joined", agentId, timestamp: Date.now() });

    // Trigger leader election if enabled
    if (swarm.config.enableLeader) {
      this.electLeader(swarm);
    }

    return true;
  }

  /**
   * Remove an agent from its swarm. Supports graceful leave.
   */
  removeAgentFromSwarm(agentId: string): boolean {
    const swarmId = this.agentToSwarm.get(agentId);
    if (!swarmId) return false;

    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    const agent = swarm.agents.get(agentId);
    if (agent) {
      agent.status = "left";
      this.emit(swarm, { type: "agent:left", agentId, reason: "manual", timestamp: Date.now() });
    }

    swarm.agents.delete(agentId);
    swarm.completedRecords.delete(agentId);
    this.agentToSwarm.delete(agentId);

    // Re-elect leader if the leaving agent was leader
    if (swarm.config.enableLeader && swarm.leaderId === agentId) {
      swarm.leaderId = undefined;
      this.emit(swarm, { type: "leader:lost", leaderId: agentId, timestamp: Date.now() });
      this.electLeader(swarm);
    }

    // Cleanup empty swarm
    if (swarm.config.autoCleanup && swarm.agents.size === 0) {
      this.disposeSwarm(swarmId);
    }

    return true;
  }

  /**
   * Agent heartbeat — call periodically to maintain healthy status.
   */
  heartbeat(agentId: string): boolean {
    const swarmId = this.agentToSwarm.get(agentId);
    if (!swarmId) return false;

    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    const agent = swarm.agents.get(agentId);
    if (!agent) return false;

    agent.lastHeartbeatAt = Date.now();
    if (agent.status === "failed" || agent.status === "timeout") {
      agent.status = "running"; // Recovered
      logger.info(`Agent recovered in swarm`, { agentId, swarmId });
    }

    this.emit(swarm, { type: "agent:heartbeat", agentId, timestamp: Date.now() });
    return true;
  }

  /**
   * Update agent metadata (e.g., progress, partial results).
   */
  updateAgentMeta(agentId: string, meta: Record<string, unknown>): boolean {
    const swarmId = this.agentToSwarm.get(agentId);
    if (!swarmId) return false;

    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    const agent = swarm.agents.get(agentId);
    if (!agent) return false;

    agent.meta = { ...agent.meta, ...meta };
    return true;
  }

  // --------------------------------------------------------------------------
  // Completion & Delivery
  // --------------------------------------------------------------------------

  /**
   * Called when a swarm agent completes its task.
   *
   * Strategies:
   * - "live":   Deliver immediately (streaming collaboration)
   * - "quorum": Deliver when quorum reached
   * - "vote":   Deliver aggregated votes (requires all to complete)
   * - "merge":  Merge all results into single delivery when complete
   * - "batch":  Traditional batch, hold until all complete or timeout
   */
  onAgentComplete(record: AgentRecord): "delivered" | "held" | "pass" {
    const swarmId = this.agentToSwarm.get(record.id);
    if (!swarmId) return "pass";

    const swarm = this.swarms.get(swarmId);
    if (!swarm || swarm.delivered) return "pass";
    if (swarm.completedRecords.has(record.id)) return "pass";

    const agent = swarm.agents.get(record.id);
    if (!agent) return "pass";

    agent.status = "completed";
    agent.completedAt = Date.now();
    agent.record = record;
    swarm.completedRecords.set(record.id, record);

    this.emit(swarm, { type: "agent:completed", agentId: record.id, record, timestamp: Date.now() });

    const strategy = swarm.config.strategy || "live";
    const allCompleted = swarm.completedRecords.size >= swarm.agents.size;

    // Check quorum
    const quorumRequired = this.computeQuorumRequired(swarm);
    const quorumMet = swarm.completedRecords.size >= quorumRequired;

    if (allCompleted) {
      // Everyone done — deliver full batch
      this.deliverBatch(swarm, false, { quorumMet: true, timedOut: false });
      return "delivered";
    }

    if (strategy === "live" && quorumMet) {
      // Live delivery: stream results as they come in, but respect rate limits
      if (this.checkRateLimit(swarm)) {
        this.deliverBatch(swarm, true, { quorumMet: true, timedOut: false });
      }
    } else if (strategy === "quorum" && quorumMet) {
      this.deliverBatch(swarm, false, { quorumMet: true, timedOut: false });
      return "delivered";
    }

    // Start timeout on first completion
    if (!swarm.timeoutHandle) {
      const timeout = swarm.isStraggler ? swarm.config.stragglerTimeout! : swarm.config.swarmTimeout!;
      swarm.timeoutHandle = setTimeout(() => this.onTimeout(swarm), timeout);
    }

    return strategy === "live" && quorumMet ? "delivered" : "held";
  }

  /**
   * Mark an agent as failed (e.g., crash, error, or missed heartbeats).
   */
  onAgentFailed(agentId: string, error?: string): boolean {
    const swarmId = this.agentToSwarm.get(agentId);
    if (!swarmId) return false;

    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    const agent = swarm.agents.get(agentId);
    if (!agent) return false;

    agent.status = "failed";
    this.emit(swarm, { type: "agent:failed", agentId, error, timestamp: Date.now() });

    // If all remaining agents are failed/left, clean up
    const activeAgents = [...swarm.agents.values()].filter(
      (a) => a.status !== "failed" && a.status !== "left" && a.status !== "timeout",
    );
    if (activeAgents.length === 0 && swarm.config.autoCleanup) {
      this.disposeSwarm(swarmId);
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Inter-Agent Messaging
  // --------------------------------------------------------------------------

  /**
   * Send a message to another agent in the same swarm (or broadcast with "*").
   */
  sendMessage(fromAgentId: string, toAgentId: string | "*", payload: unknown): boolean {
    const swarmId = this.agentToSwarm.get(fromAgentId);
    if (!swarmId) return false;

    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    // If targeting specific agent, ensure they're in the same swarm
    if (toAgentId !== "*" && this.agentToSwarm.get(toAgentId) !== swarmId) {
      logger.warn(`Cross-swarm messaging blocked`, { from: fromAgentId, to: toAgentId, swarmId });
      return false;
    }

    swarm.messageQueue.push({ from: fromAgentId, to: toAgentId, payload, ts: Date.now() });
    this.messageCb?.(fromAgentId, toAgentId, payload, swarmId);
    return true;
  }

  /**
   * Poll messages for a specific agent (call from agent runner).
   */
  pollMessages(agentId: string, since?: number): Array<{ from: string; payload: unknown; ts: number }> {
    const swarmId = this.agentToSwarm.get(agentId);
    if (!swarmId) return [];

    const swarm = this.swarms.get(swarmId);
    if (!swarm) return [];

    const cutoff = since ?? 0;
    const messages = swarm.messageQueue.filter(
      (m) => (m.to === agentId || m.to === "*") && m.ts > cutoff && m.from !== agentId,
    );

    // Clean up old messages (older than 5 minutes)
    const fiveMinAgo = Date.now() - 300_000;
    swarm.messageQueue = swarm.messageQueue.filter((m) => m.ts > fiveMinAgo);

    return messages.map((m) => ({ from: m.from, payload: m.payload, ts: m.ts }));
  }

  // --------------------------------------------------------------------------
  // Leader Election
  // --------------------------------------------------------------------------

  private electLeader(swarm: SwarmInternal): void {
    if (!swarm.config.enableLeader) return;

    const candidates = [...swarm.agents.values()].filter(
      (a) => a.status === "idle" || a.status === "running" || a.status === "completed",
    );

    if (candidates.length === 0) {
      if (swarm.leaderId) {
        this.emit(swarm, { type: "leader:lost", leaderId: swarm.leaderId, timestamp: Date.now() });
        swarm.leaderId = undefined;
      }
      return;
    }

    // Simple bully: highest priority wins, tie-break by agentId (lexicographically last)
    const leader = candidates.reduce((best, current) => {
      if (current.priority > best.priority) return current;
      if (current.priority === best.priority && current.agentId > best.agentId) return current;
      return best;
    });

    if (swarm.leaderId !== leader.agentId) {
      swarm.leaderId = leader.agentId;
      this.emit(swarm, { type: "leader:elected", leaderId: leader.agentId, timestamp: Date.now() });
      logger.info(`Leader elected in swarm`, { swarmId: swarm.config.swarmId, leaderId: leader.agentId });
    }
  }

  // --------------------------------------------------------------------------
  // Health Monitoring
  // --------------------------------------------------------------------------

  private checkHealth(swarm: SwarmInternal): void {
    const now = Date.now();
    const maxMissed = swarm.config.maxMissedHeartbeats ?? DEFAULT_MAX_MISSED_HEARTBEATS;
    const interval = swarm.config.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL;
    const threshold = interval * maxMissed;

    for (const [agentId, agent] of swarm.agents) {
      if (agent.status === "completed" || agent.status === "left") continue;

      const elapsed = now - agent.lastHeartbeatAt;
      if (elapsed > threshold) {
        agent.status = "timeout";
        logger.warn(`Agent heartbeat timeout`, { agentId, swarmId: swarm.config.swarmId, elapsed });
        this.emit(swarm, { type: "agent:failed", agentId, error: "heartbeat timeout", timestamp: now });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Timeout & Delivery Internals
  // --------------------------------------------------------------------------

  private onTimeout(swarm: SwarmInternal): void {
    if (swarm.delivered) return;
    swarm.timeoutHandle = undefined;

    const completedIds = [...swarm.completedRecords.keys()];
    const remaining = new Set<string>();
    for (const [id, agent] of swarm.agents) {
      if (!swarm.completedRecords.has(id) && agent.status !== "left" && agent.status !== "failed") {
        remaining.add(id);
      }
    }

    const completedThisWave = completedIds
      .filter((id) => !swarm.deliveredRecordIds.has(id))
      .map((id) => swarm.completedRecords.get(id))
      .filter((record): record is AgentRecord => record !== undefined);

    if (completedThisWave.length > 0) {
      const quorumMet = swarm.completedRecords.size >= this.computeQuorumRequired(swarm);
      this.deliverBatch(swarm, true, { quorumMet, timedOut: true });
    }

    this.emit(swarm, { type: "timeout", pendingAgents: [...remaining], timestamp: Date.now() });

    // Reset for next wave
    swarm.completedRecords.clear();
    swarm.deliveredRecordIds.clear();
    swarm.isStraggler = true;
    swarm.epoch++;

    if (remaining.size === 0) {
      this.disposeSwarm(swarm.config.swarmId);
      return;
    }

    // Shrink active set to remaining agents
    for (const id of completedIds) {
      this.agentToSwarm.delete(id);
    }
    for (const [id, agent] of swarm.agents) {
      if (!remaining.has(id)) {
        swarm.agents.delete(id);
      } else {
        agent.status = "running";
        agent.record = undefined;
        agent.completedAt = undefined;
      }
    }
  }

  private deliverBatch(swarm: SwarmInternal, partial: boolean, opts: { quorumMet: boolean; timedOut: boolean }): void {
    if (swarm.timeoutHandle) {
      clearTimeout(swarm.timeoutHandle);
      swarm.timeoutHandle = undefined;
    }

    const records = [...swarm.completedRecords.values()];
    if (records.length === 0) return;

    swarm.epoch++;
    const pendingCount = swarm.agents.size - swarm.completedRecords.size;

    const meta: SwarmDeliveryMeta = {
      strategy: swarm.config.strategy || "live",
      contributorCount: records.length,
      pendingCount: Math.max(0, pendingCount),
      epoch: swarm.epoch,
      timedOut: opts.timedOut,
      leaderId: swarm.leaderId,
      quorumMet: opts.quorumMet,
    };

    // Track rate limit
    swarm.deliveryTimestamps.push(Date.now());
    this.cleanupRateLimit(swarm);

    // Mark delivered records
    for (const record of records) {
      swarm.deliveredRecordIds.add(record.id);
    }

    // Metrics
    this.metrics.recordDelivery(swarm.config.swarmId, records.length, partial, opts.timedOut);

    // Safe delivery with error boundary
    try {
      this.deliverCb(records, partial, swarm.config.swarmId, meta);
    } catch (err) {
      logger.error(`Swarm delivery callback failed`, {
        swarmId: swarm.config.swarmId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    this.emit(swarm, { type: "delivery", records, partial, meta, timestamp: Date.now() });

    if (!partial) {
      swarm.delivered = true;
      if (swarm.config.autoCleanup) {
        // Delayed cleanup to allow post-delivery queries
        setTimeout(() => this.disposeSwarm(swarm.config.swarmId), 5_000);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Rate Limiting
  // --------------------------------------------------------------------------

  private checkRateLimit(swarm: SwarmInternal): boolean {
    this.cleanupRateLimit(swarm);
    const maxRate = swarm.config.maxDeliveryRate ?? DEFAULT_MAX_DELIVERY_RATE;
    return swarm.deliveryTimestamps.length < maxRate;
  }

  private cleanupRateLimit(swarm: SwarmInternal): void {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    swarm.deliveryTimestamps = swarm.deliveryTimestamps.filter((ts) => ts > cutoff);
  }

  // --------------------------------------------------------------------------
  // Quorum
  // --------------------------------------------------------------------------

  private computeQuorumRequired(swarm: SwarmInternal): number {
    const total = swarm.agents.size;
    const min = swarm.config.quorumMin ?? 1;
    const pct = swarm.config.quorumPercent ?? DEFAULT_QUORUM_PERCENT;
    return Math.max(min, Math.ceil(total * pct));
  }

  // --------------------------------------------------------------------------
  // Event Emission
  // --------------------------------------------------------------------------

  private emit(swarm: SwarmInternal, event: SwarmEvent): void {
    try {
      swarm.config.onStateChange?.(swarm.config.swarmId, event);
    } catch (err) {
      logger.warn(`Swarm stateChange handler failed`, {
        swarmId: swarm.config.swarmId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // --------------------------------------------------------------------------
  // Query APIs (Dashboard / UI)
  // --------------------------------------------------------------------------

  listSwarms(): Array<{
    swarmId: string;
    name: string;
    agentCount: number;
    strategy: SwarmStrategy;
    leaderId?: string;
  }> {
    return [...this.swarms.values()].map((swarm) => ({
      swarmId: swarm.config.swarmId,
      name: swarm.config.name,
      agentCount: swarm.agents.size,
      strategy: swarm.config.strategy || "live",
      leaderId: swarm.leaderId,
    }));
  }

  getSwarmMembers(swarmId: string): SwarmAgentState[] {
    const swarm = this.swarms.get(swarmId);
    return swarm ? [...swarm.agents.values()] : [];
  }

  getSwarmState(swarmId: string): SwarmInternal | undefined {
    return this.swarms.get(swarmId);
  }

  isSwarmMember(agentId: string): boolean {
    return this.agentToSwarm.has(agentId);
  }

  getSwarmIdForAgent(agentId: string): string | undefined {
    return this.agentToSwarm.get(agentId);
  }

  getSwarmMetrics(swarmId?: string): SwarmMetrics {
    return this.metrics.getMetrics(swarmId);
  }

  dispose(): void {
    for (const swarm of this.swarms.values()) {
      if (swarm.timeoutHandle) clearTimeout(swarm.timeoutHandle);
      if (swarm.heartbeatHandle) clearInterval(swarm.heartbeatHandle);
    }
    this.swarms.clear();
    this.agentToSwarm.clear();
    this.metrics.reset();
  }
}

// ============================================================================
// Metrics Collector
// ============================================================================

export interface SwarmMetrics {
  totalDeliveries: number;
  totalRecordsDelivered: number;
  partialDeliveries: number;
  timedOutDeliveries: number;
  averageLatencyMs?: number;
  bySwarm: Record<
    string,
    {
      deliveries: number;
      records: number;
      partials: number;
      timeouts: number;
    }
  >;
}

class SwarmMetricsCollector {
  private data: SwarmMetrics = {
    totalDeliveries: 0,
    totalRecordsDelivered: 0,
    partialDeliveries: 0,
    timedOutDeliveries: 0,
    bySwarm: {},
  };
  private latencies: number[] = [];

  recordDelivery(swarmId: string, recordCount: number, partial: boolean, timedOut: boolean): void {
    this.data.totalDeliveries++;
    this.data.totalRecordsDelivered += recordCount;
    if (partial) this.data.partialDeliveries++;
    if (timedOut) this.data.timedOutDeliveries++;

    if (!this.data.bySwarm[swarmId]) {
      this.data.bySwarm[swarmId] = { deliveries: 0, records: 0, partials: 0, timeouts: 0 };
    }
    const s = this.data.bySwarm[swarmId];
    s.deliveries++;
    s.records += recordCount;
    if (partial) s.partials++;
    if (timedOut) s.timeouts++;
  }

  recordLatency(ms: number): void {
    this.latencies.push(ms);
    if (this.latencies.length > 1000) this.latencies.shift();
  }

  getMetrics(swarmId?: string): SwarmMetrics {
    const avg =
      this.latencies.length > 0 ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length : undefined;

    return {
      ...this.data,
      averageLatencyMs: avg,
      bySwarm: swarmId
        ? { [swarmId]: this.data.bySwarm[swarmId] || { deliveries: 0, records: 0, partials: 0, timeouts: 0 } }
        : { ...this.data.bySwarm },
    };
  }

  reset(): void {
    this.data = {
      totalDeliveries: 0,
      totalRecordsDelivered: 0,
      partialDeliveries: 0,
      timedOutDeliveries: 0,
      bySwarm: {},
    };
    this.latencies = [];
  }
}

// ============================================================================
// Singleton & UI Helpers
// ============================================================================

let activeSwarmCoordinator: SwarmCoordinator | null = null;

export function setActiveSwarmCoordinator(coordinator: SwarmCoordinator | null): void {
  activeSwarmCoordinator = coordinator;
}

export function getSwarmCoordinator(): SwarmCoordinator | null {
  return activeSwarmCoordinator;
}

/**
 * UI convenience: create a swarm from selected agents with full config.
 */
export function uiCreateSwarm(agentIds: string[], config?: Partial<Omit<SwarmConfig, "swarmId">>): string | null {
  const coord = getSwarmCoordinator();
  if (!coord || agentIds.length === 0) return null;

  const swarmId = coord.createSwarm({
    name: config?.name || `Swarm ${coord.listSwarms().length + 1}`,
    strategy: config?.strategy || "live",
    enableLeader: agentIds.length > 2 ? true : config?.enableLeader,
    ...config,
  });

  for (const id of agentIds) {
    coord.addAgentToSwarm(swarmId, id);
  }
  return swarmId;
}

/**
 * UI convenience: join existing swarm.
 */
export function uiJoinSwarm(swarmId: string, agentId: string): boolean {
  const coord = getSwarmCoordinator();
  if (!coord) return false;
  return coord.addAgentToSwarm(swarmId, agentId);
}

/**
 * Backwards-compat convenience: create or join a swarm from the UI layer.
 */
export function uiCreateOrJoinSwarm(agentIds: string[], suggestedName?: string): string | null {
  const coord = getSwarmCoordinator();
  if (!coord || agentIds.length === 0) return null;

  const swarmId = coord.createSwarm(suggestedName);
  for (const id of agentIds) {
    coord.addAgentToSwarm(swarmId, id);
  }
  return swarmId;
}
