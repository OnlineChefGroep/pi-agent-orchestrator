import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SubagentScheduler } from "../src/schedule.js";
import { ScheduleStore } from "../src/schedule-store.js";

describe("CVE-005: Array bypass and limits", () => {
  let tmp: string;
  let scheduler: SubagentScheduler;
  let store: ScheduleStore;
  let pi: any;
  let ctx: any;
  let manager: any;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "cve005-"));
    store = new ScheduleStore(join(tmp, "store.json"));
    scheduler = new SubagentScheduler();
    pi = { events: { emit: () => {} } };
    ctx = { modelRegistry: {} };
    manager = { spawn: () => "agent-123", getRecord: () => ({ status: "completed" }) };
    await scheduler.start(pi, ctx, manager, store);
  });

  afterEach(() => {
    scheduler.stop();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("prevents array bypass on prompt", async () => {
    const job = await scheduler.addJob({
      name: "test-job",
      description: "initial",
      schedule: "+10s",
      subagent_type: "general-purpose",
      prompt: "short prompt",
    });

    const maliciousPrompt = new Array(10).fill("A".repeat(100000)) as any;
    // Length is 10, so it bypasses length > 50000 check if typeof is not checked

    await expect(
      scheduler.updateJob(job.id, { prompt: maliciousPrompt })
    ).rejects.toThrow(/Prompt must be a string <= 50000 characters|Prompt is required and must be a string <= 50000 characters/);
  });
});
