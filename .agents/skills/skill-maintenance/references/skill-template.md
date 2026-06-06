# Skill Template Reference

## Minimal Skill

```markdown
---
name: minimal-skill
description: "Short, clear description with trigger words"
---

# Minimal Skill

## Overview

What this skill does.

## Common Tasks

### Task 1

```bash
npm run command
```

## When to Use This Skill

Invoke this skill when:
- User mentions "keyword"
- User needs to "do something"
```

## Standard Skill

```markdown
---
name: standard-skill
description: "Detailed description with trigger words front-loaded. Covers multiple related tasks."
---

# Standard Skill

## Overview

What this skill handles and why.

## Project Context

Relevant project-specific information.

## Key Commands

```bash
npm run typecheck
npm run lint
npm test
```

## Common Tasks

### Task 1: Description

Steps:
1. Step one
2. Step two
3. Step three

```bash
# Command example
npm run command
```

### Task 2: Description

```typescript
// Code example
const example = "code";
```

## Examples

### Example 1: Scenario

Description of scenario and solution.

```bash
# Commands for this scenario
```

## References

- **Reference file**: `references/example.md`
- **External docs**: https://example.com

## When to Use This Skill

Invoke this skill when:
- User mentions "keyword1" or "keyword2"
- User needs to do "specific action"
- User asks about "domain topic"
```

## Complex Skill

```markdown
---
name: complex-skill
description: "Comprehensive skill for complex workflows with multiple phases, decision trees, and reference materials."
---

# Complex Skill

## Overview

Detailed description of scope and boundaries.

## Architecture

```
Diagram or flowchart of the workflow
```

## Phase 1: Setup

### Prerequisites

- Requirement 1
- Requirement 2

### Configuration

```bash
# Configuration commands
```

## Phase 2: Execution

### Step 1

```bash
# Step 1 commands
```

### Step 2

```typescript
// Step 2 code
```

## Phase 3: Verification

### Tests

```bash
# Verification commands
```

## Advanced Usage

### Custom Configuration

```yaml
# Custom config example
```

### Integration with Other Skills

How this skill works with other skills.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Error 1 | Cause 1 | Fix 1 |
| Error 2 | Cause 2 | Fix 2 |

## References

### Internal

- **Reference 1**: `references/ref1.md`
- **Reference 2**: `references/ref2.md`

### External

- **Documentation**: https://example.com/docs
- **Specification**: https://example.com/spec

## When to Use This Skill

Invoke this skill when:
- User mentions "keyword1" or "keyword2"
- User needs to do "complex workflow"
- User asks about "domain topic"
- User mentions "advanced feature"
```

## Frontmatter Fields

### Required

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Kebab-case identifier |
| `description` | string | Trigger description |

### Optional

| Field | Type | Description |
|-------|------|-------------|
| `trigger` | string | Explicit trigger command |
| `dependencies` | object | MCP/tool dependencies |

## Skill Size Targets

| Complexity | Lines | Sections | Examples |
|------------|-------|----------|------------|
| Minimal | 30-80 | 3-4 | 1-2 |
| Standard | 100-300 | 5-7 | 3-5 |
| Complex | 400-800 | 8-12 | 8-15 |

## Validation Checklist

- [ ] Valid YAML frontmatter
- [ ] `name` is kebab-case
- [ ] `description` is > 20 chars
- [ ] Has "When to Use This Skill" section
- [ ] All code blocks have language tags
- [ ] No broken internal links
- [ ] `agents/openai.yaml` exists (optional but recommended)
