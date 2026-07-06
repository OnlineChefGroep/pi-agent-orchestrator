# Overdrive Performance Audit — 2026-07-06

## Benchmark Results (npm run bench:all)

All 62 benchmark tests pass within budget:

| Path | Metric | Budget | Actual | Status |
|------|--------|--------|--------|--------|
| Dashboard empty | render | 0.5ms | <0.001ms | OK |
| Dashboard 10 mixed | render | 1.5ms | <0.001ms | OK |
| Dashboard 50 mixed | render | 5.0ms | <0.001ms | OK |
| Dashboard 200 mixed | render | 20.0ms | <0.001ms | OK |
| Dashboard 1000 mixed | render | 40.0ms | <0.001ms | OK |
| Widget 10 mixed | render | 1.0ms | 0.6ms | OK |
| Widget 50 mixed | render | 4.0ms | 2.3ms | OK |
| Widget 200 mixed | render | 18.0ms | 5.2ms | OK |
| Widget 200 w/ activity | render | 20.0ms | 6.4ms | OK |
| buildParentContext 200 | tokens | 2.0ms | 0.09ms | OK |
| buildSnapshotHash 1000 | hash | 3.0ms | 0.014ms | OK |
| getVisibleWindow 1000 | scroll | 3.0ms | 0.014ms | OK |
| Spawn no-inherit | latency | 50.0ms | <0.1ms | OK |
| Spawn w/ inherit 200 | latency | 40.0ms | 0.9ms | OK |
| preloadSkills 10 found | disk | 10.0ms | 0.8ms | OK |

## Audit Findings

### Overdrive Lint
- **detect-double-compute**: 1 finding (feature-flags.ts:128) — false positive (two separate functions each call `toLowerCase()` once)
- **detect-shift-in-loop**: 0 findings
- **Overdrive-lint**: 1 finding (same false positive)

### Algorithmic Patterns
- **O(N²) iterations**: None found. All loops over agents are single-pass O(N).
- **Chained .map().filter()**: Found 3 instances in agent-types.ts (`getAvailableTypes`, `getDefaultAgentNames`, `getUserAgentNames`) — these operate on the small agent registry Map (4-20 entries), not agent lists. Negligible cost.
- **JSON.stringify/parse cycles**: None found in render paths.

### Render Path Architecture
- **Dashboard body**: Virtual scrolling with VIRTUAL_WINDOW=50. Render cost is O(viewport_height) regardless of total agent count.
- **Widget render**: FNV-1a snapshot hash for O(N*id_length) change detection. Adaptive refresh (ACTIVE_REFRESH_MS vs IDLE_REFRESH_MS).
- **Agent listing**: `listAgents()` creates a sorted copy every update tick. O(N log N) but Map insertion order is already chronological, so sort is near-noop.

### Memory
- **structuredClone** in `buildChildInvocation`: O(depth) copy, only called once per spawn.
- **No unbounded caches**: Model resolver cache is per-registry-instance. Rate limiter capped at MAX_RATE_LIMIT_ENTRIES=1000.

## Conclusion

No performance issues found. All render paths are within budget. The codebase already implements the key overdrive patterns:
- Virtual scrolling for large lists
- Snapshot hashing for efficient diffing
- Single-pass categorization loops
- Adaptive refresh intervals
- Head-index queue drain (not shift())

## Actionable Principle

The team has already internalized overdrive patterns. The existing benchmark suite provides strong regression protection. New code should maintain the single-pass, O(N) standard for agent-list operations.
