
## 2025-02-24 - AgentDashboard Virtual Scroll / AgentWidget Refactor
**Systemic Bottleneck:** Multi-pass array operations and temporary wrapper array allocations during UI updates for large agent lists (`getVisibleWindow` in `agent-widget.ts` and `buildVirtualBodyLines` in `dashboard/body.ts`), which caused massive memory pressure and CPU blocking over hot-rendering loops for many thousands of agents.
**Refactor Strategy:** Implemented single-pass counting loops and zero-allocation sliding window extractions. Eliminated intermediate `.push()` operations by maintaining counter offsets during iteration and pre-calculating index bounds before selecting visible sub-arrays. Used `Object.create(null)` for rapid map checking.
**Key Metric Shift:**
- `dashboard/body.ts` virtual body rendering reduced from >215ms to ~165ms on massive payloads (50k agents × 100 iterations), a ~25% reduction.
- `agent-widget.ts` intermediate array allocations effectively eliminated.
**Actionable Principle:** In high-frequency rendering pipelines and virtual scroll view-ports, perform one non-allocating pass over the source data to compute sizes/indexes, then perform a targeted extraction loop, instead of pushing into intermediate memory-bloated category arrays.
