# Changelog

## v0.8.0 (2026-05-23)

### 🚀 New Features
- **Task budget + depth limiting**: Prevent runaway agent trees. Default levelLimit=5, taskBudget=unlimited. (from OpenCode)
- **Adversarial validators**: Post-completion Promise.all validation with ✅/❌ indicators in agent widget. (from Droid Factory)
- **Structured handoff protocol**: JSON machine-parseable chain-of-agents with graceful degrade on malformed JSON. (from Claude Code)
- **Hook system**: 11 lifecycle event types, 5s timeout, fail-open. Global registry via Symbol.for('pi-subagents:hooks'). (from Claude Code/OpenCode)
- **Permission inheritance**: Directional parent→child tool restriction. RO parent forces RO child. (from Claude Code)
- **Deferred context engine**: Build context at session.create boundary, saving 15-48% tokens on queued agents. (from Droid Factory)
- **Dual-phase compaction**: Prune old tool outputs + per-agent memory limits (default keep 5 turns). (from OpenCode)
- **Partitioned agent state**: Isolated tool/skill subsets per partition. No cross-contamination. (from OpenCode)
- **Context-mode-fork integration**: Optional ctx_* sandbox tool injection. New "Analysis" default agent type. (@onlinechef/context-mode peerDependency)
- **Code health**: Removed agent-registry.ts duplication. Fixed 35 pre-existing schedule test failures.

### 📊 Metrics
- 391 → 518 → 595 tests (+204, 0 failures)
- 22 → 30 → 33 test files
- 11 commits
- 4 plan review cycles (all APPROVED)

### 🧪 Test Suite Expansion (post v0.8.0)
- **E2E chain tests** (`test/e2e-chain.test.ts`): 28 tests covering budget enforcement, depth limit, validator isolation, permission inheritance, handoff parsing/graceful degrade, hooks dispatch, partition filtering, ctx_* tools, and full chain (spawn → run → validators → handoff → result)
- **Performance baseline** (`test/performance-baseline.test.ts`): 18 tests measuring spawn latency, context building, compaction reduction, deferred context timing, token estimation, batch throughput, and hook dispatch overhead
- **Backward compatibility** (`test/backward-compat.test.ts`): 31 tests verifying old AgentConfig loads, new field defaults, old-style invocation, and existing agent type integrity

## 0.7.6
- Fix: author -> OnlineChef, clean README

## 0.7.5
- Remove tintinweb URLs from package.json
- Add .npmignore for package-lock.json

## 0.7.4
- Publish @onlinechef/pi-subagents to GitHub Packages

## 0.7.3 (original)
- Forked from tintinweb/pi-subagents
