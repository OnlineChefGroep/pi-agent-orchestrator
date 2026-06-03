# 2026-05-29 - Compaction Engine / Algorithmic Shift
**Systemic Bottleneck:** The `pruneOldToolOutputs` and `estimateTokens` functions in `src/compaction.ts` were utilizing computationally expensive operations inside loops traversing potentially massive arrays of messages. `pruneOldToolOutputs` used `Array.prototype.unshift`, generating a systemic $O(n^2)$ time complexity due to continuous memory shifting. `estimateTokens` used `JSON.stringify` on large arrays of complex objects, incurring massive CPU and memory serialization overhead.
**Refactor Strategy:** Refactored the array construction logic in `pruneOldToolOutputs` to utilize `Array.prototype.push` inside the iteration loop followed by a single, final `Array.prototype.reverse` operation. For `estimateTokens`, replaced most generic `JSON.stringify` serialization with a fast, manual heuristic traversal that counts text block lengths directly and assigns a fixed token weight to non-text blocks.
**Key Metric Shift:**
- Execution time on a benchmark of 200,000 messages (50,000 turns) for `pruneOldToolOutputs` dropped from ~1152ms to ~13ms—an 88x improvement in array construction.
- Execution time for `estimateTokens` on an array of 50,000 deep object blocks dropped from ~42ms to ~7ms—a 6x improvement by bypassing serialization.
**Actionable Principle:** Never use `unshift` inside large loops when array ordering is critical; build the array forwards using $O(1)$ amortized `push` operations and perform a single $O(n)$ `reverse`. Furthermore, avoid generic serialization functions like `JSON.stringify` on large or deeply nested data structures within hot loops when rough heuristic approximations are sufficient.

## 2026-05-29 - Agent Orchestration UI / Tree Graph Generation
**Systemic Bottleneck:** Multi-dimensional agent arrays in `src/output-handler.ts` (`buildExecutionTree`) and `src/agent-tree.ts` (`buildAgentTreeMermaid`) used nested `Array.prototype.filter` operations inside iterative loops to associate child records with their parent or group IDs. This structural pattern produced an $O(N^2)$ algorithmic time complexity, choking the UI event loop and severely degrading dashboard response times when rendering large numbers of active or historic agents (e.g., recursive swarms, task batching).
**Refactor Strategy:** Eliminated iterative scanning. Engineered a pre-calculated index using `Map`s to bucket records linearly. Replaced the nested `.filter()` iterations with immediate $O(1)$ constant-time Map lookups during the recursive generation and edge connections.
**Key Metric Shift:**
- Execution Tree rendering (text format) for 10,000 subagents plummeted from ~2100ms to ~14ms.
- Mermaid graph generation for 10,000 subagents plummeted from ~1500ms to ~75ms.
- 99.3% reduction in synchronous block time on the main thread for UI renders.
**Actionable Principle:** Never use `Array.prototype.filter` or `Array.prototype.find` nested inside outer loops when joining relational datasets in-memory; map the relationships into $O(1)$ HashMaps/Dictionaries during a single pre-pass.
## 2026-06-01 - Tree Rendering / Array Filtering Traversal Shift
**Systemic Bottleneck:** In both `buildAgentTreeMermaid` (`src/agent-tree.ts`) and `buildExecutionTree` (`src/output-handler.ts`), the logic to establish parent-child relationships relied heavily on `Array.prototype.filter()` and `Array.prototype.find()` inside loops or recursive render functions. This resulted in a catastrophic $O(n^2)$ time complexity when generating UI/text tree outputs for deep, large-scale agent execution trees.
**Refactor Strategy:** Pre-computed parent-child structural mappings using `Map<string, AgentRecord[]>` and ID-to-Node lookups using `Map<string, AgentRecord>`. This fundamentally shifted the inner lookup loops from an $O(n)$ array traversal to an $O(1)$ Hash Map operation, effectively flattening the overall algorithm from $O(n^2)$ to $O(n)`.
**Key Metric Shift:**
- Execution time for rendering a 20,000 agent execution tree to Mermaid (`buildAgentTreeMermaid`) dropped from ~15500ms to ~145ms.
- Execution time for rendering the same tree to plain text (`buildExecutionTree` -> text format) dropped from ~17500ms to ~80ms.
**Actionable Principle:** Never use `.find()` or `.filter()` on an entire dataset within a loop or recursive traversal function when generating hierarchical tree structures. Always perform a single-pass $O(n)$ mapping initialization step to construct structural HashMaps before processing data hierarchically.

# 🏎️ Overdrive Architectural Journal

## Systemic Bottleneck
In `src/agent-manager.ts`, the validation feedback processing for failed results was using a chained `.filter().map()` approach, traversing the array multiple times. This led to inefficient execution, creating intermediate arrays inside loops.

## Refactor Strategy
Replaced the `.filter().map()` chain with a single `.reduce()` call. Inside the `.reduce()`, a standard `for...of` loop is used to iterate through criteria, building the detailed string recursively without intermediate array creation or chaining.

## Key Metric Shift
Baseline performance for 10000 items: `~530.2 ms`
Optimized performance (single reduce): `~346.7 ms`
Improvement: `~34.6%` execution time reduction for this specific block of code.

## Actionable Principle
Minimize chained array operations (`filter().map()`) inside heavily hit loops or when processing significant amounts of data. Combine these operations into a single `reduce()` or standard `for` loop to eliminate intermediate array allocations and redundant iterations.
