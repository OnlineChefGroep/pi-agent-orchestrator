# Site hosting

The pi-agent-orchestrator product site is hosted on **Cloudflare Pages** as a standalone property. It is not served from or coupled to `chefgroep.nl`.

## URLs

| Host | Role |
|------|------|
| `https://pi-agent-orchestrator.pages.dev` | Default Pages subdomain |
| `https://orchestrator.chefgroep.online` | Custom domain (`chefgroep.online` zone) |

## Deployment

Production deploys run from the `main` branch via [`.github/workflows/cloudflare-pages.yml`](../.github/workflows/cloudflare-pages.yml):

1. `scripts/build-site.sh` assembles static assets into `_site/`
2. `wrangler pages deploy` publishes to the `pi-agent-orchestrator` Pages project

The workflow runs on a daily schedule and on manual `workflow_dispatch`. Required secrets live in the GitHub `cloudflare-pages` environment: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Custom domain

`orchestrator.chefgroep.online` is attached to the Pages project in the same Cloudflare account as the `chefgroep.online` zone. DNS is a proxied CNAME to `pi-agent-orchestrator.pages.dev`.

To add or change custom domains: **Workers & Pages** → **pi-agent-orchestrator** → **Custom domains**.
