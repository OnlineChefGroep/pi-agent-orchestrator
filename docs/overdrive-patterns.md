# Overdrive Pattern Catalogue

> Extracted from the 7 bounded optimization loops of 2026-06-12
> (PRs #146–#152) and the prior optimization journal entries in
> `.jules/overdrive.md`. Each pattern is a recurring **systemic
> bottleneck** that shows up across many codebases, with a known
> **detection signal** and a known **fix template**.

This catalogue is the SSOT for the `scripts/overdrive-lint.mjs`
detectors. Each pattern maps to one or more detector rules in that
script. When a new optimization loop lands, its systemic bottleneck
should be added to this catalogue and, if recurring, to a detector.

---

## P1 — Dead allocation in hot loops (allocate-and-forget)

**Also known as:** "dead `solo` allocation", "unused `parts: T[]`" |
**Fixed by:** PR #146, 2026-05-29 entries (unshift→push+reverse) |
**Severity:** HIGH — can cost 5M+ useless pushes on a 50k-iter loop.

**Systemic bottleneck:** A local array variable is declared inside a
hot loop body, items are pushed to it, but the array is never read
after the loop. V8 cannot elide the allocation or the pushes because
the array escapes into the GC heap.

**Detection signal:**
```ts
// inside a loop body
const x: T[] = [];
for (...) {
  // ...
  x.push(item);
  // ... no consumer of `x` after this point in the loop
}
```

**Fix template:** Delete the dead declaration and push. Verify
downstream renderers have their own bucketing (the non-virtual path
in PR #146 had its own `solo` array — the dead one was a copy-paste
artifact).

**Lesson:** Pure dead-code elimination in a hot loop is often the
highest-leverage, lowest-risk optimization. No semantic change, no
API change, no test fixtures change.

---

## P2 — O(K×N) nested-loop anti-pattern (interleaved iteration)

**Also known as:** "two-level iteration with key skip" |
**Fixed by:** PR #147 (widget queued rendering) |
**Severity:** HIGH — can cost 1,600 type-comparisons per render.

**Systemic bottleneck:** A loop body contains a *nested* loop that
re-iterates an outer collection, filtering by per-element key
comparison:

```ts
for (const key of keys) {
  for (const item of outer) {
    if (item.key !== key) continue;  // O(K*N) skip
    doStuff(item);
  }
}
```

**Detection signal:**
- Inner loop with `if (x.key !== outerKey) continue;` (or similar skip)
- Outer loop is a small set (K), inner loop is a large set (N)
- The skip is testing a property already known to be the outer key

**Fix template:** Bucket the outer collection into a `Map<key, group>`
in a single pre-pass, then replace the inner loop with one O(1)
lookup per outer element. Two-pass code is usually *faster* than
"smart" one-pass code because branch predictors love the clean loop
and V8 can hoist the map lookup.

**Lesson:** When you ship an algorithmic-complexity refactor, *write
a test that exercises the regime where the win shows up*. Without
the K>>3 test (PR #148), PR #147's fix was invisible to CI.

---

## P3 — `.filter().map().join()` chain in hot paths

**Also known as:** "triple array allocation", "chain of array methods" |
**Fixed by:** PR #152 (context `extractText`), 2026-06-08 entry
(widget/dashboard rendering) |
**Severity:** MEDIUM — 3 intermediate array allocations per call.

**Systemic bottleneck:** Chained array methods like
`.filter().map().join("\n")` create 3 intermediate arrays (filter
result, map result, join input) per call. For a 50-message
conversation with ~3 content blocks per message, that's ~150 array
allocations on a hot path.

**Detection signal:**
```ts
arr.filter(x => predicate(x)).map(x => transform(x)).join(sep)
arr.filter(x => predicate(x)).map(x => transform(x))
// also: .flatMap().filter(), .map().filter(), .map().flatMap()
```

**Fix template:** Single-pass loop:

```ts
const parts: string[] = [];
for (const x of arr) {
  if (predicate(x)) parts.push(transform(x));
}
return parts.join(sep);
```

**Lesson:** Apply the single-pass loop discipline everywhere it
appears, not just in render code. The 2026-06-08 journal entry
covered render paths; PR #152 extended the principle to
context-building hot paths.

**Detector:** `scripts/overdrive-lint.mjs` rule `detect-filter-map-join`.

---

## P4 — Double-compute on the same value (call twice, use once)

**Also known as:** "double `.trim()`", "double `.toLowerCase()`" |
**Fixed by:** PR #152 (context `buildParentContext`) |
**Severity:** MEDIUM — 100 redundant `.trim()` calls per 50-message
conversation.

**Systemic bottleneck:** The same method (`.trim()`, `.toLowerCase()`,
`.toString()`, etc.) is called twice on the same value in adjacent
lines — once for a truthy check, once for the push/return.

**Detection signal:**
```ts
if (text.trim()) push(`[User]: ${text.trim()}`);
if (str.toLowerCase() === "x") return str.toLowerCase();
if (obj.toString().length) return obj.toString();
```

**Fix template:** Cache the result once, reuse:

```ts
const t = text.trim();
if (t) push(`[User]: ${t}`);
```

**Lesson:** Caching the result of a deterministic method on the same
value is a free win — no semantic change, no allocation change, just
one less method call.

**Detector:** `scripts/overdrive-lint.mjs` rule `detect-double-compute`.

---

## P5 — `queue.shift()` in BFS / hot loop

**Also known as:** "shift-as-queue", "hidden quadratic" |
**Fixed by:** PR #149 (skill-loader `bfsForSkill`) |
**Severity:** HIGH — turns BFS into `O(B·D²)`.

**Systemic bottleneck:** Using `Array.prototype.shift()` as a queue
in a BFS or any loop that pops the front element. `shift()` is
`O(N)` (re-indexes the entire array on every pop), so a BFS with B
branches and depth D becomes `O(B·D²)` overall.

**Detection signal:**
```ts
const queue = [...];
while (queue.length > 0) {
  const item = queue.shift()!;  // O(N) per pop
  for (const child of children(item)) queue.push(child);
}
```

**Fix template:** Use a head index:

```ts
const queue = [...];
let head = 0;
while (head < queue.length) {
  const item = queue[head++];  // O(1) per pop
  for (const child of children(item)) queue.push(child);
}
```

**Lesson:** `shift()` is almost always wrong in a loop. The fix is
mechanical: keep a `head` index, consume via `queue[head++]`, check
`head < queue.length` for termination.

**Detector:** `scripts/overdrive-lint.mjs` rule `detect-shift-in-loop`.

---

## P6 — Sort on every iteration (cache-detached sort)

**Also known as:** "sort in the inner loop", "per-visit sort" |
**Fixed by:** PR #149 (skill-loader BFS) |
**Severity:** MEDIUM — `O(K log K)` sort per visit on cached data.

**Systemic bottleneck:** Calling `Array.prototype.sort()` on a cached
or otherwise deterministic collection on every loop iteration, when
the sort result is identical across iterations. The sort should be
done once when the data is first acquired and cached.

**Detection signal:**
```ts
while (queue.length > 0) {
  const entries = cache.get(dir) ?? readdirSync(dir);
  entries.sort();  // runs on every visit, even from cache
  // ...
}
```

**Fix template:** Sort once, cache the sorted result:

```ts
const cache = new Map<string, string[]>();
function getEntries(dir: string): string[] {
  let entries = cache.get(dir);
  if (!entries) {
    entries = readdirSync(dir);
    entries.sort();
    cache.set(dir, entries);
  }
  return entries;
}
```

**Lesson:** Same principle as `shift()` — if the data you're sorting
comes from a cache (or is otherwise deterministic and immutable),
sort once when you first acquire the data and cache the sorted
result.

---

## P7 — Duplicate validation calls in a pipeline

**Also known as:** "check twice, transform once" |
**Fixed by:** PR #150 (handoff `isHandoffArtifactV2`) |
**Severity:** MEDIUM — 50 duplicate calls per 50-artifact handoff.

**Systemic bottleneck:** The same validation function is called on
the same value in two consecutive phases of a pipeline (validation →
coercion, filter → map, check → transform). Often the looser check
is a superset of the stricter one, making the stricter call pure
dead work.

**Detection signal:**
```ts
function isValid(v: T): boolean { /* strict check */ }
function isLoose(v: T): boolean { /* looser check */ }
if (isValid(v) && isLoose(v)) transform(v);
// or:
arr.filter(v => isValid(v)).map(v => isLoose(v) ? v : coerce(v));
```

**Fix template:** Verify the looser check is a superset of the
stricter check. If so, drop the stricter call. The proof is
mechanical: enumerate the strict types and verify each one passes
the loose check on the same fields.

**Lesson:** "Is this shape valid?" and "Can I coerce this shape?"
are often the *same* check expressed at different strictness
levels. A quick proof can save 50 calls per 50-element pipeline.

---

## P8 — `for...in` + `Object.hasOwn` (prototype-chain walk)

**Also known as:** "idiomatic `Object.keys`" |
**Fixed by:** PR #151 (handoff `truncateStrings`) |
**Severity:** LOW — within noise on most workloads; code-clarity win.

**Systemic bottleneck:** `for (const key in obj) { if
(Object.hasOwn(obj, key)) { ... } }` walks the prototype chain and
filters per iteration. `Object.keys(obj)` returns own enumerable
string-keyed properties in a single array allocation.

**Detection signal:**
```ts
for (const key in obj) {
  if (Object.hasOwn(obj, key)) {
    // ...
  }
}
```

**Fix template:** Use `Object.keys`:

```ts
for (const key of Object.keys(obj)) {
  // ...
}
```

**Lesson:** Idiomatic `Object.keys()` is more readable than
`for...in` + `Object.hasOwn`, and the early-return structure makes
each branch independently auditable. Not every bounded opt needs
measurable speedup — code-clarity micro-opts are worth documenting.

---

## Pattern Coverage Matrix

| Pattern | Detector | Severity | PR |
|---|---|---|---|
| P1 — Dead allocation | (manual review) | HIGH | #146 |
| P2 — O(K×N) nested loop | (manual review) | HIGH | #147, #148 |
| P3 — `.filter().map().join()` | `detect-filter-map-join` | MEDIUM | #152, 2026-06-08 |
| P4 — Double-compute | `detect-double-compute` | MEDIUM | #152 |
| P5 — `queue.shift()` in loop | `detect-shift-in-loop` | HIGH | #149 |
| P6 — Sort on every iteration | (manual review) | MEDIUM | #149 |
| P7 — Duplicate validation | (manual review) | MEDIUM | #150 |
| P8 — `for...in` + `hasOwn` | (manual review) | LOW | #151 |

Patterns P1, P2, P6, P7, P8 are flagged for **future detector
implementation** — they require either AST-level analysis (P1, P2,
P7) or context-aware detection (P6, P8) that is harder to express
as a regex/line-scan rule. P3, P4, P5 are covered by the v1
detectors in `scripts/overdrive-lint.mjs`.
