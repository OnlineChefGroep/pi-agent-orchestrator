# Migrating to 0.10.0

Version 0.10.0 introduces a major rebranding and some new features, but retains full backward compatibility for existing scripts and custom agents.

## Package & Repository Rename

The package has been renamed from `pi-subagents` to `@onlinechefgroep/pi-agent-orchestrator`.
The repository has been moved to `OnlineChefGroep/pi-agent-orchestrator`.

### Old Install Command
```bash
pi install npm:pi-subagents
```

### New Install Command
```bash
pi install npm:@onlinechefgroep/pi-agent-orchestrator
```

## Compatibility Namespace Stability

All existing `.pi/agents/*.md` files will continue to work without modification.
The internal plugin namespaces (`pi-subagents:hooks`, etc.) remain stable to ensure existing hook integrations do not break.
All API methods exposed to the host application (like the cross-extension RPC) have been kept backward compatible.

## What's New in 0.10.x?
- **0.10.0**: Session-wide limits (spawn and turns), `estimate_only` dry-runs, typed handoff artifacts, lock-directory scheduling persistence.
- **0.10.1**: Bugfixes for TUI overflow, validation colors, and falsy inputs.
