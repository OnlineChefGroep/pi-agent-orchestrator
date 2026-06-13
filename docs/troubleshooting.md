# Troubleshooting

> Common issues, their causes, and fixes.

---

## Installation

### `npm install` fails with peer dependency errors

**Cause:** This package has peer dependencies on `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui`.

**Fix:** Install from within the pi-coding-agent extension environment, or use:

```bash
npm install --legacy-peer-deps
```

---

## Agents

### Custom agent not appearing in `/agents` list

**Symptom:** You created `.pi/agents/my-agent.md` but it's not shown.

**Checklist:**
1. File extension is `.md` (not `.txt` or `.markdown`)
2. File is directly in `.pi/agents/` (no subdirectories)
3. Frontmatter starts with `---` on line 1
4. Frontmatter ends with `---` on its own line
5. The `name` field is valid (alphanumeric + hyphens, no spaces)
6. No YAML syntax errors in frontmatter

**Force reload:** `/agents` → "Reload custom agents"

**Debug:** Check extension output logs for parse errors (they include line numbers).

---

### Agent fails with "tool not allowed"

**Symptom:** Agent tries to use a tool and gets permission denied.

**Causes:**
1. Tool not listed in the custom agent's `tools` frontmatter
2. Tool listed in `disallowed_tools`
3. Parent agent has stricter permissions (inherited restriction)
4. Partition filter removed the tool based on `contextMode`

**Fix:** Check the agent config and parent chain. Use `getAgentConfig(name)` in code to inspect resolved permissions.

---

### Agent gets stuck in infinite loop

**Symptom:** Agent keeps calling tools without making progress.

**Causes & fixes:**

| Cause | Fix |
|-------|-----|
| Missing `maxTurns` limit | Set `defaultMaxTurns` in Settings, or pass `maxTurns` to `createSubagent` |
| No clear task boundary | Improve the `description` to be more specific |
| Tool results not informative | The LLM can't tell it's making progress — add validation steps |
| Compaction not triggering | Check that `compactionCount` is increasing in agent records |

**Emergency stop:** Use `/agents` → "Running agents" → select the agent → "Cancel".

---

## Scheduling

### Scheduled jobs not firing

**Symptom:** A cron job never runs.

**Checklist:**
1. `schedulingEnabled` is true in Settings
2. The job's `enabled` flag is true
3. The cron expression is valid (use [crontab.guru](https://crontab.guru) to verify)
4. The scheduler process is running (check if `SubagentScheduler` was initialized)
5. No errors in extension logs

**Note:** Jobs only fire while the pi session is active. They do not persist across VS Code restarts unless `schedule-store.ts` persistence is enabled.

---

### Schedule store errors on Windows

**Symptom:** `ENOENT`, stale lock, or rename errors in `schedule-store.test.ts` or `schedule.ts`.

**Cause:** Schedule persistence uses a project-local JSON file with a lock file. Writes are atomic via same-directory temp file + rename, but stale lock files can still occur after an abrupt process exit.

**Fix:** Retry the command after the stale lock recovery window, or remove the matching `.lock` file under `.pi/subagent-schedules/` if no pi process is using that session.

---

## UI / Widget

### Widget not showing

**Symptom:** No agent widget visible above the editor.

**Checklist:**
1. At least one agent must be running or recently completed
2. `getUiStyle()` is not `"plain"` with no active agents
3. Check terminal width — widget may collapse below minimum width
4. No errors in `agent-widget.ts` logs

---

## Tests

### `schedule.test.ts` or `schedule-store.test.ts` fails on Windows

**Symptom:** Lock, rename, or timing-related failures in schedule tests.

**Status:** Schedule writes now use same-directory temp files before rename. If this still fails on Windows, treat it as a real regression and capture the failing path plus the matching `.lock` file state.

**Fix:** Run the specific failing file first (`npm test -- test/schedule-store.test.ts`) to separate persistence failures from scheduler timing failures.

---

### `npm test` fails with import errors

**Symptom:** `Cannot find module '@earendil-works/pi-coding-agent'`

**Fix:** This package is a peer dependency. Tests use Vitest with `deps.inline` configured. Make sure you installed from within the pi extension environment, or mock the peer deps in your test setup.

---

## Performance

### High token usage

**Symptom:** Token counts are much higher than expected.

**Checklist:**
1. Check `compactionCount` — is compaction running?
2. Large parent context being injected? Use `level` limiting (`levelLimit` in settings)
3. Tool outputs not being pruned? Check `DEFAULT_KEEP_TURNS` setting
4. Multiple agents running in parallel? Check `maxConcurrent`

**Mitigation:**
- Reduce `maxTurns` for long-running agents
- Enable context mode for sandboxed tasks (smaller context injection)
- Use `fire-and-forget` join mode for independent agents (no parent context overhead)

---

## Git

### Worktree errors

**Symptom:** "git worktree" fails when agent tries to create a branch.

**Cause:** The worktree path may already exist, or the repository is not a git repo.

**Fix:** The extension handles this gracefully — it falls back to in-place execution. Check `src/worktree.ts` logs for details.

---

## Getting Help

1. Check `docs/architecture.md` for component relationships
2. Check `docs/api-reference.md` for function signatures
3. Check `docs/custom-agents.md` for agent authoring
4. Review `CHANGELOG.md` for recent changes
5. Enable verbose logging in pi-coding-agent settings for detailed traces
