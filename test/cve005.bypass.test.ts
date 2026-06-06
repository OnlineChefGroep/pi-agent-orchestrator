import { describe, expect, it } from "vitest";
import { SubagentScheduler } from "../src/schedule.js";

describe("SubagentScheduler Bounds Checks Array Bypass", () => {
  const scheduler = new SubagentScheduler();

  it("prevents array bypass in buildJob", () => {
    // If we pass an array, does it get caught by the typeof checks?
    const input = {
      name: ["a".repeat(101)] as any,
      description: "description",
      schedule: "1h",
      subagent_type: "general-purpose" as any,
      prompt: "prompt",
    };
    expect(() => scheduler.buildJob(input)).toThrow(/Schedule name is required and must be a string/);
  });
});
