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

**Systemic Bottleneck:** The UI rendering logic in `src/ui/dashboard/body.ts` and `src/ui/dashboard/swarm-section.ts` used repeated nested `Array.prototype.filter` and `Array.prototype.find` array traversals to group agents into segments (swarms, running, queued, and done). This resulted in an implicit O(N) penalty multiplied across each group rendering phase, choking large-scale agent displays with frequent event loop stutters.

**Refactor Strategy:** Implemented a single-pass architectural bucketing step at the beginning of the render frame using pre-allocated arrays and an O(1) tracking map for swarms (`firstSwarmAgentMap` / `grouped`). By categorizing state exclusively in one loop, all subsequent UI group renders leverage pre-sliced data.

**Key Metric Shift:**
- The time to calculate dashboard bodies for 50,000 agents over 100 render loops was reduced from ~674ms to ~337ms (a 50% speedup).
- The swarm section processing similarly bypassed implicit loops for faster map lookup resolution.

**Actionable Principle:** Avoid multiple sequential array `.filter` iterations on the same source data over the critical rendering path. Instead, perform a single O(N) iteration mapping into distinct category buckets or O(1) dictionaries to ensure layout algorithms remain lightweight.

---

## 2026-06-08 - Array Iteration over filter/map in rendering paths

**Systemic Bottleneck:** Hot rendering paths in `AgentWidget` and `AgentDashboard` (specifically `update()`, `getVisibleWindow()`, `renderAgentWidget()`, and headers) were heavily reliant on declarative array operations like `Array.prototype.filter()`. In an environment where the agent array can contain hundreds or thousands of elements, `filter` allocates a new array, iterates internally, and yields control back to the callback, causing significant memory pressure (GC churn) and redundant N iterations when multiple categories (running, queued, finished) were needed.

**Refactor Strategy:** Refactored multiple `filter` and chained operations across `src/ui/agent-widget.ts`, `src/ui/agent-widget-renderer.ts`, `src/ui/dashboard/header.ts`, `src/ui/dashboard/body.ts`, `src/ui/agent-dashboard.ts`, and `src/output-handler.ts` into single-pass `for` loops utilizing direct array indexing and explicit `push()` or counter increments.

**Key Metric Shift:**
- The `AgentDashboard` render benchmarks for large and extreme cases (200-1000 agents) dropped from ~24ms to ~10-15ms.
- The `AgentWidget` `buildSnapshot` and render loop benchmarks improved by up to 25-30% execution time decrease.
- Reduced GC allocation overhead substantially for sustained fast update rendering.

**Actionable Principle:** For operations involving filtering, grouping, or counting large arrays within high-frequency functions (like UI render ticks), single-pass traditional `for` loops significantly outperform `Array.prototype.filter` or chained methods due to zero callback allocation overhead and strict sequential memory access.

---

## 2026-06-09 - TUI Rendering Optimization (Swarm Section)

**Systemic Bottleneck:** In the dashboard rendering loop for the swarm section, the deterministic layout constants `cardW` and `contentW` were recalculated for each swarm group in the loop `for (const [swarmId, members] of grouped)`, which creates unnecessary CPU overhead on the main thread during UI updates.

**Refactor Strategy:** Hoisted the deterministic string calculations and visual padding dimension constraints outside the agent iteration loops to reuse the layout constants across the function call.

**Key Metric Shift:** Bypassed repetitive mathematical operations for deterministic UI constraints inside `src/ui/dashboard/swarm-section.ts`, saving processing time on dashboard render updates.

**Actionable Principle:** In TUI rendering loops, strictly hoist any deterministic dimension constraint, structural string calculation, or visual padding generation outside of agent iteration loops to minimize main-thread CPU overhead and improve responsiveness.

---

## 2026-06-12 — Dead allocation removal (virtual-scrolling bucketing)

