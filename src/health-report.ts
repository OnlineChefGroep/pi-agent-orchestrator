/**
 * health-report.ts — Build a structured health report for the
 * `/agents → Health check` command.
 *
 * The report is a plain JSON-serializable object (no class instances,
 * no functions) so the TUI view can render it as text without leaking
 * implementation details and the test suite can compare snapshots
 * directly. Pure data + a single builder function.
 *
 * Why a separate module: keeps `output-handler.ts` / `ui/health-view.ts`
 * free of business logic and lets tests pin down the report shape
 * independently of the rendering choice.
 */

import type { AgentManager } from "./agent-manager.js";
import {
  getAnimationStyle,
  getDashboardRefreshInterval,
  getOrchestrationMode,
  getPromptCompressionLevel,
  getUiStyle,
} from "./agent-registry.js";
import { globalCircuitBreaker } from "./agent-runner.js";
import { computeDispatchHistogram, type DispatchHistogram } from "./dispatch-history.js";
import type { SubagentScheduler } from "./schedule.js";
import type { SettingsGetters } from "./settings.js";
import type { SwarmCoordinator } from "./swarm-join.js";
import { TRACER_NAME, TRACER_VERSION } from "./telemetry-otel.js";
import type { AgentStatus } from "./types.js";

/** Number of recent errors to surface in the health report. */
const RECENT_ERRORS_LIMIT = 5;

export interface HealthReportDeps {
  manager: AgentManager;
  scheduler: SubagentScheduler;
  swarmJoin?: SwarmCoordinator | null;
  getters: SettingsGetters;
  /**
   * Override for tests — when omitted, reads the live global circuit
   * breaker. Accepts a plain object so tests can supply a deterministic
   * snapshot without mutating module state.
   */
  circuitBreakerState?: { state: string; failures: number; lastFailureAt: number };
  /** Override for tests — when omitted, uses `new Date()`. */
  now?: () => Date;
}

export interface HealthReport {
  timestamp: string;
  process: {
    nodeVersion: string;
    platform: string;
    uptimeMs: number;
    memoryRssMB: number;
    memoryHeapUsedMB: number;
  };
  tracing: {
    enabled: boolean;
    tracerName: string;
    tracerVersion: string;
  };
  circuitBreaker: {
    state: string;
    failures: number;
    lastFailureAt: number;
  };
  schedule: {
    active: boolean;
    jobCount: number;
    enabled: boolean;
  };
  swarm: {
    available: boolean;
    swarmCount: number;
    totalAgents: number;
    totalDeliveries: number;
  };
  agents: {
    total: number;
    byStatus: Record<AgentStatus, number>;
    running: number;
    queued: number;
    sessionUsage: { spawnedAgents: number; totalTurns: number };
    sessionLimits: { maxAgentsPerSession?: number; maxTotalTurnsPerSession?: number };
  };
  settings: {
    defaultMaxTurns: number | null;
    graceTurns: number;
    defaultJoinMode: string;
    schedulingEnabled: boolean;
    tracingEnabled: boolean;
    animationStyle: string;
    uiStyle: string;
    orchestrationMode: string;
    dashboardRefreshInterval: number;
    maxConcurrent: number;
    promptCompressionLevel: string;
  };
  recentErrors: Array<{
    id: string;
    type: string;
    error: string;
    completedAt: number;
    correlationId?: string;
  }>;
  /**
   * Histogram of orchestration dispatch decisions over the most recent N
   * spawns (`dispatch-history.ts`). `byKind` and `bySource` give the
   * at-a-glance view; `autoPicks` lets the user answer "of the prompts the
   * auto-heuristic saw, how many did it route to each kind?".
   */
  dispatchHistogram: DispatchHistogram;
}

const EMPTY_STATUS_COUNTS: Record<AgentStatus, number> = {
  queued: 0,
  running: 0,
  completed: 0,
  steered: 0,
  aborted: 0,
  stopped: 0,
  error: 0,
};

/**
 * Build a health report snapshot from the current runtime state. Cheap
 * to call (one `listAgents` walk, one scheduler read, one swarm read)
 * but not free, so the TUI view re-builds on open rather than on every
 * keystroke.
 *
 * Atomicity: every registry-derived field is read into a local at the
 * top of the function, so a hook firing between sections cannot produce
 * a torn read (e.g. `tracing.enabled: true` paired with
 * `settings.tracingEnabled: false`). The locals are the source of
 * truth for the returned object.
 */
