import { describe, expect, it } from "vitest";
import { SubagentScheduler } from "../src/schedule.js";

describe("SubagentScheduler Bounds Checks (CVE-005)", () => {
  const scheduler = new SubagentScheduler();

  it("prevents building a job with a prompt exceeding MAX_PROMPT_SIZE", () => {
    const input = {
      name: "test-job",
      description: "description",
      schedule: "1h",
      subagent_type: "general-purpose" as any,
      prompt: "a".repeat(50001),
    };
    expect(() => scheduler.buildJob(input)).toThrow(/Prompt is required and must be a string <= 50000 characters/);
  });

  it("prevents building a job with a name exceeding MAX_NAME_LENGTH", () => {
    const input = {
      name: "a".repeat(101),
      description: "description",
      schedule: "1h",
      subagent_type: "general-purpose" as any,
      prompt: "prompt",
    };
    expect(() => scheduler.buildJob(input)).toThrow(/Schedule name is required and must be a string <= 100 characters/);
  });

  it("prevents building a job with a description exceeding MAX_DESCRIPTION_LENGTH", () => {
    const input = {
      name: "test-job",
      description: "a".repeat(501),
      schedule: "1h",
      subagent_type: "general-purpose" as any,
      prompt: "prompt",
    };
    expect(() => scheduler.buildJob(input)).toThrow(/Description must be a string <= 500 characters/);
  });
});