**Systemic Bottleneck:** The `buildVirtualBodyLines` function in `src/ui/dashboard/body.ts` (the virtual-scrolling path used when the agent count exceeds the visible window) allocated a `solo: AgentRecord[]` array and called `solo.push(a)` for every non-swarm agent inside the single-pass bucketing loop. The `solo` array was never read in the virtual-scrolling path — agents are rendered by status (running/queued/done) or by swarm, never by a "solo" bucket. The non-virtual `renderAgentSections` path has its own independent `solo` array and is unaffected. With 50,000 agents × 100 iterations in the benchmark, this cost ~5,000,000 useless pushes (plus periodic array growth reallocations) on a path that should have been a tight per-agent categorize-and-dispatch.

**Refactor Strategy:** Removed the dead `const solo: AgentRecord[] = [];` and `solo.push(a);` lines from the bucketing loop in `buildVirtualBodyLines`. Also dropped a redundant local `const total = agents.length;` (the function already declares `total` at the top of its scope). The non-virtual `renderAgentSections` path was verified to be untouched.

**Key Metric Shift:** `buildDashboardBodyLines` (50,000 agents × 100 iterations, via `test/dashboard.benchmark.test.ts`):
- Baseline: 621.348ms / 597.417ms / 601.283ms (mean ~606.7ms)
- Optimized: 542.970ms / 458.876ms / 447.737ms (mean ~483.2ms)
- **~20.3% faster** on the virtual-scrolling hot path.

**Actionable Principle:** When refactoring a hot loop, grep for any local array variable that is declared inside the loop body but never read after the loop. A `const x: T[] = []; ... x.push(item);` with no `for (const ... of x)` or `x.length` / `x[i]` consumer downstream is dead code masquerading as logic — it allocates, it grows, it pushes, and V8 cannot elide it. A pure dead-code elimination in a hot loop is often the highest-leverage, lowest-risk optimization available (no semantic change, no API change, no test fixtures change, no public-surface change). When measuring render performance, look for *allocate-and-forget* patterns before reaching for algorithmic complexity changes.

---

## 2026-06-12 — Queued-line rendering O(K×N) → O(N+K) (widget bulk-spawn)

**Systemic Bottleneck:** The `renderAgentWidget` queued-line rendering loop in `src/ui/agent-widget-renderer.ts` used an interleaved two-level iteration: for each unique queued type (K), it pushed either a compact summary line (when `group.count >= BATCH_COMPACT_THRESHOLD=3`) or an individual line for each agent of that type via a *nested* `for` loop over the full `queued` array (N), skipping non-matching types via `if (a.type !== key) continue;`. This is an $O(K \times N)$ pattern: with 20 unique types and 40 queued agents the inner loop performed 20 × 40 = 800 type-comparisons per unique type, totaling **1,600 type-comparisons per render**. In real bulk-spawn scenarios where a parent agent fans out into many distinct sub-agent types, K can grow much larger than the existing test fixtures suggested, making the inner loop a real scalability bottleneck rather than a theoretical one.

**Refactor Strategy:** Replaced the interleaved compact/individual loop with two separate passes:
1. **Pass 1 (O(K)):** iterate the pre-built `queuedByType` map once and push compact summary lines for any group with `count >= BATCH_COMPACT_THRESHOLD`.
2. **Pass 2 (O(N)):** single pass over the `queued` array; for each agent, do one O(1) map lookup to check whether its group is already handled as compact (`group.count >= threshold`) — if so, skip; otherwise push an individual line.

Output order is preserved (all compact lines appear first in map insertion order, then all individual lines in `queued` array order), which matches the old interleaved pattern because each type's individual lines were already filtered to only that type and appeared in `queued` array order. A `BATCH_COMPACT_THRESHOLD = 3` constant was hoisted at module scope (line 14) for clarity.

