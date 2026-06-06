---
name: repo-workflow
description: "Unified repository workflow skill for repository initialization, code review, simplification, pull request creation, and PR follow-up. Use for initializing repos with AGENTS.md, reviewing changed code, improving reuse/quality/efficiency, creating PRs with Conventional Commits, addressing reviewer comments, fixing CI, rebasing, and preparing branches for merge."
---

# Repository Workflow

## Overview

This skill handles repository-level workflows for the pi-agent-orchestrator project, including initialization, code review standards, PR creation, and CI/CD maintenance. Use this skill when managing the lifecycle of features from branch creation to merge and release.

## Project Context

- **Repository**: pi-agent-orchestrator (VS Code extension for autonomous coding agents)
- **Published to**: GitHub Packages (`npm.pkg.github.com`), not npmjs
- **License**: MIT
- **Branch strategy**: Feature branches with PRs per CONTRIBUTING.md
- **Commit style**: Conventional Commits with limited types

## Conventional Commits

Allowed commit types (from AGENTS.md):
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `test:` - Test changes
- `chore:` - Maintenance tasks

**Format**: `<type>(<scope>): <description>`

Examples:
```
feat(agents): add new agent type for scheduled tasks
fix(handoff): resolve JSON parsing error in handoff validation
docs(readme): update installation instructions
refactor(skill-loader): improve caching mechanism
test(agent-manager): add session limit tests
chore(deps): update dependencies
```

**Note**: No `feat!` (use a body footer `BREAKING CHANGE:` instead). Scopes are recommended for clarity.

## Repository Initialization

When initializing a new repository or setting up this project:

1. **Create AGENTS.md** with project-specific rules
2. **Set up git hooks**:
   ```bash
   npm run setup:hooks
   ```
   This enables pre-commit (biome + tsc) and pre-push (tests) hooks.

3. **Configure .gitignore** to exclude:
   - `.agents/autoresearch/` (temp research artifacts)
   - `node_modules/`
   - `dist/`
   - `.pi/` (local agent state)

4. **Set up package.json** with:
   - `pi.extensions` field pointing to entry file
   - Correct peer dependencies (never direct deps)
   - GitHub Packages registry configuration

## Code Review Workflow

When reviewing code changes:

### 1. Review Checklist
- [ ] Follows project conventions (AGENTS.md)
- [ ] No `as any` in test mocks
- [ ] ESM imports use `.js` extensions
- [ ] Type-only imports use `import type`
- [ ] Biome linting passes
- [ ] TypeScript compilation passes
- [ ] Tests pass (or known-flaky tests are documented)
- [ ] Conventional commit format used
- [ ] No new peer dependencies added incorrectly

### 2. Quality Improvements
Look for opportunities to:
- **Improve reuse**: Extract common patterns into shared functions
- **Improve quality**: Add type safety, remove `any`, add validation
- **Improve efficiency**: Reduce redundant operations, add caching

### 3. Common Issues to Flag
- Missing required fields in type mocks
- Incorrect import paths (missing `.js`)
- Missing `import type` for type-only imports
- Direct dependencies on `@earendil-works/pi-*` packages
- Violations of AGENTS.md common mistakes

## Pull Request Creation

### 1. Branch Preparation
```bash
# Create feature branch
git checkout -b feat/your-feature-name

# Make changes
# ...

# Verify before committing
npm run typecheck && npm run lint && npm test
```

### 2. Commit with Conventional Commits
```bash
git add .
git commit -m "feat(scope): description"
```

### 3. Push and Create PR
```bash
git push origin feat/your-feature-name
```

Create PR with:
- **Title**: Same as commit message
- **Description**: Summary of changes, testing done, any breaking changes
- **Labels**: appropriate labels (bug, enhancement, docs, etc.)

### 4. PR Body Template
```markdown
## Summary
Brief description of what this PR does.

## Changes
- Bullet list of main changes

## Testing
- How you tested (manual, automated)
- Test coverage added

## Breaking Changes
None (or describe if any)

## Checklist
- [ ] Follows AGENTS.md conventions
- [ ] Tests pass
- [ ] Linting passes
- [ ] Type checking passes
- [ ] Documentation updated
```

## PR Follow-Up

### Addressing Reviewer Comments

1. **Make changes** based on feedback
2. **Commit fixes** with appropriate commit type:
   - `fix(scope): address reviewer comment about X`
   - `docs(scope): clarify documentation per review`
3. **Push updates** to the same branch
4. **Request re-review** when ready

