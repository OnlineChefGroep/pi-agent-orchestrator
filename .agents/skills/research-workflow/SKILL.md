---
name: research-workflow
description: "Multifunctional research and experiment workflow skill for autonomous optimization loops, measurable experiments, benchmark design, structured research journals, hypothesis backlogs, metric evaluation, MAD confidence scoring, and finalizing experiment branches. Use for autoresearch, optimization research, reducing runtime or bundle size, improving ML metrics, systematic trial loops, experiment logging, benchmark scripts, and keeping or reverting changes based on measured results."
---

# Research Workflow

This skill handles systematic research, experimentation, and optimization workflows for the pi-agent-orchestrator project.

## Project Context

This is a performance-focused VS Code extension with:
- **1006+ tests** across 57 test files
- **Performance benchmarks** for render, snapshot, and virtual scrolling
- **Known flaky tests** on Windows (schedule tests)
- **Optimization targets**: runtime, bundle size, ML metrics

## Research Process

### 1. Define Hypothesis

Start with a clear, testable hypothesis:

```
Hypothesis: [What you believe will happen]
- Change: [What you're changing]
- Expected: [What you expect to see]
- Metric: [How you'll measure it]
```

Example:
```
Hypothesis: Caching agent snapshots will reduce dashboard render time
- Change: Add memoization to agentSnapshot comparison
- Expected: 20-30% reduction in render time
- Metric: Dashboard render benchmark (test/dashboard-render-perf.test.ts)
```

### 2. Design Experiment

Create a structured experiment plan:

```markdown
## Experiment: [Name]

### Goal
[What you're trying to achieve]

### Baseline
- Current metric: [X]
- Test file: [path to benchmark]

### Change
- Files modified: [list]
- Implementation approach: [description]

### Success Criteria
- Metric improvement: [target % or absolute value]
- No regression in: [other metrics]
- Test coverage: [must pass X tests]

### Risk Assessment
- Potential breakage: [what could break]
- Rollback plan: [how to revert]
```

### 3. Create Research Journal

Maintain a structured research journal in `.research/`:

```bash
mkdir -p .research/experiments
```

Create `.research/experiments/YYYY-MM-DD-experiment-name.md`:

```markdown
# Experiment: [Name]

**Date**: YYYY-MM-DD
**Status**: In Progress | Completed | Abandoned
**Confidence**: 0.0-1.0 (MAD scoring)

## Hypothesis
[Your hypothesis]

## Methodology
[How you tested it]

## Results
- Baseline: [metric before]
- After: [metric after]
- Improvement: [delta %]

## Analysis
[What the results mean]

## Conclusion
- Keep: [if successful]
- Revert: [if unsuccessful]
- Iterate: [if promising but needs refinement]

## Next Steps
[What to do next]
```

## Optimization Research

### Runtime Optimization

Target areas for runtime improvements:
1. **Virtual scrolling** - Reduce render calculations
2. **Snapshot caching** - Avoid redundant comparisons
3. **Debouncing** - Reduce update frequency
4. **Lazy loading** - Load data on demand

**Benchmark files**:
- `test/widget-render-perf.test.ts` - Widget virtual scrolling
- `test/dashboard-render-perf.test.ts` - Dashboard rendering
- `test/spawn-latency-bench.test.ts` - Agent spawn latency
- `test/spawn-latency-e2e-bench.test.ts` - End-to-end spawn latency

**Process**:
```bash
# Run baseline
npm run bench:all

# Make optimization changes
# ...

# Run comparison
npm run bench:all

# Compare results
# Look for >10% improvement without regressions
```

### Bundle Size Optimization

Target areas for bundle size:
1. **Tree-shaking** - Remove unused code
2. **Code splitting** - Split into smaller chunks
3. **Dependency audit** - Remove or replace heavy deps
4. **Minification** - Ensure build minifies correctly

**Process**:
```bash
# Build with size analysis
npm run build

# Check dist/ size
du -sh dist/

# Analyze bundle (if using webpack-bundle-analyzer)
# ...

# Compare to baseline
```

### ML Metrics Optimization

