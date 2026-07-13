from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise RuntimeError(f"expected one match in {path}, found {text.count(old)}")
    file.write_text(text.replace(old, new), encoding="utf-8")


replace_once(
    "src/ui/agent-top-renderer.ts",
    'withGlyph(getAgentSpinnerFrame(entry.id, frame, "queue"), "QUEUE")',
    'withGlyph(getAgentSpinnerFrame(entry.id, frame, "queue", entry.type), "QUEUE")',
)

replace_once(
    "src/ui/animation.ts",
    '''const AGENT_TYPE_STYLE_RULES = [
  { keywords: ["security", "sentinel", "threat"], style: "sentinel" },
  { keywords: ["valid", "test", "qa", "verify", "check"], style: "prism" },
  { keywords: ["review", "critic", "inspect"], style: "aperture" },
  { keywords: ["code", "coder", "implement", "build", "engineer"], style: "forge" },
  { keywords: ["analysis", "analyst", "audit", "diagnose"], style: "signal" },
  { keywords: ["plan", "architect", "design"], style: "lattice" },
  { keywords: ["explore", "research", "search", "scan"], style: "radar" },
  { keywords: ["compress", "summary", "summarize", "summarizer", "handoff"], style: "weave" },
  { keywords: ["orchestr", "lead", "manager", "coordinator"], style: "reactor" },
] as const satisfies readonly { keywords: readonly string[]; style: SpinnerStyle }[];''',
    '''const AGENT_TYPE_STYLE_RULES = [
  { keywords: ["security", "secure", "sentinel", "threat", "threats"], style: "sentinel" },
  {
    keywords: [
      "validate", "validator", "validators", "validation", "test", "tests", "testing", "tester",
      "testers", "qa", "verify", "verifier", "verification", "check", "checker", "checking",
    ],
    style: "prism",
  },
  {
    keywords: [
      "review", "reviewer", "reviewers", "reviewing", "critic", "critics", "critique", "inspect",
      "inspection", "inspector", "inspectors",
    ],
    style: "aperture",
  },
  {
    keywords: [
      "code", "coder", "coders", "coding", "implement", "implemented", "implementing", "implementer",
      "implementers", "implementor", "implementors", "implementation", "build", "builder", "builders",
      "building", "engineer", "engineers", "engineering",
    ],
    style: "forge",
  },
  {
    keywords: [
      "analysis", "analyst", "analysts", "analyze", "analyzing", "audit", "auditor", "auditors",
      "auditing", "diagnose", "diagnosis", "diagnostic", "diagnostics",
    ],
    style: "signal",
  },
  {
    keywords: [
      "plan", "planner", "planners", "planning", "architect", "architects", "architecture",
      "architectural", "design", "designer", "designers", "designing",
    ],
    style: "lattice",
  },
  {
    keywords: [
      "explore", "explorer", "explorers", "exploring", "research", "researcher", "researchers",
      "researching", "search", "searches", "searching", "scan", "scanner", "scanners", "scanning",
    ],
    style: "radar",
  },
  {
    keywords: [
      "compress", "compressor", "compressors", "compression", "summary", "summaries", "summarize",
      "summarizes", "summarized", "summarizing", "summarizer", "summarizers", "handoff", "handoffs",
    ],
    style: "weave",
  },
  {
    keywords: [
      "orchestrate", "orchestrating", "orchestration", "orchestrator", "orchestrators", "lead", "leader",
      "leaders", "leadership", "manager", "managers", "management", "coordinate", "coordinating",
      "coordination", "coordinator", "coordinators",
    ],
    style: "reactor",
  },
] as const satisfies readonly { keywords: readonly string[]; style: SpinnerStyle }[];''',
)

replace_once(
    "src/ui/animation.ts",
    '''  return AGENT_TYPE_STYLE_RULES.find((rule) =>
    rule.keywords.some((keyword) => tokens.some((token) => token === keyword || token.startsWith(keyword)))
  )?.style;''',
    '''  return AGENT_TYPE_STYLE_RULES.find((rule) =>
    rule.keywords.some((keyword) => tokens.includes(keyword))
  )?.style;''',
)

replace_once(
    "test/motion-profiles.test.ts",
    '''    expect(getSpinnerStyleForAgentType("security-reviewer")).toBe("sentinel");
    expect(getSpinnerStyleForAgentType("explanation-writer")).toBeUndefined();''',
    '''    expect(getSpinnerStyleForAgentType("security-reviewer")).toBe("sentinel");
    expect(getSpinnerStyleForAgentType("codebase-explorer")).toBe("radar");
    expect(getSpinnerStyleForAgentType("explanation-writer")).toBeUndefined();
    expect(getSpinnerStyleForAgentType("scandal")).toBeUndefined();
    expect(getSpinnerStyleForAgentType("qatar")).toBeUndefined();
    expect(getSpinnerStyleForAgentType("testament")).toBeUndefined();''',
)
