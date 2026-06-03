import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";

describe("showAgentDetail Benchmark", () => {
  it("measures the execution time of sync vs async file I/O", async () => {
    const tempDir = tmpdir();
    // Use a random identifier to prevent concurrent test collisions
    const uniqueId = Math.random().toString(36).substring(7);
    const tempFilePath = join(tempDir, `dummy-agent-${uniqueId}.md`);
    writeFileSync(tempFilePath, "Dummy Content");

    const iterations = 1000;

    // Sync baseline
    const startSync = performance.now();
    for (let i = 0; i < iterations; i++) {
       const content = readFileSync(tempFilePath, "utf-8");
       const edited = `${content} edited`;
       writeFileSync(tempFilePath, edited, "utf-8");
    }
    const endSync = performance.now();
    const syncTime = endSync - startSync;

    // Async baseline
    const startAsync = performance.now();
    for (let i = 0; i < iterations; i++) {
       const content = await readFile(tempFilePath, "utf-8");
       const edited = `${content} edited`;
       await writeFile(tempFilePath, edited, "utf-8");
    }
    const endAsync = performance.now();
    const asyncTime = endAsync - startAsync;

    console.log(`Sync time: ${syncTime.toFixed(2)} ms`);
    console.log(`Async time: ${asyncTime.toFixed(2)} ms`);
    console.log(`Improvement: ${(((syncTime - asyncTime) / syncTime) * 100).toFixed(2)}%`);

    unlinkSync(tempFilePath);
  });
});
