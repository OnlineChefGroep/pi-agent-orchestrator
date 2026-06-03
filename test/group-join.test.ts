import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupJoinManager } from '../src/group-join.js';
import type { AgentRecord } from '../src/types.js';

describe('GroupJoinManager', () => {
  let manager: GroupJoinManager;
  let deliverCb: ReturnType<typeof vi.fn>;

  const createDummyRecord = (id: string): AgentRecord => ({
    id,
    type: 'general-purpose',
    description: 'test',
    status: 'completed',
    toolUses: 0,
    spawnedAt: Date.now(),
    startedAt: Date.now(),
    lifetimeUsage: { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, totalDurationMs: 0 },
    compactionCount: 0,
    currentLevel: 0,
    totalSpawned: 0,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    deliverCb = vi.fn();
    manager = new GroupJoinManager(deliverCb, 30_000);
  });

  afterEach(() => {
    manager.dispose();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('registration', () => {
    it('registers a group and correctly reports if an agent is grouped', () => {
      manager.registerGroup('g1', ['a1', 'a2']);
      expect(manager.isGrouped('a1')).toBe(true);
      expect(manager.isGrouped('a2')).toBe(true);
      expect(manager.isGrouped('a3')).toBe(false);
    });
  });

  describe('onAgentComplete', () => {
    it('returns pass for ungrouped agents', () => {
      const record = createDummyRecord('a1');
      expect(manager.onAgentComplete(record)).toBe('pass');
      expect(deliverCb).not.toHaveBeenCalled();
    });

    it('returns pass if group is already delivered', () => {
      manager.registerGroup('g1', ['a1']);
      manager.onAgentComplete(createDummyRecord('a1'));
      expect(manager.onAgentComplete(createDummyRecord('a1'))).toBe('pass');
    });

    it('delivers immediately when all agents complete before timeout', () => {
      manager.registerGroup('g1', ['a1', 'a2']);

      const r1 = createDummyRecord('a1');
      expect(manager.onAgentComplete(r1)).toBe('held');
      expect(deliverCb).not.toHaveBeenCalled();

      const r2 = createDummyRecord('a2');
      expect(manager.onAgentComplete(r2)).toBe('delivered');

      expect(deliverCb).toHaveBeenCalledTimes(1);
      expect(deliverCb).toHaveBeenCalledWith([r1, r2], false);

      // Cleanup check
      expect(manager.isGrouped('a1')).toBe(false);
    });

    it('delivers partial results on default timeout', () => {
      manager.registerGroup('g1', ['a1', 'a2', 'a3']);

      const r1 = createDummyRecord('a1');
      expect(manager.onAgentComplete(r1)).toBe('held');

      vi.advanceTimersByTime(30_000);

      expect(deliverCb).toHaveBeenCalledTimes(1);
      expect(deliverCb).toHaveBeenCalledWith([r1], true);

      // Completed agent is cleaned up
      expect(manager.isGrouped('a1')).toBe(false);
      // Remaining agents are still grouped
      expect(manager.isGrouped('a2')).toBe(true);
    });

    it('handles stragglers with straggler timeout', () => {
      manager.registerGroup('g1', ['a1', 'a2', 'a3']);

      // First completion triggers main timeout
      const r1 = createDummyRecord('a1');
      manager.onAgentComplete(r1);
      vi.advanceTimersByTime(30_000);

      deliverCb.mockClear();

      // First straggler completion triggers straggler timeout
      const r2 = createDummyRecord('a2');
      expect(manager.onAgentComplete(r2)).toBe('held');

      vi.advanceTimersByTime(15_000);

      expect(deliverCb).toHaveBeenCalledTimes(1);
      expect(deliverCb).toHaveBeenCalledWith([r2], true);

      deliverCb.mockClear();

      // Final straggler completes immediately
      const r3 = createDummyRecord('a3');
      expect(manager.onAgentComplete(r3)).toBe('delivered');
      expect(deliverCb).toHaveBeenCalledTimes(1);
      expect(deliverCb).toHaveBeenCalledWith([r3], false);

      expect(manager.isGrouped('a3')).toBe(false);
    });
  });

  describe('dispose', () => {
    it('clears timeouts on dispose', () => {
      manager.registerGroup('g1', ['a1', 'a2']);
      manager.onAgentComplete(createDummyRecord('a1'));

      manager.dispose();

      vi.advanceTimersByTime(30_000);
      expect(deliverCb).not.toHaveBeenCalled();
    });
  });
});
