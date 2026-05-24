/**
 * swarm-join.ts — Manages dynamic "swarm" collaborative groups of background agents.
 *
 * Unlike fixed GroupJoinManager (created at spawn time for 'group'/'smart'),
 * SwarmCoordinator supports:
 * - Runtime joining of agents into an existing swarm (the key "agent join mode" feature)
 * - Live / more continuous delivery semantics suitable for collaborative swarms
 * - Query APIs for the rich dashboard (list swarms, members, etc.)
 *
 * Swarms are session-scoped (in-memory). Delivery still goes through the same
 * consolidated notification path as groups for now.
 */

import type { AgentRecord } from "./types.js";

export type SwarmDeliveryCallback = (records: AgentRecord[], partial: boolean, swarmId: string) => void;

interface Swarm {
  swarmId: string;
  name?: string;
  agentIds: Set<string>;
  completedRecords: Map<string, AgentRecord>;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  delivered: boolean;
  /** Shorter timeout for stragglers after a partial delivery. */
  isStraggler: boolean;
}

/** Default timeout: 30s after first completion in a swarm window. */
const DEFAULT_SWARM_TIMEOUT = 30_000;
/** Straggler re-batch timeout: 15s. */
const STRAGGLER_TIMEOUT = 15_000;

export class SwarmCoordinator {
  private swarms = new Map<string, Swarm>();
  private agentToSwarm = new Map<string, string>();

  constructor(
    private deliverCb: SwarmDeliveryCallback,
    private swarmTimeout = DEFAULT_SWARM_TIMEOUT,
  ) {}

  /**
   * Create or ensure a swarm exists. Optionally seed with initial members.
   * Returns the swarmId (useful for auto-generated names).
   */
  registerSwarm(swarmId: string, initialAgentIds: string[] = [], name?: string): string {
    if (!this.swarms.has(swarmId)) {
      const swarm: Swarm = {
        swarmId,
        name,
        agentIds: new Set(initialAgentIds),
        completedRecords: new Map(),
        delivered: false,
        isStraggler: false,
      };
      this.swarms.set(swarmId, swarm);
      for (const id of initialAgentIds) {
        this.agentToSwarm.set(id, swarmId);
      }
    } else if (initialAgentIds.length > 0) {
      // Add any new initial members to an existing swarm
      const swarm = this.swarms.get(swarmId)!;
      for (const id of initialAgentIds) {
        swarm.agentIds.add(id);
        this.agentToSwarm.set(id, swarmId);
      }
    }
    return swarmId;
  }

  /**
   * Dynamically add an agent to an existing swarm at runtime.
   * This is the core primitive for "agent join mode" / swarm collaboration.
   * Creates the swarm on the fly if it doesn't exist yet (very flexible for TUI-driven swarms).
   */
  addAgentToSwarm(swarmId: string, agentId: string, swarmName?: string): boolean {
    if (!this.swarms.has(swarmId)) {
      this.registerSwarm(swarmId, [], swarmName);
    }

    const swarm = this.swarms.get(swarmId)!;
    if (swarm.delivered) return false;

    swarm.agentIds.add(agentId);
    this.agentToSwarm.set(agentId, swarmId);
    return true;
  }

  /**
   * Remove an agent from a swarm (supports dynamic leave).
   */
  removeAgentFromSwarm(agentId: string): boolean {
    const swarmId = this.agentToSwarm.get(agentId);
    if (!swarmId) return false;

    const swarm = this.swarms.get(swarmId);
    if (!swarm) return false;

    swarm.agentIds.delete(agentId);
    this.agentToSwarm.delete(agentId);

    // If swarm becomes empty, clean it up
    if (swarm.agentIds.size === 0) {
      this.cleanupSwarm(swarmId);
    }

    return true;
  }

