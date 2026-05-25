# Pi-Subagents Helper

## Purpose
Comprehensive skill for the pi-subagents-fork repository. Helps with codebase navigation, understanding architecture, testing/debugging, and PR review processes.

## When to Use
Use this skill when working on the pi-subagents extension codebase, including:
- Understanding the swarm coordination system
- Working with the agent dashboard TUI
- Debugging test failures
- Reviewing or creating PRs
- Navigating the agent management system

## Architecture Overview

### Core Components
- **AgentManager** (`src/agent-manager.ts`) - Manages agent lifecycle, spawning, and tracking
- **SwarmCoordinator** (`src/swarm-join.ts`) - Dynamic collaborative agent groups with runtime membership
- **AgentDashboard** (`src/ui/agent-dashboard.ts`) - Rich interactive TUI for agent management
- **GroupJoinManager** (`src/group-join.ts`) - Fixed batch coordination for 'group'/'smart' modes
- **SubagentScheduler** (`src/schedule.ts`) - Scheduled job execution

### Key Concepts
- **Join Modes**: `async`, `group`, `smart`, `swarm` - Different agent coordination strategies
- **Orchestration Modes**: `auto`, `single`, `swarm`, `crew` - High-level agent execution patterns
- **Agent Types**: Default agents (Explore, Plan, etc.) and custom agents from `.pi/agents/`
- **Settings**: Persistent configuration via `src/settings.ts` (global + project-level)

### File Structure
```
src/
├── agent-manager.ts       # Agent lifecycle management
├── swarm-join.ts          # Dynamic swarm coordination
├── group-join.ts          # Fixed batch coordination
├── ui/
│   ├── agent-dashboard.ts  # Interactive TUI dashboard
│   ├── agent-widget.ts     # Agent display widgets
│   └── conversation-viewer.ts  # Conversation history viewer
├── agent-registry.ts      # Agent type definitions and configuration
├── agent-types.ts         # Agent type loading and validation
├── agent-runner.ts       # Agent execution logic
├── output-handler.ts      # UI menu system and user interactions
├── settings.ts            # Settings persistence and validation
├── schedule.ts           # Job scheduling system
└── index.ts              # Extension entry point and tool registration
test/
├── swarm-join.test.ts     # Swarm coordinator tests
├── agent-registry.test.ts # Registry configuration tests
└── [other test files]
docs/
├── architecture.md        # Architecture documentation
└── REVIEW_AND_FUTURE.md   # Review findings and future roadmap
```

## Testing

### Test Commands
- Run all tests: `npm test`
- Run specific test file: `npm test test/swarm-join.test.ts`
- Run with retry for flaky tests: `npm test` (already configured with --retry=2)

### Common Test Issues
- **schedule-e2e.test.ts**: Windows timing issues - increased intervals and timeouts for reliability
- **print-mode.test.ts**: Stale context errors - tests verify graceful error handling

### Test Coverage
- Target: 80% docstring coverage
- Current: Improved with recent docstring additions
- Use: `npm run typecheck && npm run lint && npm test` for full validation

## PR Review Process

### Pre-Merge Checklist
1. All tests passing (Windows schedule tolerance excepted)
2. Typecheck passes: `npm run typecheck`
3. Lint passes: `npm run lint`
4. Docstring coverage ≥80%
5. No merge conflicts with main branch

### Common Review Comments
- **Docstring coverage**: Add JSDoc comments to functions and classes
- **Code duplication**: Simplify callback wiring and remove redundant code
- **Semantic correctness**: Ensure flags and labels match their intended behavior
- **Dead code**: Remove or document unused methods

### Git Workflow
- Work on dedicated branches
- Use conventional commit messages
- Merge main branch before creating PR
- Resolve all review comments before merge

## Navigation Tips

### Key Files for Different Tasks
- **Swarm development**: `src/swarm-join.ts`, `src/types.ts` (swarmId field)
- **Dashboard UI**: `src/ui/agent-dashboard.ts`, `src/output-handler.ts`
- **Settings**: `src/settings.ts`, `src/agent-registry.ts`
- **Agent execution**: `src/agent-runner.ts`, `src/index.ts`
- **Testing**: `test/` directory

### Search Patterns
- Find swarm-related code: `grep -r "swarm" src/`
- Find dashboard code: `grep -r "dashboard" src/`
- Find settings: `grep -r "settings" src/`
- Find agent types: `grep -r "AgentConfig" src/`

## Debugging

### Common Issues
- **Swarm not delivering**: Check SwarmCoordinator callback wiring in `src/index.ts`
- **Dashboard not refreshing**: Verify getDashboardRefreshInterval() and refresh timer setup
- **Settings not persisting**: Check settings validation in `src/settings.ts` sanitize() function
- **Agent not spawning**: Verify agent type registration in `src/agent-types.ts`

### Logging
- Extension events: `pi.events.emit()`
- Settings events: `subagents:settings_loaded`, `subagents:settings_changed`
- Agent events: `agent:loaded`, `subagents:scheduled`

## Quick Reference

### Important Constants
- `DEFAULT_SWARM_TIMEOUT`: 30s (swarm-join.ts)
- `STRAGGLER_TIMEOUT`: 15s (swarm-join.ts)
- `DASHBOARD_HEIGHT_PCT`: 85% (agent-dashboard.ts)
- `MIN_VIEWPORT`: 5 (agent-dashboard.ts)

### Default Settings
- Default join mode: `smart`
- Default orchestration mode: `auto`
- Dashboard refresh interval: 750ms
- Max concurrent: 3 (default)

### Valid Modes
- Join modes: `async`, `group`, `smart`, `swarm`
- Orchestration modes: `auto`, `single`, `swarm`, `crew`
- Animation styles: `braille`, `dots`, `lines`, `classic`, `none`
- UI styles: `premium`, `retro`, `plain`, `cinematic`
