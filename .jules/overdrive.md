## 2026-06-16 - Dashboard Body Virtual Scroll Overhaul

**Systemic Bottleneck:** The TUI dashboard rendering loop in `src/ui/dashboard/body.ts` was executing `O(N)` arrays allocations and destructuring passes (where `N` is total spawned agents) on every render tick for the virtual scroll window. Even though it only displayed a `VIRTUAL_WINDOW` of 50 agents, it built intermediate arrays (`running`, `queued`, `done`) of sizes up to 50,000 for each status bucket and utilized `Set`/`Map` objects repeatedly, taking over 500ms to build the body lines on the benchmark.

**Refactor Strategy:** Implemented a pure, minimal allocation counting phase first to establish index bounds, followed by a direct collection pass using pre-allocated sized arrays. Intermediate arrays and expensive Sets/Maps were dropped inside the hot loops. Iteration logic was restructured to just track `rc`, `qc`, and `dc` cursors. Pushing formatted strings directly out of the matched arrays.

**Key Metric Shift:** Render time for 50,000 agents body line generation dropped from ~500ms down to ~186ms, significantly unblocking the event loop for massive swarms. Execution throughput increased by roughly 2.5x with drastically reduced garbage collection thrash.

**Actionable Principle:** In high-frequency render or UI calculation paths, decouple bounding logic from data allocation. Never allocate memory structures relative to total dataset size `O(N)` if output relies on window subsets `O(W)`.
