import { describe, expect, it } from "vitest";
import {
  DASHBOARD_SPINNER_STYLES,
  getAgentSpinnerFrame,
  getSpinnerFrameForStyle,
  getSpinnerStyleForAgent,
  SPINNER_FRAMES,
} from "../src/ui/animation.js";

describe("dashboard spinner profiles", () => {
  it("contains a broad set of original dashboard-safe styles", () => {
    expect(DASHBOARD_SPINNER_STYLES.length).toBeGreaterThanOrEqual(10);
    expect(DASHBOARD_SPINNER_STYLES).toContain("orbit");
    expect(DASHBOARD_SPINNER_STYLES).toContain("pipeline");
    expect(DASHBOARD_SPINNER_STYLES).toContain("weave");
  });

  it("keeps agent style assignment deterministic", () => {
    expect(getSpinnerStyleForAgent("agent-123")).toBe(getSpinnerStyleForAgent("agent-123"));
  });

  it("uses semantic spinner roles", () => {
    expect(getSpinnerStyleForAgent("any", "header")).toBe("reactor");
    expect(getSpinnerStyleForAgent("any", "queue")).toBe("pipeline");
    expect(getSpinnerStyleForAgent("any", "swarm")).toBe("aperture");
  });

  it("supports negative frame indexes without returning undefined", () => {
    expect(getSpinnerFrameForStyle("orbit", -1)).toBe(SPINNER_FRAMES.orbit.at(-1));
  });

  it("phase-shifts agents so a fleet does not animate in lockstep", () => {
    const frames = new Set([
      getAgentSpinnerFrame("alpha", 0),
      getAgentSpinnerFrame("bravo", 0),
      getAgentSpinnerFrame("charlie", 0),
      getAgentSpinnerFrame("delta", 0),
    ]);
    expect(frames.size).toBeGreaterThan(1);
  });
});
