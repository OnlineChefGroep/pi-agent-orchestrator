# Experiment Journal Template

## Run Information

- **Date**: YYYY-MM-DD
- **Time**: HH:MM:SS
- **Branch**: experiment/name
- **Trigger**: manual | scheduled | CI
- **Researcher**: name or auto

## Objective

What are we trying to achieve?

## Hypothesis

### Statement
Clear, testable prediction.

### Rationale
Why do we believe this will work?

### Expected Outcome
Specific metric targets.

## Methodology

### Baseline
- Current metric: X
- Measurement method: Y
- Number of runs: N

### Changes Made
- Files modified: [list]
- Lines changed: [count]
- Approach: [description]

### Test Environment
- OS: [version]
- Node: [version]
- CPU: [model]
- RAM: [amount]

## Results

### Raw Data

| Run | Baseline (ms) | Optimized (ms) | Improvement |
|-----|---------------|----------------|-------------|
| 1   | 45.2          | 31.0           | 31.4%       |
| 2   | 44.8          | 30.8           | 31.3%       |
| 3   | 45.5          | 31.2           | 31.4%       |
| 4   | 45.0          | 31.1           | 30.9%       |
| 5   | 45.3          | 30.9           | 31.8%       |

### Statistics

- Mean baseline: 45.16ms
- Mean optimized: 31.00ms
- Mean improvement: 31.36%
- Standard deviation: 0.25ms
- Confidence: 0.85

### Test Results

- Unit tests: 1006/1006 passing
- Integration tests: 45/45 passing
- Type check: clean
- Lint: clean
- Bundle size: no change

## Analysis

### What Worked
- Clear improvement in target metric
- No regressions in other metrics
- Simple implementation

### What Didn't
- N/A

### Unexpected Results
- N/A

### Edge Cases
- Tested with 100, 1000, and 10000 agents
- Performance scales linearly

## Decision

- [ ] Keep — Merge to main
- [x] Iterate — Refine approach
- [ ] Revert — Abandon experiment

## Next Steps

1. Try combining with batch-sortEntries hypothesis
2. Test with swarm mode enabled
3. Profile memory usage during render

## Attachments

- Benchmark logs: `.research/logs/YYYY-MM-DD-name.log`
- Flame graph: `.research/profiles/YYYY-MM-DD-name.svg`
- Diff: `git diff main...experiment/name`
