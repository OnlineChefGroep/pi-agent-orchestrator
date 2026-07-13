---
name: release
description: Cut a release of @onlinechefgroep/pi-agent-orchestrator to npmjs.org + GitHub. Use when publishing a new version, creating a release tag, or explaining the release workflow. Triggered by pushing a `v*` tag.
---

# Release — pi-agent-orchestrator

Releases are **tag-triggered and direct-to-npm**, with an automatic GitHub Release.
Defined in `.github/workflows/release.yml`.

## Flow (automatic on tag)

Pushing a `v*` tag (or `workflow_dispatch` with a version input) runs:
`npm ci` → build → typecheck → lint → test → **`npm publish --access public`** (npmjs.org)
→ **create GitHub Release** with auto-generated notes (`gh release create`).

The package version is set from the tag inside CI (`npm version <tag> --no-git-tag-version`),
so you do **not** need to pre-bump `package.json` — but you **should** update `CHANGELOG.md`.

## Version policy

- The next release MUST exceed the currently published npm `latest`.
- Never reuse or go backwards on the `latest` dist-tag.
- Check the latest published version before tagging:
  `npm view @onlinechefgroep/pi-agent-orchestrator version`

## Steps to release

1. On `main`, up to date: `git pull origin main`.
2. Update `CHANGELOG.md` (add the new version + notes). Commit with `docs:`/`chore:`.
3. Choose version `X.Y.Z` (> published). Tag it:
   `git tag vX.Y.Z`
4. Push the tag (this triggers the release):
   `git push origin vX.Y.Z`
5. Watch `.github/workflows/release.yml` → on success the package is on npm and a GitHub
   Release exists at `https://github.com/OnlineChefGroep/pi-agent-orchestrator/releases`.

## Requirements

- Repo **org secret `NPM_TOKEN`** with publish access to the `@onlinechefgroep` scope
  (configured in repo/organization settings). The release job fails without it.
- `main` must be protected + green CI before tagging (branch protection enforces this).

## Manual dispatch (no tag)

`workflow_dispatch` accepts a `version` input and publishes that version directly
(use only for re-releases / hotfixes; still must be > published).

## Notes

- `prepublishOnly` also runs build + typecheck + lint + test locally as a safety net.
- Old `publish.yml` (GitHub Packages mirror) and `publish-npm.yml` were consolidated into
  `release.yml` to avoid double triggers on a tag.
- Do NOT commit build output (`dist/` is gitignored; `prepublishOnly` builds it).