export function buildHealthReport(deps: HealthReportDeps): HealthReport {
  const {
    manager,
    scheduler,
    swarmJoin,
    getters,
    circuitBreakerState = globalCircuitBreaker.getState(),
    now = () => new Date(),
  } = deps;

  // Capture the registry snapshot once at the top so the report is
  // atomic — see the JSDoc above for the rationale.
  const tracingEnabled = getters.isTracingEnabled();
  const schedulingEnabled = getters.isSchedulingEnabled();
  const defaultMaxTurns = getters.getDefaultMaxTurns();
  const graceTurns = getters.getGraceTurns();
  const defaultJoinMode = getters.getDefaultJoinMode();
  const animationStyle = getAnimationStyle();
  const uiStyle = getUiStyle();
  const orchestrationMode = getOrchestrationMode();
  const dashboardRefreshInterval = getDashboardRefreshInterval();
  const promptCompressionLevel = getPromptCompressionLevel();
  const mem = process.memoryUsage();

  const records = manager.listAgents();
  const byStatus: Record<AgentStatus, number> = { ...EMPTY_STATUS_COUNTS };
  const recentErrors: HealthReport["recentErrors"] = [];
  for (const r of records) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.error) {
      recentErrors.push({
        id: r.id,
        type: r.type,
        error: r.error,
        completedAt: r.completedAt ?? r.spawnedAt,
        correlationId: r.correlationId,
      });
    }
  }
  // Newest first; cap to RECENT_ERRORS_LIMIT.
  recentErrors.sort((a, b) => b.completedAt - a.completedAt);
  recentErrors.length = Math.min(recentErrors.length, RECENT_ERRORS_LIMIT);

  let swarmSection: HealthReport["swarm"];
  if (swarmJoin) {
    const swarms = swarmJoin.listSwarms();
    let totalAgents = 0;
    let totalDeliveries = 0;
    for (const s of swarms) {
      totalAgents += s.agentCount;
      const m = swarmJoin.getSwarmMetrics(s.swarmId);
      totalDeliveries += m.totalDeliveries;
    }
    swarmSection = {
      available: true,
      swarmCount: swarms.length,
      totalAgents,
      totalDeliveries,
    };
  } else {
    swarmSection = { available: false, swarmCount: 0, totalAgents: 0, totalDeliveries: 0 };
  }

  const sessionLimits = manager.getSessionLimits();
  const sessionUsage = manager.getSessionUsage();

  return {
    timestamp: now().toISOString(),
    process: {
      nodeVersion: process.version,
      platform: `${process.platform}/${process.arch}`,
      uptimeMs: Math.round(process.uptime() * 1000),
      memoryRssMB: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      memoryHeapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
    },
    tracing: {
      enabled: tracingEnabled,
      // The tracer name + version come from the single source of truth
      // in `telemetry-otel.ts`. We can't reliably detect "no provider
      // configured" from the OTel API surface (the `Tracer` interface
      // has no introspection beyond name/version), so we surface the
      // library name as-is and let the host's exporter decide what
      // happens to the spans.
      tracerName: TRACER_NAME,
      tracerVersion: TRACER_VERSION,
    },
    circuitBreaker: {
      state: circuitBreakerState.state,
      failures: circuitBreakerState.failures,
      lastFailureAt: circuitBreakerState.lastFailureAt,
    },
    schedule: {
      active: scheduler.isActive(),
      jobCount: scheduler.list().length,
      enabled: schedulingEnabled,
    },
    swarm: swarmSection,
    agents: {
      total: records.length,
      byStatus,
      running: byStatus.running,
      queued: byStatus.queued,
      sessionUsage,
      sessionLimits: {
        ...(sessionLimits.maxAgentsPerSession !== undefined
          ? { maxAgentsPerSession: sessionLimits.maxAgentsPerSession }
          : {}),
        ...(sessionLimits.maxTotalTurnsPerSession !== undefined
          ? { maxTotalTurnsPerSession: sessionLimits.maxTotalTurnsPerSession }
          : {}),
      },
    },
    settings: {
      defaultMaxTurns: defaultMaxTurns ?? null,
      graceTurns,
      defaultJoinMode,
      schedulingEnabled,
      tracingEnabled,
      animationStyle,
      uiStyle,
      orchestrationMode,
      dashboardRefreshInterval,
      maxConcurrent: manager.getMaxConcurrent(),
      promptCompressionLevel,
    },
    recentErrors,
    // Snapshot the dispatch histogram now (single read) rather than letting
    // the renderer mutably traverse module state. Mirrors the registry-capture
    // atomicity pattern used for the rest of the report.
    dispatchHistogram: computeDispatchHistogram(),
  };
}

