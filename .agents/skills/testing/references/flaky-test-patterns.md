# Flaky Test Patterns

## Identifying Flaky Tests

A test is flaky if it produces different results across runs without code changes.

### Signs of Flakiness

1. **Passes locally, fails in CI** — Timing or environment differences
2. **Fails intermittently** — Race conditions or async timing
3. **Fails on specific OS** — Platform-specific behavior (Windows paths, temp dirs)
4. **Order-dependent** — Passes when run alone, fails in suite

## Common Causes and Fixes

### 1. Time-Based Tests

**Problem:** Tests depend on current time or timing.

```typescript
// Flaky: depends on actual time
it("expires after 1 hour", () => {
  const token = createToken();
  expect(isExpired(token)).toBe(false); // May fail near midnight
});
```

**Fix:** Mock time or use deterministic values.

```typescript
// Fixed: uses fake timer
it("expires after 1 hour", () => {
  const now = 1000000000000;
  vi.setSystemTime(now);

  const token = createToken(now);
  vi.setSystemTime(now + 3600000 + 1);

  expect(isExpired(token)).toBe(true);
});
```

### 2. File System Races

**Problem:** Tests create/delete same files.

```typescript
// Flaky: parallel tests may conflict
it("writes file", () => {
  writeFileSync("/tmp/test.txt", "data");
});
```

**Fix:** Use unique temp directories per test.

```typescript
// Fixed: unique temp dir
it("writes file", () => {
  const dir = mkdtempSync(join(tmpdir(), "pi-test-"));
  writeFileSync(join(dir, "test.txt"), "data");
});
```

### 3. Module-Level State

**Problem:** Tests mutate shared state.

```typescript
// Flaky: state leaks between tests
let counter = 0;

it("increments", () => {
  counter++;
  expect(counter).toBe(1);
});

it("increments again", () => {
  counter++;
  expect(counter).toBe(1); // Fails if run after first test
});
```

**Fix:** Reset state in beforeEach.

```typescript
// Fixed: reset before each
let counter: number;

beforeEach(() => {
  counter = 0;
});

it("increments", () => {
  counter++;
  expect(counter).toBe(1);
});
```

### 4. Async Race Conditions

**Problem:** Tests don't wait for async operations.

```typescript
// Flaky: may check before event fires
it("emits event", () => {
  let received = false;
  emitter.on("event", () => { received = true; });
  emitter.emit("event");
  expect(received).toBe(true); // May fail
});
```

**Fix:** Use async assertions or waitFor.

```typescript
// Fixed: wait for event
it("emits event", async () => {
  const handler = vi.fn();
  emitter.on("event", handler);
  emitter.emit("event");

  await vi.waitFor(() => expect(handler).toHaveBeenCalled());
});
```

### 5. Random Data

**Problem:** Tests use random values that may hit edge cases.

```typescript
// Flaky: random may produce unexpected values
it("handles random input", () => {
  const value = Math.random();
  expect(process(value)).toBeDefined();
});
```

**Fix:** Use seeded random or fixed values.

```typescript
// Fixed: deterministic input
it("handles edge cases", () => {
  expect(process(0)).toBeDefined();
  expect(process(0.5)).toBeDefined();
  expect(process(1)).toBeDefined();
});
```

## Platform-Specific Flakiness

### Windows

| Issue | Cause | Fix |
|-------|-------|-----|
| `ENOTEMPTY: directory not empty` | Temp dir cleanup race | Use `force: true` + try/catch |
| Path separators | `\` vs `/` | Use `path.join()` |
| Line endings | `\r\n` vs `\n` | Normalize strings |
| Case sensitivity | File names | Use exact case |

### macOS

| Issue | Cause | Fix |
|-------|-------|-----|
| File system case | APFS case-insensitive | Normalize paths |
| Temp directory | `/var/folders/...` | Use `os.tmpdir()` |

### Linux

| Issue | Cause | Fix |
|-------|-------|-----|
| Permission errors | Umask differences | Use `mode` parameter |
| Locale differences | `LC_ALL` | Set locale in tests |

## CI Flakiness Mitigation

```yaml
# Retry flaky tests
- name: Run tests
  run: npx vitest run
  timeout-minutes: 10

# Mark known flaky tests
- name: Run flaky tests
  run: npx vitest run test/schedule.test.ts
  continue-on-error: true
```

## Local Debugging Checklist

When a test is flaky:

1. [ ] Run 10 times in a row: `for i in {1..10}; do npx vitest run test/file.test.ts; done`
2. [ ] Run with `--no-threads` to check for race conditions
3. [ ] Run in isolation vs full suite
4. [ ] Check for missing `beforeEach` resets
5. [ ] Check for async operations without `await`
6. [ ] Check for time-dependent assertions
7. [ ] Check for shared temp directories
8. [ ] Check for non-deterministic data
