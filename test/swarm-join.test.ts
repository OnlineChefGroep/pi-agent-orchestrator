import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSwarmCoordinator, SwarmCoordinator, setActiveSwarmCoordinator, uiCreateOrJoinSwarm } from "../src/swarm-join.js";
import type { AgentRecord } from "../src/types.js";

describe("SwarmCoordinator", () => {
  let coordinator: SwarmCoordinator;
  let deliveryCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deliveryCallback = vi.fn();
    coordinator = new SwarmCoordinator(deliveryCallback, 30_000);
  });

  afterEach(() => {
    coordinator.dispose();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("registerSwarm", () => {
    it("creates a new swarm with given ID", () => {
      coordinator.registerSwarm("test-swarm", ["agent1", "agent2"], "Test Swarm");
      
      expect(coordinator.listSwarms().map(s => s.swarmId)).toContain("test-swarm");
      expect(coordinator.getSwarmMembers("test-swarm").map(s => s.agentId)).toEqual(["agent1", "agent2"]);
    });

    it("returns the swarm ID", () => {
      const swarmId = coordinator.registerSwarm("test-swarm");
      expect(swarmId).toBe("test-swarm");
    });

    it("adds new members to existing swarm", () => {
      coordinator.registerSwarm("test-swarm", ["agent1"]);
      coordinator.registerSwarm("test-swarm", ["agent2"]);
      
      expect(coordinator.getSwarmMembers("test-swarm").map(s => s.agentId)).toEqual(["agent1", "agent2"]);
    });

    it("handles empty initial members", () => {
      coordinator.registerSwarm("test-swarm");
      expect(coordinator.getSwarmMembers("test-swarm")).toEqual([]);
    });
  });

  describe("addAgentToSwarm", () => {
    it("adds agent to existing swarm", () => {
      coordinator.registerSwarm("test-swarm", ["agent1"]);
      const result = coordinator.addAgentToSwarm("test-swarm", "agent2");
      
      expect(result).toBe(true);
      expect(coordinator.getSwarmMembers("test-swarm").map(s => s.agentId)).toEqual(["agent1", "agent2"]);
    });

    it("creates swarm on the fly if it doesn't exist", () => {
      const result = coordinator.addAgentToSwarm("new-swarm", "agent1", "New Swarm");
      
      expect(result).toBe(true);
      expect(coordinator.listSwarms().map(s => s.swarmId)).toContain("new-swarm");
      expect(coordinator.getSwarmMembers("new-swarm").map(s => s.agentId)).toEqual(["agent1"]);
    });

    it("returns false if swarm is already delivered", () => {
      coordinator.registerSwarm("test-swarm", ["agent1"]);
      // Mark swarm as delivered via internal state
      (coordinator as any).swarms.get("test-swarm").delivered = true;

      const result = coordinator.addAgentToSwarm("test-swarm", "agent2");
      expect(result).toBe(false);
    });
  });

  describe("removeAgentFromSwarm", () => {
    it("removes agent from swarm", () => {
      coordinator.registerSwarm("test-swarm", ["agent1", "agent2"]);
      const result = coordinator.removeAgentFromSwarm("agent1");
      
      expect(result).toBe(true);
      expect(coordinator.getSwarmMembers("test-swarm").map(s => s.agentId)).toEqual(["agent2"]);
    });

    it("returns false if agent not in any swarm", () => {
      const result = coordinator.removeAgentFromSwarm("nonexistent");
      expect(result).toBe(false);
    });

    it("cleans up empty swarm", () => {
      coordinator.registerSwarm("test-swarm", ["agent1"]);
      coordinator.removeAgentFromSwarm("agent1");
      
      expect(coordinator.listSwarms().map(s => s.swarmId)).not.toContain("test-swarm");
    });
  });

  describe("createSwarm", () => {
    it("creates swarm with auto-generated ID from name", () => {
      const swarmId = coordinator.createSwarm("Auto Swarm");
      
      expect(swarmId).toMatch(/^swarm-/);
      expect(coordinator.listSwarms().map(s => s.swarmId)).toContain(swarmId);
      expect(coordinator.getSwarmMembers(swarmId)).toEqual([]);
    });

    it("uses default name if none provided", () => {
      const swarmId1 = coordinator.createSwarm();
      const swarmId2 = coordinator.createSwarm();
      
      expect(coordinator.listSwarms().map(s => s.swarmId)).toContain(swarmId1);
      expect(coordinator.listSwarms().map(s => s.swarmId)).toContain(swarmId2);
    });
  });

  describe("onAgentComplete", () => {
    it("returns 'pass' for agent not in any swarm", () => {
      const record: AgentRecord = {
        id: "agent1",
        type: "general-purpose",
        description: "test",
        status: "completed",
        toolUses: 0,
        spawnedAt: Date.now(),
        startedAt: Date.now(),
        completedAt: Date.now(),
        lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
        compactionCount: 0,
        currentLevel: 0,
        totalSpawned: 0,
      };
      
      const result = coordinator.onAgentComplete(record);
      expect(result).toBe("pass");
      expect(deliveryCallback).not.toHaveBeenCalled();
    });

    it("delivers single completion immediately for swarm members", () => {
      coordinator.registerSwarm("test-swarm", ["agent1"]);
      const record: AgentRecord = {
        id: "agent1",
        type: "general-purpose",
        description: "test",
        status: "completed",
        toolUses: 0,
        spawnedAt: Date.now(),
        startedAt: Date.now(),
        completedAt: Date.now(),
        lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
        compactionCount: 0,
        currentLevel: 0,
        totalSpawned: 0,
        swarmId: "test-swarm",
      };
      
      const result = coordinator.onAgentComplete(record);
      expect(result).toBe("delivered");
      expect(deliveryCallback).toHaveBeenCalledWith([record], false, "test-swarm", expect.any(Object));
    });

    it("returns 'pass' for agent in delivered swarm", () => {
      coordinator.registerSwarm("test-swarm", ["agent1"]);
      const record: AgentRecord = {
        id: "agent1",
        type: "general-purpose",
        description: "test",
        status: "completed",
        toolUses: 0,
        spawnedAt: Date.now(),
        startedAt: Date.now(),
        completedAt: Date.now(),
        lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
        compactionCount: 0,
        currentLevel: 0,
        totalSpawned: 0,
        swarmId: "test-swarm",
      };
      
      // First completion
      coordinator.onAgentComplete(record);
      
      // Manually remove agent from swarm to simulate delivered state
      coordinator.removeAgentFromSwarm("agent1");
      
      // Second completion should return 'pass' since agent is no longer in swarm
      const result = coordinator.onAgentComplete(record);
      expect(result).toBe("pass");
    });

    it("does not re-deliver the same completion on timeout", async () => {
      vi.useFakeTimers();
      coordinator = new SwarmCoordinator(deliveryCallback, 10);
      coordinator.registerSwarm("test-swarm", ["agent1"]);
      const record: AgentRecord = {
        id: "agent1",
        type: "general-purpose",
        description: "test",
        status: "completed",
        toolUses: 0,
        spawnedAt: Date.now(),
        startedAt: Date.now(),
        completedAt: Date.now(),
        lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
        compactionCount: 0,
        currentLevel: 0,
        totalSpawned: 0,
        swarmId: "test-swarm",
      };

      coordinator.onAgentComplete(record);
      expect(deliveryCallback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(20);
      expect(deliveryCallback).toHaveBeenCalledTimes(1);
    });

    it("removes completed members from reverse mapping after timeout", async () => {
      vi.useFakeTimers();
      coordinator = new SwarmCoordinator(deliveryCallback, 10);
      coordinator.registerSwarm("test-swarm", ["agent1", "agent2"]);
      const record: AgentRecord = {
        id: "agent1",
        type: "general-purpose",
        description: "test",
        status: "completed",
        toolUses: 0,
        spawnedAt: Date.now(),
        startedAt: Date.now(),
        completedAt: Date.now(),
        lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
        compactionCount: 0,
        currentLevel: 0,
        totalSpawned: 0,
        swarmId: "test-swarm",
      };

      coordinator.onAgentComplete(record);
      await vi.advanceTimersByTimeAsync(20);

      expect(coordinator.getSwarmMembers("test-swarm").map(s => s.agentId)).toEqual(["agent2"]);
      expect(coordinator.getSwarmIdForAgent("agent1")).toBeUndefined();
      expect(coordinator.getSwarmIdForAgent("agent2")).toBe("test-swarm");
    });
  });

  describe("query APIs", () => {
    beforeEach(() => {
      coordinator.registerSwarm("swarm1", ["agent1", "agent2"]);
      coordinator.registerSwarm("swarm2", ["agent3"]);
    });

    it("listSwarms returns all swarm IDs", () => {
      const swarms = coordinator.listSwarms();
      expect(swarms.map(s => s.swarmId)).toContain("swarm1");
      expect(swarms.map(s => s.swarmId)).toContain("swarm2");
      expect(swarms.length).toBe(2);
    });

    it("getSwarmMembers returns agents for specific swarm", () => {
      const members = coordinator.getSwarmMembers("swarm1");
      expect(members.map(s => s.agentId)).toEqual(["agent1", "agent2"]);
    });

    it("getSwarmMembers returns empty array for nonexistent swarm", () => {
      const members = coordinator.getSwarmMembers("nonexistent");
      expect(members).toEqual([]);
    });

    it("isSwarmMember checks membership correctly", () => {
      expect(coordinator.isSwarmMember("agent1")).toBe(true);
      expect(coordinator.isSwarmMember("agent3")).toBe(true);
      expect(coordinator.isSwarmMember("nonexistent")).toBe(false);
    });

    it("getSwarmIdForAgent returns correct swarm ID", () => {
      expect(coordinator.getSwarmIdForAgent("agent1")).toBe("swarm1");
      expect(coordinator.getSwarmIdForAgent("agent3")).toBe("swarm2");
      expect(coordinator.getSwarmIdForAgent("nonexistent")).toBeUndefined();
    });
  });

  describe("straggler behavior", () => {
    const makeRecord = (id: string, swarmId: string): AgentRecord => ({
      id,
      type: "general-purpose",
      description: "test",
      status: "completed",
      toolUses: 0,
      spawnedAt: Date.now(),
      startedAt: Date.now(),
      completedAt: Date.now(),
      lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
      compactionCount: 0,
      currentLevel: 0,
      totalSpawned: 0,
      swarmId,
    });

    it("delivers partial results on main timeout after first completion", async () => {
      vi.useFakeTimers();
      coordinator = new SwarmCoordinator(deliveryCallback, 30_000);
      // Use "batch" strategy so completions are held until timeout/all-done
      coordinator.createSwarm({ swarmId: "test-swarm", strategy: "batch" });
      coordinator.addAgentToSwarm("test-swarm", "agent1");
      coordinator.addAgentToSwarm("test-swarm", "agent2");
      coordinator.addAgentToSwarm("test-swarm", "agent3");

      const r1 = makeRecord("agent1", "test-swarm");
      expect(coordinator.onAgentComplete(r1)).toBe("held");
      expect(deliveryCallback).not.toHaveBeenCalled();

      // Advance past main timeout (30s)
      await vi.advanceTimersByTimeAsync(30_000);

      // Should deliver partial results with timedOut flag
      expect(deliveryCallback).toHaveBeenCalledTimes(1);
      const callArgs = deliveryCallback.mock.calls[0];
      expect(callArgs[1]).toBe(true); // partial
      expect(callArgs[2]).toBe("test-swarm");
      expect(callArgs[3].timedOut).toBe(true);
      expect(callArgs[3].quorumMet).toBe(false);

      // Completed agent should be cleaned from reverse mapping
      expect(coordinator.getSwarmIdForAgent("agent1")).toBeUndefined();
      // Remaining agents should still be in swarm
      expect(coordinator.getSwarmIdForAgent("agent2")).toBe("test-swarm");
      expect(coordinator.getSwarmIdForAgent("agent3")).toBe("test-swarm");
    });

    it("uses shorter straggler timeout after first timeout wave", async () => {
      vi.useFakeTimers();
      coordinator = new SwarmCoordinator(deliveryCallback, 30_000);
      // Use "batch" strategy — completions held until timeout/all-done
      coordinator.createSwarm({ swarmId: "test-swarm", strategy: "batch" });
      coordinator.addAgentToSwarm("test-swarm", "agent1");
      coordinator.addAgentToSwarm("test-swarm", "agent2");
      coordinator.addAgentToSwarm("test-swarm", "agent3");

      // First agent completes → starts main 30s timeout
      coordinator.onAgentComplete(makeRecord("agent1", "test-swarm"));
      await vi.advanceTimersByTimeAsync(30_000);
      // Main timeout fires → partial delivery, swarm now isStraggler

      deliveryCallback.mockClear();

      // Straggler agent completes → starts straggler timeout (15s)
      const r2 = makeRecord("agent2", "test-swarm");
      expect(coordinator.onAgentComplete(r2)).toBe("held");
      expect(deliveryCallback).not.toHaveBeenCalled();

      // Advance past straggler timeout (15s) but NOT full main timeout
      await vi.advanceTimersByTimeAsync(15_000);

      // Should deliver straggler partial
      expect(deliveryCallback).toHaveBeenCalledTimes(1);
      const callArgs = deliveryCallback.mock.calls[0];
      expect(callArgs[1]).toBe(true); // partial
      expect(callArgs[3].timedOut).toBe(true);

      deliveryCallback.mockClear();

      // Final straggler completes immediately (only one left)
      const r3 = makeRecord("agent3", "test-swarm");
      expect(coordinator.onAgentComplete(r3)).toBe("delivered");
      expect(deliveryCallback).toHaveBeenCalledTimes(1);
      expect(deliveryCallback.mock.calls[0][1]).toBe(false); // not partial - all done
    });

    it("does not double-deliver if all agents complete before timeout", async () => {
      vi.useFakeTimers();
      coordinator = new SwarmCoordinator(deliveryCallback, 30_000);
      // Use "batch" strategy — timeout-based delivery only
      coordinator.createSwarm({ swarmId: "test-swarm", strategy: "batch" });
      coordinator.addAgentToSwarm("test-swarm", "agent1");
      coordinator.addAgentToSwarm("test-swarm", "agent2");

      coordinator.onAgentComplete(makeRecord("agent1", "test-swarm"));
      coordinator.onAgentComplete(makeRecord("agent2", "test-swarm"));

      expect(deliveryCallback).toHaveBeenCalledTimes(1);

      // Timeout should not cause re-delivery
      await vi.advanceTimersByTimeAsync(30_000);
      expect(deliveryCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispose", () => {
    it("clears all swarms and mappings", () => {
      coordinator.registerSwarm("swarm1", ["agent1"]);
      coordinator.registerSwarm("swarm2", ["agent2"]);
      
      coordinator.dispose();
      
      expect(coordinator.listSwarms()).toEqual([]);
      expect(coordinator.getSwarmMembers("swarm1")).toEqual([]);
      expect(coordinator.isSwarmMember("agent1")).toBe(false);
    });

    it("clears timeout handles", () => {
      coordinator.registerSwarm("swarm1", ["agent1"]);
      const record: AgentRecord = {
        id: "agent1",
        type: "general-purpose",
        description: "test",
        status: "completed",
        toolUses: 0,
        spawnedAt: Date.now(),
        startedAt: Date.now(),
        completedAt: Date.now(),
        lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
        compactionCount: 0,
        currentLevel: 0,
        totalSpawned: 0,
        swarmId: "swarm1",
      };
      
      coordinator.onAgentComplete(record);
      coordinator.dispose();
      
      // Should not throw or cause issues with pending timeouts
      expect(coordinator.listSwarms()).toEqual([]);
    });
  });
});

describe("Singleton access", () => {
  afterEach(() => {
    setActiveSwarmCoordinator(null);
    vi.restoreAllMocks();
  });

  it("setActiveSwarmCoordinator and getSwarmCoordinator work together", () => {
    const deliveryCallback = vi.fn();
    const coordinator = new SwarmCoordinator(deliveryCallback);
    
    setActiveSwarmCoordinator(coordinator);
    const retrieved = getSwarmCoordinator();
    
    expect(retrieved).toBe(coordinator);
  });

  it("getSwarmCoordinator returns null when none set", () => {
    const retrieved = getSwarmCoordinator();
    expect(retrieved).toBeNull();
  });
});

describe("uiCreateOrJoinSwarm", () => {
  afterEach(() => {
    setActiveSwarmCoordinator(null);
    vi.restoreAllMocks();
  });

  it("creates swarm from UI layer", () => {
    const deliveryCallback = vi.fn();
    const coordinator = new SwarmCoordinator(deliveryCallback);
    setActiveSwarmCoordinator(coordinator);
    
    const swarmId = uiCreateOrJoinSwarm(["agent1", "agent2"], "UI Swarm");
    
    expect(swarmId).toBeTruthy();
    expect(coordinator.isSwarmMember("agent1")).toBe(true);
    expect(coordinator.isSwarmMember("agent2")).toBe(true);
  });

  it("returns null when no coordinator set", () => {
    const swarmId = uiCreateOrJoinSwarm(["agent1"]);
    expect(swarmId).toBeNull();
  });

  it("returns null for empty agent list", () => {
    const deliveryCallback = vi.fn();
    const coordinator = new SwarmCoordinator(deliveryCallback);
    setActiveSwarmCoordinator(coordinator);
    
    const swarmId = uiCreateOrJoinSwarm([]);
    expect(swarmId).toBeNull();
  });
});
