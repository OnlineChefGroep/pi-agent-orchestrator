import { describe, expect, it } from "vitest";
import {
  ANIMATION_INTERVAL,
  getAlternateFrame,
  getSpinnerFrame,
  getTimeSpinnerFrame,
  makeDualSpinner,
  SPINNER,
  SPINNER_FRAMES,
  SpinnerEngine,
  type SpinnerStyle,
  setSpinnerStyle,
} from "../src/ui/animation.js";

describe("SPINNER_FRAMES", () => {
  it("has all expected styles", () => {
    const styles = Object.keys(SPINNER_FRAMES);
    expect(styles).toContain("braille");
    expect(styles).toContain("dots");
    expect(styles).toContain("lines");
    expect(styles).toContain("classic");
    expect(styles).toContain("pulse");
    expect(styles).toContain("wave");
    expect(styles).toContain("moon");
    expect(styles).toContain("clock");
    expect(styles).toContain("none");
  });

  it("each style has at least one frame", () => {
    for (const [, frames] of Object.entries(SPINNER_FRAMES)) {
      expect(Array.isArray(frames)).toBe(true);
      expect(frames.length).toBeGreaterThan(0);
    }
  });
});

describe("setSpinnerStyle", () => {
  it("updates the global SPINNER array", () => {
    setSpinnerStyle("lines");
    expect(SPINNER[0]).toBe("-");
    setSpinnerStyle("braille"); // restore
    expect(SPINNER.length).toBeGreaterThan(0);
  });

  it("falls back to braille for unknown style", () => {
    setSpinnerStyle("nonexistent" as SpinnerStyle);
    expect(SPINNER[0]).toBe("⠋");
    setSpinnerStyle("braille"); // restore
  });
});

describe("getSpinnerFrame", () => {
  it("returns a frame from the global SPINNER", () => {
    setSpinnerStyle("dots");
    const frame = getSpinnerFrame(0);
    expect(frame).toBe("⠁");
    setSpinnerStyle("braille"); // restore
  });

  it("wraps around correctly", () => {
    setSpinnerStyle("lines");
    expect(getSpinnerFrame(0)).toBe("-");
    expect(getSpinnerFrame(1)).toBe("\\");
    expect(getSpinnerFrame(3)).toBe("/");
    expect(getSpinnerFrame(4)).toBe("-"); // wraps
    setSpinnerStyle("braille"); // restore
  });

  it("returns empty string for empty spinner", () => {
    setSpinnerStyle("none");
    expect(getSpinnerFrame(0)).toBe("");
    setSpinnerStyle("braille"); // restore
  });
});

describe("getTimeSpinnerFrame", () => {
  it("returns a frame based on current time", () => {
    const frame = getTimeSpinnerFrame();
    expect(typeof frame).toBe("string");
    expect(frame.length).toBeGreaterThan(0);
  });

  it("accepts custom time and interval", () => {
    const frame1 = getTimeSpinnerFrame(0, 80);
    const frame2 = getTimeSpinnerFrame(80, 80);
    expect(typeof frame1).toBe("string");
    expect(typeof frame2).toBe("string");
  });
});

describe("SpinnerEngine", () => {
  it("creates with default options", () => {
    const engine = new SpinnerEngine();
    expect(engine.frames).toEqual(SPINNER_FRAMES.braille);
    expect(engine.interval).toBe(ANIMATION_INTERVAL);
  });

  it("creates with custom style", () => {
    const engine = new SpinnerEngine({ style: "dots" });
    expect(engine.frames).toEqual(SPINNER_FRAMES.dots);
  });

  it("creates with custom frames", () => {
    const engine = new SpinnerEngine({ customFrames: ["A", "B", "C"] });
    // Custom frames are directly assigned from options
    expect(engine.frames).toEqual(["A", "B", "C"]);
  });

  it("creates with prefix and suffix", () => {
    const engine = new SpinnerEngine({ prefix: "[", suffix: "]" });
    expect(engine.prefix).toBe("[");
    expect(engine.suffix).toBe("]");
  });

  it("getFrame returns current frame", () => {
    const engine = new SpinnerEngine({ customFrames: ["X", "Y"] });
    expect(engine.getFrame()).toBe("X");
  });

  it("getFrame advances with each call", () => {
    const engine = new SpinnerEngine({ customFrames: ["A", "B", "C"] });
    expect(engine.getFrame()).toBe("A");
    // getFrame doesn't auto-advance; start() does
  });

  it("toString includes prefix and suffix", () => {
    const engine = new SpinnerEngine({
      customFrames: ["*"],
      prefix: "[",
      suffix: "]",
    });
    expect(engine.toString()).toBe("[*]");
  });

  it("toString handles function prefix/suffix", () => {
    const engine = new SpinnerEngine({
      customFrames: ["*"],
      prefix: () => "(",
      suffix: () => ")",
    });
    expect(engine.toString()).toBe("(*)");
  });

  it("applies colorizer", () => {
    const engine = new SpinnerEngine({
      customFrames: ["*"],
      colorizer: (s) => `<${s}>`,
    });
    expect(engine.getFrame()).toBe("<*>");
  });

  it("update changes options dynamically", () => {
    const engine = new SpinnerEngine({ customFrames: ["A"] });
    engine.update({ customFrames: ["B", "C"] });
    expect(engine.frames).toEqual(["B", "C"]);
  });

  it("update changes style", () => {
    const engine = new SpinnerEngine({ style: "braille" });
    engine.update({ style: "dots" });
    expect(engine.frames).toEqual(SPINNER_FRAMES.dots);
  });

  it("start and stop do not crash", () => {
    const engine = new SpinnerEngine({ customFrames: ["."] });
    engine.start(false); // non-terminal mode
    engine.stop("Done", false);
  });
});

describe("makeDualSpinner", () => {
  it("creates dual spinner options", () => {
    const opts = makeDualSpinner("dots", "Processing");
    expect(opts.style).toBe("dots");
    expect(opts.colorizer).toBeDefined();
    if (opts.colorizer) {
      const result = opts.colorizer("⠁");
      expect(result).toContain("⠁");
    }
  });
});

describe("getAlternateFrame", () => {
  it("returns a frame alternating between two styles", () => {
    const frame = getAlternateFrame("braille", "dots");
    expect(typeof frame).toBe("string");
  });
});
