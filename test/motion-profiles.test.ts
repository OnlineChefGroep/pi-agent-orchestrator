import { afterEach, describe, expect, it } from "vitest";
import {
  getAgentSpinnerFrame,
  getAnimationProfile,
  getSpinnerStyleForAgent,
  getTimeSpinnerFrameForRole,
  isReducedMotion,
  SPINNER_PACKS,
  setSpinnerStyle,
} from "../src/ui/animation.js";

afterEach(() => setSpinnerStyle("orchestrator"));

describe("motion profiles", () => {
  it("selects deterministic styles from the orchestrator pack", () => {
    setSpinnerStyle("orchestrator");
    const style = getSpinnerStyleForAgent("alpha");
    expect(SPINNER_PACKS.orchestrator).toContain(style);
    expect(getSpinnerStyleForAgent("alpha")).toBe(style);
  });

  it("switches the semantic role language with the selected pack", () => {
    setSpinnerStyle("signals");
    expect(getSpinnerStyleForAgent("header", "header")).toBe("signal");
    expect(getSpinnerStyleForAgent("queue", "queue")).toBe("scanline");
    expect(getSpinnerStyleForAgent("scheduler", "scheduler")).toBe("radar");

    setSpinnerStyle("minimal");
    expect(getSpinnerStyleForAgent("swarm", "swarm")).toBe("squareSpin");
    expect(getSpinnerStyleForAgent("handoff", "handoff")).toBe("pipe");
  });

  it("freezes semantic frames in reduced-motion mode", () => {
    setSpinnerStyle("reduced");
    expect(isReducedMotion()).toBe(true);
    expect(getAgentSpinnerFrame("alpha", 0)).toBe(getAgentSpinnerFrame("alpha", 500));
    expect(getTimeSpinnerFrameForRole("scheduler", "nightly", 0)).toBe(
      getTimeSpinnerFrameForRole("scheduler", "nightly", 100_000),
    );
  });

  it("removes motion glyphs in none mode", () => {
    setSpinnerStyle("none");
    expect(getAgentSpinnerFrame("alpha", 10)).toBe("");
    expect(getTimeSpinnerFrameForRole("handoff", "result", 10_000)).toBe("");
  });

  it("keeps legacy direct-spinner profiles compatible", () => {
    setSpinnerStyle("lines");
    expect(getAnimationProfile()).toBe("lines");
    expect(getSpinnerStyleForAgent("alpha")).toBe("lines");
  });
});
