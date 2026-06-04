# // MIGRATING TO 0.10.0

> VERSION 0.10.0 UPGRADE MATRIX. ARCHITECTURAL RENAMING AND SUBSYSTEM CAPABILITIES. BACKWARD COMPATIBILITY MAINTAINED.

---

## // PACKAGE & REPOSITORY IDENTIFIERS

System identifier mutated from `pi-subagents` to `@onlinechefgroep/pi-agent-orchestrator`.
Repository physical location migrated to `OnlineChefGroep/pi-agent-orchestrator`.

### Legacy Execution
```bash
pi install npm:pi-subagents
```

### Current Execution
```bash
pi install npm:@onlinechefgroep/pi-agent-orchestrator
```

---

## // COMPATIBILITY NAMESPACE

Existing `.pi/agents/*.md` definitions process without mutation.
Internal execution namespaces (`pi-subagents:hooks`) remain locked. External hook integrators suffer zero disruption.
Host application API surfaces (cross-extension RPC) guarantee backward compatibility constraints.

---

## // SUBSYSTEM DELTAS 0.10.X

- **0.10.0**: Session-wide block limits (spawn/turns). `estimate_only` execution flag. Typed JSON handoff artifacts. Lock-directory temporal persistence mechanism.
- **0.10.1**: Display block overflow patches. Validation matrix color codes. Falsy parameter hardening.
