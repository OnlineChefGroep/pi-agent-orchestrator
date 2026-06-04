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

### Date: 2026-06-04
#### Systemic Bottleneck
The `buildExecutionTree` function in `src/output-handler.ts` was executing an `O(N^2)` lookup pattern when traversing and formatting the agent execution tree into text. For each node in the tree hierarchy, it invoked `records.find(x => x.id === nodeId)`, resulting in an iterative scan of the entire `records` array inside a recursive traversal function. This severely degraded performance as the depth and breadth of the agent swarm grew.

#### Refactor Strategy
Pre-calculated lookups. A `nodeMap` (Map<string, AgentRecord>) was constructed from the initial `records` array iteration before recursion began. Inside the recursive `render` function, the `Array.find()` was replaced by a `nodeMap.get(nodeId)` invocation, converting the linear `O(N)` scan per node into an `O(1)` constant time hash lookup.

#### Key Metric Shift
- **Baseline (10,000 records):** ~660.75ms
- **Optimized (10,000 records):** ~15.94ms
- **Improvement:** ~97.5% reduction in execution time (41x speedup). The algorithmic complexity was shifted from O(N^2) to O(N).

#### Actionable Principle
Inside recursive structures or tight nested loops, always pre-calculate relationship indices using `Map` objects. Never rely on `Array.find` or `Array.filter` within recursive tree walks, as this trivially scales computational complexity into polynomial bounds.
