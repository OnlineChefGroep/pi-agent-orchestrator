import { describe, expect, it } from "vitest";
import {
  getDashboardRefreshInterval,
  getOrchestrationMode,
  setDashboardRefreshInterval,
  setOrchestrationMode,
} from "../src/agent-registry.js";

describe("agent-registry orchestration mode", () => {
  it("has default orchestration mode", () => {
    expect(getOrchestrationMode()).toBe("auto");
  });

  it("can set orchestration mode", () => {
    setOrchestrationMode("swarm");
    expect(getOrchestrationMode()).toBe("swarm");
    
    setOrchestrationMode("crew");
    expect(getOrchestrationMode()).toBe("crew");
    
    // Reset to default
    setOrchestrationMode("auto");
  });

  it("supports all orchestration modes", () => {
    const modes = ["auto", "single", "swarm", "crew"] as const;
    
    for (const mode of modes) {
      setOrchestrationMode(mode);
      expect(getOrchestrationMode()).toBe(mode);
    }
    
    setOrchestrationMode("auto");
  });
});

describe("agent-registry dashboard refresh interval", () => {
  it("has default refresh interval", () => {
    expect(getDashboardRefreshInterval()).toBe(750);
  });

  it("can set refresh interval", () => {
    setDashboardRefreshInterval(500);
    expect(getDashboardRefreshInterval()).toBe(500);
    
    setDashboardRefreshInterval(1000);
    expect(getDashboardRefreshInterval()).toBe(1000);
    
    // Reset to default
    setDashboardRefreshInterval(750);
  });

  it("allows setting low refresh intervals", () => {
    setDashboardRefreshInterval(100);
    expect(getDashboardRefreshInterval()).toBe(100);
    
    setDashboardRefreshInterval(200);
    expect(getDashboardRefreshInterval()).toBe(200);
    
    // Reset to default
    setDashboardRefreshInterval(750);
  });

  it("allows high refresh intervals", () => {
    setDashboardRefreshInterval(5000);
    expect(getDashboardRefreshInterval()).toBe(5000);
    
    setDashboardRefreshInterval(10000);
    expect(getDashboardRefreshInterval()).toBe(10000);
    
    // Reset to default
    setDashboardRefreshInterval(750);
  });
});