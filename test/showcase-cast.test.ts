import {describe, expect, it} from "vitest";
import {
  encodeShowcaseMarker,
  labelShowcaseMarkers,
  parseAsciicast,
  REQUIRED_SHOWCASE_SCENES,
} from "../scripts/lib/showcase-cast.mjs";
import {
  getShowcasePlaybackRange,
  SHOWCASE_FPS,
} from "../showcase/remotion/src/showcase-timing.js";

const cast = (events: unknown[]) =>
  [
    JSON.stringify({version: 2, width: 100, height: 30, timestamp: 1_700_000_000}),
    ...events.map((event) => JSON.stringify(event)),
  ].join("\n");

const sceneMarker = (index: number) =>
  encodeShowcaseMarker(REQUIRED_SHOWCASE_SCENES[index]);

describe("real showcase asciicast parsing", () => {
  it("extracts native markers without putting them in terminal frames", async () => {
    const input = cast([
      [0.1, "m", sceneMarker(0)],
      [0.11, "o", "\u001b[2J\u001b[H\u001b[32mSkill created\u001b[0m"],
      [1.25, "m", sceneMarker(1)],
      [1.3, "o", "\u001b[2J\u001b[HSubagent running"],
      [2.5, "m", sceneMarker(2)],
      [2.55, "o", "\u001b[2J\u001b[HDashboard top"],
      [4, "m", sceneMarker(3)],
      [4.1, "o", "\u001b[2J\u001b[HHandoff complete"],
      [4.75, "o", "\r\nVerified"],
    ]);

    const parsed = await parseAsciicast(input, {
      generatedAt: "test",
      packageVersion: "1.2.3",
      source: "fixture.cast",
    });

    expect(parsed.durationSeconds).toBe(4.75);
    expect(parsed.fps).toBe(60);
    expect(parsed.scenes.map((scene) => scene.id)).toEqual(
      REQUIRED_SHOWCASE_SCENES.map((scene) => scene.id),
    );
    expect(parsed.scenes.map((scene) => [scene.startSeconds, scene.endSeconds])).toEqual([
      [0.1, 1.25],
      [1.25, 2.5],
      [2.5, 4],
      [4, 4.75],
    ]);
    expect(parsed.frames.length).toBeGreaterThanOrEqual(4);
    expect(parsed.frames.every((frame) => !frame.screen.includes("pi-showcase:"))).toBe(true);
    expect(parsed.frames.at(-1)?.screen).toContain("Handoff complete");
  });

  it("labels interactive recording markers in the required order", async () => {
    const input = cast([
      [0.1, "m", ""],
      [0.2, "o", "skill"],
      [1, "m", ""],
      [1.1, "o", "agent"],
      [2, "m", ""],
      [2.1, "o", "dashboard"],
      [3, "m", ""],
      [3.1, "o", "handoff"],
      [4, "o", "done"],
    ]);

    const labeled = labelShowcaseMarkers(input);
    expect(labelShowcaseMarkers(labeled)).toBe(labeled);
    const parsed = await parseAsciicast(labeled, {generatedAt: "test"});

    expect(parsed.scenes.map((scene) => scene.id)).toEqual([
      "skill-creation",
      "subagent-run",
      "dashboard-top",
      "handoff",
    ]);
  });

  it("rejects events that move backward in time", async () => {
    const input = cast([
      [1, "o", "later"],
      [0.5, "o", "earlier"],
    ]);

    await expect(parseAsciicast(input)).rejects.toThrow("not ordered");
  });
});

describe("showcase composition timing", () => {
  const data = {
    durationSeconds: 8.019,
    scenes: [
      {id: "skill-creation", startSeconds: 0.1, endSeconds: 1.25},
      {id: "subagent-run", startSeconds: 1.25, endSeconds: 2.5},
      {id: "dashboard-top", startSeconds: 2.5, endSeconds: 4},
      {id: "handoff", startSeconds: 4, endSeconds: 8.019},
    ],
  };

  it("derives the 60fps master duration from capture data", () => {
    expect(getShowcasePlaybackRange(data)).toEqual({
      startSeconds: 0,
      endSeconds: 482 / SHOWCASE_FPS,
      startFrame: 0,
      durationInFrames: 482,
    });
  });

  it("resolves inclusive scene clip ranges", () => {
    expect(
      getShowcasePlaybackRange(data, {
        fromScene: "subagent-run",
        toScene: "dashboard-top",
      }),
    ).toEqual({
      startSeconds: 1.25,
      endSeconds: 4,
      startFrame: 75,
      durationInFrames: 165,
    });
  });

  it("rejects reversed and missing scene ranges", () => {
    expect(() =>
      getShowcasePlaybackRange(data, {
        fromScene: "handoff",
        toScene: "skill-creation",
      }),
    ).toThrow("occurs after");
    expect(() => getShowcasePlaybackRange(data, {fromScene: "missing"})).toThrow(
      "Unknown fromScene",
    );
  });
});