If using ML features (not currently in this project):
- **Accuracy** - Improve prediction quality
- **Latency** - Reduce inference time
- **Throughput** - Increase requests per second

## Systematic Trial Loops

### Autoresearch Pattern

For exploring multiple approaches systematically:

```markdown
## Trial Loop: [Topic]

### Trial 1: [Approach A]
- Implementation: [description]
- Result: [metric]
- Confidence: [0.0-1.0]

### Trial 2: [Approach B]
- Implementation: [description]
- Result: [metric]
- Confidence: [0.0-1.0]

### Trial 3: [Approach C]
- Implementation: [description]
- Result: [metric]
- Confidence: [0.0-1.0]

## Comparison
| Approach | Metric | Confidence |
|----------|--------|------------|
| A        | X      | 0.8        |
| B        | Y      | 0.6        |
| C        | Z      | 0.9        |

## Recommendation
[Best approach based on results]
```

### Hypothesis Backlog

Maintain a backlog of research hypotheses in `.research/hypotheses.md`:

```markdown
# Hypothesis Backlog

## High Priority
- [ ] Caching agent snapshots for dashboard render
- [ ] Virtual scrolling optimization for large agent lists
- [ ] Debouncing swarm status updates

## Medium Priority
- [ ] Lazy loading agent history
- [ ] Code splitting for dashboard module
- [ ] Optimizing schedule store queries

## Low Priority
- [ ] Reducing bundle size with tree-shaking
- [ ] Minification improvements
- [ ] Dependency replacement
```

## Metric Evaluation

### Performance Metrics

Key metrics to track:
- **Render time** - Dashboard and widget rendering
- **Spawn latency** - Time to create new agents
- **Memory usage** - RAM consumption during operation
- **Bundle size** - JavaScript bundle size
- **Test duration** - Time to run full test suite

### MAD Confidence Scoring

Use MAD (Mean Average Deviation) confidence scoring:
- **0.9-1.0**: Very confident - results clear and reproducible
- **0.7-0.9**: Confident - results consistent but some variance
- **0.5-0.7**: Moderate - results promising but need validation
- **0.3-0.5**: Low - results unclear or inconsistent
- **0.0-0.3**: Very low - results inconclusive

**Scoring factors**:
- Sample size (more runs = higher confidence)
- Variance (lower variance = higher confidence)
- Reproducibility (consistent across runs = higher confidence)
- Statistical significance (p-value consideration)

## Benchmark Scripts

### Creating Benchmarks

Add benchmarks to appropriate test files:

```typescript
// test/my-benchmark.test.ts
import { describe, it, expect, bench } from "vitest";

describe("My Feature Benchmark", () => {
  it("should process quickly", () => {
    const input = generateTestData(1000);
    
    bench("baseline", () => {
      baselineImplementation(input);
    });
    
    bench("optimized", () => {
      optimizedImplementation(input);
    });
  });
  
  it("should be faster than baseline", () => {
    const baselineTime = measureBaseline();
    const optimizedTime = measureOptimized();
    expect(optimizedTime).toBeLessThan(baselineTime * 0.9); // 10% improvement
  });
});
```

### Running Benchmarks

```bash
# Run all benchmarks
npm run bench:all

# Run specific benchmark
npx vitest run test/widget-render-perf.test.ts --reporter=verbose

# Run with coverage
npx vitest run test/widget-render-perf.test.ts --coverage
```

## Experiment Branches

### Branch Strategy

Create feature branches for experiments:

```bash
# Create experiment branch
git checkout -b experiment/optimization-name

# Make changes
# ...

# Run benchmarks
npm run bench:all

# Document results
# Update .research/experiments/YYYY-MM-DD-name.md
```

### Finalizing Experiments

Based on results:

**If successful**:
```bash
# Commit with conventional commit
git commit -m "perf(scope): optimization description"

# Update CHANGELOG.md
# Document improvement

# Merge to main
git checkout main
git merge experiment/optimization-name
```

**If unsuccessful**:
```bash
# Document findings in research journal
# Mark experiment as "Abandoned"

# Delete branch
git checkout main
git branch -D experiment/optimization-name
```

