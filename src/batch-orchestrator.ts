/**
 * batch-orchestrator.ts — Batch orchestration for smart/group/swarm join modes.
 *
 * Manages batch tracking for background agents spawned in the current turn.
 * Uses a debounced timer to capture parallel tool calls dispatched across
 * multiple microtasks into the same batch.
 */

import type { AgentManager } from "./agent-manager.js";
import { GroupJoinManager } from "./group-join.js";
import { SwarmCoordinator } from "./swarm-join.js";
import type { AgentRecord, JoinMode } from "./types.js";

export interface BatchOrchestratorDeps {
  manager: AgentManager;
  groupJoin: GroupJoinManager;
  swarmJoin: SwarmCoordinator;
  onAgentHandled: (record: AgentRecord) => void;
  onWidgetUpdate: () => void;
}

export class BatchOrchestrator {
  private currentBatchAgents: { id: string; joinMode: JoinMode }[] = [];
  private batchFinalizeTimer: ReturnType<typeof setTimeout> | undefined;
  private batchCounter = 0;

  constructor(private deps: BatchOrchestratorDeps) {}

  /**
   * Add an agent to the current batch.
   * Resets the debounce timer to capture parallel tool calls.
   */
  addToBatch(id: string, joinMode: JoinMode): void {
    this.currentBatchAgents.push({ id, joinMode });
    if (this.batchFinalizeTimer) clearTimeout(this.batchFinalizeTimer);
    this.batchFinalizeTimer = setTimeout(() => this.finalizeBatch(), 100);
  }

  /**
   * Finalize the current batch: smart/group get traditional fixed groups,
   * swarm gets a dynamic SwarmCoordinator entry (can grow later via dashboard hotkeys).
   */
  private finalizeBatch(): void {
    this.batchFinalizeTimer = undefined;
    const batchAgents = [...this.currentBatchAgents];
    this.currentBatchAgents = [];

    // Traditional smart/group batching (unchanged behavior)
    const smartAgents = batchAgents.filter(a => a.joinMode === 'smart' || a.joinMode === 'group');
    let handledSmartGroupIds: string[] = [];
    if (smartAgents.length >= 2) {
      const groupId = `batch-${++this.batchCounter}`;
      const ids = smartAgents.map(a => a.id);
      handledSmartGroupIds = ids;
      this.deps.groupJoin.registerGroup(groupId, ids);
      for (const id of ids) {
        const record = this.deps.manager.getRecord(id);
        if (!record) continue;
        record.groupId = groupId;
        if (record.completedAt != null && !record.resultConsumed) {
          this.deps.groupJoin.onAgentComplete(record);
        }
      }
    }

    // Swarm mode — dynamic collaborative groups
    const swarmAgents = batchAgents.filter(a => a.joinMode === 'swarm');
    if (swarmAgents.length >= 1) {
      const swarmId = `swarm-${++this.batchCounter}`;
      const ids = swarmAgents.map(a => a.id);
      this.deps.swarmJoin.registerSwarm(swarmId, ids);
      for (const id of ids) {
        const record = this.deps.manager.getRecord(id);
        if (!record) continue;
        record.swarmId = swarmId;
        if (record.completedAt != null && !record.resultConsumed) {
          this.deps.swarmJoin.onAgentComplete(record);
        }
      }
    }

    // Any agents that were in the debounce batch but did not form (or join) a group/swarm
    // get their deferred individual nudges now.
    const handled = new Set([
      ...handledSmartGroupIds,
      ...batchAgents.filter(a => a.joinMode === 'swarm').map(a => a.id),
    ]);

    for (const { id } of batchAgents) {
      if (handled.has(id)) continue;
      const record = this.deps.manager.getRecord(id);
      if (record?.completedAt != null && !record.resultConsumed) {
        this.deps.onAgentHandled(record);
      }
    }

    this.deps.onWidgetUpdate();
  }

  /**
   * Check if an agent is currently pending batch finalization.
   */
  isPendingBatchFinalization(agentId: string): boolean {
    return this.currentBatchAgents.some(a => a.id === agentId);
  }

  /**
   * Clean up resources (clear timer, reset state).
   */
  dispose(): void {
    if (this.batchFinalizeTimer) {
      clearTimeout(this.batchFinalizeTimer);
      this.batchFinalizeTimer = undefined;
    }
    this.currentBatchAgents = [];
  }
}
