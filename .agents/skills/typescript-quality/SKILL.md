---
name: typescript-quality
description: "Unified TypeScript and React code quality skill for removing unused exports, enabling or fixing Knip findings, banning unsafe type assertions, and removing unnecessary React useEffect patterns. Use for knip unused exports, @typescript-eslint consistent-type-assertions, replacing `as` assertions with safer typing, React no-use-effect refactors, hook cleanup, and TypeScript lint migrations."
---

# TypeScript Quality

This skill handles TypeScript and React code quality improvements for the pi-agent-orchestrator project.

## Project Context

This is a TypeScript project using:
- **Biome** for linting (not ESLint/Prettier)
- **Vitest** for testing
- **ES modules only** (`"type": "module"`)
- **Double quotes** enforced by Biome
- **No CommonJS**

## Common Tasks

### 1. Remove Unused Exports with Knip

```bash
# Install Knip if not present
npm install -D knip

# Run Knip to detect unused exports
npx knip

# Fix unused exports by removing them
npx knip --fix
```

**Manual removal process:**
1. Run `npx knip` to identify unused exports
2. For each unused export, remove it from the source file
3. Remove the export from any re-exports in `index.ts` files
4. Update imports in files that were importing the unused export
5. Run `npm run typecheck` to verify no type errors remain

### 2. Fix Unsafe Type Assertions

The project uses `@typescript-eslint/consistent-type-assertions` rule. Avoid `as any` and prefer:

```typescript
// Don't do this
const mock = { id: "x" } as any;

// Do this - include all required fields
const mock: AgentRecord = { id: "x", /* all required fields */ };

// Or use type guards
if (isAgentRecord(obj)) {
  // obj is now typed as AgentRecord
}
```

**Refactoring steps:**
1. Search for `as any` usage with grep
2. Replace with proper type definitions
3. For test mocks, include all required fields from the type definition
4. Use `import type` for type-only imports

### 3. Remove Unnecessary React useEffect Patterns

Identify and remove:
- `useEffect` with empty dependency arrays that could be replaced with derived state
- `useEffect` that only runs once on mount (use `useLayoutEffect` or refactor)
- `useEffect` that sets state based on props (use derived state instead)

**Refactoring pattern:**
```typescript
// Before
const [derived, setDerived] = useState(null);
useEffect(() => {
  setDerived(calculate(props.value));
}, [props.value]);

// After
const derived = useMemo(() => calculate(props.value), [props.value]);
```

### 4. Hook Cleanup

Remove unused hooks and consolidate related effects:
- Remove `useEffect` that have no side effects
- Combine multiple `useEffect` with same dependencies
- Move initialization logic outside components when possible

### 5. TypeScript Lint Migrations

When adding new TypeScript lint rules:
1. Run `npm run lint` to see current issues
2. Enable the rule in `biome.json`
3. Run `npm run lint:fix` for auto-fixable issues
4. Manually fix remaining issues
5. Run `npm run typecheck` to verify type safety

## Project-Specific Rules

From AGENTS.md:

### ESM Imports Need Explicit `.js` Extensions
```typescript
// Correct
import { x } from './foo.js'

// Incorrect
import { x } from './foo'
import { x } from './foo.ts'
```

### Type-Only Imports Must Use `import type`
```typescript
// Correct
import type { Foo } from './foo.js'

// Incorrect
import { Foo } from './foo.js' // if Foo is only used as a type
```

### Biome Requires Double Quotes
```typescript
// Correct
const message = "hello"

// Incorrect
const message = 'hello'
```

### Avoid `as any` in Test Mocks
Always include all required fields when mocking types. Reference the type in `src/types.ts` and copy the shape.

## Verification Commands

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Auto-fix lint issues
npm run lint:fix

