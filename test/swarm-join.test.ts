import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRecord } from "../src/types.js";

// Mock logger
vi.mock("../src/logger.js", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { SwarmCoordinator, setActiveSwarmCoordinator, getSwarmCoordinator, uiCreateSwarm, uiJoinSwarm, uiCreateOrJoinSwarm } = await import("../src/swarm-join.js");

function makeRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: "agent-1",
    type: "Explore",
    status: "completed",
    description: "Done",
    spawnedAt: Date.now(),
    startedAt: Date.now() - 1000,
    completedAt: Date.now(),
    swarmId: undefined,
    handoff: undefined,
    invocation: undefined,
    compactionCount: 0,
    toolUses: 0,
    lifetimeUsage: { input: 100, output: 50, cacheWrite: 0 },
    ...overrides,
  } as AgentRecord;
}

describe("SwarmCoordinator", () => {
  let deliverCb: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    deliverCb = vi.fn();
    setActiveSwarmCoordinator(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("createSwarm", () => {
    it("creates a swarm with a generated ID", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const id = sc.createSwarm("Test Swarm");
      expect(id).toBeTruthy();
      expect(id).toContain("swarm-");
    });

    it("returns a valid swarm id from string name", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const id = sc.createSwarm("My Swarm");
      expect(typeof id).toBe("string");
      const swarms = sc.listSwarms();
      expect(swarms.length).toBe(1);
      expect(swarms[0].name).toBe("My Swarm");
    });

    it("creates swarm with full config", () => {
      const onStateChange = vi.fn();
      const sc = new SwarmCoordinator(deliverCb);
      const id = sc.createSwarm({
        name: "Config Swarm",
        strategy: "quorum",
        enableLeader: true,
        quorumMin: 2,
        onStateChange,
      });
      expect(id).toBeTruthy();

      const swarms = sc.listSwarms();
      expect(swarms[0].strategy).toBe("quorum");
    });

    it("emits swarm:created event", () => {
      const onStateChange = vi.fn();
      const sc = new SwarmCoordinator(deliverCb);
      sc.createSwarm({ name: "Event Swarm", onStateChange });

      expect(onStateChange).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ type: "swarm:created" }),
      );
    });
  });

  describe("addAgentToSwarm", () => {
    it("adds an agent to an existing swarm", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const swarmId = sc.createSwarm("Swarm");
      const result = sc.addAgentToSwarm(swarmId, "agent-1");
      expect(result).toBe(true);
      expect(sc.isSwarmMember("agent-1")).toBe(true);
    });

    it("auto-creates swarm if it does not exist", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const result = sc.addAgentToSwarm("new-swarm", "agent-1");
      expect(result).toBe(true);
      expect(sc.listSwarms().length).toBe(1);
    });

    it("prevents adding to delivered swarm", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const swarmId = sc.createSwarm("Swarm");
      sc.addAgentToSwarm(swarmId, "agent-1");
      sc.onAgentComplete(makeRecord({ id: "agent-1" }));
      // Mark as delivered by completing all agents
      const result = sc.addAgentToSwarm(swarmId, "agent-2");
      expect(result).toBe(false); // Can't join delivered swarm
    });

    it("removes agent from previous swarm when switching", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const swarm1 = sc.createSwarm("Swarm 1");
      const swarm2 = sc.createSwarm("Swarm 2");
      sc.addAgentToSwarm(swarm1, "agent-1");
      sc.addAgentToSwarm(swarm2, "agent-1");

      expect(sc.isSwarmMember("agent-1")).toBe(true);
      expect(sc.getSwarmIdForAgent("agent-1")).toBe(swarm2);
    });

    it("emits agent:joined event", () => {
      const onStateChange = vi.fn();
      const sc = new SwarmCoordinator(deliverCb);
      const swarmId = sc.createSwarm({ name: "Swarm", onStateChange });
      // Clear the swarm:created event
      onStateChange.mockClear();
      sc.addAgentToSwarm(swarmId, "agent-1");

      expect(onStateChange).toHaveBeenCalledWith(
        swarmId,
        expect.objectContaining({ type: "agent:joined", agentId: "agent-1" }),
      );
    });
  });

  describe("removeAgentFromSwarm", () => {
    it("removes an agent from its swarm", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const swarmId = sc.createSwarm("Swarm");
      sc.addAgentToSwarm(swarmId, "agent-1");

      expect(sc.removeAgentFromSwarm("agent-1")).toBe(true);
      expect(sc.isSwarmMember("agent-1")).toBe(false);
    });

    it("returns false for agent not in any swarm", () => {
      const sc = new SwarmCoordinator(deliverCb);
      expect(sc.removeAgentFromSwarm("agent-1")).toBe(false);
    });

    it("auto-cleans up empty swarm", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const swarmId = sc.createSwarm({ name: "Swarm", autoCleanup: true });
      sc.addAgentToSwarm(swarmId, "agent-1");
      sc.removeAgentFromSwarm("agent-1");

      expect(sc.listSwarms().length).toBe(0);
    });
  });

  describe("onAgentComplete", () => {
    it("returns pass for agent not in swarm", () => {
      const sc = new SwarmCoordinator(deliverCb);
      expect(sc.onAgentComplete(makeRecord({ id: "a1" }))).toBe("pass");
    });

    it("returns held when swarm not yet complete with batch strategy", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const swarmId = sc.createSwarm({ name: "Swarm", strategy: "batch" });
      sc.addAgentToSwarm(swarmId, "agent-1");
      sc.addAgentToSwarm(swarmId, "agent-2");

      // With "batch" strategy, completion is held until all done
      expect(sc.onAgentComplete(makeRecord({ id: "agent-1" }))).toBe("held");
    });

    it("returns delivered when all agents complete", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const swarmId = sc.createSwarm("Swarm");
      sc.addAgentToSwarm(swarmId, "agent-1");

      expect(sc.onAgentComplete(makeRecord({ id: "agent-1" }))).toBe("delivered");
    });

    it("ignores duplicate completions", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const swarmId = sc.createSwarm("Swarm");
      sc.addAgentToSwarm(swarmId, "agent-1");
      sc.addAgentToSwarm(swarmId, "agent-2");

      sc.onAgentComplete(makeRecord({ id: "agent-1" }));
      expect(sc.onAgentComplete(makeRecord({ id: "agent-1" }))).toBe("pass");
    });
  });

  describe("listSwarms", () => {
    it("returns info for all swarms", () => {
      const sc = new SwarmCoordinator(deliverCb);
      sc.createSwarm("Swarm 1");
      sc.createSwarm("Swarm 2");

      const swarms = sc.listSwarms();
      expect(swarms.length).toBe(2);
      expect(swarms[0].name).toBe("Swarm 1");
      expect(swarms[0].agentCount).toBe(0);
    });

    it("returns empty when no swarms", () => {
      const sc = new SwarmCoordinator(deliverCb);
      expect(sc.listSwarms()).toEqual([]);
    });
  });

  describe("getSwarmIdForAgent", () => {
    it("returns swarm id for swarm member", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const swarmId = sc.createSwarm("Swarm");
      sc.addAgentToSwarm(swarmId, "agent-1");
      expect(sc.getSwarmIdForAgent("agent-1")).toBe(swarmId);
    });

    it("returns undefined for non-member", () => {
      const sc = new SwarmCoordinator(deliverCb);
      expect(sc.getSwarmIdForAgent("agent-1")).toBeUndefined();
    });
  });

  describe("getSwarmMembers", () => {
    it("returns member states", () => {
      const sc = new SwarmCoordinator(deliverCb);
      const swarmId = sc.createSwarm("Swarm");
      sc.addAgentToSwarm(swarmId, "agent-1", 5);
      sc.addAgentToSwarm(swarmId, "agent-2", 3);

      const members = sc.getSwarmMembers(swarmId);
      expect(members.length).toBe(2);
      expect(members.find((m) => m.agentId === "agent-1")!.priority).toBe(5);
    });

    it("returns empty for unknown swarm", () => {
      const sc = new SwarmCoordinator(deliverCb);
      expect(sc.getSwarmMembers("unknown")).toEqual([]);
    });
  });

  describe("dispose", () => {
    it("clears all swarms", () => {
      const sc = new SwarmCoordinator(deliverCb);
      sc.createSwarm("Swarm");
      sc.dispose();
      expect(sc.listSwarms()).toEqual([]);
    });
  });
});

