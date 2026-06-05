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

## 2026-06-04 — fastTruncate (dashboard / conversation viewer)

**Systemic Bottleneck:** Dashboard rendering (specifically `padVisible` and various dashboard row renderers) called `truncateToWidth` continuously. Profiling showed that >60% of CPU time during render loops was spent in `truncateToWidth` string regex replacements, taking ~130ms for 10,000 calls.

**Refactor Strategy:** Introduced `fastTruncate(str, maxWidth)` which first checks `visibleWidth(str) <= maxWidth`. Because most strings are actually well within their maximum width limit, this bypasses the expensive truncation logic 99% of the time. Replaced `truncateToWidth` with `fastTruncate` across dashboard files and `conversation-viewer.ts`. On `main` see `src/ui/theme.ts`.

**Key Metric Shift:** A 1000-render loop benchmark with 100 mock agents went from ~22,000ms down to ~1,000ms, representing a >20x speedup in raw string processing/layout.

**Actionable Principle:** For TUI rendering or padding operations, avoid applying expensive string transformations (like regex-based truncation) unless a cheap bounds check (like `visibleWidth`) proves it is strictly necessary.

---

## 2026-06-04 — Input validation DoS via implicit iteration

**Systemic Bottleneck:** The `sanitizeValidatorInput` function in `src/validators.ts` relied on `Array.from(str)` and `.replace()` without explicitly verifying that the input was actually a primitive string type. When maliciously crafted arrays or iterable objects with large `length` values were passed, the .replace() regex iterated over every element of the input (treating it as array-like) and `Array.from(...)` then traversed the full length to build a character array — both O(N) operations on data of attacker-controlled size. This caused the Node.js event loop to block for tens of seconds, resulting in a denial of service.

**Refactor Strategy:** Added an explicit, early type guard `if (typeof input !== 'string') return '';` at the top of `sanitizeValidatorInput`. The check is the cheapest possible O(1) operation (a single tag comparison) and short-circuits before any iteration, truncation, or regex work.

**Key Metric Shift:** Execution time for a crafted adversarial iterable input of length 10,000,000 dropped from ~10,375 ms to < 1 ms — an instant rejection, freeing the event loop for other work.

**Actionable Principle:** Never assume input data originating from potentially untrusted LLM outputs or API endpoints matches the expected TypeScript type. Always explicitly perform primitive type checking (e.g. `typeof input === 'string'`) prior to performing O(N) operations like spread syntax `[...str]`, `Array.from()`, `.length` checks, or `.replace()` with `g` flag on user-controlled data.

---

## 2026-06-05 — Stale PR branches removed (housekeeping)

Log of PR branches superseded by the optimizations already on `main` and closed/deleted as part of routine cleanup. Code in this section describes *what was removed*, not new performance work.

- `jules-17395782889347801643-1f9e99e5` (PR #89, "⚡ [Optimize Execution Tree Construction from O(N^2) to O(N)]"): the `nodeMap`/`childrenMap` hash-map lookup in `buildExecutionTree` was already merged to `main` in commit `3089a297` (2026-05-29). The branch's only material delta was an `export` keyword (plus JSDoc) on `buildExecutionTree` and a new `test/tree-construction.benchmark.test.ts` that uses `console.log` + `toContain` rather than the project's `toBeLessThan` threshold convention. The `.jules/overdrive.md` addition on the branch duplicated the consolidated notes above. PR closed (not merged) and remote branch deleted.
## 2026-06-05 - Dashboard Body and Swarm Agent Filtering

**Systemic Bottleneck:** The UI rendering logic in `src/ui/dashboard/body.ts` and `src/ui/dashboard/swarm-section.ts` used repeated nested `Array.prototype.filter` and `Array.prototype.find` array traversals to group agents into segments (swarms, running, queued, and done). This resulted in an implicit O(N) penalty multiplied across each group rendering phase, choking large scale agent displays with frequent event loop stutters.

**Refactor Strategy:** Implemented a single-pass architectural bucketing step at the beginning of the render frame using pre-allocated arrays and an O(1) tracking map for swarms (`firstSwarmAgentMap` / `grouped`). By categorizing state exclusively in one loop, all subsequent UI group renders leverage pre-sliced data.

**Key Metric Shift:**
- The time to calculate dashboard bodies for 50,000 agents over 100 render loops was reduced from ~674ms to ~337ms (a 50% speedup).
- The swarm section processing similarly bypassed implicit loops for faster map lookup resolution.

**Actionable Principle:** Avoid multiple sequential array `.filter` iterations on the same source data over the critical rendering path. Instead, perform a single O(N) iteration mapping into distinct category buckets or O(1) dictionaries to ensure layout algorithms remain lightweight.
