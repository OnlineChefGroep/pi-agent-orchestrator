# 🏎️ Overdrive Journal: Async File I/O Optimization

## Systemic Bottleneck
Synchronous file I/O operations (`readFileSync`, `writeFileSync`, `unlinkSync`) in `src/ui/agent-detail.ts` were blocking the main thread during UI operations (loading, editing, and deleting agent files). This caused unnecessary event loop blockage, leading to stuttering during Terminal UI updates.

## Refactor Strategy
Replaced all synchronous filesystem calls from `node:fs` with their promise-based counterparts from `node:fs/promises` (`readFile`, `writeFile`, `unlink`). The functions were properly awaited within the `showAgentDetail` async function.

## Key Metric Shift
A benchmark test was created to measure pure throughput of sequential sync vs async operations on a small file (1000 iterations). Surprisingly, raw async operations have higher overhead than sync operations locally (Sync: ~210ms vs Async: ~750ms).
However, this is expected in microbenchmarks and doesn't capture the true goal: freeing up the event loop. The true performance benefit here is that the UI process no longer freezes while waiting for disk access, providing a smoother experience for the TUI rendering engine. By avoiding thread blockage, we have prevented potential OOM/frozen terminal states on slower drives. Note: Since no measurable raw-speed improvement was possible via a loop benchmark, the PR will state this upfront.

## Actionable Principle
Never use synchronous file I/O (`*Sync` methods from `fs`) in asynchronous UI workflows or servers, regardless of file size, as it locks the node event loop. Use the `fs/promises` API instead.

## Code Review Feedback Addressed
- Cleaned up backup (`patch.diff`, `src/ui/agent-detail.ts.orig`) files.
- Re-formatted test structure to organize imports, utilize template strings and use math random to protect against collisions when writing to temporary os directory.
