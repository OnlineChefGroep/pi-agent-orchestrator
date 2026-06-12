# Branch Manifest — 2026-06-12

> Generated as part of the verify skill sweep. Tracks every local + remote branch in
> `OnlineChefGroep/pi-agent-orchestrator` and confirms which features are on `main`,
> which are safely preserved on origin, and which were intentionally removed.

## Local branches

| Branch | Status | PR | Disposition |
|--------|--------|-----|-------------|
| `main` | Current | — | HEAD `2ac9620f`, all gates green |
| (7 session branches) | — | #132, #141, #143, #144, #145, #147, #118, #120 | Force-deleted 2026-06-12 (squash-merge orphans, content already on main) |

## Remote branches — safely preserved on origin (not deleted locally)

### Closed PRs — work superseded by later merged PRs (safe to keep remote-only)

| Branch | PR | Disposition |
|--------|-----|-------------|
| `origin/overdrive/remove-render-array-allocations-6904741631355003578` | #135 | Superseded by PR #146 (dead `solo` allocation) on main |
| `origin/overdrive-single-pass-array-iteration-6100557666392916402` | #124 | Superseded by PR #146 (single-pass bucketing) on main |
| `origin/overdrive-dashboard-filters-16450858206408547538` | #130 | Superseded by PR #146 on main |
| `origin/perf/optimize-validation-feedback-6928519283505435654` | #95 | Closed as superseded |
| `origin/perf-optimize-validation-feedback-8715550715435805143` | #114 | Close-only (chore) |
| `origin/perf/agent-manager-reduce-5685546247960599468` | #108 | Closed as superseded |
| `origin/jules-2898575264009305182-13bad6d3` | #107 | Closed as superseded |
| `origin/jules-4972188800466055243-e16c81d3` | #119 | Closed as superseded |
| `origin/jules-6459104142078897177-1d3dd947` | #102 | Closed as superseded |
| `origin/jules-18098770110999477986-ad6d8ec1` | #111 | Close-only (chore) |
| `origin/jules-security-perf-expansion-5624997764721318828` | #101 | Closed as superseded |
| `origin/jules/security-perf-expansion-5624997764721318828` (variant) | (no PR) | Orphan duplicate of #101 |
| `origin/fix/cve-002-redaction-1949649005945693465` | #115 | Close-only (chore) |
| `origin/fix/telemetry-logger-6486878781201785893` | #100 | Close-only (chore) |
| `origin/fix-unredacted-telemetry-cve002-8128307169393833117` | #98 | Superseded by PR #79 (CVE-002 fix) on main |
| `origin/cve-005-settimeout-max-interval-fix-13589591084708940372` | #103 | Superseded by PRs #72, #76, #78 (CVE-005 fixes) on main |
| `origin/fix-cve-005-array-bypass-7635454104522430283` | #117 | Superseded by CVE-005 fixes on main |
| `origin/fix-cve-005-schedule-bounds-12132418268681231553` | #113 | Superseded by CVE-005 fixes on main |
| `origin/fix-cve-005-scheduler-bounds-2548406797578668039` | #116 | Superseded by CVE-005 fixes on main |
| `origin/security/cve-005-array-bypass-fix-15625530659279221053` | #96 | Superseded by PR #106 (CVE-005) on main |
| `origin/feat/prompt-compression-levels` | #92 | Closed (feature deferred) |
| `origin/docs/v0.11.0-update-and-showcase` | #93 | Closed (chore) |
| `origin/fix/sarif-webstorm-inspections` | #123 | Closed (chore) |
| `origin/overdrive/fix-cve004-dos-150902998333681632` | #90 | Closed (chore) |

**Security verification:** CVE-002 (unredacted telemetry) and CVE-005 (schedule bounds /
array bypass) are both already fixed on main via merged PRs (#72, #76, #78, #79, #106).
The 6 CVE-related CLOSED branches on origin are preserved as historical record but their
work is redundant with the merged fixes on main.

## Net effect

- **Main:** `2ac9620f` · v0.13.0 · 7 bounded optimization loops · 14 journal entries
- **Local branches:** only `main`
- **Open PRs:** 0
- **All gates green:** typecheck ✅ · lint ✅ · 65/65 thresholds ✅ · 1424 tests ✅
- **Features at risk:** none — all merged work is on main, all unmerged work is preserved on origin
