#!/usr/bin/env bash
# Historical finalize here-doc from PR #282 before add5157.
# The terminator is indented inside `if`, so bash -n fails with:
#   warning: here-document delimited by end-of-file (wanted `NODE')
#   syntax error: unexpected end of file
set -euo pipefail
TAG="v0.18.0"
if gh release view "$TAG" --json tagName,isDraft,isPrerelease,name > release-meta.json 2>/dev/null; then
  node --input-type=module <<'NODE'
  import { readFile } from "node:fs/promises";
  const release = JSON.parse(await readFile("release-meta.json", "utf8"));
  console.log(release.tagName);
  NODE
else
  gh release create "$TAG" --verify-tag --generate-notes --title "$TAG"
fi