# Full verification
npm run typecheck && npm run lint && npm test
```

## Common Mistakes to Avoid

1. **Don't use `as any`** - defeats type checking
2. **Don't skip `.js` extensions** in ESM imports
3. **Don't use single quotes** - Biome enforces double quotes
4. **Don't mix type and value imports** - use `import type` for types
5. **Don't remove type annotations** that add clarity
6. **Don't ignore type errors** - always run `npm run typecheck` after changes

## Biome Configuration

The project uses Biome with specific settings:

```json
// biome.json
{
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "off"
      },
      "suspicious": {
        "noExplicitAny": "off",
        "noControlCharactersInRegex": "off",
        "noEmptyInterface": "off"
      }
    }
  },
  "formatter": {
    "enabled": false
  }
}
```

**Key settings:**
- Formatter is **disabled** — do not run `biome format`
- `noExplicitAny` is **off** — project allows `any` where needed (but avoid it)
- `noNonNullAssertion` is **off** — `!` operator is allowed
- Double quotes enforced

## Type-Safe Patterns

### Parse Don't Validate

```typescript
// Don't: validate then cast
function processAgent(data: unknown): AgentRecord {
  if (isValidAgent(data)) {
    return data as AgentRecord; // Unsafe
  }
  throw new Error("invalid");
}

// Do: parse with proper type narrowing
function parseAgent(data: unknown): AgentRecord {
  if (!isAgentRecord(data)) {
    throw new TypeError("Expected AgentRecord");
  }
  return data; // Already typed as AgentRecord
}

// Type guard with full validation
function isAgentRecord(data: unknown): data is AgentRecord {
  return (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    typeof (data as Record<string, unknown>).id === "string" &&
    "type" in data &&
    typeof (data as Record<string, unknown>).type === "string" &&
    "status" in data &&
    isValidStatus((data as Record<string, unknown>).status)
  );
}
```

### Exhaustive Switch

```typescript
// Don't: missing cases silently return undefined
function getStatusColor(status: AgentStatus): string {
  switch (status) {
    case "running": return "green";
    case "completed": return "blue";
    // "error" not handled!
  }
}

// Do: exhaustive switch with compile-time check
function getStatusColor(status: AgentStatus): string {
  switch (status) {
    case "running": return "green";
    case "completed": return "blue";
    case "error": return "red";
    case "queued": return "yellow";
    default:
      // Compile error if new status added
      const _exhaustive: never = status;
      return _exhaustive;
  }
}
```

### Branded Types for IDs

```typescript
// Don't: string IDs are interchangeable
type AgentId = string;
type SessionId = string;

function getAgent(id: AgentId) { /* ... */ }
getAgent(sessionId); // No error, but wrong!

// Do: branded types prevent mixups
type AgentId = string & { __brand: "AgentId" };
type SessionId = string & { __brand: "SessionId" };

function getAgent(id: AgentId) { /* ... */ }
getAgent(sessionId); // Type error!
getAgent(agentId);   // OK
```

### Discriminated Unions

```typescript
// Don't: optional fields with type checks
type Event = {
  type: string;
  agentId?: string;
  error?: string;
};

// Do: discriminated union
type AgentEvent =
  | { type: "spawned"; agentId: string }
  | { type: "completed"; agentId: string }
  | { type: "error"; error: string };

function handleEvent(event: AgentEvent) {
  switch (event.type) {
    case "spawned":
      console.log(event.agentId); // Guaranteed present
      break;
    case "error":
      console.log(event.error);     // Guaranteed present
      break;
  }
}
```

## Common Migration Patterns

### From ESLint to Biome

```bash
# 1. Remove ESLint config
rm .eslintrc.js .eslintignore

# 2. Update package.json scripts
# "lint": "eslint ." → "lint": "biome check ."
# "lint:fix": "eslint --fix ." → "lint:fix": "biome check --apply ."

# 3. Run Biome
npm run lint

# 4. Auto-fix what you can
npm run lint:fix

# 5. Manual fix remaining issues
# - Double quotes (Biome enforces)
# - ESM .js extensions
# - import type for type-only imports
```

### From CommonJS to ESM

```typescript
// Before (CommonJS)
const { foo } = require("./foo");
module.exports = { bar };

// After (ESM)
import { foo } from "./foo.js"; // Note .js extension
export { bar };
```

**Migration checklist:**
- [ ] Add `"type": "module"` to package.json
- [ ] Add `.js` to all relative imports
- [ ] Change `require()` to `import`
- [ ] Change `module.exports` to `export`
- [ ] Change `__dirname` to `import.meta.url` pattern
- [ ] Update tsconfig.json module settings

### From Jest to Vitest

```typescript
// Before (Jest)
import { jest } from "@jest/globals";
const mockFn = jest.fn();

