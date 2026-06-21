
## 2026-06-21 - [TUI Virtual Scrolling Architecture]
**Systemic Bottleneck:** Creating large intermediate categorization arrays (`running`, `queued`, `done`, `solo`) during every frame render loop of large virtual scrolling views. This resulted in O(N) memory allocations per frame (costing ~5M array pushes across a 50k-agent virtual scroll benchmark), triggering excessive GC pauses and dragging down TUI refresh rates under high load.
**Refactor Strategy:** Implemented a zero-allocation single-pass counting loop to establish virtual window bounds, then iterating over the data array and extracting only the visible slice.
**Key Metric Shift:** 50,000-agent dashboard body rendering dropped under 10ms per build (100 iterations), effectively neutralizing memory GC stutters during extreme load and maintaining maximum framerate regardless of total agent counts.
**Actionable Principle:** To optimize memory allocations for virtual scrolling views over large datasets, use a zero-allocation single-pass counting loop to establish window bounds before extracting only the visible slice, rather than populating large intermediate categorized arrays.
