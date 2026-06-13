# Repository & Naming

## Canonical location

| What | Canonical name |
|------|----------------|
| **GitHub org** | [OnlineChefGroep](https://github.com/OnlineChefGroep) |
| **Repository** | `OnlineChefGroep/pi-agent-orchestrator` |
| **npm package** | `@onlinechefgroep/pi-agent-orchestrator` |
| **Install** | `pi install npm:@onlinechefgroep/pi-agent-orchestrator` |

## Legacy redirect

`OnlineChef/pi-agent-orchestrator` is the **old** personal-account location. Do not use it for new links, badges, or clones. If you still have that remote:

```bash
git remote set-url origin https://github.com/OnlineChefGroep/pi-agent-orchestrator.git
```

On GitHub: transfer the repository from `OnlineChef` → `OnlineChefGroep`, or create `OnlineChefGroep/pi-agent-orchestrator` and archive the old repo with a redirect notice.

## Why these names?

| Name | Role |
|------|------|
| `pi-agent-orchestrator` | **Repository** — describes what it does (orchestrates autonomous agents inside Pi). Clear for GitHub search and new contributors. |
| `@onlinechefgroep/pi-agent-orchestrator` | **npm package** — scoped to the org; matches the repo. Changing this would be a breaking publish identity. |
| `pi-subagents` | **Internal legacy** — still used in Symbol keys (`pi-subagents:manager`), settings paths, and log prefixes for backward compatibility. Not the public repo name. |

### Alternatives considered

| Name | Pros | Cons |
|------|------|------|
| `pi-subagents` | Short, matches internal namespace | Less descriptive; v0.10 already renamed away from this |
| `pi-agents` | Very short | Too generic; collides with host terminology |
| `pi-orchestrator` | Medium length | Omits "agent" — ambiguous in the Pi ecosystem |

**Recommendation:** keep `OnlineChefGroep/pi-agent-orchestrator` + `@onlinechefgroep/pi-agent-orchestrator`. It is accurate, already in CHANGELOG/migration docs, and distinguishes this extension from the host (`pi-coding-agent`) and the TUI sidecar (`pi-subagents-tui`).

## Publishing (npm registry)

The package is published to **GitHub Packages** (`npm.pkg.github.com`), not the public npmjs registry:

```json
"publishConfig": {
  "registry": "https://npm.pkg.github.com",
  "access": "public"
}
```

| Registry | Install experience |
|----------|-------------------|
| **GitHub Packages** (current) | Users need a GitHub token and `.npmrc` pointing at `npm.pkg.github.com` — unless they use `pi install`, which abstracts this. Fine for a GitHub-centric audience. |
| **npmjs.org** (alternative) | `npm install @onlinechefgroep/pi-agent-orchestrator` works out of the box for anyone; better discoverability on [npmjs.com](https://www.npmjs.com). Requires changing `publishConfig.registry` and publishing there. |

Both can coexist (dual-publish), but that adds CI complexity. For a first public OSS release on GitHub Packages, the current setup is valid — `pi install npm:@onlinechefgroep/pi-agent-orchestrator` is the intended install path.

## Related packages

| Package | Repository |
|---------|------------|
| `@onlinechefgroep/pi-subagents-tui` | `OnlineChefGroep/pi-subagents-tui` |
| `@onlinechef/context-mode` | separate optional peer (sandbox tools) |
