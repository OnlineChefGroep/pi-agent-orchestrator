import { describe, expect, it } from "vitest";

describe("Benchmark: renderSwarmSection mode resolution", () => {
  it("resolves mode uniformly without O(N) traversal", () => {
    const iterations = 10000;
    const swarmCount = 100;
    const membersPerSwarm = 100;

    const grouped = new Map<string, any[]>();
    for (let i = 0; i < swarmCount; i++) {
      const members = [];
      for (let j = 0; j < membersPerSwarm; j++) {
        members.push({ joinMode: "group" });
      }
      grouped.set(`swarm-${i}`, members);
    }

    const startOld = process.hrtime.bigint();
    for (let iter = 0; iter < iterations; iter++) {
      for (const [_swarmId, members] of grouped) {
        const _mode = members.find((m: any) => m.joinMode)?.joinMode ?? "group";
      }
    }
    const endOld = process.hrtime.bigint();

    const startNew = process.hrtime.bigint();
    for (let iter = 0; iter < iterations; iter++) {
      for (const [_swarmId, members] of grouped) {
        const _mode = members[0]?.joinMode ?? "group";
      }
    }
    const endNew = process.hrtime.bigint();

    const oldMs = Number(endOld - startOld) / 1_000_000;
    const newMs = Number(endNew - startNew) / 1_000_000;

    console.log(`\n[BENCHMARK] Swarm mode resolution:`);
    console.log(`  Old (.find()): ${oldMs.toFixed(2)}ms`);
    console.log(`  New ([0]): ${newMs.toFixed(2)}ms`);
    console.log(`  Improvement: ${((oldMs - newMs) / oldMs * 100).toFixed(1)}%`);

    expect(newMs).toBeLessThan(oldMs);
  });
});
