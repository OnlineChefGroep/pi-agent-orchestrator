from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# Motion catalogue, role language, and semantic agent identities.
replace(
    "src/ui/animation.ts",
    '''  ripple: ["·", "∙", "•", "●", "•", "∙"],
  shuttle: ["▰", "▱", "▱", "▰", "▱", "▱"],
  none: [""],''',
    '''  ripple: ["·", "∙", "•", "●", "•", "∙"],
  shuttle: ["▰", "▱", "▱", "▰", "▱", "▱"],

  // Motion system v2: compact identities for orchestration roles.
  reactor: ["⊙", "◉", "●", "◉"],
  forge: ["◇", "◈", "◆", "◈"],
  neural: ["⠁", "⠉", "⠋", "⠛", "⠟", "⠿", "⡿", "⣿", "⣾", "⣼", "⣸", "⣰", "⣠", "⣀"],
  vector: ["⇢", "⇡", "⇠", "⇣"],
  sentinel: ["◡", "⊙", "◠", "⊙"],
  comet: ["·", "∙", "•", "◉", "●", "◉", "•", "∙"],
  none: [""],''',
)

replace(
    "src/ui/animation.ts",
    '''  "prism",
  "ripple",
] as const satisfies readonly SpinnerStyle[];''',
    '''  "prism",
  "ripple",
  "reactor",
  "forge",
  "neural",
  "vector",
  "sentinel",
  "comet",
] as const satisfies readonly SpinnerStyle[];''',
)

replace(
    "src/ui/animation.ts",
    '''  orchestrator: {
    header: "orbit",
    queue: "pipeline",
    handoff: "weave",
    swarm: "aperture",
    tool: "signal",
    scheduler: "clock",
  },''',
    '''  orchestrator: {
    header: "reactor",
    queue: "pipeline",
    handoff: "weave",
    swarm: "aperture",
    tool: "neural",
    scheduler: "clock",
  },''',
)

replace(
    "src/ui/animation.ts",
    '''} as const satisfies Record<"orchestrator" | "signals" | "minimal", Record<Exclude<SpinnerRole, "agent">, SpinnerStyle>>;

/** Mutable global frames retained for backwards compatibility. */''',
    '''} as const satisfies Record<"orchestrator" | "signals" | "minimal", Record<Exclude<SpinnerRole, "agent">, SpinnerStyle>>;

/**
 * Known agent families receive stable visual identities in the default
 * orchestrator profile. Unknown custom agents still use deterministic hashing.
 */
const AGENT_TYPE_STYLE_RULES = [
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
}

/** Mutable global frames retained for backwards compatibility. */''',
)

replace(
    "src/ui/animation.ts",
    'export function getSpinnerStyleForAgent(agentId: string, role: SpinnerRole = "agent"): SpinnerStyle {',
    '''export function getSpinnerStyleForAgent(
  agentId: string,
  role: SpinnerRole = "agent",
  agentType?: string,
): SpinnerStyle {''',
)

replace(
    "src/ui/animation.ts",
    '''  if (isDirectStyle(activeAnimationProfile)) {
    return activeAnimationProfile;
  }

  const pack = SPINNER_PACKS[packName];''',
    '''  if (isDirectStyle(activeAnimationProfile)) {
    return activeAnimationProfile;
  }

  if (packName === "orchestrator" && agentType) {
    const semanticStyle = getSpinnerStyleForAgentType(agentType);
    if (semanticStyle) return semanticStyle;
  }

  const pack = SPINNER_PACKS[packName];''',
)

replace(
    "src/ui/animation.ts",
    '''export function getAgentSpinnerFrame(agentId: string, frame: number, role: SpinnerRole = "agent"): string {
  const style = getSpinnerStyleForAgent(agentId, role);''',
    '''export function getAgentSpinnerFrame(
  agentId: string,
  frame: number,
  role: SpinnerRole = "agent",
  agentType?: string,
): string {
  const style = getSpinnerStyleForAgent(agentId, role, agentType);''',
)

# Compact widget: semantic agent identity + visibly smoother cadence.
replace(
    "src/ui/agent-widget-renderer.ts",
    '    const agentGlyph = getAgentSpinnerFrame(agent.id, options.frame, "agent");',
    '    const agentGlyph = getAgentSpinnerFrame(agent.id, options.frame, "agent", agent.type);',
)
replace(
    "src/ui/agent-widget.ts",
    ''' * - Adaptive refresh: faster interval (200ms) when agents are running,
 *   falls back to animation interval (80ms) when all agents are finished.''',
    ''' * - Adaptive refresh: responsive interval (160ms) while work is active,
 *   falling back to a low-cost 1000ms idle cadence.''',
)
replace("src/ui/agent-widget.ts", "const ACTIVE_REFRESH_MS = 200;", "const ACTIVE_REFRESH_MS = 160;")
replace(
    "src/ui/agent-widget.ts",
    '''    if (!this.dirty && hasActive && this.widgetFrame % 3 === 0) {
      this.dirty = true;
    }''',
    '''    if (!this.dirty && hasActive) {
      this.dirty = true;
    }''',
)