**Key Metric Shift:** New K>>3 individual-line benchmark (`test/widget-render-perf.test.ts`, 20 unique types × 2 queued each = 40 total queued, all per-type counts < `BATCH_COMPACT_THRESHOLD=3`):
- **0.248ms per render** (threshold 2ms, well under).
- Algorithmic complexity: $O(K \times N) = 1{,}600$ type-comparisons → $O(N + K) = 60$ lookups, a **~27× reduction in the hot loop**.
- At 3 unique types (the prior test regime), the absolute win is small (K×N = 150 → N+K = 53), which is why the refactor was originally almost invisible to CI — the follow-up K>>3 individual-line test (PR #148) was added specifically to make this win CI-visible for the first time.

**Actionable Principle:** When a loop body contains a *nested* loop that re-iterates an outer collection with a per-element key comparison, you almost certainly have an $O(K \times N)$ hidden in an otherwise-acceptable-looking single-pass function. The fix is mechanical: bucket the outer collection into a `Map<key, group>` in a single pre-pass, then replace the inner loop with one O(1) lookup per outer element. Two-pass code is usually *faster* than "smart" one-pass code because branch predictors love the clean loop and V8 can hoist the map lookup into a hidden class. Also: when you ship an algorithmic-complexity refactor, *write a test that exercises the regime where the win shows up* — without the K>>3 test, this fix was invisible to the CI threshold check and could have been silently reverted.

---

## 2026-06-12 — BFS sort-on-cache-miss + head-index (skill-loader)

**Systemic Bottleneck:** The `bfsForSkill` function in `src/skill-loader.ts` (the core directory-walking loop used to find skill directories by name) had two latent algorithmic issues in its reversed-order hot path (distractors alphabetically first, skills alphabetically last):
1. `entries.sort()` was called on **every** BFS visit, even when the entries came from the `ctx.dirEntries` cache. The cache made the `readdirSync` I/O free, but the `O(K log K)` sort still ran on every pop. With 5 skills and 10 distractor dirs, the sort ran ~50 times per `preloadSkills` call instead of ~10 times.
2. `queue.shift()` is `O(N)` — it re-indexes the entire array on every pop. In a BFS with B branches and depth D, this makes the overall traversal `O(B * D^2)` overall — a hidden quadratic that grows with the number of skills and the depth of the directory tree.

**Refactor Strategy:** Two mechanical fixes in `bfsForSkill`:
1. Moved `entries.sort()` **inside** the cache-miss branch. `readdirSync` returns a fresh array we can mutate in-place and cache; sorting once on miss and reusing the sorted result across subsequent BFS visits is sound and saves an `O(K log K)` sort per visit. The new invariant is "the cache holds sorted entries".
2. Replaced `queue.shift()!` with an index-based head pointer: `let head = 0; const current = queue[head++];`. The `queue` is now used as a ring/array (items are never removed, just consumed via the head index), giving `O(1)` per pop and making the overall traversal `O(B * D + sort cost)`.

The initial BFS queue from `index.nonSkillDirs` is already in sorted order (built by iterating `buildRootIndex`'s pre-sorted `entries`), so the new "cache holds sorted entries" invariant is consistent with the existing ordering guarantee — the BFS traversal remains deterministic byte-order.

**Key Metric Shift:** `test/spawn-latency-bench.test.ts` reversed-order benchmarks:
- `preloadSkills 5 dir-skill reversed-order`: 0.691ms → 0.626-0.659ms (~5-10% faster; 40× headroom under the 25ms threshold)
- `preloadSkills 10 dir-skill reversed-order`: 1.227ms → 1.213-1.344ms (within noise; 37× headroom under the 50ms threshold)
- **Algorithmic complexity:** `O(B * D^2)` → `O(B * D)` in the BFS traversal (the `shift()` was the hidden quadratic).

**Honest assessment:** unlike the dashboard dead-allocation win (clean ~20% speedup) or even the widget O(K×N)→O(N+K) refactor (clean ~27× hot-loop reduction with a CI-visible test), this BFS fix is primarily an **algorithmic correctness win** — the absolute time savings are modest because the BFS was already fast at the benchmark scale (10-20 dirs doesn't expose the worst case). The real value is the complexity shift and the code clarity: the sort is now co-located with the I/O that produces the entries (not detached and re-applied per visit), and the BFS no longer carries a hidden quadratic from the `shift()`.

**Actionable Principle:** When reviewing a loop that uses `Array.shift()` (or any "remove the first element" pattern), it is almost always wrong — `shift()` is `O(N)` and turns any loop that uses it into at least `O(N^2)`. The fix is mechanical: keep a `head` index, consume via `queue[head++]`, check `head < queue.length` for termination. Same rule for the "sort on every iteration" pattern: if the data you're sorting comes from a cache (or is otherwise deterministic and immutable), sort once when you first acquire the data and cache the sorted result. Two patterns, both mechanical to fix, both hidden until you measure at scale or in the worst case.

---

## 2026-06-12 — Duplicate `isHandoffArtifactV2` call eliminated (handoff parse time)

**Systemic Bottleneck:** The `parseHandoff` function in `src/handoff.ts` (the hot path for structured handoff parsing at the end of every chained-agent response) was calling `isHandoffArtifactV2(value)` **twice per artifact** — once inside `isCoercibleArtifactShape` (called by `validateHandoffShape` during handoff-level validation), and once again in the coercion step (the `.map((a) => isHandoffArtifactV2(a) ? a : coerceLegacyArtifact(a))` line). Each call is non-trivial: it does a type check, an array check, a `switch` on `obj.type` over 4 cases (file/branch/url/note), and per-case field validation (string length checks against `MAX_ARTIFACT_PATH_LENGTH`, `MAX_ARTIFACT_URL_LENGTH`, `MAX_ARTIFACT_TITLE_LENGTH`, `MAX_ARTIFACT_VALUE_LENGTH`, etc.). For a handoff with `MAX_ARTIFACTS_COUNT=50` artifacts, that's **100 wasted `isHandoffArtifactV2` calls per parse** — pure duplicate work in the most common code path (v2-strict artifacts, which are the default for new agents).

**Refactor Strategy:** Removed the explicit `isHandoffArtifactV2(value)` call from `isCoercibleArtifactShape`. The loose check below it (path/url/branch/title+value fields) is a verified **superset** of "is v2-strict + coercible":
- v2 file `{type: "file", path: "/x.ts"}` → loose check matches `path` is non-empty string → true
- v2 branch `{type: "branch", branch: "fix/x"}` → loose check matches `branch` is non-empty string → true
- v2 url `{type: "url", url: "https://x.com"}` → loose check matches `url` is non-empty string → true
- v2 note `{type: "note", title: "T", value: "V"}` → loose check matches `title + value` both non-empty → true

So every v2-typed artifact passes the loose check, and the strict v2 check then runs **once** in the coercion step (not twice). Net: 1 `isHandoffArtifactV2` call per artifact instead of 2 — 50 saved calls for a 50-artifact handoff. The 27 existing handoff-v2 tests confirm semantic equivalence (all green).

**Key Metric Shift:** New `Benchmark: parseHandoff — parse time` describe block in `test/handoff-v2.test.ts` (5 regimes):
- `parseHandoff large 50 v2 artifacts` (the K>>3-equivalent for the artifact path): **0.192-0.207ms → 0.130-0.160ms** (~10-30% improvement, well under 2ms threshold)
- `parseHandoff large 50 legacy artifacts` (exercises the coercion path): **0.243-0.256ms → 0.190-0.220ms** (~10-15% improvement)
- `parseHandoff over-limit strings` (12000-char summary + 51000-char note value, actually exercises `truncateStrings` slice): 0.035-0.052ms → 0.030-0.045ms (within noise, but the benchmark itself is new — without it the truncation path was invisible to CI)

The over-limit-strings benchmark was deliberately bumped from 2000 chars (which did NOT exercise the truncation path because `MAX_SUMMARY_LENGTH=10000`) to 12000 chars + a 51000-char note value (which DOES exercise the inner `obj.slice(0, MAX_STRING_LENGTH)` call). This makes the `truncateStrings` defense-in-depth path CI-visible for the first time.

**Actionable Principle:** When you see the same function called on the same value in two consecutive phases of a pipeline (validation → coercion, filter → map, check → transform), it's almost always a duplicate. The "is this shape valid?" check and the "can I coerce this shape?" check are often the *same* check expressed at different strictness levels — and the looser check is usually a superset of the stricter one. A quick proof: enumerate the v2-strict types and verify each one passes the loose check on the same fields. If the proof holds, the duplicate call is pure dead work. Same lesson as the dashboard `solo` removal and the widget O(K×N) fix: **measure first, then look for duplicate work in the hot path**. The benchmark suite added in this entry (5 regimes, 100-1000 iterations each) makes the entire `parseHandoff` path CI-visible — without it, the duplicate call would have been invisible to the threshold check and could have been silently reintroduced.

---

## 2026-06-12 — `truncateStrings` micro-opt: `Object.keys` + skip-noop writes (handoff)

**Systemic Bottleneck:** The `truncateStrings` function in `src/handoff.ts` (called once per `parseHandoff` invocation, walks the entire parsed JSON tree as a defense-in-depth measure against over-length strings) had two micro-inefficiencies in its hot path:
1. `for (const key in obj) { if (Object.hasOwn(obj, key)) { ... } }` — `for...in` walks the prototype chain, and `Object.hasOwn` filters per iteration. This is a well-known JS micro-optimization anti-pattern: `Object.keys()` returns own enumerable string-keyed properties in a single array allocation.
2. Unconditional `obj[i] = truncateStrings(obj[i])` reassignment even when the value didn't change. For nested objects/arrays, `truncateStrings` mutates in place and returns the same reference — so the reassignment is a wasted write. For primitives (numbers, booleans, null, undefined), `truncateStrings` returns the same value — another wasted write.

**Refactor Strategy:** Two mechanical micro-optimizations + one restructure in `truncateStrings`:
1. `for...in` + `Object.hasOwn` -> `for...of Object.keys(obj)` (one allocation + direct array iteration vs per-iteration chain walk + filter check)
2. Added `!==` check before reassignment: `const truncated = truncateStrings(obj[key]); if (truncated !== obj[key]) obj[key] = truncated;` (avoids wasted writes for the no-truncation case)
3. Restructured from `if/else if/else if` chain to early-return pattern with separate `if` blocks (each branch — string/array/object — is independently readable)

**Key Metric Shift:** Within noise on all 5 parse-time regimes in `test/handoff-v2.test.ts` (small, medium v2, large 50 v2 artifacts, large 50 legacy artifacts, over-limit strings). The absolute time savings are modest because the `parseHandoff` path was already fast — the real value is code clarity.

**Honest assessment:** Unlike the prior 5 PRs (which had measurable speedups — ~20% dashboard, ~27× widget hot-loop, O(B·D²)→O(B·D) BFS, ~10-30% handoff parse), this is primarily a **code-clarity micro-optimization** with no measurable CI-visible speedup. The benchmarks confirm: the parseHandoff path is already well within all thresholds, and `truncateStrings` is not the bottleneck. But the change is still worth shipping because (a) idiomatic `Object.keys()` is more readable than `for...in` + `Object.hasOwn`, (b) the early-return structure makes each branch independently auditable, and (c) removing wasted writes is a free correctness/performance win even when the absolute numbers don't show it.

**Actionable Principle:** Not every bounded optimization loop needs to produce a measurable speedup. Sometimes the right outcome is "the code is clearer and the hot path is slightly tighter, even if the benchmark doesn't show a 20% win." The journal is for **all** findings — measurable wins AND code-clarity micro-opts — because future maintainers benefit from knowing *why* the code is shaped the way it is, not just *what* changed. The same `for...in` + `Object.hasOwn` anti-pattern shows up in many JS codebases; the `!==` skip-noop-write pattern shows up in many tree-walking functions. Both are worth fixing even when the benchmark says "within noise" — the next person to look at the code will thank you.
