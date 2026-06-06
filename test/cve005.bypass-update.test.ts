import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SubagentScheduler } from "../src/schedule.js";
import { ScheduleStore } from "../src/schedule-store.js";

describe("CVE-005 Array Bypass in updateJob early checks", () => {
  let tmp: string;
  let scheduler: SubagentScheduler;
  let store: ScheduleStore;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "cve005-update-"));
    store = new ScheduleStore(join(tmp, "store.json"));
    scheduler = new SubagentScheduler();
    await scheduler.start({ events: { emit: () => {} } } as any, { modelRegistry: {} } as any, { spawn: () => "id", getRecord: () => ({status: "completed"}) } as any, store);
  });

  afterEach(() => {
    scheduler.stop();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("fails fast in updateJob if patch provides arrays to bypass .length checks", async () => {
    const job = await scheduler.addJob({
      name: "test",
      description: "desc",
      schedule: "1h",
      subagent_type: "general-purpose" as any,
      prompt: "prompt",
    });

    const maliciousPrompt = ["a".repeat(100000)] as any; // length 1 array

    // We want updateJob to fail IMMEDIATELY if it's not a string, or if it bypassed the early checks
    // Currently updateJob has:
    // if (patch.prompt !== undefined && patch.prompt.length > MAX_PROMPT_SIZE)
    // For an array of length 1, patch.prompt.length is 1. 1 is not > 50000, so it bypasses.
    // We should fix this.
    // The test asserts it fails, which it does anyway because validateScheduleInput runs later and fails.
    // But let's check if the early check catches it.

    // How to test if the early check caught it?
    // The early check throws "Prompt must be <= ... characters".
    // The validateScheduleInput check throws "Invalid schedule update: Prompt is required and must be a string..."

    await expect(scheduler.updateJob(job.id, { prompt: maliciousPrompt })).rejects.toThrow(/Prompt must be a string/);
  });
});
