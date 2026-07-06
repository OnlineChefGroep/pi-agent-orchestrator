# Runbooks — Incident Response Playbooks

> Operational runbooks for the pi-agent-orchestrator extension. These playbooks guide on-call developers through common incidents and failure scenarios.

## Quick Reference

| Scenario | Severity | Runbook |
|----------|----------|---------|
| npm publish failure | High | [Publish Failure](#publish-failure) |
| CI test suite failing on main | High | [CI Failure on Main](#ci-failure-on-main) |
| Test regression after dependency bump | Medium | [Dependency Regression](#dependency-regression) |
| Windows schedule test flakiness | Low | [Windows Schedule Flakiness](#windows-schedule-flakiness) |
| Sentry error spike | Medium | [Error Tracking Spike](#error-tracking-spike) |
| Security vulnerability report | Critical | [Security Incident](#security-incident) |

---

## Severity Definitions

- **Critical**: Production package broken, security vulnerability active. Page on-call immediately.
- **High**: CI red on main, publish blocked, core feature broken. Fix within business hours.
- **Medium**: Degraded CI, flaky tests, non-blocking regression. Fix within 1-2 days.
- **Low**: Known cosmetic or platform-specific issue. Fix when convenient.

---

## Publish Failure

**Symptoms:** `publish-npm.yml` workflow fails on tag push. Package not on npmjs.org.

### Investigation Steps

1. Check the [publish workflow run](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions/workflows/publish-npm.yml).
2. Verify the `NPM_TOKEN` org secret is valid and has publish access to `@onlinechefgroep`.
3. Confirm the tag matches the version in `package.json` (e.g., tag `v0.17.0` → `"version": "0.17.0"`).
4. Check if the version already exists on npm: `npm view @onlinechefgroep/pi-agent-orchestrator versions --json | grep 0.17.0`.

### Remediation

1. If `NPM_TOKEN` expired: rotate via npm org settings, update GitHub org secret.
2. If version mismatch: delete the tag (`git tag -d vX.Y.Z && git push origin :vX.Y.Z`), fix `package.json`, re-tag and push.
3. If pre-publish checks failed (typecheck/lint/test): fix locally, re-tag.
4. If version already published: bump version, create new tag.

### Rollback

npm does not support unpublishing after 72 hours. If a broken version shipped:
1. Immediately publish a patch release with the fix.
2. Add a deprecation notice: `npm deprecate @onlinechefgroep/pi-agent-orchestrator@0.17.0 "Broken — upgrade to 0.17.1"`.

---

## CI Failure on Main

**Symptoms:** CI workflow red on the `main` branch. PRs cannot merge.

### Investigation Steps

1. Open the [CI workflow](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions/workflows/ci.yml).
2. Identify which matrix leg failed (OS, Node version, peer-deps variant).
3. Check whether it's a real failure or a known-flaky test (see [Windows Schedule Flakiness](#windows-schedule-flakiness)).

### Remediation

1. If a real regression: identify the offending commit (`git log --oneline -10`), revert or patch.
2. If lint failure: run `npm run lint:fix` locally, commit, push.
3. If typecheck failure: run `npx tsc --noEmit`, fix type errors.
4. If lowest-peer-deps failure: this is `continue-on-error: true` and should not block. Verify it's that matrix leg.

---

## Dependency Regression

**Symptoms:** Tests start failing after a Dependabot dependency bump PR.

### Investigation Steps

1. Check the Dependabot PR diff for the specific version change.
2. Review the dependency's changelog for breaking changes.
3. Run the failing test locally with the new version: `npm ci && npm test`.

### Remediation

1. If breaking change in a direct dependency: update call sites, then merge.
2. If breaking change in a peer dependency: pin to a compatible version in the Dependabot config or bump the `peerDependencies` range.
3. If the regression is in `@earendil-works/pi-*`: coordinate with the host platform team.

---

## Windows Schedule Flakiness

**Symptoms:** `test/schedule.test.ts` or `test/schedule-store.test.ts` fails intermittently on Windows CI only.

**Known issue:** These tests race on temp directory creation on Windows. CI marks them `continue-on-error`. See [AGENTS.md → Common Mistake #5](../AGENTS.md).

### Remediation

1. Confirm the failure is only on `windows-latest` and only in schedule tests.
2. If yes: this is the known flake. Do not block the PR.
3. If the failure is on Linux/macOS or in other test files: investigate as a real bug.

---

## Error Tracking Spike

**Symptoms:** Sentry reports a sudden increase in errors from the extension.

### Prerequisites

Error tracking requires:
- `SENTRY_DSN` environment variable set at runtime
- `@sentry/node` installed (optional peer dependency)
- Source maps uploaded during CI build (see `.github/workflows/coverage.yml`)

### Investigation Steps

1. Open the Sentry project dashboard linked in `SENTRY_DSN`.
2. Filter by release version to correlate with a recent publish.
3. Check breadcrumbs in the error event — these show the logger trail leading to the crash.
4. Verify source maps resolved the stack trace to TypeScript source (not minified `dist/`).

### Remediation

1. If the error is in agent lifecycle (`agent-runner.ts`): check the `captureException` tags for `agentType` and trace the spawn path.
2. If the error is in swarm coordination (`swarm-join.ts`): check the `swarmId` tag for swarm-specific issues.
3. If source maps are missing: verify the `SENTRY_AUTH_TOKEN` secret is set and the upload step in CI succeeded.

---

## Security Incident

**Symptoms:** Vulnerability reported via security@chefgroep.nl or GitHub private advisory.

### Response Procedure

1. **Acknowledge** within 5 business days (per [SECURITY.md](../SECURITY.md)).
2. **Triage:** assess severity using CVSS. See existing CVEs (CVE-002 through CVE-005) for precedent.
3. **Fix:** create a private security advisory on GitHub, develop the fix in a private fork.
4. **Publish:** once fixed, publish a patch release and disclose via GitHub advisory.
5. **Post-mortem:** document root cause and prevention measures in `docs/`.

### Resources

- [Security Policy](../SECURITY.md)
- [Security Audit Report](SECURITY_AUDIT_REPORT.md)
- [GitHub Security Advisories](https://github.com/OnlineChefGroep/pi-agent-orchestrator/security/advisories)

---

## Deployment Observability

After publishing, verify the deploy is healthy:

1. **npm registry:** Confirm the new version appears: `npm view @onlinechefgroep/pi-agent-orchestrator version`.
2. **CI status:** Verify all workflow runs are green on the new tag.
3. **Sentry:** Watch for error spikes in the first 24 hours after release. Filter by the new release version.
4. **GitHub Releases:** Verify the release notes were generated (see the [releases page](https://github.com/OnlineChefGroep/pi-agent-orchestrator/releases)).

### Alerting

The [alerts workflow](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions/workflows/alerts.yml) sends notifications when:
- CI fails on `main`
- A publish workflow fails
- A new release is published

Configure the webhook URL via the `ALERT_WEBHOOK_URL` org/repo secret (Slack incoming webhook or equivalent).

---

## Monitoring Dashboards

External monitoring is managed at the organization level:

| Dashboard | Location | Purpose |
|-----------|----------|---------|
| CI Health | [GitHub Actions](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions) | Build/test/deploy status |
| Error Tracking | Sentry (linked via `SENTRY_DSN`) | Runtime error tracking with source maps |
| npm Stats | [npmjs.org](https://www.npmjs.com/package/@onlinechefgroep/pi-agent-orchestrator) | Download counts, version adoption |
| Coverage | [coverage.yml workflow](https://github.com/OnlineChefGroep/pi-agent-orchestrator/actions/workflows/coverage.yml) | Code coverage reports per PR |

---

## Post-Mortem Template

After resolving a High or Critical incident, fill out a post-mortem:

```markdown
## Incident: [Title]

**Date:** YYYY-MM-DD
**Severity:** Critical / High / Medium
**Duration:** X hours

### Summary
[1-2 sentence description]

### Timeline
- [Timestamp] — [Event]

### Root Cause
[Technical explanation]

### Resolution
[What was done to fix]

### Action Items
- [ ] [Preventive measure 1]
- [ ] [Preventive measure 2]
```

Store post-mortems in `docs/post-mortems/`.