**If promising but needs refinement**:
```bash
# Document as "In Progress"
# Add next steps to research journal

# Keep branch for iteration
# Or create new branch: experiment/optimization-name-v2
```

## Research Tools

### Performance Profiling

```bash
# Node.js profiling
node --prof dist/index.js

# Flame graph generation
node --prof-process isolate-*.log > profile.txt
```

### Memory Profiling

```bash
# Memory usage snapshot
node --heap-snapshot dist/index.js

# Analyze with Chrome DevTools
# Load .heapsnapshot file
```

### Bundle Analysis

If using webpack-bundle-analyzer or similar:
```bash
# Analyze bundle
npm run build:analyze

# View report
# Open generated HTML report
```

## Common Research Patterns

### A/B Testing

```typescript
// Test two implementations
const baseline = runBaseline(input);
const optimized = runOptimized(input);

const baselineTime = measureTime(() => baseline);
const optimizedTime = measureTime(() => optimized);

console.log(`Baseline: ${baselineTime}ms`);
console.log(`Optimized: ${optimizedTime}ms`);
console.log(`Improvement: ${((baselineTime - optimizedTime) / baselineTime * 100).toFixed(1)}%`);
```

### Regression Testing

After optimization:
```bash
# Run full test suite
npm test

# Run typecheck
npm run typecheck

# Run lint
npm run lint

# Run benchmarks
npm run bench:all
```

### Rollback Testing

Test rollback plan before committing:
```bash
# Stash changes
git stash

# Verify baseline still works
npm test
npm run bench:all

# Restore changes
git stash pop
```

## Auto Research Loop

The auto-research loop is an autonomous optimization pattern that iteratively tests, measures, and improves code without manual intervention. Ideal for long-running optimization sessions and systematic exploration of parameter spaces.

### Loop Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTO RESEARCH LOOP                        │
├─────────────────────────────────────────────────────────────┤
│  Phase 1: Detect ──→ Phase 2: Hypothesize ──→ Phase 3:    │
│     ↑                                    Experiment          │
│     │                                            │           │
│     └────────── Phase 5: Adapt ←─── Phase 4: Measure        │
│                    (Iterate)                                  │
└─────────────────────────────────────────────────────────────┘
```

### Phase 1: Detect

Automatically identify optimization opportunities:

```typescript
// Auto-detect slow functions from benchmark results
function detectBottlenecks(benchmarkResults: BenchmarkResult[]): Bottleneck[] {
  return benchmarkResults
    .filter(r => r.duration > r.baseline * 1.2) // 20% slower than baseline
    .map(r => ({
      file: r.file,
      function: r.name,
      duration: r.duration,
      baseline: r.baseline,
      severity: r.duration / r.baseline,
    }))
    .sort((a, b) => b.severity - a.severity);
}
```

**Detection sources**:
1. Benchmark failures (`npm run bench:all`)
2. Vitest slow test warnings (`npx vitest --reporter=verbose`)
3. TypeScript build times (`time npm run build`)
4. Bundle size changes (`du -sh dist/`)
5. Lint errors on performance patterns (`npm run lint`)

### Phase 2: Hypothesize

Generate testable hypotheses from detected bottlenecks:

```typescript
interface Hypothesis {
  id: string;
  target: string;           // File or function to optimize
  change: string;           // Proposed modification
  expectedImprovement: number; // Percentage improvement
  confidence: number;       // Initial confidence (0-1)
  testFile: string;         // Benchmark to validate
  risk: "low" | "medium" | "high";
}

