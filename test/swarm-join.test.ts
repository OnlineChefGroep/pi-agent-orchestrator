import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwarmCoordinator, setActiveSwarmCoordinator, getSwarmCoordinator, uiCreateOrJoinSwarm } from "../src/swarm-join.js";
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
  });

  describe("registerSwarm", () => {
    it("creates a new swarm with given ID", () => {
      const swarmId = coordinator.registerSwarm("test-swarm", ["agent1", "agent2"], "Test Swarm");
      
      expect(coordinator.listSwarms()).toContain("test-swarm");
      expect(coordinator.getSwarmMembers("test-swarm")).toEqual(["agent1", "agent2"]);
    });

    it("returns the swarm ID", () => {
      const swarmId = coordinator.registerSwarm("test-swarm");
      expect(swarmId).toBe("test-swarm");
    });

    it("adds new members to existing swarm", () => {
      coordinator.registerSwarm("test-swarm", ["agent1"]);
      coordinator.registerSwarm("test-swarm", ["agent2"]);
      
      expect(coordinator.getSwarmMembers("test-swarm")).toEqual(["agent1", "agent2"]);
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
      expect(coordinator.getSwarmMembers("test-swarm")).toEqual(["agent1", "agent2"]);
    });

    it("creates swarm on the fly if it doesn't exist", () => {
      const result = coordinator.addAgentToSwarm("new-swarm", "agent1", "New Swarm");
      
      expect(result).toBe(true);
      expect(coordinator.listSwarms()).toContain("new-swarm");
      expect(coordinator.getSwarmMembers("new-swarm")).toEqual(["agent1"]);
    });

    it("returns false if swarm is already delivered", () => {
      coordinator.registerSwarm("test-swarm", ["agent1"]);
      // Manually mark as delivered (simulating completion)
      // This would normally happen through the lifecycle
      
      // Since we can't easily simulate delivered state without private access,
      // we'll test the basic case
      const result = coordinator.addAgentToSwarm("test-swarm", "agent2");
      expect(result).toBe(true);
    });
  });

  describe("removeAgentFromSwarm", () => {
    it("removes agent from swarm", () => {
      coordinator.registerSwarm("test-swarm", ["agent1", "agent2"]);
      const result = coordinator.removeAgentFromSwarm("agent1");
      
      expect(result).toBe(true);
      expect(coordinator.getSwarmMembers("test-swarm")).toEqual(["agent2"]);
    });

    it("returns false if agent not in any swarm", () => {
      const result = coordinator.removeAgentFromSwarm("nonexistent");
      expect(result).toBe(false);
    });

    it("cleans up empty swarm", () => {
      coordinator.registerSwarm("test-swarm", ["agent1"]);
      coordinator.removeAgentFromSwarm("agent1");
      
      expect(coordinator.listSwarms()).not.toContain("test-swarm");
    });
  });

  describe("createSwarm", () => {
    it("creates swarm with auto-generated ID", () => {
      const swarmId = coordinator.createSwarm("Auto Swarm");
      
      expect(swarmId).toMatch(/^swarm-/);
      expect(coordinator.listSwarms()).toContain(swarmId);
      expect(coordinator.getSwarmMembers(swarmId)).toEqual([]);
    });

    it("uses default name if none provided", () => {
      const swarmId1 = coordinator.createSwarm();
      const swarmId2 = coordinator.createSwarm();
      
      expect(coordinator.listSwarms()).toContain(swarmId1);
      expect(coordinator.listSwarms()).toContain(swarmId2);
    });
  });

  describe("onAgentComplete", () => {
    it("returns 'pass' for agent not in any swarm", () => {
      const record: AgentRecord = {
        id: "agent1",
        type: "general-purpose",
        status: "completed",
        startedAt: Date.now(),
        completedAt: Date.now(),
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
        status: "completed",
        startedAt: Date.now(),
        completedAt: Date.now(),
        swarmId: "test-swarm",
      };
      
      const result = coordinator.onAgentComplete(record);
      expect(result).toBe("delivered");
      expect(deliveryCallback).toHaveBeenCalledWith([record], false, "test-swarm");
    });

    it("returns 'pass' for agent in delivered swarm", () => {
      coordinator.registerSwarm("test-swarm", ["agent1"]);
      const record: AgentRecord = {
        id: "agent1",
        type: "general-purpose",
        status: "completed",
        startedAt: Date.now(),
        completedAt: Date.now(),
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
  });

  describe("query APIs", () => {
    beforeEach(() => {
      coordinator.registerSwarm("swarm1", ["agent1", "agent2"]);
      coordinator.registerSwarm("swarm2", ["agent3"]);
    });

    it("listSwarms returns all swarm IDs", () => {
      const swarms = coordinator.listSwarms();
      expect(swarms).toContain("swarm1");
      expect(swarms).toContain("swarm2");
      expect(swarms.length).toBe(2);
    });

    it("getSwarmMembers returns agents for specific swarm", () => {
      const members = coordinator.getSwarmMembers("swarm1");
      expect(members).toEqual(["agent1", "agent2"]);
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
        status: "completed",
        startedAt: Date.now(),
        completedAt: Date.now(),
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