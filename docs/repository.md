# Repository & Naming

## Canonical location

| What | Value |
|------|-------|
| **GitHub** | https://github.com/OnlineChefGroep/pi-agent-orchestrator |
| **Org** | [OnlineChefGroep](https://github.com/OnlineChefGroep) |
| **npm package** | `@onlinechefgroep/pi-agent-orchestrator` |
| **Install** | `pi install npm:@onlinechefgroep/pi-agent-orchestrator` |

Clone:

```bash
git clone https://github.com/OnlineChefGroep/pi-agent-orchestrator.git
```

## One-time GitHub setup (org admin)

The canonical URL is `OnlineChefGroep/pi-agent-orchestrator`. If the repository does not exist under the org yet, an org admin must either:

1. **Transfer** the existing repo: `OnlineChef/pi-agent-orchestrator` → Settings → Danger zone → Transfer ownership → `OnlineChefGroep`, or
2. **Create** `OnlineChefGroep/pi-agent-orchestrator` and push this codebase there.

After that, `git push origin main` works with the remote already configured in this repo.

## Git remote

This repository's `origin` must point at OnlineChefGroep:

```bash
git remote set-url origin https://github.com/OnlineChefGroep/pi-agent-orchestrator.git
```

## Naming

| Name | Role |
|------|------|
| `OnlineChefGroep/pi-agent-orchestrator` | **GitHub repository** |
| `@onlinechefgroep/pi-agent-orchestrator` | **npm package** (GitHub Packages) |
| `pi-subagents` | **Internal legacy** — Symbol keys (`pi-subagents:manager`), settings paths, log prefixes. Not the public repo name. |

## Publishing (npm registry)

Published to **GitHub Packages** (`npm.pkg.github.com`):

```json
"publishConfig": {
  "registry": "https://npm.pkg.github.com",
  "access": "public"
}
```

Install via Pi (recommended): `pi install npm:@onlinechefgroep/pi-agent-orchestrator`

For manual `npm install`, users need a GitHub token and `.npmrc` scoped to `npm.pkg.github.com`. Publishing to [npmjs.com](https://www.npmjs.com) is optional and would improve discoverability for non-GitHub users.

## Related packages

| Package | Repository |
|---------|------------|
| `@onlinechefgroep/pi-subagents-tui` | `OnlineChefGroep/pi-subagents-tui` |
| `@onlinechef/context-mode` | optional peer (sandbox tools) |