describe("singleton & UI helpers", () => {
  beforeEach(() => {
    setActiveSwarmCoordinator(null);
  });

  describe("setActiveSwarmCoordinator / getSwarmCoordinator", () => {
    it("returns the active coordinator", () => {
      const sc = new SwarmCoordinator(vi.fn());
      setActiveSwarmCoordinator(sc);
      expect(getSwarmCoordinator()).toBe(sc);
    });

    it("returns null when none set", () => {
      expect(getSwarmCoordinator()).toBeNull();
    });
  });

  describe("uiCreateSwarm", () => {
    it("returns null when no active coordinator", () => {
      const result = uiCreateSwarm(["a1", "a2"]);
      expect(result).toBeNull();
    });

    it("returns swarm id when coordinator is active", () => {
      const sc = new SwarmCoordinator(vi.fn());
      setActiveSwarmCoordinator(sc);

      const result = uiCreateSwarm(["a1", "a2"]);
      expect(result).toBeTruthy();
      expect(sc.isSwarmMember("a1")).toBe(true);
      expect(sc.isSwarmMember("a2")).toBe(true);
    });

    it("returns null for empty agent list", () => {
      const sc = new SwarmCoordinator(vi.fn());
      setActiveSwarmCoordinator(sc);
      expect(uiCreateSwarm([])).toBeNull();
    });
  });

  describe("uiJoinSwarm", () => {
    it("returns false when no active coordinator", () => {
      expect(uiJoinSwarm("swarm-1", "agent-1")).toBe(false);
    });
  });

  describe("uiCreateOrJoinSwarm", () => {
    it("returns null when no active coordinator", () => {
      expect(uiCreateOrJoinSwarm(["a1"])).toBeNull();
    });

    it("creates swarm and adds agents", () => {
      const sc = new SwarmCoordinator(vi.fn());
      setActiveSwarmCoordinator(sc);

      const result = uiCreateOrJoinSwarm(["a1", "a2"], "My Swarm");
      expect(result).toBeTruthy();
      expect(sc.isSwarmMember("a1")).toBe(true);
    });
  });
});
