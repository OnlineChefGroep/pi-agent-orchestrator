# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.11.x  | :white_check_mark: |
| < 0.11  | :x:                |

This project is a **pi extension** — it runs inside the Pi coding agent host, not as a standalone service. Security reports should scope concerns to the extension's behavior within that host context.

## Reporting a Vulnerability

We take security seriously. To report a vulnerability:

1. **Do not open a public issue.** Instead, email security concerns to the maintainers.
2. We aim to acknowledge reports within **5 business days** and provide an initial assessment.
3. We will keep you informed of progress and coordinate disclosure timing.

**What to include in your report:**
- Description of the vulnerability
- Steps to reproduce or a proof of concept
- Affected version(s)
- Any potential mitigations you've identified

## Security Audits

Past security audits and CVE fixes are documented in:
- [Security Audit Report](docs/SECURITY_AUDIT_REPORT.md)
- [Security Audit Verification (2026-05-23)](docs/SECURITY_AUDIT_VERIFICATION_2026-05-23.md)

Known CVEs (CVE-002 through CVE-005) have been addressed in the current release. These fixes include input validation, size limits, and control character sanitization — do not weaken these guards when contributing.

## Scope

This policy covers the `@onlinechefgroep/pi-agent-orchestrator` package, its source code, and its published artifacts. The pi host platform (`@earendil-works/pi-*` packages) is maintained separately.