/** Append the Process section lines. */
function pushProcessSection(lines: string[], r: HealthReport): void {
  lines.push("## Process");
  lines.push(`  node      : ${r.process.nodeVersion}`);
  lines.push(`  platform  : ${r.process.platform}`);
  lines.push(`  uptime    : ${formatDuration(r.process.uptimeMs)}`);
  lines.push(`  rss       : ${r.process.memoryRssMB} MB`);
  lines.push(`  heapUsed  : ${r.process.memoryHeapUsedMB} MB`);
  lines.push("");
}

/** Append the Tracing section lines. */
function pushTracingSection(lines: string[], r: HealthReport): void {
  lines.push("## Tracing");
  lines.push(`  enabled       : ${r.tracing.enabled ? "yes" : "no"}`);
  lines.push(`  tracer        : ${r.tracing.tracerName}`);
  lines.push(`  tracerVersion : ${r.tracing.tracerVersion}`);
  lines.push("");
}

/** Append the Circuit Breaker section lines. */
function pushCircuitBreakerSection(lines: string[], r: HealthReport): void {
  lines.push("## Circuit Breaker");
  lines.push(`  state          : ${r.circuitBreaker.state.toUpperCase()}`);
  lines.push(`  failures       : ${r.circuitBreaker.failures}`);
  lines.push(
    `  lastFailureAt  : ${r.circuitBreaker.lastFailureAt === 0 ? "never" : new Date(r.circuitBreaker.lastFailureAt).toISOString()}`,
  );
  lines.push("");
}

/** Append the Schedule section lines. */
function pushScheduleSection(lines: string[], r: HealthReport): void {
  lines.push("## Schedule");
  lines.push(`  feature  : ${r.schedule.enabled ? "enabled" : "disabled"}`);
  lines.push(`  runtime  : ${r.schedule.active ? "running" : "stopped"}`);
  lines.push(`  jobs     : ${r.schedule.jobCount}`);
  lines.push("");
}

/** Append the Swarm section lines. */
function pushSwarmSection(lines: string[], r: HealthReport): void {
  lines.push("## Swarm");
  if (r.swarm.available) {
    lines.push(`  coordinator   : present`);
    lines.push(`  swarms        : ${r.swarm.swarmCount}`);
    lines.push(`  agents        : ${r.swarm.totalAgents}`);
    lines.push(`  deliveries    : ${r.swarm.totalDeliveries}`);
  } else {
    lines.push(`  coordinator   : not configured`);
  }
  lines.push("");
}

/** Append the Agents section lines. */
function pushAgentsSection(lines: string[], r: HealthReport): void {
  lines.push("## Agents");
  lines.push(`  total         : ${r.agents.total}`);
  lines.push(`  running       : ${r.agents.running}`);
  lines.push(`  queued        : ${r.agents.queued}`);
  lines.push(`  by status     :`);
  for (const status of Object.keys(r.agents.byStatus) as AgentStatus[]) {
    const n = r.agents.byStatus[status];
    if (n > 0) lines.push(`    ${status.padEnd(10)} : ${n}`);
  }
  lines.push(
    `  session       : ${r.agents.sessionUsage.spawnedAgents} agents, ${r.agents.sessionUsage.totalTurns} turns`,
  );
  const limitParts: string[] = [];
  if (r.agents.sessionLimits.maxAgentsPerSession !== undefined) {
    limitParts.push(`agents≤${r.agents.sessionLimits.maxAgentsPerSession}`);
  }
  if (r.agents.sessionLimits.maxTotalTurnsPerSession !== undefined) {
    limitParts.push(`turns≤${r.agents.sessionLimits.maxTotalTurnsPerSession}`);
  }
  lines.push(`  session limits: ${limitParts.length === 0 ? "unlimited" : limitParts.join(", ")}`);
  lines.push("");
}

