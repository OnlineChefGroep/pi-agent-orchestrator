---
name: skill-maintenance
description: "Unified skill maintenance skill for creating, testing, validating, consolidating, and improving Codex skills. Use for skill creation, skill testing, quick_validate, frontmatter cleanup, openai.yaml metadata, reference organization, gap analysis, umbrella skill migration, archive scripts, and skill portfolio cleanup."
---

# Skill Maintenance

This skill handles the creation, testing, validation, and maintenance of Codex skills for the pi-agent-orchestrator project.

## Project Context

Skills are stored in `.agents/skills/` following the OpenAI Agent Skills specification:
- **Format**: Folder with `SKILL.md` (required) and optional `agents/openai.yaml`
- **Location**: `.agents/skills/<skill-name>/SKILL.md`
- **Discovery**: Scanned by Codex from current directory up to repo root
- **Structure**: YAML frontmatter + markdown instructions

## SKILL.md Format

### Required Frontmatter

```yaml
---
name: skill-name
description: "Explain exactly when this skill should and should not trigger. Front-load key use case and trigger words."
---
```

### Optional Frontmatter

```yaml
---
name: skill-name
description: "Skill description"
trigger: /command  # Optional: trigger command
---
```

### Body Content

The markdown body contains the skill instructions for Codex to follow. Use:
- **Imperative steps** with explicit inputs and outputs
- **Code blocks** for commands and examples
- **Sections** with clear headings (##)
- **Lists** for step-by-step guidance

## Creating a New Skill

### 1. Use the Skill Creator (Recommended)

```
$skill-creator
```

The creator will ask:
- What the skill does
- When it should trigger
- Whether it should be instruction-only or include scripts

### 2. Manual Creation

Create a folder and SKILL.md:

```bash
mkdir -p .agents/skills/my-skill
```

Create `.agents/skills/my-skill/SKILL.md`:

```yaml
---
name: my-skill
description: "Concise description with clear scope and boundaries. Front-load key use case and trigger words."
---

# My Skill

Instructions for Codex to follow.

## When to Use This Skill

Invoke this skill when:
- User mentions X
- User needs to do Y
- User asks about Z
```

### 3. Add Optional UI Metadata

Create `.agents/skills/my-skill/agents/openai.yaml`:

```yaml
interface:
  display_name: "Optional user-facing name"
  short_description: "Optional user-facing description"
  icon_small: "./assets/small-logo.svg"
  icon_large: "./assets/large-logo.png"
  brand_color: "#3B82F6"
  default_prompt: "Optional surrounding prompt to use the skill with"
  policy:
    allow_implicit_invocation: false
  dependencies:
    tools:
      - type: "mcp"
        value: "server-name"
        description: "Description of tool dependency"
        transport: "streamable_http"
        url: "https://example.com/mcp"
```

## Skill Testing

### Quick Validation

Check that a skill is properly formatted:

```bash
# Verify SKILL.md exists and has valid frontmatter
cat .agents/skills/my-skill/SKILL.md

# Check for YAML syntax errors
# (Frontmatter should parse correctly)
```

### Manual Testing

1. **Restart Codex** after skill changes (auto-detection may not always work)
2. **Test implicit invocation**: Prompt with task matching skill description
3. **Test explicit invocation**: Use `$my-skill` or `/skills` to select
4. **Verify instructions**: Ensure Codex follows the skill steps correctly

### Test Checklist

- [ ] SKILL.md has valid YAML frontmatter (--- boundaries)
- [ ] `name` is unique and lowercase with hyphens
- [ ] `description` is concise and front-loads trigger words
- [ ] Instructions are imperative and step-by-step
- [ ] Code blocks are properly formatted
- [ ] No broken references or missing files
- [ ] Skill appears in Codex skill selector

## Frontmatter Cleanup

### Common Issues

1. **Missing name or description**
   ```yaml
   # Bad
   ---
   ---
   
   # Good
   ---
   name: my-skill
   description: "What this skill does"
   ---
   ```

2. **Non-standard fields**
   - Remove fields not in the OpenAI spec
   - Keep it to: `name`, `description`, `trigger`

3. **Description too vague**
   ```yaml
   # Bad
   description: "A skill for doing things"
   
   # Good
   description: "Handle TypeScript code quality improvements including unused exports, type assertions, and React hook cleanup"
   ```

## Reference Organization

### Adding Supporting Files

Skills can include:
- **Templates**: `.agents/skills/my-skill/templates/template.md`
- **Examples**: `.agents/skills/my-skill/examples/example.md`
- **Schemas**: `.agents/skills/my-skill/schemas/schema.json`
- **Scripts**: `.agents/skills/my-skill/scripts/script.sh`

Reference these in SKILL.md:

```markdown
## Templates

Use the template at `templates/template.md` as a starting point.

## Examples

See `examples/example.md` for a complete example.
```

### File Structure Best Practices

```
.agents/skills/my-skill/
├── SKILL.md              # Required
├── agents/
│   └── openai.yaml       # Optional UI metadata
├── templates/            # Optional templates
├── examples/             # Optional examples
├── schemas/              # Optional JSON schemas
└── scripts/              # Optional automation scripts
```

## Gap Analysis

Review existing skills to identify gaps:

### Current Skills

1. **graphify** - Knowledge graph generation
2. **showcase** - README/PR showcase media
3. **testing-pi-agent-orchestrator** - Extension testing
4. **typescript-quality** - TypeScript/React code quality
5. **repo-workflow** - Repository workflows
6. **skill-maintenance** - Skill maintenance (this skill)

### Potential Gaps

Consider adding skills for:
- **Documentation generation** - Auto-generate docs from code
- **Performance profiling** - Identify bottlenecks
- **Security auditing** - Scan for vulnerabilities
- **Dependency management** - Update and audit dependencies
- **CI/CD workflows** - Pipeline configuration and debugging

## Umbrella Skill Migration

When multiple small skills cover related areas, consider consolidating into an umbrella skill:

### Example: TypeScript Quality

Instead of separate skills for:
- `remove-unused-exports`
- `fix-type-assertions`
- `cleanup-react-hooks`

Create one umbrella skill:
- `typescript-quality` with sections for each task

### Migration Steps

1. **Identify related skills** with overlapping scope
2. **Create umbrella skill** with comprehensive coverage
3. **Migrate instructions** from individual skills
4. **Update references** in other skills/docs
5. **Archive old skills** (move to `.agents/skills/archive/`)

## Archive Scripts

For deprecated skills:

```bash
# Create archive directory
mkdir -p .agents/skills/archive

# Move deprecated skill
mv .agents/skills/old-skill .agents/skills/archive/

# Add deprecation notice to SKILL.md
```

## Skill Portfolio Cleanup

### Regular Maintenance Tasks

1. **Remove unused skills**: Skills not invoked in 30+ days
2. **Consolidate overlapping skills**: Merge similar functionality
3. **Update descriptions**: Improve discoverability
4. **Add UI metadata**: Enhance Codex app experience
5. **Test all skills**: Ensure they still work correctly

### Cleanup Commands

```bash
# List all skills
ls -la .agents/skills/

# Find skills without openai.yaml
find .agents/skills -name "SKILL.md" -exec dirname {} \; | while read dir; do
  if [ ! -f "$dir/agents/openai.yaml" ]; then
    echo "$dir missing openai.yaml"
  fi
done

# Check for duplicate skill names
find .agents/skills -name "SKILL.md" -exec grep -H "^name:" {} \;
```

## Skill Validation

### Automated Validation Script

```bash
#!/bin/bash
# validate-skills.sh

SKILLS_DIR=".agents/skills"
ERRORS=0

echo "Validating skills in ${SKILLS_DIR}..."

for skill_dir in ${SKILLS_DIR}/*/; do
  skill_name=$(basename "$skill_dir")
  skill_file="${skill_dir}SKILL.md"

  echo "Checking ${skill_name}..."

  # Check SKILL.md exists
  if [ ! -f "$skill_file" ]; then
    echo "  ERROR: Missing SKILL.md"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Check frontmatter
  if ! grep -q "^---$" "$skill_file"; then
    echo "  ERROR: Missing frontmatter start marker"
    ERRORS=$((ERRORS + 1))
  fi

  # Check name field
  if ! grep -q "^name:" "$skill_file"; then
    echo "  ERROR: Missing 'name' in frontmatter"
    ERRORS=$((ERRORS + 1))
  fi

  # Check description field
  if ! grep -q "^description:" "$skill_file"; then
    echo "  ERROR: Missing 'description' in frontmatter"
    ERRORS=$((ERRORS + 1))
  fi

  # Check When to Use section
  if ! grep -q "When to Use This Skill" "$skill_file"; then
    echo "  WARNING: Missing 'When to Use This Skill' section"
  fi

done

echo ""
echo "Validation complete: ${ERRORS} errors found"
exit ${ERRORS}
```

### YAML Frontmatter Validation

```typescript
// scripts/validate-skill.ts
import { readFileSync } from "node:fs";
import { parse } from "yaml";

interface SkillFrontmatter {
  name: string;
  description: string;
  trigger?: string;
}

function validateSkill(path: string): string[] {
  const content = readFileSync(path, "utf-8");
  const errors: string[] = [];

  // Check frontmatter markers
  if (!content.startsWith("---")) {
    errors.push("Missing frontmatter start marker");
  }

  // Parse frontmatter
  const match = content.match(/^---\n(.*?)\n---/s);
  if (!match) {
    errors.push("Invalid frontmatter format");
    return errors;
  }

  let frontmatter: SkillFrontmatter;
  try {
    frontmatter = parse(match[1]) as SkillFrontmatter;
  } catch {
    errors.push("Invalid YAML frontmatter");
    return errors;
  }

  // Validate required fields
  if (!frontmatter.name) {
    errors.push("Missing 'name' field");
  } else if (!/^[a-z0-9-]+$/.test(frontmatter.name)) {
    errors.push("Invalid 'name': must be lowercase with hyphens");
  }

  if (!frontmatter.description) {
    errors.push("Missing 'description' field");
  } else if (frontmatter.description.length < 20) {
    errors.push("Description too short (min 20 chars)");
  }

  return errors;
}
```

## Skill Organization

### By Domain

Organize skills by domain or workflow:

```
.agents/skills/
├── development/
│   ├── typescript-quality/
│   ├── testing/
│   └── tui-dashboard/
├── operations/
│   ├── repo-workflow/
│   ├── showcase/
│   └── skill-maintenance/
└── research/
    ├── graphify/
    └── research-workflow/
```

### Flat Structure (Current)

```
.agents/skills/
├── agent-orchestration/
├── graphify/
├── pi-extension-dev/
├── repo-workflow/
├── research-workflow/
├── showcase/
├── skill-maintenance/
├── testing/
├── tui-dashboard/
└── typescript-quality/
```

### Naming Conventions

| Pattern | Example | When to Use |
|---------|---------|-------------|
| `domain-action` | `typescript-quality` | General domain skill |
| `tool-name` | `graphify` | Tool-specific skill |
| `workflow-type` | `repo-workflow` | Process/workflow skill |
| `testing-target` | `testing-pi-agent-orchestrator` | Testing-specific skill |

### Skill Size Guidelines

| Metric | Minimum | Ideal | Maximum |
|--------|---------|-------|---------|
| Lines in SKILL.md | 50 | 200-500 | 1000 |
| Reference files | 0 | 2-5 | 10 |
| Sections | 3 | 5-8 | 15 |
| Code examples | 2 | 5-10 | 20 |

**If a skill exceeds 1000 lines:**
- Consider splitting into multiple skills
- Move detailed reference content to `references/` folder
- Keep SKILL.md focused on instructions

## Skill Quality Metrics

### Coverage Score

```typescript
interface SkillQualityScore {
  frontmatter: number;      // 0-10: Valid name, description, trigger
  structure: number;        // 0-10: Clear sections, headings
  examples: number;         // 0-10: Code examples, use cases
  references: number;       // 0-10: Links to related files/docs
  triggers: number;         // 0-10: "When to Use" clarity
  total: number;            // 0-50
}

function calculateQualityScore(skillPath: string): SkillQualityScore {
  const content = readFileSync(skillPath, "utf-8");

  return {
    frontmatter: checkFrontmatter(content),
    structure: checkStructure(content),
    examples: checkExamples(content),
    references: checkReferences(content),
    triggers: checkTriggers(content),
    total: 0, // Calculated from components
  };
}
```

### Skill Health Dashboard

```markdown
# Skill Health Report

## Overall Health

| Skill | Size | Examples | References | Quality |
|-------|------|----------|------------|---------|
| agent-orchestration | 596 lines | Good | Good | Excellent |
| graphify | 1300 lines | Good | Excellent | Excellent |
| pi-extension-dev | 566 lines | Good | Good | Good |
| repo-workflow | 635 lines | Good | Good | Good |
| research-workflow | 1064 lines | Excellent | Excellent | Excellent |
| showcase | 751 lines | Excellent | Excellent | Excellent |
| skill-maintenance | 336 lines | Fair | Fair | Good |
| testing | 787 lines | Excellent | Good | Excellent |
| tui-dashboard | 423 lines | Good | Good | Good |
| typescript-quality | 498 lines | Good | Good | Good |

## Recommendations

1. **skill-maintenance**: Add more reference files and examples
2. **tui-dashboard**: Consider splitting if grows beyond 500 lines
3. **All skills**: Ensure `agents/openai.yaml` exists for UI metadata
```

## Skill Template

### Complete SKILL.md Template

```markdown
---
name: {kebab-case-name}
description: "Clear description with trigger words front-loaded. Explain exactly when this skill should and should not trigger."
---

# {Human-Readable Name}

## Overview

Brief description of what this skill handles.

## Project Context

Relevant project-specific context.

## Key Commands

```bash
# Important commands
npm run command
```

## Common Tasks

### Task 1: Description

```bash
# Step 1
npm run step1

# Step 2
npm run step2
```

## Examples

### Example 1: Scenario

```typescript
// Code example
const example = "code";
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

## Best Practices

### Skill Design

1. **Keep focused**: One job per skill
2. **Prefer instructions over scripts**: More flexible for AI
3. **Write imperative steps**: Clear inputs and outputs
4. **Test descriptions**: Verify trigger behavior
5. **Front-load keywords**: Help implicit matching

### Description Writing

```yaml
# Good description
description: "Handle TypeScript code quality improvements including unused exports, type assertions, and React hook cleanup"

# Bad description
description: "TypeScript stuff"
```

### Instruction Writing

```markdown
# Good - imperative, explicit
## Step 1 - Run type checking
```bash
npm run typecheck
```

# Bad - vague, no action
## Type checking
You should check types.
```

### Reference File Organization

```
.agents/skills/my-skill/
├── SKILL.md                      # Main instructions
├── agents/
│   └── openai.yaml                # UI metadata
├── references/
│   ├── pattern-reference.md      # Common patterns
│   ├── troubleshooting.md         # Debug guide
│   └── example-config.md         # Config examples
└── templates/
    └── starter-template.md        # Reusable templates
```

## When to Use This Skill

Invoke this skill when:
- User mentions "create a skill" or "new skill"
- User mentions "skill testing" or "validate skill"
- User mentions "skill cleanup" or "skill maintenance"
- User mentions "frontmatter" or "SKILL.md"
- User mentions "skill portfolio" or "skill organization"
- User wants to consolidate or archive skills
- User needs to add UI metadata to skills
- User mentions "skill quality" or "skill metrics"
- User wants to reorganize skill structure
- User mentions "skill template" or "skill boilerplate"
