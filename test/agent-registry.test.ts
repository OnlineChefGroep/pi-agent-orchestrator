import { describe, expect, it } from "vitest";
import {
  getDefaultOrchestrationMode,
  setDefaultOrchestrationMode,
  getDashboardRefreshInterval,
  setDashboardRefreshInterval,
} from "../src/agent-registry.js";

describe("agent-registry orchestration mode", () => {
  it("has default orchestration mode", () => {
    expect(getDefaultOrchestrationMode()).toBe("auto");
  });

  it("can set orchestration mode", () => {
    setDefaultOrchestrationMode("swarm");
    expect(getDefaultOrchestrationMode()).toBe("swarm");
    
    setDefaultOrchestrationMode("crew");
    expect(getDefaultOrchestrationMode()).toBe("crew");
    
    // Reset to default
    setDefaultOrchestrationMode("auto");
  });

  it("supports all orchestration modes", () => {
    const modes = ["auto", "single", "swarm", "crew"] as const;
    
    for (const mode of modes) {
      setDefaultOrchestrationMode(mode);
      expect(getDefaultOrchestrationMode()).toBe(mode);
    }
    
    setDefaultOrchestrationMode("auto");
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

  it("enforces minimum refresh interval of 100ms", () => {
    setDashboardRefreshInterval(50);
    expect(getDashboardRefreshInterval()).toBe(100); // clamped to minimum
    
    setDashboardRefreshInterval(99);
    expect(getDashboardRefreshInterval()).toBe(100); // clamped to minimum
    
    setDashboardRefreshInterval(100);
    expect(getDashboardRefreshInterval()).toBe(100); // exact minimum
    
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