### Fixing CI Failures

1. **Check CI logs** for specific failure
2. **Reproduce locally**:
   ```bash
   npm run typecheck && npm run lint && npm test
   ```
3. **Fix the issue** and commit
4. **Push** and wait for CI to re-run

**Known flaky tests**: `schedule.test.ts` and `schedule-store.test.ts` on Windows are marked `continue-on-error` in CI. These should not block PRs.

### Rebasing

When asked to rebase:
```bash
# Fetch latest main
git fetch origin main

# Rebase your branch
git rebase origin/main

# Force push (careful!)
git push --force-with-lease origin feat/your-feature-name
```

**Note**: Only rebase when explicitly requested. It rewrites history.

### Preparing for Merge

Before merge:
1. **Resolve all conflicts**
2. **Ensure CI passes**
3. **Update documentation** if needed
4. **Squash commits** if requested (use `git rebase -i`)
5. **Remove WIP/Draft labels**

## Pre-Commit and Pre-Push Hooks

### Pre-Commit (runs automatically)
- Biome lint check
- TypeScript compilation check
- **Does NOT run tests** (tests are in pre-push)

### Pre-Push (runs automatically)
- Full test suite
- **Can be bypassed** with `git push --no-verify` if tests are slow/flaky
- **Document reason** in commit body if bypassed

### Manual Hook Installation
```bash
npm run setup:hooks
```

## Repository Maintenance

### Dependency Updates
```bash
# Check for outdated dependencies
npm outdated

# Update dependencies
npm update

# Update dev dependencies
npm update --save-dev
```

**Note**: Peer dependencies should NOT be updated lightly - they must match the host platform version.

### Documentation Updates
- Keep AGENTS.md current with new rules
- Update CHANGELOG.md for notable changes
- Update README.md for user-facing changes
- Update docs/api-reference.md for API changes

### Branch Strategies

### Feature Branch Workflow (Default)

```
main (protected)
  └── feat/feature-name
  └── fix/bug-description
  └── docs/update-section
  └── refactor/module-name
```

**Rules:**
- All changes go through PRs
- No direct pushes to main
- Feature branches are deleted after merge
- Branch names follow pattern: `<type>/<description>`

### Hotfix Workflow

For critical production fixes:

```bash
# Create hotfix from main
git checkout -b hotfix/critical-fix main

# Make minimal fix
# ...

# Fast-track review and merge
git push origin hotfix/critical-fix
# Create PR with "hotfix" label
```

### Experiment Branches

For research and spikes:

```bash
# Create experiment branch
git checkout -b experiment/optimization-name

# Make experimental changes
# Run benchmarks
# Document results

# Decision:
# - Success → create clean PR from new branch
# - Failure → delete branch, document findings
```

## Code Review Templates

### Author Checklist (Before Submitting)

```markdown
## Self-Review Checklist

- [ ] I have run `npm run typecheck && npm run lint && npm test`
- [ ] I have reviewed my own code for clarity
- [ ] I have added tests for new functionality
- [ ] I have updated documentation if needed
- [ ] My commits follow Conventional Commits
- [ ] I have rebased on latest main
- [ ] No `as any` or `// @ts-ignore` without justification
- [ ] ESM imports use `.js` extensions
- [ ] Type-only imports use `import type`
```

### Reviewer Checklist

```markdown
## Review Checklist

### Correctness
- [ ] Logic is correct and handles edge cases
- [ ] Error paths are handled
- [ ] No race conditions or state pollution

### Type Safety
- [ ] No `any` types (unless justified)
- [ ] Proper type guards for runtime validation
- [ ] Return types are explicit

### Testing
- [ ] Tests cover happy path and error cases
- [ ] Adversarial tests for defensive code
- [ ] No test pollution (state resets in beforeEach)

### Performance
- [ ] No obvious performance regressions
- [ ] Benchmarks pass (if applicable)
- [ ] No unnecessary re-renders or recalculations

### Style
- [ ] Follows project conventions (AGENTS.md)
- [ ] Biome linting passes
- [ ] Variable names are descriptive
- [ ] Functions are focused and small

### Documentation
- [ ] Complex logic has comments
- [ ] API changes are documented
- [ ] AGENTS.md updated if conventions change
```

### Review Response Template

```markdown
## Review Response

### Changes Made
- Fixed X in commit `abc1234`
- Added test for Y in commit `def5678`
- Updated documentation in commit `ghi9012`

### Not Addressed
- Item Z: Won't fix because [reason]

