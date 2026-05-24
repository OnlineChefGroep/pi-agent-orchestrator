---
name: qa-cli
description: >
  QA tests for the pi-subagents TypeScript extension. Tests agent spawning,
  execution, handoffs, scheduling, and settings through a test pi host harness.
  Uses functional verification against the built extension code.
---

# QA Sub-Skill: pi-subagents Extension

## App-Specific Configuration Notes

- This is a **pi extension** that runs inside the pi coding agent host
- Testing requires a minimal pi host harness or mocking the Extension API
- The extension exports tools (`Agent`, `get_subagent_result`, `steer_subagent`) and a command (`/agents`)
- All agent execution is asynchronous; tests must poll for completion

## Testing Target

Since this is a local development package:

1. Ensure the current working directory is the repository root
2. Run `npm run build` to compile the TypeScript extension
3. Use the built `dist/index.js` as the entry point for testing
4. If the build fails, report as BLOCKED

## Authentication

No authentication required. This extension does not manage user sessions, OAuth, or API keys.
LLM provider configuration is handled by the pi host, not this extension.

## Available Test Flows Menu

### Flow 1: Extension Loading
- Build the extension (`npm run build`)
- Verify `dist/index.js` and `dist/index.d.ts` exist
- Verify the extension exports the expected tools and command
- **Use when**: Changes to `src/index.ts`, build configuration, or package.json

### Flow 2: Agent Spawn and Basic Lifecycle
- Use the test harness to call the `Agent` tool with a simple task (e.g., "explore the src directory")
- Verify the agent is spawned and receives a task ID
- Poll `get_subagent_result` until the agent completes
- Verify the result contains expected output
- **Use when**: Changes to `src/agent-manager.ts`, `src/agent-runner.ts`, `src/agent-types.ts`

### Flow 3: Multi-Agent Chain with Handoff
- Spawn an Explore agent
- After completion, spawn a Plan agent with context from the Explore result
- Verify the handoff JSON structure is correct
- Verify both agents complete successfully
- **Use when**: Changes to `src/handoff.ts`, `src/agent-runner.ts`, inter-agent communication

### Flow 4: Validation and Error Handling
- Spawn an agent with an invalid type name
- Verify the extension returns an appropriate error
- Spawn an agent exceeding task budget
- Verify graceful degradation or error message
- **Use when**: Changes to `src/validators.ts`, `src/usage.ts`, error handling

### Flow 5: Schedule Store Persistence
- Schedule an agent to run after a delay
- Verify the schedule is persisted to disk (check schedule store file)
- Wait for execution or trigger manually
- Verify the scheduled agent runs
- **Use when**: Changes to `src/schedule.ts`, `src/schedule-store.ts`

### Flow 6: Settings and Configuration
- Change a setting via the extension's configuration API
- Verify the setting is persisted
- Restart the extension (if test harness supports it)
- Verify the setting is restored
- **Use when**: Changes to `src/settings.ts`, `src/agent-registry.ts`

### Flow 7: Custom Agent Loading
- Create a custom agent `.md` file in `.pi/agents/`
- Verify the extension loads it into the AgentRegistry
- Spawn the custom agent
- Verify it uses the custom system prompt
- Clean up the custom agent file after testing
- **Use when**: Changes to `src/custom-agents.ts`, `src/agent-registry.ts`, agent prompt loading

### Flow 8: Hooks System
- Register a hook for a lifecycle event (spawn, complete, error)
- Trigger the corresponding event
- Verify the hook is called with correct arguments
- Verify hook timeout handling (fail-open after 5s)
- **Use when**: Changes to `src/hooks.ts`, lifecycle events

### Flow 9: Cinematic TUI Integration (Optional)
- Install the optional `@onlinechefgroep/pi-subagents-tui` package
- Set UI style to "cinematic"
- Spawn an agent
- Verify the TUI binary is spawned and receives JSON state updates
- Uninstall the TUI package and verify graceful fallback
- **Use when**: Changes to `src/ui/agent-widget.ts`, TUI rendering

### Flow 10: Memory Compaction
- Spawn multiple agents to generate memory usage
- Trigger compaction (if accessible via test harness)
- Verify old tool outputs are pruned
- Verify per-agent memory limits are respected
- **Use when**: Changes to `src/compaction.ts`, `src/memory.ts`

## Per-Persona Variations

Since this extension has only one persona (`default_user`):
- All flows run with default settings
- For negative tests: attempt operations that should fail (invalid configs, missing files)

## Error Handling Specific to This App

- If `npm run build` fails: BLOCKED -- fix TypeScript errors first
- If the test harness cannot be instantiated: BLOCKED -- check Node.js version >= 18
- If `.pi/agents/` directory is missing during custom agent tests: Create it automatically
- If `@onlinechefgroep/pi-subagents-tui` is not installed during cinematic tests: Report as expected optional dependency, not a failure

## Known Failure Modes

1. **Build output stale.** `dist/` may contain old compiled code. Always run `npm run build` before testing.
2. **Node.js version mismatch.** Requires Node.js >= 18. Older versions may fail on ES2022 syntax.
3. **Peer dependencies missing.** `@mariozechner/pi-coding-agent` and `@mariozechner/pi-tui` are peer dependencies. The test harness must provide mock implementations.
4. **Custom agents directory not found.** If `.pi/agents/` does not exist, custom agent loading tests will fail. Create it in pre-flight.
5. **Schedule store locked.** If a previous test left the PID lock file (`schedule-store.pid`), schedule tests may be blocked. Clean up PID files in pre-flight.