function generateHypotheses(bottleneck: Bottleneck): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];

  if (bottleneck.severity > 2.0) {
    // Severe slowdown - try caching
    hypotheses.push({
      id: `cache-${bottleneck.function}`,
      target: bottleneck.file,
      change: "Add memoization to repeated calculations",
      expectedImprovement: 30,
      confidence: 0.6,
      testFile: `test/${bottleneck.file.replace(".ts", "-perf.test.ts")}`,
      risk: "low",
    });
  }

  if (bottleneck.duration > 100) {
    // Slow function - try batching
    hypotheses.push({
      id: `batch-${bottleneck.function}`,
      target: bottleneck.file,
      change: "Batch sequential operations",
      expectedImprovement: 20,
      confidence: 0.5,
      testFile: `test/${bottleneck.file.replace(".ts", "-perf.test.ts")}`,
      risk: "medium",
    });
  }

  return hypotheses;
}
```

**Hypothesis templates**:

| Bottleneck Pattern | Hypothesis | Risk |
|-------------------|------------|------|
| Repeated calculation | Add memoization / caching | Low |
| Large array operations | Use chunked/batched processing | Medium |
| Deep object traversal | Flatten data structure | Medium |
| Synchronous file I/O | Use async / buffered reads | High |
| Frequent DOM updates | Implement virtual scrolling | High |
| String concatenation in loop | Use array join / template literals | Low |
| Regex in hot path | Pre-compile / cache regex | Low |
| Object creation in loop | Object pooling / reuse | Medium |

### Phase 3: Experiment

Automate the experiment execution:

```bash
#!/bin/bash
# auto-research-loop.sh

set -euo pipefail

HYPOTHESIS_ID="$1"
TARGET_FILE="$2"
TEST_FILE="$3"
BRANCH="auto-research/${HYPOTHESIS_ID}"

git checkout -b "$BRANCH"

# 1. Record baseline
echo "=== Baseline ===" > ".research/auto-${HYPOTHESIS_ID}.log"
npm run bench:all >> ".research/auto-${HYPOTHESIS_ID}.log" 2>&1

# 2. Apply optimization (auto-generated patch)
git apply ".research/patches/${HYPOTHESIS_ID}.patch"

# 3. Verify no regressions
npm test >> ".research/auto-${HYPOTHESIS_ID}.log" 2>&1 || {
  echo "Tests failed - aborting"
  git checkout -- .
  git checkout main
  git branch -D "$BRANCH"
  exit 1
}

# 4. Measure improvement
npm run bench:all >> ".research/auto-${HYPOTHESIS_ID}.log" 2>&1

# 5. Compare results
node scripts/compare-benchmarks.js \
  ".research/auto-${HYPOTHESIS_ID}.log" \
  --threshold 10 \
  --output ".research/results/${HYPOTHESIS_ID}.json"
```

**Experiment automation script**:

```typescript
// scripts/run-auto-experiment.ts
import { execSync } from "node:child_process";
import fs from "node:fs";

interface ExperimentResult {
  hypothesisId: string;
  branch: string;
  baseline: number;
  optimized: number;
  improvement: number;
  testsPassed: boolean;
  lintPassed: boolean;
  confidence: number;
  decision: "keep" | "revert" | "iterate";
}

function runExperiment(hypothesis: Hypothesis): ExperimentResult {
  const branch = `auto-research/${hypothesis.id}`;

  // Create branch
  execSync(`git checkout -b ${branch}`);

  // Record baseline
  const baseline = measureBenchmark(hypothesis.testFile);

  // Apply patch (pre-generated optimization)
  execSync(`git apply .research/patches/${hypothesis.id}.patch`);

  // Verify
  const testsPassed = runTests();
  const lintPassed = runLint();

  if (!testsPassed || !lintPassed) {
    cleanup(branch);
    return {
      hypothesisId: hypothesis.id,
      branch,
      baseline,
      optimized: baseline,
      improvement: 0,
      testsPassed,
      lintPassed,
      confidence: 0,
      decision: "revert",
    };
  }

  // Measure
  const optimized = measureBenchmark(hypothesis.testFile);
  const improvement = ((baseline - optimized) / baseline) * 100;

  // Calculate confidence
  const confidence = calculateConfidence(baseline, optimized);

  // Decision
  let decision: "keep" | "revert" | "iterate";
  if (improvement >= hypothesis.expectedImprovement && confidence > 0.7) {
    decision = "keep";
  } else if (improvement < 0 || confidence < 0.3) {
    decision = "revert";
  } else {
    decision = "iterate";
  }

  return {
    hypothesisId: hypothesis.id,
    branch,
    baseline,
    optimized,
    improvement,
    testsPassed,
    lintPassed,
    confidence,
    decision,
  };
}

