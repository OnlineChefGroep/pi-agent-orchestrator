# Security Policy

## Supported Versions

This project is pre-1.0 and follows a rolling-release model: only the latest
published `0.x` release receives security fixes.

| Version | Supported |
| ------- | --------- |
| latest `0.x` | ✅ |
| older `0.x` | ❌ |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report privately through GitHub's
[private vulnerability reporting](https://github.com/OnlineChefGroep/pi-agent-orchestrator/security/advisories/new)
(the **Security → Report a vulnerability** tab on the repository). This keeps
the report confidential until a fix is available.

When reporting, please include:

- A description of the vulnerability and its impact.
- Steps to reproduce (a minimal proof of concept is ideal).
- The affected version(s) and environment.

We aim to acknowledge reports within a few days and to provide a remediation
timeline after triage. Coordinated disclosure is appreciated — please give us a
reasonable window to ship a fix before any public disclosure.

## Security Model

This extension runs **inside the trusted Pi coding-agent host** and inherits the
host's tool-execution sandbox. It is not a standalone networked service. Its
threat surface is primarily:

1. **Untrusted custom-agent definitions** (`.pi/agents/*.md`). The loader in
   `src/custom-agents.ts` validates agent names against an unsafe-name pattern,
   skips symlinks to prevent directory traversal, enforces size limits, and
   strips control characters from parsed fields.
2. **Cross-extension RPC** (`src/cross-extension-rpc.ts`). Mutating calls
   (`spawn`, `stop`) are rate-limited and, when an `authProvider` is configured
   by the host, authenticated — payload-provided identity is never trusted. The
   global symbol registry exposes read-only methods only.
3. **Recursive agent spawning**. Depth (`levelLimit`) and task budgets bound
   runaway agent trees; read-only agents enforce a directional parent → child
   permission floor so a restricted parent cannot spawn a more-privileged child.

If you believe any of these controls can be bypassed, please report it using the
process above.
