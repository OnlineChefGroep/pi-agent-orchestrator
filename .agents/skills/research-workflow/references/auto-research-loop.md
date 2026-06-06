# Auto Research Loop Reference

## Loop Architecture

```
Phase 1: Detect     →   Phase 2: Hypothesize   →   Phase 3: Experiment
     ↑                                                    │
     └───────────────  Phase 5: Adapt  ←──  Phase 4: Measure
```

## Configuration

### Environment Variables

```bash
# Control loop behavior
MAX_ITERATIONS=5              # Max experiments to run
CONFIDENCE_THRESHOLD=0.7      # Minimum confidence to keep
IMPROVEMENT_THRESHOLD=10      # Minimum % improvement to keep
SAFETY_ENABLED=1              # Enable safety checks

# Git configuration
AUTO_MERGE=0                  # Auto-merge high-confidence results
CREATE_PR=1                   # Create PR instead of direct merge

# Output
RESEARCH_DIR=.research/auto   # Where to store results
VERBOSE=1                     # Detailed logging
```

## Script Reference

| Script | Phase | Purpose |
|--------|-------|---------|
| `scripts/auto-research-loop.sh` | All | Main orchestration script |
| `scripts/detect-bottlenecks.js` | 1 | Parse benchmark output, find slow functions |
| `scripts/generate-hypotheses.js` | 2 | Generate optimization hypotheses from bottlenecks |
| `scripts/run-auto-experiment.js` | 3 | Run single experiment (baseline → patch → measure) |
| `scripts/compare-benchmarks.js` | 4 | Compare baseline vs optimized results |
| `scripts/adapt-research.js` | 5 | Decide keep/revert/iterate based on results |
| `scripts/generate-auto-report.js` | — | Generate final markdown report |
| `scripts/safety-checks.ts` | — | Validate patches before applying |

## Hypothesis Templates

### Template 1: Memoization

```typescript
// BEFORE: Repeated calculation
function expensiveCalculation(input: AgentRecord[]): DashboardState {
  return input.map(transform).filter(filter).reduce(reduce);
}

// AFTER: With memoization
const cache = new Map<string, DashboardState>();

function expensiveCalculation(input: AgentRecord[]): DashboardState {
  const key = hashRecords(input);
  if (cache.has(key)) return cache.get(key)!;

  const result = input.map(transform).filter(filter).reduce(reduce);
  cache.set(key, result);
  return result;
}
```

**When to apply:**
- Function called with same arguments repeatedly
- Calculation is deterministic (no side effects)
- Result is used multiple times per render cycle

**Expected improvement:** 20-40%

**Risk:** Low

### Template 2: Batching

```typescript
// BEFORE: Individual updates
for (const agent of agents) {
  updateWidget(agent);
}

// AFTER: Batched update
const batch: AgentRecord[] = [];
for (const agent of agents) {
  batch.push(agent);
}
updateWidgetBatch(batch);
```

**When to apply:**
- Multiple sequential updates to same component
- Updates trigger re-renders
- Updates can be deferred slightly

**Expected improvement:** 15-30%

**Risk:** Medium

### Template 3: Lazy Loading

```typescript
// BEFORE: Load all data
function loadDashboard(): DashboardData {
  return loadAllAgents() + loadAllHistory() + loadAllMetrics();
}

// AFTER: Lazy loading
function loadDashboard(): DashboardData {
  return {
    agents: loadAllAgents(),
    history: () => loadAllHistory(), // Lazy
    metrics: () => loadAllMetrics(), // Lazy
  };
}
```

**When to apply:**
- Not all data is needed immediately
- Data is large and slow to load
- User may not access all features

**Expected improvement:** 10-25%

**Risk:** Medium

### Template 4: Pre-compilation

```typescript
// BEFORE: Regex in loop
const items = data.filter(item => /pattern/.test(item.name));

// AFTER: Pre-compiled regex
const pattern = /pattern/;
const items = data.filter(item => pattern.test(item.name));
```

**When to apply:**
- Regex created inside loop
- String concatenation in loop
- Object creation in hot path

**Expected improvement:** 5-15%

**Risk:** Low

## Decision Matrix