/** Append the Settings section lines. */
function pushSettingsSection(lines: string[], r: HealthReport): void {
  lines.push("## Settings");
  lines.push(`  maxConcurrent              : ${r.settings.maxConcurrent}`);
  lines.push(`  defaultMaxTurns            : ${r.settings.defaultMaxTurns ?? "unlimited"}`);
  lines.push(`  graceTurns                 : ${r.settings.graceTurns}`);
  lines.push(`  defaultJoinMode            : ${r.settings.defaultJoinMode}`);
  lines.push(`  schedulingEnabled          : ${r.settings.schedulingEnabled}`);
  lines.push(`  tracingEnabled             : ${r.settings.tracingEnabled}`);
  lines.push(`  animationStyle             : ${r.settings.animationStyle}`);
  lines.push(`  uiStyle                    : ${r.settings.uiStyle}`);
  lines.push(`  orchestrationMode          : ${r.settings.orchestrationMode}`);
  lines.push(`  dashboardRefreshInterval   : ${r.settings.dashboardRefreshInterval}ms`);
  lines.push(`  promptCompressionLevel     : ${r.settings.promptCompressionLevel}`);
  lines.push("");
}

/** Append the Recent Errors section lines. */
function pushRecentErrorsSection(lines: string[], r: HealthReport): void {
  lines.push("## Recent Errors");
  if (r.recentErrors.length === 0) {
    lines.push("  (none)");
  } else {
    for (const e of r.recentErrors) {
      const corr = e.correlationId ? ` [corr=${e.correlationId}]` : "";
      lines.push(`  ${e.id} (${e.type})${corr}`);
      lines.push(`    ${new Date(e.completedAt).toISOString()}: ${e.error}`);
    }
  }
  lines.push("");
}

/** Append the Dispatch Decisions section lines. */
function pushDispatchSection(lines: string[], r: HealthReport): void {
  lines.push("## Dispatch Decisions (recent)");
  const h = r.dispatchHistogram;
  if (h.total === 0) {
    lines.push(`  (none — empty ring buffer, capacity ${h.bufferCapacity})`);
    return;
  }
  lines.push(
    `  total       : ${h.total} (last ${Math.min(h.total, h.bufferCapacity)} of ${h.bufferCapacity}-slot ring)`,
  );
  lines.push(`  by kind     :`);
  lines.push(`    single    : ${h.byKind.single}`);
  lines.push(`    swarm     : ${h.byKind.swarm}`);
  lines.push(`    crew      : ${h.byKind.crew}`);
  lines.push(`  by source   :`);
  lines.push(`    explicit  : ${h.bySource.explicit} (user pinned single/swarm/crew)`);
  lines.push(`    auto      : ${h.bySource.autoHeuristic} (heuristic picked under auto mode)`);
  if (h.bySource.autoHeuristic > 0) {
    lines.push(`  auto picks  :`);
    lines.push(`    →single   : ${h.autoPicks.single}`);
    lines.push(`    →swarm    : ${h.autoPicks.swarm}`);
    lines.push(`    →crew     : ${h.autoPicks.crew}`);
  }
  lines.push(`  last decision: ${h.lastDecisionAt === null ? "n/a" : new Date(h.lastDecisionAt).toISOString()}`);
}

/**
 * Render a `HealthReport` as a fixed-width text block suitable for
 * `ctx.ui.editor(...)`. Sections are separated by a single blank line
 * and a comment header so the user can scroll the report in their
 * editor buffer.
 */
export function formatHealthReport(r: HealthReport): string {
  const lines: string[] = [];

  lines.push(`# /agents health — ${r.timestamp}`);
  lines.push("");

  pushProcessSection(lines, r);
  pushTracingSection(lines, r);
  pushCircuitBreakerSection(lines, r);
  pushScheduleSection(lines, r);
  pushSwarmSection(lines, r);
  pushAgentsSection(lines, r);
  pushSettingsSection(lines, r);
  pushRecentErrorsSection(lines, r);
  pushDispatchSection(lines, r);

  return lines.join("\n");
}

/** Format a duration in ms as a compact `1d2h3m4s` string (no spaces between units, drops zero-leading units, always shows all units from the highest non-zero down to seconds). */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  // Always show smaller units when a larger unit is present, so `1h` is
  // rendered as `1h0m0s` (not `1h0s`). The seconds unit is always shown.
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  if (days > 0 || hours > 0 || minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join("");
}

// Re-exported for tests and the UI view.
export { formatDuration };
