# Render Metrics Reference

## RenderMetrics Class

Tracks per-frame timing for performance analysis.

```typescript
import { RenderMetrics } from "../src/ui/render-metrics.js";

const metrics = new RenderMetrics();

// After each render
const start = performance.now();
renderDashboard(agents);
const end = performance.now();

metrics.recordRender(start, end, agents.length);
```

## Snapshot Interface

```typescript
interface RenderMetricsSnapshot {
  /** Total time spent rendering (ms) */
  totalMs: number;
  /** Number of render calls */
  count: number;
  /** Average render time (ms) */
  avgMs: number;
  /** Maximum render time (ms) */
  maxMs: number;
  /** 95th percentile render time (ms) */
  p95Ms: number;
  /** Number of agents at max render time */
  agentsAtMax: number;
}
```

## Benchmark Thresholds

| Agent Count | Target | Warning | Fail |
|-------------|--------|---------|------|
| 10 | < 5ms | 5-8ms | > 8ms |
| 50 | < 10ms | 10-16ms | > 16ms |
| 100 | < 16ms | 16-25ms | > 25ms |
| 200 | < 33ms | 33-50ms | > 50ms |
| 1000 | < 100ms | 100-150ms | > 150ms |

## Interpreting Metrics

### High avgMs, low maxMs
- Consistent overhead (theme calculation, string formatting)
- Fix: Memoize expensive calculations

### Low avgMs, high maxMs
- Occasional spikes (large agent lists, full re-render)
- Fix: Optimize worst-case path, improve dirty flag

### High agentsAtMax
- Performance scales with agent count
- Fix: Verify virtual scrolling is working

### Increasing p95Ms over time
- Memory leak or accumulated state
- Fix: Check for unclosed subscriptions, growing caches

## Logging Format

```
BENCHMARK PASS: 100 agents — 12ms (75%)
BENCHMARK WARN: 500 agents — 28ms (85%)
BENCHMARK FAIL: 1000 agents — 180ms (180%)
```

Percentages are relative to threshold:
- < 80%: Green (comfortable headroom)
- 80-100%: Yellow (near threshold)
- > 100%: Red (exceeds threshold)