# Full dashboard parity.
replace(
    "src/ui/dashboard/helpers.ts",
    '  if (rec.status === "running") return getAgentSpinnerFrame(rec.id, frame);',
    '  if (rec.status === "running") return getAgentSpinnerFrame(rec.id, frame, "agent", rec.type);',
)

# Top view previously hard-coded orbit and ignored reduced/none/profile selection.
replace(
    "src/ui/agent-top-renderer.ts",
    'import { ANIMATION_INTERVAL, getSpinnerFrameForStyle } from "./animation.js";',
    'import { ANIMATION_INTERVAL, getAgentSpinnerFrame } from "./animation.js";',
)
replace(
    "src/ui/agent-top-renderer.ts",
    '''export interface AgentTopEntry {
  id: string;
  name: string;''',
    '''export interface AgentTopEntry {
  id: string;
  type: string;
  name: string;''',
)
replace(
    "src/ui/agent-top-renderer.ts",
    '''      id: record.id,
      name: getDisplayName(record.type),''',
    '''      id: record.id,
      type: record.type,
      name: getDisplayName(record.type),''',
)
replace(
    "src/ui/agent-top-renderer.ts",
    '''function statusText(entry: AgentTopEntry, theme: TopTheme): string {
  if (entry.status === "running") {
    const frame = Math.floor(Date.now() / ANIMATION_INTERVAL);
    return theme.fg("accent", `${getSpinnerFrameForStyle("orbit", frame)} RUN`);
  }
  if (entry.status === "queued") return theme.fg("warning", "◌ QUEUE");
  if (entry.status === "completed") return theme.fg("success", "✓ DONE");
  if (entry.status === "steered") return theme.fg("warning", "↳ STEER");
  if (entry.status === "aborted" || entry.status === "error") return theme.fg("error", "✕ FAIL");
  return theme.fg("dim", `■ ${entry.status.toUpperCase()}`);
}''',
    '''function statusText(entry: AgentTopEntry, theme: TopTheme): string {
  const frame = Math.floor(Date.now() / ANIMATION_INTERVAL);
  const withGlyph = (glyph: string, label: string): string => glyph ? `${glyph} ${label}` : label;
  if (entry.status === "running") {
    return theme.fg("accent", withGlyph(getAgentSpinnerFrame(entry.id, frame, "agent", entry.type), "RUN"));
  }
  if (entry.status === "queued") {
    return theme.fg("warning", withGlyph(getAgentSpinnerFrame(entry.id, frame, "queue"), "QUEUE"));
  }
  if (entry.status === "completed") return theme.fg("success", "✓ DONE");
  if (entry.status === "steered") return theme.fg("warning", "↳ STEER");
  if (entry.status === "aborted" || entry.status === "error") return theme.fg("error", "✕ FAIL");
  return theme.fg("dim", `■ ${entry.status.toUpperCase()}`);
}''',
)

# Settings exposes the visual language rather than opaque names.
replace(
    "src/ui/settings-menu.ts",
    '''const MOTION_PROFILE_OPTIONS: ReadonlyArray<{ profile: AnimationStyle; description: string }> = [
  { profile: "orchestrator", description: "semantic per-agent motion pack (default)" },
  { profile: "signals", description: "telemetry, scanline and data-flow motion" },
  { profile: "minimal", description: "restrained low-noise geometric motion" },
  { profile: "reduced", description: "static semantic glyphs; no frame animation" },
  { profile: "braille", description: "single consistent braille spinner" },
  { profile: "dots", description: "single consistent dots spinner" },
  { profile: "lines", description: "single consistent ASCII spinner" },
  { profile: "classic", description: "static asterisk" },
  { profile: "none", description: "disable motion glyphs" },
];''',
    '''const MOTION_PROFILE_OPTIONS: ReadonlyArray<{
  profile: AnimationStyle;
  preview: string;
  description: string;
}> = [
  { profile: "orchestrator", preview: "⊙ ▖ ⌜ ◆ △", description: "semantic identities for explore, plan, build, review and validation (default)" },
  { profile: "signals", preview: "▁ ▍ ⣤ ▚", description: "telemetry, scanline and data-flow motion" },
  { profile: "minimal", preview: "⠁ • ◇ ◑", description: "restrained low-noise geometric motion" },
  { profile: "reduced", preview: "⊙ ┈ ⠏", description: "static semantic glyphs; no frame animation" },
  { profile: "braille", preview: "⠋", description: "single consistent braille spinner" },
  { profile: "dots", preview: "⠁", description: "single consistent dots spinner" },
  { profile: "lines", preview: "-", description: "single consistent ASCII spinner" },
  { profile: "classic", preview: "*", description: "static asterisk" },
  { profile: "none", preview: "·", description: "disable motion glyphs" },
];''',
)
replace(
    "src/ui/settings-menu.ts",
    '''      MOTION_PROFILE_OPTIONS.map(({ profile, description }) =>
        `${profile} — ${description}${profile === current ? " ◀ current" : ""}`,
      ),''',
    '''      MOTION_PROFILE_OPTIONS.map(({ profile, preview, description }) =>
        `${profile}  ${preview} — ${description}${profile === current ? " ◀ current" : ""}`,
      ),''',
)

