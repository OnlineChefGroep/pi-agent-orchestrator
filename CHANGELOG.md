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
- 391 → 518 tests (+127, 0 failures)
- 22 → 30 test files
- 11 commits
- 4 plan review cycles (all APPROVED)

## 0.7.6
- Fix: author -> OnlineChef, clean README

## 0.7.5
- Remove tintinweb URLs from package.json
- Add .npmignore for package-lock.json

## 0.7.4
- Publish @onlinechef/pi-subagents to GitHub Packages

## 0.7.3 (original)
- Forked from tintinweb/pi-subagents