function calculateConfidence(baseline: number, optimized: number): number {
  // Run multiple times for statistical significance
  const runs = 5;
  const results: number[] = [];

  for (let i = 0; i < runs; i++) {
    const time = measureBenchmark(hypothesis.testFile);
    results.push(time);
  }

  const mean = results.reduce((a, b) => a + b, 0) / runs;
  const variance = results.reduce((a, b) => a + (b - mean) ** 2, 0) / runs;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // Coefficient of variation

  // Higher confidence = lower CV + clear improvement
  return Math.max(0, 1 - cv) * (optimized < baseline ? 1 : 0.5);
}
```

### Phase 4: Measure

Detailed measurement and comparison:

```typescript
// scripts/compare-benchmarks.ts
interface BenchmarkComparison {
  metric: string;
  baseline: number;
  current: number;
  delta: number;
  deltaPercent: number;
  isRegression: boolean;
  isSignificant: boolean; // >10% change
}

function compareBenchmarks(
  baseline: BenchmarkResult[],
  current: BenchmarkResult[],
): BenchmarkComparison[] {
  const comparisons: BenchmarkComparison[] = [];

  for (const base of baseline) {
    const curr = current.find(c => c.name === base.name);
    if (!curr) continue;

    const delta = base.duration - curr.duration;
    const deltaPercent = (delta / base.duration) * 100;

    comparisons.push({
      metric: base.name,
      baseline: base.duration,
      current: curr.duration,
      delta,
      deltaPercent,
      isRegression: delta < 0,
      isSignificant: Math.abs(deltaPercent) > 10,
    });
  }

  return comparisons.sort((a, b) => b.deltaPercent - a.deltaPercent);
}

function generateReport(comparisons: BenchmarkComparison[]): string {
  const improvements = comparisons.filter(c => c.deltaPercent > 0);
  const regressions = comparisons.filter(c => c.deltaPercent < 0);

  return `
## Auto Research Results

### Improvements
${improvements.map(c => `- ${c.metric}: ${c.deltaPercent.toFixed(1)}% faster (${c.baseline.toFixed(0)}ms → ${c.current.toFixed(0)}ms)`).join("\n")}

### Regressions
${regressions.map(c => `- ${c.metric}: ${Math.abs(c.deltaPercent).toFixed(1)}% slower (${c.baseline.toFixed(0)}ms → ${c.current.toFixed(0)}ms)`).join("\n")}

### Overall
- Total metrics: ${comparisons.length}
- Improvements: ${improvements.length}
- Regressions: ${regressions.length}
- Net improvement: ${comparisons.reduce((a, c) => a + c.deltaPercent, 0).toFixed(1)}%
`;
}
```

### Phase 5: Adapt

Adaptive iteration based on results:

```typescript
// scripts/adapt-research.ts
interface AdaptationStrategy {
  condition: (result: ExperimentResult) => boolean;
  action: (result: ExperimentResult) => void;
  description: string;
}

const strategies: AdaptationStrategy[] = [
  {
    condition: r => r.decision === "keep" && r.confidence > 0.8,
    action: r => {
      // Commit and merge
      execSync(`git add -A && git commit -m "perf(auto): ${r.hypothesisId}"`);
      execSync(`git checkout main && git merge ${r.branch}`);
      console.log(`✓ Merged ${r.hypothesisId}: ${r.improvement.toFixed(1)}% improvement`);
    },
    description: "Auto-merge high-confidence improvements",
  },
  {
    condition: r => r.decision === "keep" && r.confidence <= 0.8,
    action: r => {
      // Keep branch for manual review
      console.log(`⚠ ${r.hypothesisId} needs review: ${r.improvement.toFixed(1)}% (confidence: ${r.confidence.toFixed(2)})`);
    },
    description: "Flag medium-confidence improvements for review",
  },
  {
    condition: r => r.decision === "revert",
    action: r => {
      // Clean up
      execSync(`git checkout main && git branch -D ${r.branch}`);
      console.log(`✗ Reverted ${r.hypothesisId}`);
    },
    description: "Auto-revert failed experiments",
  },
  {
    condition: r => r.decision === "iterate",
    action: r => {
      // Generate refined hypothesis
      const refinedId = `${r.hypothesisId}-v2`;
      console.log(`↻ Iterating ${r.hypothesisId} → ${refinedId}`);
      // Queue for next loop iteration
      queueHypothesis(refinedId);
    },
    description: "Queue iterations for promising but incomplete results",
  },
];

