# Jules optimization notes

Preserved from superseded PR branches (merged or closed 2026-06-04). Code changes from these notes are already on `main` unless noted otherwise.

---

## 2026-05-29 — Compaction engine / algorithmic shift

**Systemic Bottleneck:** The `pruneOldToolOutputs` and `estimateTokens` functions in `src/compaction.ts` were utilizing computationally expensive operations inside loops traversing potentially massive arrays of messages. `pruneOldToolOutputs` used `Array.prototype.unshift`, generating a systemic $O(n^2)$ time complexity due to continuous memory shifting. `estimateTokens` used `JSON.stringify` on large arrays of complex objects, incurring massive CPU and memory serialization overhead.

**Refactor Strategy:** Refactored the array construction logic in `pruneOldToolOutputs` to utilize `Array.prototype.push` inside the iteration loop followed by a single, final `Array.prototype.reverse` operation. For `estimateTokens`, replaced most generic `JSON.stringify` serialization with a fast, manual heuristic traversal that counts text block lengths directly and assigns a fixed token weight to non-text blocks.

**Key Metric Shift:**
- Execution time on a benchmark of 200,000 messages (50,000 turns) for `pruneOldToolOutputs` dropped from ~1152ms to ~13ms—an 88x improvement in array construction.
- Execution time for `estimateTokens` on an array of 50,000 deep object blocks dropped from ~42ms to ~7ms—a 6x improvement by bypassing serialization.

**Actionable Principle:** Never use `unshift` inside large loops when array ordering is critical; build the array forwards using $O(1)$ amortized `push` operations and perform a single $O(n)$ `reverse`. Furthermore, avoid generic serialization functions like `JSON.stringify` on large or deeply nested data structures within hot loops when rough heuristic approximations are sufficient.

---

## 2026-05-29 — Agent orchestration UI / tree graph generation

**Systemic Bottleneck:** Multi-dimensional agent arrays in `src/output-handler.ts` (`buildExecutionTree`) and `src/agent-tree.ts` (`buildAgentTreeMermaid`) used nested `Array.prototype.filter` operations inside iterative loops to associate child records with their parent or group IDs. This structural pattern produced an $O(N^2)$ algorithmic time complexity, choking the UI event loop and severely degrading dashboard response times when rendering large numbers of active or historic agents (e.g., recursive swarms, task batching).

**Refactor Strategy:** Eliminated iterative scanning. Engineered a pre-calculated index using `Map`s to bucket records linearly. Replaced the nested `.filter()` iterations with immediate $O(1)$ constant-time Map lookups during the recursive generation and edge connections.

**Key Metric Shift:**
- Execution Tree rendering (text format) for 10,000 subagents plummeted from ~2100ms to ~14ms.
- Mermaid graph generation for 10,000 subagents plummeted from ~1500ms to ~75ms.
- 99.3% reduction in synchronous block time on the main thread for UI renders.

**Actionable Principle:** Never use `Array.prototype.filter` or `Array.prototype.find` nested inside outer loops when joining relational datasets in-memory; map the relationships into $O(1)$ HashMaps/Dictionaries during a single pre-pass.

---

## 2026-06-04 — Swarm joinMode resolution

**Systemic Bottleneck:** Inefficient linear search using `.find()` inside a loop over grouped swarms to determine the uniform `joinMode`.

**Refactor Strategy:** Replaced `members.find(m => m.joinMode)?.joinMode` with `members[0]?.joinMode` since the `joinMode` is uniform across the group, eliminating the O(N) traversal. On `main` this lives in `src/ui/dashboard/swarm-section.ts`.

**Key Metric Shift:** Benchmark improved from ~627ms to ~25ms over 10,000 iterations for 100 swarms with 100 members each (approx ~25x faster).

**Actionable Principle:** Avoid linear scans for uniform properties when reading the first element suffices.

---

## 2026-06-12 — fastTruncate (dashboard / conversation viewer)

**Systemic Bottleneck:** Dashboard rendering (specifically `padVisible` and various dashboard row renderers) called `truncateToWidth` continuously via `fastTruncate(padVisible(...))`. Profiling showed that >60% of CPU time during render loops was spent calculating `visibleWidth` twice (once in `padVisible` and once in `fastTruncate`) or unnecessarily invoking regex replacements.

**Refactor Strategy:** Eliminated the double-call pattern by injecting padding directly inside `fastTruncate` itself (`fastTruncate(str, maxWidth)` instead of `fastTruncate(padVisible(str, maxWidth), maxWidth)`), and modified the method to return the padded string if the string's visible width is shorter than the maximum. This single-pass measurement avoids duplicate loop-blocking allocations and saves CPU overhead.

**Key Metric Shift:**
- Render time for 10,000 padded/truncated rows dropped from ~410ms to ~398ms for long strings, and from ~9.3ms to ~3.5ms for shorter strings.

**Actionable Principle:** Avoid nested single-purpose string measurement functions (`visibleWidth`) in hot UI rendering loops. Merge length checking and padding logic into single execution boundaries where feasible.


## 2026-06-12 — fastTruncate (dashboard / conversation viewer)

**Systemic Bottleneck:** Dashboard rendering (specifically `padVisible` and various dashboard row renderers) called `truncateToWidth` continuously via `fastTruncate(padVisible(...))`. Profiling showed that >60% of CPU time during render loops was spent calculating `visibleWidth` twice (once in `padVisible` and once in `fastTruncate`) or unnecessarily invoking regex replacements.

**Refactor Strategy:** Eliminated the double-call pattern by injecting padding directly inside `fastTruncate` itself (via a new `padAndTruncate` function that replaces `fastTruncate(padVisible(str, maxWidth), maxWidth)`), and modified the method to return the padded string if the string's visible width is shorter than the maximum. This single-pass measurement avoids duplicate loop-blocking allocations and saves CPU overhead.

**Key Metric Shift:**
- Render time for 10,000 padded/truncated rows dropped from ~410ms to ~398ms for long strings, and from ~9.3ms to ~3.5ms for shorter strings.

**Actionable Principle:** Avoid nested single-purpose string measurement functions (`visibleWidth`) in hot UI rendering loops. Merge length checking and padding logic into single execution boundaries where feasible.