### Questions
- Should I also update [related file]?
```

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          registry-url: https://npm.pkg.github.com

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test
        continue-on-error: false

      - name: Build
        run: npm run build
```

### Known Flaky Test Handling

```yaml
# Mark known flaky tests
- name: Run flaky tests
  run: npx vitest run test/schedule.test.ts test/schedule-e2e.test.ts
  continue-on-error: true
  if: matrix.os == 'windows-latest'
```

### Publishing Workflow

```yaml
# .github/workflows/publish.yml
name: Publish

on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: https://npm.pkg.github.com

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Publish
        run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Release Management

### Semantic Versioning

This project follows SemVer:
- **MAJOR**: Breaking API changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### Release Checklist

```bash
# 1. Ensure main is clean
git checkout main
git pull origin main

# 2. Run full verification
npm run typecheck && npm run lint && npm test

# 3. Update version
npm version patch  # or minor, major

# 4. Update CHANGELOG.md
# Add section for new version

# 5. Commit version bump
# (npm version already commits and tags)

# 6. Push
 git push origin main --follow-tags

# 7. Publish
npm publish

# 8. Create GitHub release
# Use tag v0.x.y, copy CHANGELOG section
```

### CHANGELOG Format

```markdown
## [0.11.0] - 2024-01-15

### Added
- Swarm topology view in dashboard
- Activity heatmap for agent monitoring
- Custom theme support

### Changed
- Improved render performance by 30%
- Updated peer dependency requirements

### Fixed
- Handoff validation for large payloads
- Windows temp directory cleanup race

### Deprecated
- Old widget API (will be removed in 0.12.0)
```

## Troubleshooting Common Issues

### Merge Conflicts

```bash
# During rebase
git rebase origin/main
# Fix conflicts in files
# Mark as resolved
git add <file>
git rebase --continue

# During merge
git merge origin/main
# Fix conflicts
git add <file>
git commit
```

### CI Fails But Tests Pass Locally

**Possible causes:**
1. **Different Node version** — CI uses different version
2. **Missing environment variable** — CI doesn't have local env vars
3. **Race condition** — Parallel tests interact
4. **File system differences** — Windows path separators, case sensitivity

**Fix:**
```bash
# Reproduce CI environment
rm -rf node_modules package-lock.json
npm ci
npm run typecheck && npm run lint && npm test

# Run with same Node version as CI
nvm use 20
npm test
```

### Large PRs

If PR is too large to review effectively:

1. **Split into smaller PRs**:
   - One PR per feature/fix
   - Base each PR on previous one
   - Merge in sequence

2. **Add review guide**:
   ```markdown
   ## Review Guide

   Start with these files (in order):
   1. `src/types.ts` - New types added
   2. `src/new-module.ts` - Core logic
   3. `test/new-module.test.ts` - Tests
   4. `docs/api-reference.md` - Documentation
   ```

### Revert a Bad Merge

```bash
# Revert merge commit
git revert -m 1 <merge-commit-hash>

# Or reset if not pushed
git reset --hard origin/main

# If already pushed, create revert PR
git checkout -b revert/bad-merge
git revert -m 1 <merge-commit-hash>
git push origin revert/bad-merge
```

## Git Best Practices

### Commit Messages

```
feat(scope): add feature

Detailed explanation of what and why.

BREAKING CHANGE: description of breaking change
```

**Rules:**
- Subject line: 50 chars max
- Body: Explain what and why, not how
- Reference issues: `Fixes #123`
- Breaking changes in body footer

### Commit Frequency

- **Commit early and often** during development
- **Squash if requested** before merge
- **Keep commits atomic** (one logical change per commit)

### Git History

```bash
# View history with graph
git log --oneline --graph --all

# Find when file was changed
git log --follow -- src/file.ts

# Find commit that introduced bug
git bisect start
git bisect bad HEAD
git bisect good v0.10.0
# ... automated test narrows down
```

## When to Use This Skill

Invoke this skill when:
- User mentions "PR", "pull request", or "review"
- User mentions "commit", "conventional commits", or "commit style"
- User mentions "rebase", "merge", or "branch"
- User mentions "CI", "hooks", or "git"
- User wants to initialize a repository
- User needs to address reviewer comments
- User needs to fix CI failures
- User mentions "repository workflow" or "repo workflow"
- User mentions "release", "version", or "publish"
- User mentions "CHANGELOG" or "semantic versioning"
- User asks about branch strategy or git best practices
- User needs help with merge conflicts or rebase
