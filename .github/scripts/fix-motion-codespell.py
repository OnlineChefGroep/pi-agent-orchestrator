from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace(
    "docs/motion-profiles.md",
    "| Coder, implementor, builder, engineer | `forge` | construction |",
    "| Coder, implementer, builder, engineer | `forge` | construction |",
)
replace(
    "src/ui/animation.ts",
    '{ keywords: ["compress", "summar", "handoff"], style: "weave" },',
    '{ keywords: ["compress", "summary", "summarize", "summarizer", "handoff"], style: "weave" },',
)
