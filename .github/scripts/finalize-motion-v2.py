from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old!r}")
    file.write_text(text.replace(old, new), encoding="utf-8")


replace(
    "test/agent-widget.test.ts",
    "// Verify initial interval (ACTIVE_REFRESH_MS = 200ms)",
    "// Verify initial state tick interval (ACTIVE_REFRESH_MS = 160ms)",
)
replace(
    "test/agent-widget.test.ts",
    "expect(widget.currentIntervalMs).toBe(200);",
    "expect(widget.currentIntervalMs).toBe(160);",
)
replace(
    "test/dashboard-v2-rendering.test.ts",
    '''    id: "a",
    name: "Explore",''',
    '''    id: "a",
    type: "Explore",
    name: "Explore",''',
)
replace(
    "test/dashboard-v2-rendering.test.ts",
    '''    id: "b",
    name: "Plan",''',
    '''    id: "b",
    type: "Plan",
    name: "Plan",''',
)