// After (Vitest)
import { vi } from "vitest";
const mockFn = vi.fn();
```

**Differences:**
| Feature | Jest | Vitest |
|---------|------|--------|
| Mock function | `jest.fn()` | `vi.fn()` |
| Spy | `jest.spyOn()` | `vi.spyOn()` |
| Module mock | `jest.mock()` | `vi.mock()` |
| Timer mocking | `jest.useFakeTimers()` | `vi.useFakeTimers()` |
| beforeEach | `beforeEach()` | `beforeEach()` |
| Globals | Injected | Must import |

## React-Specific Patterns (if applicable)

### useMemo vs useEffect + setState

```typescript
// Don't: useEffect to set derived state
const [derived, setDerived] = useState(null);
useEffect(() => {
  setDerived(expensiveCalculation(props.data));
}, [props.data]);

// Do: useMemo for derived values
const derived = useMemo(
  () => expensiveCalculation(props.data),
  [props.data]
);
```

### useCallback for Event Handlers

```typescript
// Don't: new function on every render
<button onClick={() => handleClick(id)}>Click</button>

// Do: memoized callback
const handleClick = useCallback((id: string) => {
  // handle click
}, []);

<button onClick={() => handleClick(id)}>Click</button>
```

### Cleanup in useEffect

```typescript
// Don't: missing cleanup
useEffect(() => {
  const interval = setInterval(() => {
    refreshData();
  }, 1000);
}, []); // Interval never cleared!

// Do: proper cleanup
useEffect(() => {
  const interval = setInterval(() => {
    refreshData();
  }, 1000);

  return () => clearInterval(interval);
}, []);
```

## Project-Specific Gotchas

### YAML Boolean Strings

When reading frontmatter via `js-yaml`, `handoff: true` is parsed as a JS string `"true"`, not a boolean.

```typescript
// Don't: string "false" is truthy
if (frontmatter.handoff) {
  // Runs for "false" string!
}

// Do: explicit parse with strict semantics
import { parseBooleanWithDefault } from "../src/custom-agents.js";
const handoff = parseBooleanWithDefault(frontmatter.handoff, false);
```

### Number.isInteger Gotcha

`Number.isInteger()` does NOT narrow TypeScript types.

```typescript
// Don't: no narrowing
function process(value: number | undefined) {
  if (Number.isInteger(value)) {
    // TypeScript still thinks value is number | undefined
    return value * 2; // Error: possibly undefined
  }
}

// Do: pair with undefined check
function process(value: number | undefined) {
  if (value !== undefined && Number.isInteger(value)) {
    // TypeScript knows value is number
    return value * 2; // OK
  }
}
```

### Map/Set Order

Rely on Map/Set preserving insertion order for deterministic UI output.

```typescript
// Running agents first, then queued, then done
const agents = new Map<string, AgentRecord>();
// Insert in order: running → queued → done
// Don't sort unless you need a different order
```

### Settings Persistence

Settings persist to `.pi/subagent-settings.json`, NOT `package.json` or env vars (except at first-run).

```typescript
// When adding a setting:
// 1. Update SubagentsSettings interface in src/settings.ts
// 2. Update defaults
// 3. Update validation
// 4. Update buildSettingsSnapshot in output-handler.ts
// 5. Update settings menu
// 6. Update docs/api-reference.md
```

## When to Use This Skill

Invoke this skill when:
- User mentions "unused exports", "knip", or "dead code"
- User mentions "type assertions", "as any", or "unsafe types"
- User mentions "useEffect", "React hooks", or "hook cleanup"
- User mentions "TypeScript lint", "Biome", or "lint fixes"
- User wants to improve code quality or type safety
- User mentions "Parse Don't Validate" or "type guards"
- User mentions "discriminated unions" or "branded types"
- User mentions "exhaustive switch" or "never type"
- User wants to migrate from ESLint to Biome
- User wants to migrate from CommonJS to ESM
- User mentions "YAML booleans" or `parseBooleanWithDefault`
