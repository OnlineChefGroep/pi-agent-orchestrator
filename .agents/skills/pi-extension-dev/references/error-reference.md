# Extension Error Reference

## Load Errors

### `Cannot find module './src/index.ts'`

**Cause:** `pi.extensions` path incorrect or file missing

**Fix:**
```json
// package.json
{
  "pi": {
    "extensions": ["./src/index.ts"]  // Must exist at this path
  }
}
```

### `registerCommands is not a function`

**Cause:** Entry file doesn't export required functions

**Fix:**
```typescript
// src/index.ts
export function registerCommands(api: ExtensionAPI): void {
  // Implementation
}

export function initSubagents(api: ExtensionAPI): void {
  // Implementation
}
```

### `Peer dependency @earendil-works/pi-ai not found`

**Cause:** Host platform not installed (expected — peer deps are host)

**Fix:** This is expected in development. Use feature detection:
```typescript
const piAi = (globalThis as any)["@earendil-works/pi-ai"];
if (piAi) {
  // Use feature
}
```

## Runtime Errors

### `Command /agents already registered`

**Cause:** Double registration or conflict with another extension

**Fix:**
```typescript
// Guard against double registration
let commandsRegistered = false;

export function registerCommands(api: ExtensionAPI): void {
  if (commandsRegistered) return;
  commandsRegistered = true;
  // Register commands...
}
```

### `Rate limit exceeded for spawn`

**Cause:** Too many `subagents:rpc:spawn` calls from another extension

**Fix:**
```typescript
// Add retry with exponential backoff
async function spawnWithRetry(payload: unknown, retries = 3): Promise<unknown> {
  for (let i = 0; i < retries; i++) {
    const result = await rpcCall("subagents:rpc:spawn", payload);
    if (result.success) return result;
    if (result.error?.includes("rate limit")) {
      await sleep(1000 * Math.pow(2, i)); // Exponential backoff
      continue;
    }
    throw new Error(result.error);
  }
  throw new Error("Max retries exceeded");
}
```

### `Unauthorized RPC call`

**Cause:** Caller identity not resolved or not authorized

**Fix:**
```typescript
// Ensure caller context is available
const ctx = api.getContext();
if (!ctx.session) {
  return { error: "Unauthorized", success: false };
}
```

### `Context too large`

**Cause:** Parent context exceeds token limit

**Fix:**
```typescript
// Use aggressive compression
const handoff = buildHandoffPrompt({
  compressionLevel: "aggressive",
});

// Or compact context manually
const compactContext = {
  summary: summarizeLog(parentLog),
  keyFindings: extractFindings(parentLog),
};
```

## Type Errors

### `Cannot use import statement outside a module`

**Cause:** CommonJS/ESM mismatch

**Fix:**
```json
// package.json
{
  "type": "module"
}
```

### `Relative import paths need explicit file names`

**Cause:** Missing `.js` extension in ESM import

**Fix:**
```typescript
// Don't
import { foo } from "./foo";

// Do
import { foo } from "./foo.js";
```

### `Type 'any' is not assignable to type 'AgentRecord'`

**Cause:** Using `as any` in mocks

**Fix:**
```typescript
// Don't
const mock = { id: "x" } as any;

// Do
const mock: AgentRecord = {
  id: "x",
  type: "Explore",
  // ... all required fields
};
```

## Build Errors

### `Cannot find module '@earendil-works/pi-tui'`

**Cause:** Peer dependency not available during build

**Fix:**
```typescript
// Use type-only import for peer deps
import type { Component } from "@earendil-works/pi-tui";

// Or feature detection at runtime
const tui = (globalThis as any)["@earendil-works/pi-tui"];
```

### `dist/` not found

**Cause:** Build artifacts missing

**Fix:**
```bash
npm run build
# Verify dist/ exists
ls dist/
```

## Test Errors

### `Module-level state pollution`

**Cause:** Tests not resetting shared state

**Fix:**
```typescript
beforeEach(() => {
  resetAuditLogger();
  resetRpcRateLimitsForTests();
  // Reset other module state
});
```

### `Mock function not called`

**Cause:** vi.mock() path mismatch

**Fix:**
```typescript
// Path must match import exactly
vi.mock("../src/agent-runner.js", () => ({
  runAgent: vi.fn(),
}));

// Import must match mock path
import { runAgent } from "../src/agent-runner.js";
```