# Tests: semantic identity, updated role language, and renderer parity.
replace(
    "test/motion-profiles.test.ts",
    '''  getSpinnerStyleForAgent,
  getTimeSpinnerFrameForRole,''',
    '''  getSpinnerStyleForAgent,
  getSpinnerStyleForAgentType,
  getTimeSpinnerFrameForRole,''',
)
replace(
    "test/motion-profiles.test.ts",
    '  it("switches the semantic role language with the selected pack", () => {',
    '''  it("assigns stable identities to known agent families", () => {
    setSpinnerStyle("orchestrator");
    expect(getSpinnerStyleForAgentType("Explore")).toBe("radar");
    expect(getSpinnerStyleForAgentType("codex-implementor")).toBe("forge");
    expect(getSpinnerStyleForAgentType("security-reviewer")).toBe("aperture");
    expect(getSpinnerStyleForAgent("agent-a", "agent", "validator")).toBe("prism");
  });

  it("switches the semantic role language with the selected pack", () => {''',
)
replace(
    "test/animation-profiles.test.ts",
    '    expect(getSpinnerStyleForAgent("any", "header")).toBe("orbit");',
    '    expect(getSpinnerStyleForAgent("any", "header")).toBe("reactor");',
)
replace(
    "test/widget-motion-parity.test.ts",
    '''    expect(output).toContain(getAgentSpinnerFrame("alpha", 3));
    expect(output).toContain(getAgentSpinnerFrame("bravo", 3));''',
    '''    expect(output).toContain(getAgentSpinnerFrame("alpha", 3, "agent", "Explore"));
    expect(output).toContain(getAgentSpinnerFrame("bravo", 3, "agent", "Explore"));''',
)

Path("docs/motion-profiles.md").write_text(
    '''# Motion profiles

The orchestrator uses a compact motion language rather than one generic loading spinner. Motion communicates three things independently:

1. **Agent identity** — known agent families keep a recognizable visual signature.
2. **Runtime role** — queue, tool activity, swarm coordination, scheduler and handoff each use a dedicated motion channel.
3. **Accessibility preference** — `reduced` freezes semantic glyphs and `none` removes them without hiding state text.

## Profiles

| Profile | Behaviour | Recommended use |
|---|---|---|
| `orchestrator` | Semantic agent identities plus role-specific orchestration motion | Default full dashboard experience |
| `signals` | Scanlines, signal bars, matrix/cascade and telemetry-oriented movement | Dense operational monitoring |
| `minimal` | Restrained dots and geometric movement | Low-distraction terminals |
| `reduced` | Semantic glyphs remain visible but do not advance | Accessibility, screen recording and slow terminals |
| `braille`, `dots`, `lines`, `classic` | One consistent legacy spinner style | Strict visual uniformity or compatibility |
| `none` | Motion glyphs are omitted | Fully static/plain output |

Select a profile from `/agents → Settings → Motion profile`. The menu includes a compact preview and persists the value in `.pi/subagents.json` as `animationStyle`.

## Default semantic identities

The `orchestrator` profile recognizes common agent-family names before falling back to deterministic ID hashing:

| Agent family | Motion identity | Meaning |
|---|---|---|
| Explore, research, search, scan | `radar` | discovery and coverage |
| Plan, architect, design | `lattice` | structure and decomposition |
| Analysis, audit, diagnose | `signal` | evidence and telemetry |
| Coder, implementor, builder, engineer | `forge` | construction |
| Reviewer, critic, inspector | `aperture` | inspection |
| Validator, test, QA, verify | `prism` | verification |
| Security, sentinel, threat | `sentinel` | watch and defence |
| Orchestrator, lead, manager, coordinator | `reactor` | coordination core |
| Compressor, summarizer, handoff | `weave` | synthesis and transfer |

Custom agent names that do not match a family still receive a stable style derived from their agent ID. Selecting `signals`, `minimal` or a direct legacy style intentionally overrides these identities.

## Runtime channels

- Running agent rows use agent identity motion.
- Queued work uses the profile's queue channel.
- Tool activity uses the tool channel.
- Dashboard headers use the coordination-core channel.
- Swarms, scheduler jobs and result handoffs each use their own role mapping.
- Phase offsets prevent a fleet from moving in lockstep.

## Rendering guarantees

- Dashboard-safe frames occupy one terminal cell to prevent horizontal jitter.
- The compact widget refreshes at 160 ms while work is active and returns to a 1000 ms idle cadence.
- `reduced` freezes the selected semantic frame rather than replacing state with a generic marker.
- `none` suppresses glyphs while preserving labels, counts, status, success/error markers and progress information.
- Compact widget, full dashboard and Agent Top use the same profile resolver.
''',
    encoding="utf-8",
)
