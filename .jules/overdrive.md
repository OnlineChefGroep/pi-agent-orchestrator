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
## Optimize agent key resolution to O(1)

### Systemic Bottleneck
In `src/agent-types.ts`, the `resolveKey` function used a linear search (`O(N)`) over all agent keys to find a case-insensitive match for the provided agent name. While the number of default agents is small, this linear search is called frequently and its performance degrades linearly as the number of agents grows (which can easily happen with dynamically registered user agents or in a loop context). The `resolveKey` function is a core utility used in multiple places within the code.

### Refactor Strategy
To eliminate the linear search, we introduced an auxiliary Map called `lowerCaseKeys` that caches the lowercased version of each agent's name to its original casing. This map is updated in `registerAgents` alongside the primary `agents` map. The `resolveKey` function now simply checks the primary map, and if not found, performs a direct `O(1)` lookup in the `lowerCaseKeys` map.

### Key Metric Shift
- **Baseline Performance:** Resolving 100,000 keys simulating worst-case resolution (non-existent key) across 1,000 simulated agents took approximately ~4007 ms.
- **Optimized Performance:** Resolving the same 100,000 keys took approximately ~15 ms.
- **Improvement:** This represents a >99% reduction in execution time for the `resolveKey` function in worst-case scenarios, significantly reducing CPU cycles and improving overall application responsiveness when handling agent resolution.

### Actionable Principle
When resolving keys case-insensitively, especially in frequently executed or core functions, maintain an auxiliary lookup map (e.g., lowercased to original) to achieve O(1) time complexity rather than relying on linear O(N) searches.

## Optimization: Async refactor of custom agent loading (2026-06-03)

### Systemic Bottleneck
The `loadFromDir` function in `src/custom-agents.ts` was performing sequential synchronous filesystem reads (`readFileSync`) inside a loop over custom agent markdown files. During initialization or when reloading agents (which happens frequently such as when spawning new agents or editing them via the TUI wizard), this would block the Node.js event loop, causing visual stutters in the TUI dashboard. Benchmarks showed synchronous IO looping took ~151ms for 1,000 files, blocking the main thread entirely.

### Refactor Strategy
1. Upgraded `readdirSync` to use `fs/promises.readdir` with `{ withFileTypes: true }`, bypassing the need for per-file `lstatSync` checks to filter symbolic links.
2. Refactored the internal `for` loop to use `Promise.all` alongside `fs/promises.readFile`, allowing parallel background I/O.
3. Propagated the async signature (`Promise<void>`) all the way up through `loadCustomAgents` to `reloadCustomAgents` in `src/agent-registry.ts`.
4. Updated all callers (TUI wizards, agent tools, output handlers, and index entrypoint) to properly `await` the reloads.

### Key Metric Shift
- Reduced main-thread blocking time during agent reloading from ~150ms to <20ms (offloaded to threadpool).
- Measured overall IO latency improvement of >30% for bulk file reading (from 151ms to 102ms), but more importantly reduced event loop blocking time to nearly zero, fixing TUI stutters.

### Actionable Principle
Never execute synchronous bulk I/O (`readFileSync` inside loops) on the main thread in a TUI-driven interactive CLI. Always propagate async I/O up the call stack and use `Promise.all` where feasible to ensure the event loop is yielded to the renderer.
