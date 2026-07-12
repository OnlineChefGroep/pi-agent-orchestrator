import { afterEach, describe, expect, it } from "vitest";
import {
  getDashboardRefreshInterval,
  getOrchestrationMode,
  setDashboardRefreshInterval,
  setOrchestrationMode,
} from "../src/agent-registry.js";

describe("agent-registry orchestration mode", () => {
  afterEach(() => {
    setOrchestrationMode("single");
  });

  it("has default orchestration mode", async () => {
    expect(getOrchestrationMode()).toBe("single");
  });

  it("can set orchestration mode", async () => {
    setOrchestrationMode("swarm");
    expect(getOrchestrationMode()).toBe("swarm");

    setOrchestrationMode("crew");
    expect(getOrchestrationMode()).toBe("crew");
  });

  it("supports all orchestration modes", async () => {
    const modes = ["auto", "single", "swarm", "crew"] as const;

    for (const mode of modes) {
      setOrchestrationMode(mode);
      expect(getOrchestrationMode()).toBe(mode);
    }
  });
});

describe("agent-registry dashboard refresh interval", () => {
  afterEach(() => {
    setDashboardRefreshInterval(750);
  });

  it("has default refresh interval", async () => {
    expect(getDashboardRefreshInterval()).toBe(750);
  });

  it("can set refresh interval", async () => {
    setDashboardRefreshInterval(500);
    expect(getDashboardRefreshInterval()).toBe(500);

    setDashboardRefreshInterval(1000);
    expect(getDashboardRefreshInterval()).toBe(1000);
  });

  it("allows setting low refresh intervals", async () => {
    setDashboardRefreshInterval(100);
    expect(getDashboardRefreshInterval()).toBe(100);

    setDashboardRefreshInterval(200);
    expect(getDashboardRefreshInterval()).toBe(200);
  });

  it("allows high refresh intervals", async () => {
    setDashboardRefreshInterval(5000);
    expect(getDashboardRefreshInterval()).toBe(5000);

    setDashboardRefreshInterval(10000);
    expect(getDashboardRefreshInterval()).toBe(10000);
  });
});