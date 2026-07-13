from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:140]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace(
    "src/ui/animation.ts",
    '''const AGENT_TYPE_STYLE_RULES = [
  { keywords: ["explore", "research", "search", "scan"], style: "radar" },
  { keywords: ["plan", "architect", "design"], style: "lattice" },
  { keywords: ["analysis", "analyst", "audit", "diagnose"], style: "signal" },
  { keywords: ["code", "coder", "implement", "build", "engineer"], style: "forge" },
  { keywords: ["review", "critic", "inspect"], style: "aperture" },
  { keywords: ["valid", "test", "qa", "verify", "check"], style: "prism" },
  { keywords: ["security", "sentinel", "threat"], style: "sentinel" },
  { keywords: ["orchestr", "lead", "manager", "coordinator"], style: "reactor" },
  { keywords: ["compress", "summar", "handoff"], style: "weave" },
] as const satisfies readonly { keywords: readonly string[]; style: SpinnerStyle }[];

export function getSpinnerStyleForAgentType(agentType: string): SpinnerStyle | undefined {
  const normalized = agentType.trim().toLowerCase();
  if (!normalized) return undefined;
  return AGENT_TYPE_STYLE_RULES.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)))?.style;
}''',
    '''const AGENT_TYPE_STYLE_RULES = [
  { keywords: ["security", "sentinel", "threat"], style: "sentinel" },
  { keywords: ["valid", "test", "qa", "verify", "check"], style: "prism" },
  { keywords: ["review", "critic", "inspect"], style: "aperture" },
  { keywords: ["code", "coder", "implement", "build", "engineer"], style: "forge" },
  { keywords: ["analysis", "analyst", "audit", "diagnose"], style: "signal" },
  { keywords: ["plan", "architect", "design"], style: "lattice" },
  { keywords: ["explore", "research", "search", "scan"], style: "radar" },
  { keywords: ["compress", "summar", "handoff"], style: "weave" },
  { keywords: ["orchestr", "lead", "manager", "coordinator"], style: "reactor" },
] as const satisfies readonly { keywords: readonly string[]; style: SpinnerStyle }[];

function tokenizeAgentType(agentType: string): string[] {
  return agentType
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function getSpinnerStyleForAgentType(agentType: string): SpinnerStyle | undefined {
  const tokens = tokenizeAgentType(agentType);
  if (tokens.length === 0) return undefined;
  return AGENT_TYPE_STYLE_RULES.find((rule) =>
    rule.keywords.some((keyword) => tokens.some((token) => token === keyword || token.startsWith(keyword)))
  )?.style;
}''',
)

replace(
    "src/ui/agent-widget.ts",
    '''    // Force re-render periodically when running agents exist (spinner animation).
    // Without this, the dirty-check optimization freezes spinners indefinitely.
    if (!this.dirty && hasActive) {
      this.dirty = true;
    }''',
    '''    // Render motion every second 160ms tick. This is visibly responsive while
    // avoiding a full widget redraw on every timer callback over SSH terminals.
    if (!this.dirty && hasActive && this.widgetFrame % 2 === 0) {
      this.dirty = true;
    }''',
)

replace(
    "docs/motion-profiles.md",
    "- The compact widget refreshes at 160 ms while work is active and returns to a 1000 ms idle cadence.",
    "- The compact widget advances state on a 160 ms active tick and redraws motion every second tick (about 320 ms), then returns to a 1000 ms idle cadence.",
)

replace(
    "test/motion-profiles.test.ts",
    '''    expect(getSpinnerStyleForAgentType("codex-implementor")).toBe("forge");
    expect(getSpinnerStyleForAgentType("security-reviewer")).toBe("aperture");
    expect(getSpinnerStyleForAgent("agent-a", "agent", "validator")).toBe("prism");''',
    '''    expect(getSpinnerStyleForAgentType("codex-implementor")).toBe("forge");
    expect(getSpinnerStyleForAgentType("security-reviewer")).toBe("sentinel");
    expect(getSpinnerStyleForAgentType("explanation-writer")).toBeUndefined();
    expect(getSpinnerStyleForAgent("agent-a", "agent", "validator")).toBe("prism");

    setSpinnerStyle("signals");
    expect(getSpinnerStyleForAgent("agent-a", "agent", "validator")).not.toBe("prism");''',
)

replace(
    "test/animation-profiles.test.ts",
    'import { describe, expect, it } from "vitest";',
    '''import { describe, expect, it } from "vitest";
import { visibleWidth } from "../src/ui/tui-shim.js";''',
)

replace(
    "test/animation-profiles.test.ts",
    '''  it("keeps agent style assignment deterministic", () => {''',
    '''  it("keeps every dashboard-safe frame to one terminal cell", () => {
    for (const style of DASHBOARD_SPINNER_STYLES) {
      for (const frame of SPINNER_FRAMES[style]) {
        expect(visibleWidth(frame), `${style}: ${frame}`).toBe(1);
      }
    }
  });

  it("keeps agent style assignment deterministic", () => {''',
)
