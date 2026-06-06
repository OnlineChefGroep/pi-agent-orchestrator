# npmjs.org Publish Setup

The `publish-npm.yml` workflow publishes `@onlinechefgroep/pi-agent-orchestrator` to the public npmjs registry on every `v*` tag push.

## Prerequisites

### 1. npmjs.org Organization

The `@onlinechefgroep` scope must exist on [npmjs.com](https://www.npmjs.com/org/onlinechefgroep). If not yet created:

1. Go to https://www.npmjs.com/org/create
2. Create `@onlinechefgroep` organization
3. Add team members who need publish access

### 2. Publish Access Token

Generate a granular access token for CI:

1. Go to https://www.npmjs.com/settings/<your-username>/tokens
2. Click "Generate New Token" → "Granular Access Token"
3. Set:
   - **Token name**: `GitHub Actions - pi-agent-orchestrator`
   - **Expiration**: 365 days (or as appropriate)
   - **Packages and scopes**: `@onlinechefgroep/pi-agent-orchestrator` (Read and write)
4. Copy the generated token

### 3. GitHub Repository Secret

Add the token as a GitHub secret:

1. Go to https://github.com/OnlineChefGroep/pi-agent-orchestrator/settings/secrets/actions
2. Click "New repository secret"
3. Set:
   - **Name**: `NPM_TOKEN`
   - **Value**: The token from step 2

## Verification

After setup, push a `v*` tag to trigger both publish workflows:

```bash
git tag v0.11.1
git push origin v0.11.1
```

Both workflows should succeed:
- `Publish to npmjs.org (Public)` — publishes to `https://registry.npmjs.org`
- `Publish to GitHub Packages (Internal Mirror)` — publishes to `https://npm.pkg.github.com`

## Troubleshooting

| Error | Solution |
|-------|----------|
| `402 Payment Required` / `402 Could not login` | Token has expired. Regenerate. |
| `403 Forbidden` | Token lacks write access to the package scope. |
| `404 Not Found` | The `@onlinechefgroep` org does not exist on npmjs.com. |
| `Package already exists` | Version already published. Bump the version. |
