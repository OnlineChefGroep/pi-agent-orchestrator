import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRecord } from "../src/types.js";
import type { AgentActivity } from "../src/ui/agent-ui-types.js";
import type { Theme } from "../src/ui/theme.js";

// ── Mock AgentManager ─────────────────────────────────────────────────────────

class MockAgentManager {
  private _agents: AgentRecord[] = [];

  listAgents(): AgentRecord[] {
    return [...this._agents];
  }

  setAgents(agents: AgentRecord[]) {
    this._agents = agents;
  }
}

// ── Mock UICtx ────────────────────────────────────────────────────────────────

function createMockUiCtx() {
  return {
    setWidget: vi.fn(),
    setStatus: vi.fn(),
  };
}

// ── Helpers to build mock data ────────────────────────────────────────────────

let agentCounter = 0;

function mockRecord(overrides: Partial<AgentRecord> = {}): AgentRecord {
  agentCounter++;
  return {
    id: `agent-${agentCounter}`,
    type: "general-purpose",
    description: `test agent ${agentCounter}`,
    status: "running",
    toolUses: 0,
    startedAt: Date.now() - 1000,
    spawnedAt: Date.now() - 1000,
    lifetimeUsage: { input: 0, output: 0, cacheWrite: 0 },
    compactionCount: 0,
    currentLevel: 0,
    totalSpawned: 0,
    ...overrides,
  } as AgentRecord;
}

// Simple theme with tag-based markers for assertion
const testTheme: Theme = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
  bold: (text: string) => `<bold>${text}</bold>`,
  dim: "<dim>",
  error: "<error>",
  warning: "<warning>",
  success: "<success>",
  accent: "<accent>",
  muted: "<muted>",
  highlight: "<highlight>",
  border: "<border>",
  title: "<title>",
  reset: "</reset>",
  bgCard: "",
  bgSelected: "",
  bgHeader: "",
};

// Mock tui-like object (minimal for renderAgentWidget)
const mockTui = {
  terminal: { columns: 120 },
};

// ═════════════════════════════════════════════════════════════════════════════
// buildSnapshotHash (dirty checking) — shared utility
// ═════════════════════════════════════════════════════════════════════════════

