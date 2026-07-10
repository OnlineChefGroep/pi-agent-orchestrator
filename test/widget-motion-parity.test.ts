import { afterEach, describe, expect, it } from "vitest";
import type { AgentRecord } from "../src/types.js";
import { renderAgentWidget } from "../src/ui/agent-widget-renderer.js";
import { getAgentSpinnerFrame, setSpinnerStyle } from "../src/ui/animation.js";
import type { Theme } from "../src/ui/theme.js";

const theme: Theme = {
  fg: (_color, text) => text,
  bold: (text) => text,
};

function agent(id: string, status: AgentRecord["status"]): AgentRecord {
  return {
    id,
    type: "Explore",
    description: `task ${id}`,
    status,
    toolUses: 0,
    spawnedAt: Date.now() - 1000,
    startedAt: Date.now() - 1000,
    completedAt: status === "completed" ? Date.now() : undefined,
    lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
    compactionCount: 0,
    currentLevel: 0,
    totalSpawned: 0,
  };
}

afterEach(() => setSpinnerStyle("orchestrator"));

describe("compact widget motion parity", () => {
  it("uses deterministic per-agent motion instead of one shared frame", () => {
    setSpinnerStyle("orchestrator");
    const lines = renderAgentWidget({
      agents: [agent("alpha", "running"), agent("bravo", "running")],
      agentActivity: new Map(),
      frame: 3,
      shouldShowFinished: () => true,
      theme,
      tui: { terminal: { columns: 140 } },
    });
    const output = lines.join("\n");
    expect(output).toContain(getAgentSpinnerFrame("alpha", 3));
    expect(output).toContain(getAgentSpinnerFrame("bravo", 3));
  });

  it("uses queue-role motion for queued work", () => {
    setSpinnerStyle("signals");
    const lines = renderAgentWidget({
      agents: [agent("queued-alpha", "queued")],
      agentActivity: new Map(),
      frame: 4,
      shouldShowFinished: () => true,
      theme,
      tui: { terminal: { columns: 100 } },
    });
    expect(lines.join("\n")).toContain(getAgentSpinnerFrame("queued-alpha", 4, "queue"));
  });

  it("keeps content stable in reduced-motion mode", () => {
    setSpinnerStyle("reduced");
    const input = {
      agents: [agent("alpha", "running")],
      agentActivity: new Map(),
      shouldShowFinished: () => true,
      theme,
      tui: { terminal: { columns: 100 } },
    };
    const first = renderAgentWidget({ ...input, frame: 0 });
    const later = renderAgentWidget({ ...input, frame: 999 });
    expect(later).toEqual(first);
  });
});
