# Git Cheatsheet

## Branching

```bash
# Create and switch to new branch
git checkout -b feat/feature-name

# Switch to existing branch
git checkout branch-name

# List branches
git branch -a

# Delete local branch
git branch -d branch-name

# Delete remote branch
git push origin --delete branch-name
```

## Staging and Committing

```bash
# Stage all changes
git add .

# Stage specific file
git add path/to/file

# Unstage file
git reset HEAD path/to/file

# Commit with message
git commit -m "feat(scope): description"

# Amend last commit
git commit --amend -m "new message"

# Stage and commit in one (only tracked files)
git commit -am "fix(scope): quick fix"
```

## Pushing and Pulling

```bash
# Push current branch
git push origin branch-name

# Push and set upstream
git push -u origin branch-name

# Pull changes
git pull origin main

# Fetch without merging
git fetch origin

# Force push (careful!)
git push --force-with-lease origin branch-name
```

## Rebasing

```bash
# Start rebase
git rebase origin/main

# Continue after resolving conflicts
git rebase --continue

# Abort rebase
git rebase --abort

# Interactive rebase (squash, reorder)
git rebase -i HEAD~5
```

## Merging

```bash
# Merge branch into current
git merge feature-branch

# Merge with no fast-forward
git merge --no-ff feature-branch

# Abort merge
git merge --abort
```

## History

```bash
# Log with graph
git log --oneline --graph --all

# Log specific file
git log --follow -- path/to/file

# Show diff for commit
git show commit-hash

# Blame (who changed what)
git blame path/to/file
```

## Undoing Changes

```bash
# Unstage files
git reset HEAD file

# Discard local changes
git checkout -- file

# Revert commit (create new commit)
git revert commit-hash

# Reset to specific commit (destructive!)
git reset --hard commit-hash

# Undo last commit (keep changes)
git reset --soft HEAD~1
```

## Stashing

```bash
# Stash changes
git stash

# Stash with message
git stash push -m "message"

# List stashes
git stash list

# Apply stash
git stash apply

# Apply and drop
git stash pop

# Drop stash
git stash drop
```

## Tags

```bash
# Create tag
git tag v0.1.0

# Create annotated tag
git tag -a v0.1.0 -m "Release 0.1.0"

# Push tags
git push origin --tags

# Delete tag
git tag -d v0.1.0
```

## Submodules

```bash
# Add submodule
git submodule add https://github.com/user/repo.git

# Update submodules
git submodule update --init --recursive

# Remove submodule
git submodule deinit -f path/to/submodule
rm -rf .git/modules/path/to/submodule
git rm -f path/to/submodule
```

## Bisect (Find Bug)

```bash
# Start bisect
git bisect start

# Mark current as bad
git bisect bad

# Mark known good commit
git bisect good v0.10.0

# Git checks out middle commit
# Test and mark:
git bisect bad   # if bug present
git bisect good  # if bug absent

# Repeat until found, then:
git bisect reset
```

## Conventional Commits Quick Reference

| Type | Use When | Example |
|------|----------|---------|
| `feat` | New feature | `feat(agents): add swarm mode` |
| `fix` | Bug fix | `fix(handoff): validate JSON size` |
| `docs` | Documentation | `docs(readme): update install` |
| `refactor` | Code change | `refactor(dashboard): simplify render` |
| `test` | Test changes | `test(agent): add limit tests` |
| `chore` | Maintenance | `chore(deps): update vitest` |

**Breaking change:**
```
feat(api): new agent spawn API

BREAKING CHANGE: spawn() signature changed
```
