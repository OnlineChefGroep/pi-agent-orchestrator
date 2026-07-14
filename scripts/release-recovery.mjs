/**
 * Decide whether the release workflow should publish an npm tarball.
 *
 * Exact-version existence must be checked via `npm view pkg@x.y.z`, not via the
 * floating `latest` dist-tag. Latest is only used to refuse publishing behind
 * the registry's current highest published stable when the exact version is absent.
 */
export function decideNpmPublish({ releaseVersion, exactVersion, latestVersion }) {
  const release = String(releaseVersion ?? "");
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(release)) {
    throw new Error(`expected stable release version, received ${JSON.stringify(releaseVersion)}`);
  }

  if (exactVersion != null && exactVersion !== "") {
    if (String(exactVersion) === release) {
      return {
        publish: false,
        reason: "exact-version-exists",
        message: `npm already contains ${release}; continuing recovery without republishing`,
      };
    }
    throw new Error(
      `npm view returned unexpected exact version ${JSON.stringify(exactVersion)} for ${release}`,
    );
  }

  if (latestVersion != null && latestVersion !== "") {
    const highest = [String(latestVersion), release].sort(compareSemver)[1];
    if (highest !== release) {
      throw new Error(`Refusing to publish ${release} behind npm latest ${latestVersion}`);
    }
  }

  return {
    publish: true,
    reason: "exact-version-absent",
    message: `npm does not contain ${release}; publish required`,
  };
}

/**
 * Prepare-release must refuse when the exact candidate already exists on npm,
 * even if `latest` points elsewhere.
 */
export function assertExactVersionAbsent({ releaseVersion, exactVersion }) {
  const decision = decideNpmPublish({
    releaseVersion,
    exactVersion,
    latestVersion: null,
  });
  if (!decision.publish) {
    throw new Error(
      `npm already contains ${releaseVersion}; use release recovery instead of preparing again`,
    );
  }
}

function compareSemver(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function validateGitHubReleaseMetadata(release, expected) {
  const tagName = String(expected?.tagName ?? "");
  const title = String(expected?.name ?? tagName);
  if (!tagName) throw new Error("expected.tagName is required");

  if (!release || typeof release !== "object") {
    throw new Error(`GitHub Release ${tagName} metadata is missing`);
  }
  if (release.tagName !== tagName) {
    throw new Error(
      `GitHub Release tagName is ${JSON.stringify(release.tagName)}, expected ${JSON.stringify(tagName)}`,
    );
  }

  const repairs = [];
  if (release.isDraft === true) repairs.push("draft");
  if (release.isPrerelease === true) repairs.push("prerelease");
  if (String(release.name ?? "") !== title) repairs.push("title");

  return {
    ok: repairs.length === 0,
    repairs,
    expected: { tagName, name: title, isDraft: false, isPrerelease: false },
  };
}
