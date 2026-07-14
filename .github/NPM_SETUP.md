# npm release setup

`@onlinechefgroep/pi-agent-orchestrator` is published to the public npm registry by `.github/workflows/release.yml`.

The release workflow has one canonical path:

1. Check out the release commit.
2. Verify the tag is reachable from `main` when triggered by a tag.
3. Install, build, typecheck, lint, test, and validate the package.
4. Confirm the requested version is newer than the latest npm version.
5. Publish the public scoped package.
6. Create the matching GitHub Release.

Do not add a second npm or GitHub Packages publish workflow. Duplicate tag triggers create split release state and make failures harder to recover.

## Current authentication: granular npm token

The workflow currently reads the `NPM_TOKEN` GitHub Actions secret.

Create a granular npm access token with the smallest possible scope:

- Package: `@onlinechefgroep/pi-agent-orchestrator`
- Permission: read and write
- Expiration: the shortest operationally practical period

Store it as the repository Actions secret `NPM_TOKEN`.

Repository secret location:

```text
https://github.com/OnlineChefGroep/pi-agent-orchestrator/settings/secrets/actions
```

## Preferred authentication: npm trusted publishing

Migrate to npm trusted publishing so releases use GitHub OIDC instead of a long-lived npm token.

In npm package settings, configure a trusted publisher with:

- Provider: GitHub Actions
- Organization or user: `OnlineChefGroep`
- Repository: `pi-agent-orchestrator`
- Workflow filename: `release.yml`
- Environment: leave empty unless the workflow is moved behind a protected release environment

After npm accepts the trusted publisher:

1. Add `id-token: write` to the workflow permissions.
2. Remove `NODE_AUTH_TOKEN` and the `NPM_TOKEN` dependency.
3. Publish with provenance:

```bash
npm publish --access public --provenance
```

Do not remove token authentication before trusted publishing is configured on npm.

## Release methods

### Tag release

The tag must point to a commit reachable from `main`.

```bash
git switch main
git pull --ff-only
git tag v0.18.0
git push origin v0.18.0
```

### Manual release

Run the `Release` workflow from GitHub Actions on `main` and supply a version newer than the currently published npm version, for example `0.18.0`.

The workflow updates the package version only inside the release job. A separate source version commit is not required.

## Post-release verification

```bash
npm view @onlinechefgroep/pi-agent-orchestrator version
npm view @onlinechefgroep/pi-agent-orchestrator pi --json
pi -e npm:@onlinechefgroep/pi-agent-orchestrator
```

Verify that:

- npm shows the expected version;
- `pi.extensions` contains `./dist/index.js`;
- `pi.video` contains the public MP4 showcase URL;
- the Pi package catalog refreshes the package card;
- the GitHub Release exists for the same version.

## Failure recovery

| Failure | Response |
| --- | --- |
| `401` or `ENEEDAUTH` | Verify `NPM_TOKEN`, or the npm trusted publisher configuration after migration. |
| `403 Forbidden` | Verify package-level publish permission for the `@onlinechefgroep` scope. |
| Version already exists | Never overwrite. Choose a new semver and rerun the canonical release workflow. |
| npm publish succeeded but GitHub Release failed | Create the missing GitHub Release for the already-published version; do not republish. |
| GitHub Release exists but npm publish failed | Fix authentication or package validation, delete only an incorrect unannounced tag/release if necessary, then release a valid new version. |
