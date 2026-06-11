---
name: overdrive
trigger: /overdrive
description: "Explicitly analyze Pi Orchestra health metrics and perform performance auditing to track rendering budget. Use when needing to optimize TUI micro-UX, eliminate bottlenecks, or assess system latency."
---

# Overdrive Performance Auditor

The `overdrive` skill focuses on analyzing Pi Orchestra's health and rendering performance. It evaluates execution bottlenecks, TUI rendering limits, and array traversals within the core TS modules.

## Responsibilities

1. **Profile First:** Run performance verification suite and benchmark scripts to establish a baseline before attempting refactors.
2. **Review Metrics:** Assess whether current operations fall within acceptable latency thresholds (e.g. single-digit milliseconds for UI renders).
3. **Analyze Array Traversals:** Specifically target O(N²) (O(N^2)) algorithm flaws or extensive nesting when joining relational datasets.
4. **Log Key Metric Shifts:** Document before-and-after values for benchmark execution durations.
5. **Architectural Journaling:** Append discoveries to `.jules/overdrive.md` under specific structured headers (Systemic Bottleneck, Refactor Strategy, Key Metric Shift, Actionable Principle).

## Commands

- `npm run bench:all` — Execute the benchmark suite to monitor active health constraints.
