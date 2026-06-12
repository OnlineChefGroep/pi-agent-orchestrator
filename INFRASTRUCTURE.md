# INFRASTRUCTURE.md

> Infrastructure overview for `@onlinechefgroep/pi-agent-orchestrator` — CI/CD, publishing, tooling, and development environment.

---

## CI/CD

### GitHub Actions Workflows

| Workflow | File | Purpose |
|---|---|---|
| **CI** | `.github/workflows/ci.yml` | TypeScript matrix: `ubuntu/windows × node 20/22 × peer-deps lowest/latest`. Runs typecheck, lint, and full test suite (1035 tests). |
| **Linter** | `.github/workflows/linter.yml` | Super-linter with Bash, JSON, TypeScript checks. |
| **CodeQL** | `.github/workflows/codeql.yml` | Security analysis (disabled auto-triggers, manual only). |
| **Qodana** | `.github/workflows/qodana_code_quality.yml` | Static analysis for TS and Python. |
| **Publish (GitHub)** | `.github/workflows/publish.yml` | Publishes to GitHub Packages (`npm.pkg.github.com`). |
| **Publish (npm)** | `.github/workflows/publish-npm.yml` | Publishes to npmjs.org. |
| **Chef Linear→Notion Sync** | `.github/workflows/chef-linear-notion-sync.yml` | Project management sync (OnlineChefGroep internal). |

### Branch Protection (main)

- Required approving reviews: 0
- Dismiss stale reviews: enabled
- Status checks: none required (CI runs but doesn't block merge)

## Publishing

Dual publishing to both registries:

```bash
# GitHub Packages (internal)
npm publish --registry=https://npm.pkg.github.com

# npmjs.org (public)
npm publish --registry=https://registry.npmjs.org
```

The `files` whitelist in `package.json` ensures only runtime source and docs are included.

## Development Environment

### Prerequisites

- Node.js >= 22
- npm (or pnpm/bun — project uses npm)
- Optional: tmux, asciinema, ffmpeg (for showcase pipeline)

### Setup

```bash
npm install
npm run setup:hooks   # opt-in git hooks (biome + tsc on commit, test suite on push)
```

### Verification Commands

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # biome check
npm run lint:fix      # biome check --write
npm test              # vitest run (1035 tests)
npm run bench:all     # full benchmark suite
```

### Git Hooks (opt-in)

Run `npm run setup:hooks` after `npm install` to enable:

- **pre-commit**: biome check + tsc --noEmit
- **pre-push**: full test suite (`npm test`)

Hooks are **opt-in** — not installed by default.

## Showcase Infrastructure

Six pipeline modes for generating demo assets:

| Pipeline | Script | Dependencies |
|---|---|---|
| Programmatic (CI) | `scripts/render-showcase-assets.sh` | Node.js only |
| Live asciinema | `scripts/capture-live-showcase.sh` | asciinema |
| Remotion hero | `scripts/render-showcase-remotion.sh` | Remotion, ffmpeg |
| Tmux recording | `scripts/showcase-tmux-recorder.sh` | tmux, asciinema, agg, ffmpeg |
| VHS tape | `scripts/render-showcase-vhs.sh` | vhs |
| Full pipeline | `scripts/showcase-all.sh` | All of the above |

## Agent Portfolio

### Daemons (`.agents/daemons/`)

| Daemon | Trigger | Purpose |
|---|---|---|
| `github-activity-digest` | `/github-activity-digest` | GitHub activity digests |
| `js-ts-dependency-upgrades` | `/js-ts-dependency-upgrades` | JS/TS dependency management |
| `linear-issue-labeler` | `/linear-issue-labeler` | Linear issue labeling |
| `pr-check-repair` | `/pr-check-repair` | PR check and repair |

### Skills (`.agents/skills/`)

| Skill | Trigger | Purpose |
|---|---|---|
| `graphify` | `/graphify` | Codebase knowledge graph generation |
| `overdrive` | `/overdrive` | Pi Orchestra performance auditing |
| `showcase` | `/showcase` | Demo video generation |
| `testing` | `/test` | Test and benchmark discipline |

## Repository Structure

```
.
├── .agents/           # Agent definitions (daemons + skills)
│   ├── daemons/       # Autonomous daemon agents
│   └── skills/        # Skill packages
├── .github/           # CI/CD workflows
├── .jules/            # Jules optimization journal
├── docs/              # Documentation + showcase assets
│   └── images/        # Showcase GIFs, MP4s, PNGs
├── scripts/           # Showcase + build scripts
├── showcase/          # Raw showcase tapes
├── src/               # TypeScript source
│   └── ui/            # TUI dashboard components
│       └── dashboard/ # Modular dashboard components
└── test/              # Vitest test suite (58 files, 1035 tests)
```
