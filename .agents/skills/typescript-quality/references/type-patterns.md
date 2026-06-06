# TypeScript Patterns Reference

## Type Guards

### Primitive Guards

```typescript
function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}
```

### Object Guards

```typescript
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasProperty<K extends string>(
  obj: unknown,
  key: K,
): obj is Record<K, unknown> {
  return isRecord(obj) && key in obj;
}
```

### Array Guards

```typescript
function isArray<T>(
  value: unknown,
  guard: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

// Usage
function isStringArray(value: unknown): value is string[] {
  return isArray(value, isString);
}
```

## Branded Types

```typescript
type Brand<T, B> = T & { __brand: B };

// Usage
type AgentId = Brand<string, "AgentId">;
type SessionId = Brand<string, "SessionId">;
type UserId = Brand<string, "UserId">;

function createAgentId(id: string): AgentId {
  return id as AgentId;
}

function getAgent(id: AgentId) { /* ... */ }

const agentId = createAgentId("agent-1");
const sessionId = createAgentId("session-1") as SessionId;

getAgent(agentId);     // OK
getAgent(sessionId);   // Type error!
getAgent("raw-string"); // Type error!
```

## Nominal Typing with Enums

```typescript
// Use const enums for zero-overhead nominal types
const enum StatusCode {
  OK = 200,
  BadRequest = 400,
  NotFound = 404,
  ServerError = 500,
}

function handleResponse(status: StatusCode) {
  switch (status) {
    case StatusCode.OK: return "success";
    case StatusCode.BadRequest: return "bad request";
    // Missing cases caught at compile time
  }
}
```

## Result Type (Instead of Throwing)

```typescript
type Result<T, E = string> =
  | { success: true; data: T }
  | { success: false; error: E };

function parseConfig(json: string): Result<Config> {
  try {
    const data = JSON.parse(json);
    if (!isValidConfig(data)) {
      return { success: false, error: "Invalid config structure" };
    }
    return { success: true, data };
  } catch (e) {
    return { success: false, error: `Parse error: ${e}` };
  }
}

// Usage
const result = parseConfig(configJson);
if (result.success) {
  useConfig(result.data);
} else {
  console.error(result.error);
}
```

## Builder Pattern

```typescript
class AgentConfigBuilder {
  private config: Partial<AgentConfig> = {};

  withType(type: string): this {
    this.config.type = type;
    return this;
  }

  withPrompt(prompt: string): this {
    this.config.prompt = prompt;
    return this;
  }

  withMaxTurns(maxTurns: number): this {
    this.config.maxTurns = maxTurns;
    return this;
  }

  build(): AgentConfig {
    if (!this.config.type) throw new Error("Type is required");
    return this.config as AgentConfig;
  }
}

// Usage
const config = new AgentConfigBuilder()
  .withType("Explore")
  .withPrompt("Investigate...")
  .withMaxTurns(10)
  .build();
```

## Parse Don't Validate (Complete Example)

```typescript
// Domain types
interface AgentConfig {
  type: string;
  prompt: string;
  maxTurns: number;
}

// Parser function
function parseAgentConfig(data: unknown): AgentConfig {
  if (!isRecord(data)) {
    throw new TypeError("Expected object");
  }

  const type = data["type"];
  if (!isString(type)) {
    throw new TypeError("type must be a string");
  }

  const prompt = data["prompt"];
  if (!isString(prompt)) {
    throw new TypeError("prompt must be a string");
  }

  const maxTurns = data["maxTurns"];
  if (maxTurns !== undefined && !isNumber(maxTurns)) {
    throw new TypeError("maxTurns must be a number");
  }

  return {
    type,
    prompt,
    maxTurns: maxTurns ?? 0,
  };
}

// Type guard helpers
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value);
}
```

## Exhaustive Switch with Helper

```typescript
function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}

function getStatusColor(status: AgentStatus): string {
  switch (status) {
    case "running": return "green";
    case "completed": return "blue";
    case "error": return "red";
    case "queued": return "yellow";
    default:
      return assertNever(status); // Compile-time exhaustiveness check
  }
}
```

## Module Augmentation

```typescript
// Extend existing types without modifying source
declare module "../src/types.js" {
  interface AgentRecord {
    customField?: string;
  }
}
```
