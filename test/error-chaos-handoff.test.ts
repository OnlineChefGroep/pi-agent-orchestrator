import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentHandoffManager } from '../src/core/handoff';

// Stricter resilience tests for handoff under chaos conditions
describe('Handoff - Error Chaos & Resilience', () => {
  let handoffManager: AgentHandoffManager;

  beforeEach(() => {
    handoffManager = new AgentHandoffManager();
    vi.clearAllMocks();
  });

  it('should gracefully handle corrupted handoff JSON', async () => {
    const corruptedPayload = 'invalid json { broken';
    const result = await handoffManager.processHandoff(corruptedPayload);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error.toString().toLowerCase()).toMatch(/(parse|syntax|unexpected|invalid)/);
    expect(result.fallback).toBeDefined(); // Must degrade gracefully
  });

  it('should handle missing required fields in handoff', async () => {
    const incomplete = { agentId: '123' }; // missing target, context etc.
    const result = await handoffManager.processHandoff(incomplete);
    expect(result.success).toBe(false);
  });

  it('should survive concurrent handoffs without race conditions', async () => {
    const promises = Array.from({ length: 10 }, () =>
      handoffManager.processHandoff({ agentId: 'test', target: 'subagent' })
    );
    const results = await Promise.allSettled(promises);

    // Assert no Promise was rejected
    const rejected = results.filter(r => r.status === 'rejected');
    expect(rejected).toHaveLength(0);

    // Verify each fulfilled result matches expected response contract
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    fulfilled.forEach(result => {
      expect(result.value).toBeDefined();
      expect(result.value).toHaveProperty('success');
      expect(result.value).toHaveProperty('agentId');
      expect(result.value).toHaveProperty('target');
    });

    // Assert there are exactly 10 successful handoffs
    expect(fulfilled).toHaveLength(10);
  });

  it('should enforce budget and depth limits under stress', async () => {
    // Test with excessive depth/budget
    const result = await handoffManager.processHandoff({
      agentId: 'stress-test',
      depth: 999,
      budget: -100
    });
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/budget|depth/i);
  });
});