describe("buildSnapshotHash (dirty checking)", () => {
  let buildSnapshotHash: typeof import("../src/ui/snapshot-hash.js").buildSnapshotHash;

  beforeEach(async () => {
    agentCounter = 0;
    const mod = await import("../src/ui/snapshot-hash.js");
    buildSnapshotHash = mod.buildSnapshotHash;
  });

  it("returns 0 for empty agents list", () => {
    const hash = buildSnapshotHash([]);
    expect(hash).toBe(0);
  });

  it("returns a non-zero numeric hash from agent IDs and statuses", () => {
    const agents = [
      { id: "a1", status: "running" },
      { id: "a2", status: "queued" },
    ];
    const hash = buildSnapshotHash(agents);
    expect(hash).toBeTypeOf("number");
    expect(hash).not.toBe(0);
  });

  it("produces same output for same input (deterministic)", () => {
    const agents1 = [
      { id: "a1", status: "completed" },
      { id: "a2", status: "error" },
    ];
    const agents2 = [
      { id: "a1", status: "completed" },
      { id: "a2", status: "error" },
    ];
    expect(buildSnapshotHash(agents1)).toBe(buildSnapshotHash(agents2));
  });

  it("detects status changes", () => {
    const before = [
      { id: "a1", status: "running" },
    ];
    const after = [
      { id: "a1", status: "completed" },
    ];
    expect(buildSnapshotHash(before)).not.toBe(buildSnapshotHash(after));
  });

  it("detects agent additions", () => {
    const before = [{ id: "a1", status: "running" }];
    const after = [
      { id: "a1", status: "running" },
      { id: "a2", status: "queued" },
    ];
    expect(buildSnapshotHash(before)).not.toBe(buildSnapshotHash(after));
  });

  it("detects agent removals", () => {
    const before = [
      { id: "a1", status: "running" },
      { id: "a2", status: "completed" },
    ];
    const after = [{ id: "a1", status: "running" }];
    expect(buildSnapshotHash(before)).not.toBe(buildSnapshotHash(after));
  });

  it("handles many agents efficiently (no crash)", () => {
    const agents = Array.from({ length: 100 }, (_, i) => ({
      id: `agent-${i}`,
      status: i % 2 === 0 ? "running" : "queued",
    }));
    const hash = buildSnapshotHash(agents);
    expect(hash).toBeTypeOf("number");
    expect(hash).not.toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AgentWidget — debouncedUpdate (spawn batching)
// ═════════════════════════════════════════════════════════════════════════════

describe("AgentWidget — debouncedUpdate (spawn batching)", () => {
  let manager: MockAgentManager;
  let uiCtx: ReturnType<typeof createMockUiCtx>;
  let widget: any;

  beforeEach(async () => {
    agentCounter = 0;
    vi.useFakeTimers();
    const { AgentWidget } = await import("../src/ui/agent-widget.js");
    manager = new MockAgentManager();
    uiCtx = createMockUiCtx();
    widget = new AgentWidget(manager as any, new Map());
  });

  afterEach(() => {
    widget.dispose();
    vi.useRealTimers();
  });

  it("dispose clears widget, status, and pending timers", () => {
    manager.setAgents([mockRecord({ status: "running" })]);
    widget.setUICtx(uiCtx as any);
    widget.debouncedUpdate();

    const setWidgetCalls = vi.mocked(uiCtx.setWidget).mock.calls.length;
    const setStatusCalls = vi.mocked(uiCtx.setStatus).mock.calls.length;

    widget.dispose();

    expect(uiCtx.setWidget).toHaveBeenLastCalledWith("agents", undefined);
    expect(uiCtx.setStatus).toHaveBeenLastCalledWith("subagents", undefined);

    vi.advanceTimersByTime(5000);
    expect(uiCtx.setWidget.mock.calls.length).toBe(setWidgetCalls + 1);
    expect(uiCtx.setStatus.mock.calls.length).toBe(setStatusCalls + 1);
  });

  it("debouncedUpdate without UI context is a no-op", () => {
    // No uiCtx set → debouncedUpdate should do nothing
    widget.debouncedUpdate();
    expect(uiCtx.setWidget).not.toHaveBeenCalled();
  });

  it("debouncedUpdate first call triggers immediate update", () => {
    // Set up with a running agent so the widget has something to show
    manager.setAgents([mockRecord({ status: "running" })]);
    widget.setUICtx(uiCtx as any);

    widget.debouncedUpdate();

    // First call should register the widget immediately
    expect(uiCtx.setWidget).toHaveBeenCalledOnce();
    expect(uiCtx.setWidget).toHaveBeenCalledWith(
      "agents",
      expect.any(Function),
      expect.any(Object),
    );
  });

  it("debouncedUpdate coalesces rapid calls", () => {
    manager.setAgents([mockRecord({ status: "running" })]);
    widget.setUICtx(uiCtx as any);

    // First call → immediate update + schedule timer
    widget.debouncedUpdate();
    expect(uiCtx.setWidget).toHaveBeenCalledTimes(1);

    // Second call within window → should NOT trigger another update
    // (timer already pending)
    widget.debouncedUpdate();
    expect(uiCtx.setWidget).toHaveBeenCalledTimes(1);

    // Advance past the debounce window (16ms)
    vi.advanceTimersByTime(20);
    // Now the timer handler fired, which calls update() again
    // Since widget was already registered, it uses requestRender
    // The spy shows setWidget was only called once (on registration)
    expect(uiCtx.setWidget).toHaveBeenCalledTimes(1);
  });

  it("update() clears pending debounce timer", () => {
    manager.setAgents([mockRecord({ status: "running" })]);
    widget.setUICtx(uiCtx as any);

    // Start debouncedUpdate → schedules timer
    widget.debouncedUpdate();
    expect(uiCtx.setWidget).toHaveBeenCalledTimes(1);

    // Direct update() call should clear the pending timer
    // Adding another agent changes the snapshot
    manager.setAgents([
      mockRecord({ status: "running" }),
      mockRecord({ status: "queued" }),
    ]);
    widget.update();

    // Advance past the original debounce window
    vi.advanceTimersByTime(20);

    // The timer should NOT fire an extra update (was cleared)
    // setWidget calls stay the same (already registered, uses requestRender)
    expect(uiCtx.setWidget).toHaveBeenCalledTimes(1);
  });

  it("two sequential debouncedUpdate bursts work correctly", () => {
    manager.setAgents([mockRecord({ status: "running" })]);
    widget.setUICtx(uiCtx as any);

    // First burst
    widget.debouncedUpdate();
    vi.advanceTimersByTime(20);

    // Verify first registration happened
    expect(uiCtx.setWidget).toHaveBeenCalledTimes(1);

    // Second burst (e.g., another batch of spawns)
    manager.setAgents([
      mockRecord({ status: "running" }),
      mockRecord({ status: "running" }),
    ]);
    widget.debouncedUpdate();
    vi.advanceTimersByTime(20);

    // Still registered, no new setWidget calls
    expect(uiCtx.setWidget).toHaveBeenCalledTimes(1);
  });

  it("fires status bar update on status change", () => {
    manager.setAgents([mockRecord({ status: "running" })]);
    widget.setUICtx(uiCtx as any);

    // First update → shows "1 running agent"
    widget.update();
    expect(uiCtx.setStatus).toHaveBeenCalledWith(
      "subagents",
      "1 running agent",
    );

    // Second update with same data → no status change (dedup)
    uiCtx.setStatus.mockClear();
    widget.update();
    expect(uiCtx.setStatus).not.toHaveBeenCalled();

    // Adding a queued agent → status changes
    manager.setAgents([
      mockRecord({ status: "running" }),
      mockRecord({ status: "queued" }),
    ]);
    widget.update();
    expect(uiCtx.setStatus).toHaveBeenCalledWith(
      "subagents",
      "1 running, 1 queued agents",
    );
  });

  it("clears widget and status from the previous UI context", () => {
    const previousCtx = createMockUiCtx();
    manager.setAgents([mockRecord({ status: "running" })]);
    widget.setUICtx(previousCtx as any);
    widget.update();

    widget.setUICtx(uiCtx as any);

    expect(previousCtx.setWidget).toHaveBeenLastCalledWith("agents", undefined);
    expect(previousCtx.setStatus).toHaveBeenLastCalledWith("subagents", undefined);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AgentWidget — adaptive refresh interval
// ═════════════════════════════════════════════════════════════════════════════

describe("AgentWidget — adaptive refresh interval", () => {
  let manager: MockAgentManager;
  let uiCtx: ReturnType<typeof createMockUiCtx>;
  let widget: any;

  beforeEach(async () => {
    agentCounter = 0;
    vi.useFakeTimers();
    const { AgentWidget } = await import("../src/ui/agent-widget.js");
    manager = new MockAgentManager();
    uiCtx = createMockUiCtx();
    widget = new AgentWidget(manager as any, new Map());
    widget.setUICtx(uiCtx as any);
  });

  afterEach(() => {
    widget.dispose();
    vi.useRealTimers();
  });

  it("switches to fast interval when agents are running", () => {
    manager.setAgents([mockRecord({ status: "running" })]);
    widget.ensureTimer();

    // Verify initial state tick interval (ACTIVE_REFRESH_MS = 160ms)
    expect(widget.currentIntervalMs).toBe(160);
  });

  it("switches to idle interval when all agents are finished", () => {
    manager.setAgents([mockRecord({ status: "completed", completedAt: Date.now() })]);
    widget.ensureTimer();
    widget.update(); // triggers snapshot change → adaptive interval

    // After snapshot detects only completed agents → IDLE_REFRESH_MS = 1000ms
    expect(widget.currentIntervalMs).toBe(1000);
  });

  it("transitions from idle to active when new running agent appears", () => {
    // Start with completed agents
    manager.setAgents([mockRecord({ status: "completed", completedAt: Date.now() })]);
    widget.ensureTimer();
    widget.update();
    expect(widget.currentIntervalMs).toBe(1000);

    // Add a running agent → snapshot changes → re-evaluate interval
    manager.setAgents([
      mockRecord({ status: "completed", completedAt: Date.now() }),
      mockRecord({ status: "running" }),
    ]);
    widget.update();
    expect(widget.currentIntervalMs).toBe(160);
  });

  it("transitions from active to idle when last running agent finishes", () => {
    // Start with a running agent
    manager.setAgents([mockRecord({ status: "running" })]);
    widget.ensureTimer();
    widget.update();
    expect(widget.currentIntervalMs).toBe(160);

    // Add completed, remove running
    manager.setAgents([mockRecord({ status: "completed", completedAt: Date.now() })]);
    widget.update();
    expect(widget.currentIntervalMs).toBe(1000);
  });

  it("does not restart timer when interval stays the same", () => {
    manager.setAgents([mockRecord({ status: "running" })]);
    widget.ensureTimer();
    widget.update();
    const interval1 = widget.widgetInterval;

    // Same snapshot → no interval change
    widget.update();
    expect(widget.widgetInterval).toBe(interval1); // Same timer reference
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// renderAgentWidget — compact batch rendering
// ═════════════════════════════════════════════════════════════════════════════

describe("renderAgentWidget — compact batch rendering", () => {
  beforeEach(() => {
    agentCounter = 0;
  });

  async function renderWidget(
    agents: AgentRecord[],
    activity = new Map<string, AgentActivity>(),
    shouldShowFinished = () => true,
  ) {
    const { renderAgentWidget } = await import("../src/ui/agent-widget-renderer.js");
    return renderAgentWidget({
      agents,
      agentActivity: activity,
      frame: 0,
      shouldShowFinished,
      theme: testTheme as any,
      tui: mockTui as any,
    });
  }

  it("groups 3+ queued agents of same type into compact line", async () => {
    const agents = [
      mockRecord({ type: "Explore", status: "queued" }),
      mockRecord({ type: "Explore", status: "queued" }),
      mockRecord({ type: "Explore", status: "queued" }),
    ];
    const lines = await renderWidget(agents);
    const joined = lines.join("\n");
    // Should show compact "3× ... queued" line with the multiply indicator
    expect(joined).toContain("× ");
    expect(joined).toContain("queued");
    // Should NOT show individual descriptions for each
    expect(joined).not.toContain("test agent 1");
    expect(joined).not.toContain("test agent 2");
    expect(joined).not.toContain("test agent 3");
  });

  it("shows individual lines for small batches (< 3 queued)", async () => {
    const agents = [
      mockRecord({ type: "Explore", status: "queued", description: "search files" }),
      mockRecord({ type: "Explore", status: "queued", description: "parse output" }),
    ];
    const lines = await renderWidget(agents);
    const joined = lines.join("\n");
    // Should show individual lines with descriptions
    expect(joined).toContain("search files");
    expect(joined).toContain("parse output");
    // Should NOT show compact batch format (no multiply indicator)
    expect(joined).not.toContain("× ");
  });

  it("keeps different types separate in compact mode", async () => {
    const agents = [
      mockRecord({ type: "Explore", status: "queued" }),
      mockRecord({ type: "Explore", status: "queued" }),
      mockRecord({ type: "Explore", status: "queued" }),
      mockRecord({ type: "Plan", status: "queued" }),
      mockRecord({ type: "Plan", status: "queued" }),
      mockRecord({ type: "Plan", status: "queued" }),
    ];
    const lines = await renderWidget(agents);
    const joined = lines.join("\n");
    // Should have two compact lines (one per type)
    const compactLines = joined.split("\n").filter(l => l.includes("× "));
    expect(compactLines.length).toBe(2);
  });

  it("shows running agents individually regardless of count", async () => {
    const agents = [
      mockRecord({ type: "Explore", status: "running", description: "searching" }),
      mockRecord({ type: "Explore", status: "running", description: "indexing" }),
      mockRecord({ type: "Explore", status: "running", description: "parsing" }),
    ];
    const lines = await renderWidget(agents);
    const joined = lines.join("\n");
    // Should show individual activity lines for each
    expect(joined).toContain("searching");
    expect(joined).toContain("indexing");
    expect(joined).toContain("parsing");
  });

  it("handles mixed queued+finished+running", async () => {
    const agents = [
      mockRecord({ type: "Explore", status: "queued" }),
      mockRecord({ type: "Explore", status: "queued" }),
      mockRecord({ type: "Explore", status: "queued" }),
      mockRecord({ type: "Explore", status: "running", description: "active search" }),
      mockRecord({ type: "Explore", status: "completed", description: "done", completedAt: Date.now() }),
    ];
    const lines = await renderWidget(agents);
    const joined = lines.join("\n");
    // Compact queued (with multiply indicator)
    expect(joined).toContain("× ");
    // Individual running
    expect(joined).toContain("active search");
    // Finished line
    expect(joined).toContain("done");
  });

  it("returns empty array when no active or finished agents", async () => {
    const lines = await renderWidget([]);
    expect(lines).toEqual([]);
  });

  it("handles single queued agent", async () => {
    const agents = [
      mockRecord({ type: "Explore", status: "queued", description: "single search" }),
    ];
    const lines = await renderWidget(agents);
    const joined = lines.join("\n");
    expect(joined).toContain("single search");
  });

  it("handles edge case: exactly 3 queued agents", async () => {
    const agents = [
      mockRecord({ type: "Explore", status: "queued" }),
      mockRecord({ type: "Explore", status: "queued" }),
      mockRecord({ type: "Explore", status: "queued" }),
    ];
    const lines = await renderWidget(agents);
    const joined = lines.join("\n");
    // Should show one compact line (not one per agent)
    const compactLines = joined.split("\n").filter(l => l.includes("× "));
    expect(compactLines.length).toBe(1);
  });

  it("handles edge case: exactly 2 queued agents (should be individual)", async () => {
    const agents = [
      mockRecord({ type: "Explore", status: "queued" }),
      mockRecord({ type: "Explore", status: "queued" }),
    ];
    const lines = await renderWidget(agents);
    const joined = lines.join("\n");
    // Should NOT show compact format (no multiply indicator)
    expect(joined).not.toContain("× ");
  });

  it("respects shouldShowFinished to hide stale agents", async () => {
    const agents = [
      mockRecord({ type: "Explore", status: "completed", completedAt: Date.now() }),
    ];
    // Don't show finished agents
    const lines = await renderWidget(agents, new Map(), () => false);
    expect(lines).toEqual([]);
  });
});
