# Security

Thanks for helping keep this project safe. The good news: this is a local
pi extension, it runs in your own Pi coding-agent host, it doesn't talk to
servers, and it doesn't handle credentials, personal data, or anything
remotely dangerous. So this page is short on purpose.

## Reporting an issue

If you find a security problem, **open a GitHub issue** on
[OnlineChefGroep/pi-agent-orchestrator](https://github.com/OnlineChefGroep/pi-agent-orchestrator/issues).
Yes, really — an issue is fine. We're not running a CVE factory here, this
is a small open-source tool, and public issues are the fastest way to get
something fixed in the open.

If the issue is sensitive enough that you don't want it public, email
**chefadmin@chefgroep.online** and we'll discuss it from there.

## What we'd like to know

- What you did (the steps or a tiny repro)
- What you saw
- What you expected
- The version (run "npm view @onlinechefgroep/pi-agent-orchestrator version" or check the commit hash)

## What we'll do

- Reply within a few days (we're a small team, be patient).
- Confirm or close the report.
- If it's real, ship a fix and credit you in the release notes (unless
  you prefer to stay anonymous).

## Scope

In scope: the source under "src/", the published npm package
"@onlinechefgroep/pi-agent-orchestrator", and the example agent templates
under "examples/agents/".

Out of scope (maintained by their owners, please report to them directly):

- The Pi host platform ("@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai", "@earendil-works/pi-agent-core").
- The optional "@onlinechef/context-mode" peer extension.
- Your local Pi host, your model provider, and your machine.

## A note on this project

This extension is local-only. It does not make outbound network calls of
its own, it does not log secrets, and it does not store user data on any
server. The biggest realistic risk is "it runs commands on your machine
via a sub-agent you didn't fully understand the prompt of" — and that's a
prompt review problem, not a security one. Read the prompt your
sub-agents are given, and pin your tools.