| Improvement | Confidence | Decision | Action |
|-------------|------------|----------|--------|
| ≥10% | ≥0.7 | keep | Commit and merge |
| ≥5% | 0.5-0.7 | keep | Flag for review |
| <5% | ≥0.5 | iterate | Queue refined hypothesis |
| <0% | any | revert | Discard branch |
| any | <0.3 | revert | Discard branch |

## Safety Check Rules

### File Limits
- Max files changed: 5
- Max lines changed: 100
- Max new dependencies: 0

### Forbidden Patterns
- `eval(` — No dynamic code execution
- `\bany\b` — No explicit any types
- `TODO|FIXME|HACK` — No temporary fixes
- `process.exit` — No early exits
- `setTimeout` with long delays — No blocking timeouts

### Required Tests
- Dashboard render perf test
- Widget render perf test
- All existing unit tests must pass

## Example Output

```
═══════════════════════════════════════════════
  AUTO RESEARCH LOOP
  Max iterations: 5
  Confidence threshold: 0.7
  Improvement threshold: 10%
═══════════════════════════════════════════════

═══ Phase 1: Detecting bottlenecks ═══
Found 2 bottlenecks:
  - renderDashboard (agent-dashboard.ts): 2.3x baseline
  - sortEntries (agent-top-renderer.ts): 1.8x baseline

═══ Phase 2: Generating hypotheses ═══
Generated 3 hypotheses:
  1. cache-renderDashboard (confidence: 0.6)
  2. batch-sortEntries (confidence: 0.5)
  3. lazy-history-loading (confidence: 0.4)

═══════════════════════════════════════════════
  ITERATION 1 / 5
═══════════════════════════════════════════════
Testing: cache-renderDashboard
  Baseline: 45ms
  Optimized: 31ms
  Improvement: 31.1%
  Confidence: 0.85
  Decision: keep
  ✓ Merged cache-renderDashboard: 31.1% improvement

═══════════════════════════════════════════════
  ITERATION 2 / 5
═══════════════════════════════════════════════
Testing: batch-sortEntries
  Baseline: 12ms
  Optimized: 11ms
  Improvement: 8.3%
  Confidence: 0.45
  Decision: iterate
  ↻ Iterating batch-sortEntries → batch-sortEntries-v2

═══════════════════════════════════════════════
  FINAL REPORT
═══════════════════════════════════════════════

## Auto Research Results

### Improvements
- renderDashboard: 31.1% faster (45ms → 31ms)

### Regressions
None

### Overall
- Total metrics: 2
- Improvements: 1
- Regressions: 0
- Net improvement: 31.1%

### Actions Taken
- Merged: cache-renderDashboard (confidence: 0.85)
- Iterating: batch-sortEntries-v2 (queued)
- Skipped: lazy-history-loading (not reached)

### Test Results
- All tests: 1006/1006 passing
- Lint: clean
- Typecheck: clean
```

## Troubleshooting

### Loop exits early

**Cause:** No hypotheses generated or all failed safety checks

**Fix:**
```bash
# Check bottleneck detection
node scripts/detect-bottlenecks.js --verbose

# Check hypothesis generation
node scripts/generate-hypotheses.js --verbose
```

### Tests fail after patch

**Cause:** Patch introduced regression

**Fix:**
- Increase safety check strictness
- Add more required tests
- Review patch before applying

### Confidence too low

**Cause:** High variance in benchmark results

**Fix:**
```bash
# Increase number of runs
export BENCHMARK_RUNS=10

# Use more stable environment
# Close other applications
# Disable CPU throttling
```

### No improvements found

**Cause:** Code is already optimized

**Fix:**
- Try different hypothesis templates
- Expand search to other files
- Reduce improvement threshold temporarily

## Integration with Existing Workflows

### Pre-commit Hook

```bash
#!/bin/bash
# .husky/pre-commit

# Run quick benchmark check
npm run bench:quick

# If significant regression, block commit
if [[ $? -ne 0 ]]; then
  echo "Performance regression detected. Run auto-research loop to fix."
  exit 1
fi
```

### PR Template

```markdown
## Performance Impact

- [ ] No impact
- [ ] Improvement (run auto-research loop)
- [ ] Regression (investigate and fix)

## Benchmark Results

<!-- Paste from .research/auto/report.md -->
```