function adapt(result: ExperimentResult): void {
  for (const strategy of strategies) {
    if (strategy.condition(result)) {
      strategy.action(result);
      break;
    }
  }
}
```

### Running the Full Loop

```bash
#!/bin/bash
# scripts/auto-research-loop.sh

set -euo pipefail

MAX_ITERATIONS="${MAX_ITERATIONS:-5}"
CONFIDENCE_THRESHOLD="${CONFIDENCE_THRESHOLD:-0.7}"
IMPROVEMENT_THRESHOLD="${IMPROVEMENT_THRESHOLD:-10}"

mkdir -p .research/auto/{patches,results,logs}

echo "═══════════════════════════════════════════════"
echo "  AUTO RESEARCH LOOP"
echo "  Max iterations: $MAX_ITERATIONS"
echo "  Confidence threshold: $CONFIDENCE_THRESHOLD"
echo "  Improvement threshold: $IMPROVEMENT_THRESHOLD%"
echo "═══════════════════════════════════════════════"

# Phase 1: Detect
echo ""
echo "═══ Phase 1: Detecting bottlenecks ═══"
npm run bench:all > .research/auto/detect-baseline.log 2>&1
node scripts/detect-bottlenecks.js \
  --input .research/auto/detect-baseline.log \
  --output .research/auto/bottlenecks.json

# Phase 2: Hypothesize
echo ""
echo "═══ Phase 2: Generating hypotheses ═══"
node scripts/generate-hypotheses.js \
  --input .research/auto/bottlenecks.json \
  --output .research/auto/hypotheses.json

# Read hypotheses
hypotheses=$(cat .research/auto/hypotheses.json)
total=$(echo "$hypotheses" | jq '. | length')

echo "Generated $total hypotheses"

# Phase 3-5: Iterate
for ((i = 1; i <= MAX_ITERATIONS; i++)); do
  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  ITERATION $i / $MAX_ITERATIONS"
  echo "═══════════════════════════════════════════════"

  # Get next hypothesis
  hypothesis=$(echo "$hypotheses" | jq -r ".[$i - 1]")
  if [[ "$hypothesis" == "null" ]]; then
    echo "No more hypotheses to test"
    break
  fi

  id=$(echo "$hypothesis" | jq -r '.id')
  echo "Testing: $id"

  # Run experiment
  node scripts/run-auto-experiment.js \
    --hypothesis "$id" \
    --output ".research/auto/results/${id}.json" \
    || echo "Experiment failed: $id"

  # Adapt
  node scripts/adapt-research.js \
    --result ".research/auto/results/${id}.json" \
    --threshold "$CONFIDENCE_THRESHOLD"
done

# Final report
echo ""
echo "═══════════════════════════════════════════════"
echo "  FINAL REPORT"
echo "═══════════════════════════════════════════════"
node scripts/generate-auto-report.js \
  --results-dir .research/auto/results \
  --output .research/auto/report.md

cat .research/auto/report.md
```

### Auto Research Journal

```markdown
# Auto Research Log

## Run: 2024-01-15T10:30:00Z

### Detected Bottlenecks
| Function | File | Severity | Duration |
|----------|------|----------|----------|
| renderDashboard | agent-dashboard.ts | 2.3x | 45ms |
| sortEntries | agent-top-renderer.ts | 1.8x | 12ms |

### Generated Hypotheses
1. **cache-renderDashboard**: Add memoization to dashboard render (confidence: 0.6)
2. **batch-sortEntries**: Batch sort operations (confidence: 0.5)

