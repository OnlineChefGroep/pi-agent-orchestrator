# Site hosting

The pi-agent-orchestrator product site has two static hosts. **Cloudflare Pages** is the product URL; **GitHub Pages** mirrors the same staged `_site/` tree for the org `.github.io` link used in README/canonical metadata.

## URLs

| Host | Role |
|------|------|
| `https://pi-agent-orchestrator.pages.dev` | Default Cloudflare Pages subdomain |
| `https://orchestrator.chefgroep.online` | Custom domain (`chefgroep.online` zone) |
| `https://onlinechefgroep.github.io/pi-agent-orchestrator/` | GitHub Pages mirror (Actions deploy) |

GitHub Pages requires a one-time repo enablement (`build_type=workflow`). The Deploy Pages workflow only publishes from `main` and cannot flip that enablement bit with `GITHUB_TOKEN`.

## Deployment

Production deploys run from the `main` branch via [`.github/workflows/cloudflare-pages.yml`](../.github/workflows/cloudflare-pages.yml):

1. `scripts/build-site.sh` assembles static assets into `_site/`
2. `wrangler pages deploy` publishes to the `pi-agent-orchestrator` Pages project

The workflow runs on a daily schedule and on manual `workflow_dispatch`. Required secrets live in the GitHub `cloudflare-pages` environment: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Custom domain

`orchestrator.chefgroep.online` is attached to the Pages project in the same Cloudflare account as the `chefgroep.online` zone. DNS is a proxied CNAME to `pi-agent-orchestrator.pages.dev`.

To add or change custom domains: **Workers & Pages** → **pi-agent-orchestrator** → **Custom domains**.
