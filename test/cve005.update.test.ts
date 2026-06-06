import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SubagentScheduler } from "../src/schedule.js";
import { ScheduleStore } from "../src/schedule-store.js";

describe("CVE-005 Array Bypass in updateJob", () => {
  let tmp: string;
  let scheduler: SubagentScheduler;
  let store: ScheduleStore;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "cve005-test-"));
    store = new ScheduleStore(join(tmp, "store.json"));
    scheduler = new SubagentScheduler();
    await scheduler.start({ events: { emit: () => {} } } as any, { modelRegistry: {} } as any, { spawn: () => "id", getRecord: () => ({status: "completed"}) } as any, store);
  });

  afterEach(() => {
    scheduler.stop();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("prevents array bypass for prompt in updateJob", async () => {
    const job = await scheduler.addJob({
      name: "test",
      description: "desc",
      schedule: "1h",
      subagent_type: "general-purpose" as any,
      prompt: "prompt",
    });

    const maliciousPrompt = ["a".repeat(100000)] as any; // length 1 array, bypasses .length > 50000 check if typeof not checked

    // In current implementation, patch.prompt.length > MAX_PROMPT_SIZE is false (1 > 50000).
    // Then it merges and calls validateScheduleInput, which throws.
    // Let's verify that it throws anyway.
    await expect(scheduler.updateJob(job.id, { prompt: maliciousPrompt })).rejects.toThrow();
  });
});
