# Roadmap

## Current State

**v0.11.0** — Stable release with subagent orchestration, TUI dashboard, swarm coordination, scheduling engine, hooks, and permission inheritance. MIT licensed.

## Planned Features

### Orchestration Mode Dispatch
The `OrchestrationMode` setting (`auto`/`single`/`swarm`/`crew`) exists but needs runtime dispatch. Planned: heuristic-driven mode selection, crew mode with role-based agents.

### Observability
Structured JSON logging, metrics export (Prometheus format), local tracing with correlation IDs, and a `/agents health` check command.

### Reliability
Exponential backoff retry, dead letter queue for failed agents with replay capability, and saga compensation for multi-agent workflows.

### Security & Governance
Immutable audit logging, cost guards (token/cost budgets), simple RBAC via settings, and secrets redaction.

### Testing & Operations
Chaos engineering tests, performance benchmarks, and health monitoring.

## Out of Scope

- Multi-tenancy
- Horizontal scaling / worker pools
- Redis / RabbitMQ / external message queues
- Distributed tracing backends (Jaeger/Tempo)
- External auth (OAuth/OIDC)
- Kubernetes / container orchestration

This project is a **pi extension** — it runs inside the Pi coding agent host, not as a standalone service.