  /**
   * Create a new swarm with a nice name and return the generated swarmId.
   * Very useful for dashboard "create swarm from selected" action.
   */
  createSwarm(name?: string): string {
    const swarmId = `swarm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    this.registerSwarm(swarmId, [], name || `Swarm ${this.swarms.size + 1}`);
    return swarmId;
  }

  /**
   * Called when a swarm agent completes.
   *
   * Swarm semantics (distinct from fixed 'group'):
   * - Dynamic membership: agents can join/leave at runtime.
   * - Live delivery: we deliver the completed record *immediately* for a streaming
   *   collaborative feel (the dashboard can show real-time swarm progress).
   * - Still supports wave-style partial deliveries on timeout for stragglers.
   */
  onAgentComplete(record: AgentRecord): 'delivered' | 'held' | 'pass' {
    const swarmId = this.agentToSwarm.get(record.id);
    if (!swarmId) return 'pass';

    const swarm = this.swarms.get(swarmId);
    if (!swarm || swarm.delivered) return 'pass';

    swarm.completedRecords.set(record.id, record);

    // === LIVE SWARM BEHAVIOR (the "grotere" distinction) ===
    // Deliver this completion right away so the UI gets a steady stream of updates.
    // This makes swarms feel like a living, collaborative team instead of a rigid batch.
    this.deliverSingle(record, swarmId);

    // Still track for timeout-based "wave complete" summaries
    if (!swarm.timeoutHandle) {
      const timeout = swarm.isStraggler ? STRAGGLER_TIMEOUT : this.swarmTimeout;
      swarm.timeoutHandle = setTimeout(() => {
        this.onTimeout(swarm);
      }, timeout);
    }

    // Clean up this agent from the "pending" set for future waves
    // (but keep it in the swarm membership so dashboard still sees it as part of the swarm)
    // We keep the record in completedRecords for the current wave summary.

    return 'delivered';
  }

  /**
   * Deliver a single swarm agent's completion immediately (live collaborative feel).
   */
  private deliverSingle(record: AgentRecord, swarmId: string): void {
    this.deliverCb([record], false, swarmId);
  }

  private onTimeout(swarm: Swarm): void {
    if (swarm.delivered) return;
    swarm.timeoutHandle = undefined;

    const remaining = new Set<string>();
    for (const id of swarm.agentIds) {
      if (!swarm.completedRecords.has(id)) remaining.add(id);
    }

    // For swarms we do NOT remove from agentToSwarm on partial — they stay swarm members
    // even if they haven't completed this wave yet. This supports truly dynamic long-lived swarms.

    const completedThisWave = [...swarm.completedRecords.values()];
    this.deliverCb(completedThisWave, true, swarm.swarmId);

    // Clear only the wave, keep membership for the living swarm
    swarm.completedRecords.clear();
    swarm.isStraggler = true;

    // If there are still members, they can start a new wave on next completion
    if (remaining.size > 0) {
      swarm.agentIds = remaining; // shrink to only still-active
    }
  }

  private deliver(swarm: Swarm, partial: boolean): void {
    if (swarm.timeoutHandle) {
      clearTimeout(swarm.timeoutHandle);
      swarm.timeoutHandle = undefined;
    }
    swarm.delivered = true;

    this.deliverCb([...swarm.completedRecords.values()], partial, swarm.swarmId);

    this.cleanupSwarm(swarm.swarmId);
  }

  private cleanupSwarm(swarmId: string): void {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;
    for (const id of swarm.agentIds) {
      this.agentToSwarm.delete(id);
    }
    this.swarms.delete(swarmId);
  }

  // --- Query APIs for dashboard / UI ---

  listSwarms(): string[] {
    return [...this.swarms.keys()];
  }

  getSwarmMembers(swarmId: string): string[] {
    const swarm = this.swarms.get(swarmId);
    return swarm ? [...swarm.agentIds] : [];
  }

  isSwarmMember(agentId: string): boolean {
    return this.agentToSwarm.has(agentId);
  }

  getSwarmIdForAgent(agentId: string): string | undefined {
    return this.agentToSwarm.get(agentId);
  }

  dispose(): void {
    for (const swarm of this.swarms.values()) {
      if (swarm.timeoutHandle) clearTimeout(swarm.timeoutHandle);
    }
    this.swarms.clear();
    this.agentToSwarm.clear();
  }
}