### Experiment Results
| Hypothesis | Improvement | Confidence | Decision |
|------------|-------------|------------|----------|
| cache-renderDashboard | 32% | 0.85 | keep |
| batch-sortEntries | 8% | 0.45 | iterate |

### Adaptations
- cache-renderDashboard: Auto-merged to main
- batch-sortEntries: Queued for iteration v2

### Net Improvement
- Total: +32% dashboard render time
- Tests: 1006/1006 passing
- Lint: clean
```

### CI Integration

```yaml
# .github/workflows/auto-research.yml
name: Auto Research Loop

on:
  schedule:
    - cron: "0 2 * * 1"  # Weekly Monday 2am
  workflow_dispatch:
    inputs:
      max_iterations:
        description: "Max iterations"
        default: "5"
      target:
        description: "Target file (optional)"
        required: false

jobs:
  research:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm ci

      - name: Run auto research loop
        run: |
          chmod +x scripts/auto-research-loop.sh
          MAX_ITERATIONS="${{ github.event.inputs.max_iterations || 5 }}" \
          TARGET="${{ github.event.inputs.target }}" \
            bash scripts/auto-research-loop.sh

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: research-results
          path: .research/auto/

      - name: Create PR for improvements
        if: success()
        run: |
          if [[ -n $(git status --short) ]]; then
            git checkout -b auto-research/$(date +%Y%m%d)
            git add -A
            git commit -m "perf(auto): automated optimization results"
            git push origin auto-research/$(date +%Y%m%d)
            gh pr create --title "perf(auto): automated optimizations" \
                        --body "Auto-generated improvements from research loop"
          fi
```

### Safety Controls

```typescript
// scripts/safety-checks.ts
interface SafetyConfig {
  maxChanges: number;        // Max files modified per experiment
  maxLineChanges: number;    // Max lines changed per experiment
  forbiddenPatterns: string[]; // Regex patterns that block auto-merge
  requiredTests: string[];     // Tests that must pass
}

const defaultSafety: SafetyConfig = {
  maxChanges: 5,
  maxLineChanges: 100,
  forbiddenPatterns: [
    "eval\\(",           // No eval
    "\\bany\\b",          // No explicit any
    "TODO|FIXME|HACK",    // No temporary fixes
  ],
  requiredTests: [
    "test/dashboard-render-perf.test.ts",
    "test/widget-render-perf.test.ts",
  ],
};

function runSafetyCheck(patch: string, config: SafetyConfig = defaultSafety): boolean {
  // Check file count
  const filesChanged = (patch.match(/^diff --git/g) || []).length;
  if (filesChanged > config.maxChanges) {
    console.error(`Too many files changed: ${filesChanged} > ${config.maxChanges}`);
    return false;
  }

  // Check line count
  const linesChanged = patch.split("\n").length;
  if (linesChanged > config.maxLineChanges) {
    console.error(`Too many lines changed: ${linesChanged} > ${config.maxLineChanges}`);
    return false;
  }

  // Check forbidden patterns
  for (const pattern of config.forbiddenPatterns) {
    const regex = new RegExp(pattern, "i");
    if (regex.test(patch)) {
      console.error(`Forbidden pattern found: ${pattern}`);
      return false;
    }
  }

  return true;
}
```

### Emergency Stop

```bash
# Create emergency stop flag
touch .research/auto/STOP

# In loop, check before each iteration
if [[ -f .research/auto/STOP ]]; then
  echo "Emergency stop detected"
  rm .research/auto/STOP
  exit 0
fi
```

## When to Use This Skill

Invoke this skill when:
- User mentions "optimization", "performance", or "benchmark"
- User mentions "experiment", "research", or "hypothesis"
- User mentions "A/B test", "trial", or "comparison"
- User wants to reduce runtime or bundle size
- User wants to improve ML metrics
- User mentions "research journal" or "experiment log"
- User wants to systematically test multiple approaches
- User mentions "confidence scoring" or "MAD"
- User asks for "auto research", "automated optimization", or "self-improving"
- User wants to run an optimization loop without manual steps
