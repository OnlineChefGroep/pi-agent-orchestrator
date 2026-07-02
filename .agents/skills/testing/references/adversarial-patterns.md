# Adversarial Testing Patterns

Detailed adversarial testing documentation for pi-agent-orchestrator. Loaded on-demand when the agent invokes `/test` and needs to write or review adversarial tests.

## Known Flaky Tests

On Windows, `schedule.test.ts` and `schedule-e2e.test.ts` may fail with `ENOTEMPTY: directory not empty, rmdir` errors during temp directory cleanup. These are pre-existing and documented in AGENTS.md as `continue-on-error` in CI. Not caused by code changes.

## Writing Adversarial Tests

When testing changes to core modules:

1. **Session limits** (`src/agent-manager.ts`): Test that setters feed into enforcement fields (`sessionLimits.maxAgentsPerSession`/`maxTotalTurnsPerSession`), not just scalar fields. Also test `setSessionLimits()` syncs scalar getters.
2. **Handoff validation** (`src/handoff.ts`): `validateHandoffShape` rejects the entire handoff (returns `null`) when any field is invalid — it does NOT filter out bad items. Test with `vi.spyOn(console, 'warn')` to assert specific error messages.
3. **Artifact validation** (`src/handoff.ts`): `isArtifact()` is called by `validateHandoffShape` — invalid artifacts cause the whole handoff to be rejected, not filtered.
4. **Tree rendering** (`src/output-handler.ts`): Test with multiple root nodes to verify `isLast` logic.
5. **Audit logging** (`src/audit-logger.ts`): `recordAudit()` shallow-copies entries before storing — test by mutating the original object after recording and asserting the stored copy is unaffected. This is the key adversarial test for buffer immutability.
6. **Rate limiting** (`src/cross-extension-rpc.ts`): Rate limits are module-level global state with last-call-wins semantics. Always call `resetRpcRateLimitsForTests()` in `beforeEach`/`afterEach` to avoid test pollution. Test custom thresholds via `configureRateLimit()` and verify with `getRateLimitConfig()`.
7. **Audit trail integration** (`src/cross-extension-rpc.ts`): The `auditedRpc()` wrapper resolves caller identity eagerly — even rate-limited and unauthorized calls get attributed. Test all 4 outcomes: `success`, `error`, `rate_limited`, `unauthorized`.
8. **Module-level state isolation**: Many modules use module-scoped `let` variables with getter/setter exports. Always reset state in `beforeEach`/`afterEach` (e.g., `resetAuditLogger()`, `resetRpcRateLimitsForTests()`). Without resets, tests may pass individually but fail when run together.

## Testing Immutability Patterns

When a function claims to store a copy (shallow or deep), write an adversarial test:
1. Create an object, pass it to the function
2. Mutate every field on the original object
3. Retrieve the stored version and assert all fields retained original values
4. This test should FAIL if the copy is removed — that's what makes it adversarial

Example for `recordAudit()`:

```typescript
const entry = { extensionId: "original", outcome: "success", ... };
recordAudit(entry);
entry.extensionId = "MUTATED";
expect(getAuditLog()[0].extensionId).toBe("original"); // proves shallow copy works
```

Note: `tsx` is not installed by default. For inline script-based tests, write a temporary `.test.ts` file in the `test/` directory and run via vitest instead.
