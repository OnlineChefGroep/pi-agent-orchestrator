# Site hosting

Canonical product URL is a **subdomain of `chefgroep.online`**. Cloudflare Pages is only the deploy backend; GitHub Pages is an optional mirror for org `.github.io` links.

## URLs

| Host | Role |
|------|------|
| `https://orchestrator.chefgroep.online` | **Canonical** product site (`chefgroep.online` zone) |
| `https://onlinechefgroep.github.io/pi-agent-orchestrator/` | GitHub Pages mirror (Actions deploy; README/legacy links) |

Internal only (not a public brand URL): the Cloudflare project default host `pi-agent-orchestrator.pages.dev` exists as the Pages origin behind the CNAME. Do not advertise it; point humans and agents at `orchestrator.chefgroep.online`.

GitHub Pages requires a one-time repo enablement (`build_type=workflow`). The Deploy Pages workflow only publishes from `main` and cannot flip that enablement bit with `GITHUB_TOKEN`.

## Deployment

Production deploys run from the `main` branch:

1. `scripts/build-site.sh` builds the Vite SPA in `site/web/` and assembles `_site/`
2. Cloudflare: `wrangler pages deploy` via [`.github/workflows/cloudflare-pages.yml`](../.github/workflows/cloudflare-pages.yml)
3. GitHub mirror: [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) (base path `/pi-agent-orchestrator/`)

Showcase media is staged from `docs/images/` before the Vite build. Remotion outputs (`feature_tour.mp4`, promo stills) are generated on `main` by the Showcase workflow and appear in the `/showcase` gallery when present.

## Custom domain

`orchestrator.chefgroep.online` is attached to the Pages project in the same Cloudflare account as the `chefgroep.online` zone. DNS is a proxied CNAME from that subdomain to the Pages project origin.

To add or change custom domains: **Workers & Pages** → **pi-agent-orchestrator** → **Custom domains**.
