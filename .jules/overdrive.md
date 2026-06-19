## 2024-06-17 - TUI Rendering Optimization

**Systemic Bottleneck:** TUI dashboard rendering was spending excessive time chaining `padVisible` and `fastTruncate`, leading to redundant string allocations and CPU overhead in hot rendering loops.
**Refactor Strategy:** Introduced `padAndTruncate` combined utility that determines visible width in a single pass and pads/truncates appropriately, replacing chaining of `fastTruncate(padVisible(...))`. Also replaced array `.map().filter().join()` chains with explicit loops in certain areas to reduce intermediate allocations.
**Key Metric Shift:** padVisible+fastTruncate time dropped from ~11.2ms to ~3.5ms for 10k iterations.
**Actionable Principle:** For extreme performance optimization in hot-rendering loops, avoid chaining utilities that perform redundant passes (like `visibleWidth`); prefer combined functions.
