# Scout Discovery Report — Cycle 1

## Summary
- **Lint issues:** 0
- **Type errors:** 0
- **`any` type usages:** 48 across 16 files
- **TODO/FIXME:** 1 (auth provider)
- **Large files:** 3 (>500 lines)
- **Large functions:** 36 (>=50 lines)
- **Missing tests:** 33 source files without test counterpart

## Top 3 Improvement Recommendations

### 1. Break up `createAgentTool` (533 lines)
- **File:** `src/tools/agent.ts:21`
- **Why:** Largest untested module, contains entire tool definition + session wiring + result rendering
- **How:** Extract `renderResult` (89 lines), session-callback wiring, spawn-options builder into separate functions
- **Impact:** Testability, cognitive load reduction

### 2. Replace `any` types with proper generics/interfaces
- **Hotspots:**
  - `src/model-resolver.ts` — ModelResolver interface returns `any` from all 3 methods
  - `src/agent-runner.ts` — 10 `any` usages, mostly `Model<any>`
  - `src/index.ts` + `src/telemetry.ts` — `(globalThis as any)` pattern
- **How:** Concrete model type parameters, typed module-scoped singletons
- **Impact:** Type safety, IDE support, compile-time error detection

### 3. Add tests for `src/tools/agent.ts` and `src/output-handler.ts`
- **Why:** Two largest untested modules with core business logic
- **How:** Unit tests for renderResult, renderCall, execute handler; integration tests for output-handler
- **Impact:** Regression prevention, confidence in refactoring

## Detailed Findings

### `any` Type Distribution (48 total)
| File | Count | Context |
|---|---|---|
| agent-runner.ts | 10 | Model<any> generics |
| conversation-viewer.ts | 4 | Content type narrowing |
| cross-extension-rpc.ts | 4 | RPC handler generics |
| index.ts | 4 | globalThis registry |
| model-resolver.ts | 4 | Interface methods |
| tool-result-helpers.ts | 3 | Result construction |
| tools/agent.ts | 3 | Session callbacks |
| telemetry.ts | 3 | globalThis registry |
| Others (9 files) | 17 | Scattered |

### Large Functions (top 10)
| Function | File | Lines |
|---|---|---|
| createAgentTool | tools/agent.ts:21 | 533 |
| runAgent | agent-runner.ts:270 | 398 |
| anonymous | index.ts:42 | 385 |
| anonymous (inner) | tools/agent.ts:231 | 321 |
| showSettings | settings-menu.ts:18 | 195 |
| buildContentLines | conversation-viewer.ts:202 | 193 |
| startAgent | agent-manager.ts:281 | 143 |
| renderAgentWidget | agent-widget-renderer.ts:69 | 129 |
| handleInput | agent-dashboard.ts:119 | 101 |

### Missing Test Coverage (critical gaps)
- `src/tools/agent.ts` (554 lines) — **no tests**
- `src/output-handler.ts` (285 lines) — **no tests**
- `src/telemetry.ts` — **no tests**
- `src/context.ts` — **no tests**
- `src/tool-result-helpers.ts` — **no tests**
- Entire `src/ui/` directory (16 files) — **no tests**
