const fs = require('fs');

const content = fs.readFileSync('test/tool-result-helpers.test.ts', 'utf8');
const lines = content.split('\n');

const lastDescribeIdx = lines.findLastIndex(l => l.includes('describe("additional coverage for buildNotificationDetails"'));
if (lastDescribeIdx !== -1) {
  lines.splice(lastDescribeIdx, 0, `
  it("handles completedAt but missing startedAt in buildNotificationDetails", () => {
    const recordWithCompleted = { id: "agent-1", description: "Test", status: "completed", toolUses: 3, lifetimeUsage: { input: 100, output: 50, cacheWrite: 0 }, completedAt: 5000, startedAt: undefined };
    const details = buildNotificationDetails(recordWithCompleted as any, 200);
    expect(details.durationMs).toBe(5000);
  });
`);
}

fs.writeFileSync('test/tool-result-helpers.test.ts', lines.join('\n'));
