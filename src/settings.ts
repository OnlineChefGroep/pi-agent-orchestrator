import { logger } from "./logger.js";
// Persistence for pi-subagents operational settings.
// - Global:  ~/.pi/agent/subagents.json (via getAgentDir()) — manual defaults, never written here
// - Project: <cwd>/.pi/subagents.json — written by /agents → Settings; overrides global on load

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { OrchestrationMode } from "./agent-registry.js";
import type { JoinMode, PromptCompressionLevel } from "./types.js";

/** User-supplied override paths for the offline debug-capture feature.
 *  Empty fields fall back to defaults (cwd/.pi/subagent-debug and
 *  <agent-dir>/subagent-debug respectively). */
export interface DebugCapturePathOverrides {
  project?: string;
  personal?: string;
}

/** Prompt compression level: controls verbosity of system prompts. */
export type { PromptCompressionLevel } from "./types.js";

export interface SubagentsSettings {
  maxConcurrent?: number;
  /** Optional hard cap for all agents spawned during one pi session. Omit for unlimited. */
  maxAgentsPerSession?: number;
  /** Optional hard cap for cumulative agentic turns across one pi session. Omit for unlimited. */
  maxTotalTurnsPerSession?: number;
  /**
   * 0 = unlimited — the extension's single source of truth for that convention:
   * `normalizeMaxTurns()` in agent-runner.ts treats 0 → `undefined`, and the
   * `/agents` → Settings input prompt explicitly says "0 = unlimited".
   */
  defaultMaxTurns?: number;
  graceTurns?: number;
  defaultJoinMode?: JoinMode;
  /**
   * Master switch for the schedule subagent feature. Defaults to `true`.
   * When `false`: the `Agent` tool's `schedule` param + its guideline are
   * stripped from the tool spec at registration (zero LLM-context cost), the
   * scheduler doesn't bind to the session, and the `/agents → Scheduled jobs`
   * menu entry is hidden. Schema-level removal applies at extension load
   * (next pi session); runtime menu/runtime-fire short-circuit is immediate.
   */
  schedulingEnabled?: boolean;
  /**
   * Master switch for OpenTelemetry span emission in agent-runner. Defaults
   * to `true`. When `false`: every span helper in `telemetry-otel.ts`
   * short-circuits to a shared no-op span, so no TracerProvider is consulted
   * and the runtime cost is one flag check per span lifecycle call. Useful
   * for users who have configured an OTel TracerProvider globally but don't
   * want subagent spans to show up in their traces. Runtime toggles via
   * /agents → Settings take effect for all subsequent spans; in-flight
   * agent spans keep their real span and end normally.
   */
  tracingEnabled?: boolean;
  animationStyle?: "braille" | "dots" | "lines" | "classic" | "none";
  /**
   * UI rendering style. Defaults to "premium" (truecolor gradients + rounded connectors).
   */
  uiStyle?: "premium" | "retro" | "plain";
  /**
   * Show real-time activity stream (tool calls, responses) in the widget.
   * Defaults to `true`.
   */
  showActivityStream?: boolean;
  /**
   * Show token usage and context fill percentage.
   * Defaults to `true`.
   */
  showTokenUsage?: boolean;
  /**
   * Show turn progress (current/max turns) for running agents.
   * Defaults to `true`.
   */
  showTurnProgress?: boolean;
  /**
   * Orchestration mode for agent execution. Defaults to "auto".
   * Controls how agents are coordinated: auto (smart selection), single (one at a time),
   * swarm (dynamic collaborative groups), or crew (structured team).
   */
  orchestrationMode?: OrchestrationMode;
  /**
   * Dashboard refresh interval in milliseconds. Defaults to 750ms.
   * Controls how often the agent dashboard refreshes its display.
   * Minimum 100ms, maximum 60000ms (60 seconds).
   */
  dashboardRefreshInterval?: number;
  /** Guardrail limit for total spawns in a session */
  sessionMaxSpawns?: number;
  /** Guardrail limit for cumulative turns in a session */
  sessionMaxTurns?: number;
  /** Prompt compression level. Defaults to "balanced". */
  promptCompressionLevel?: PromptCompressionLevel;
  /**
   * Master switch for the local offline debug-capture feature (defaults to
   * `false`). When `true`, the extension writes append-only JSONL captures
   * of agent lifecycle hooks, errors with stack traces, schedule firings,
   * RPC audit entries, and per-agent metrics snapshots to two roots:
   * `<cwd>/.pi/subagent-debug` and `<agent-dir>/subagent-debug` (both can be
   * overridden via `debugCapturePaths`). Capture is strictly local — no
   * network — and the feature is best-effort: a capture failure never breaks
   * the agent runtime. The module is implemented in `src/debug-capture.ts`
   * and is a pure sink; wiring lives in `src/index.ts`.
   *
   * **PII warning:** captured content includes full agent prompts, error
   * stacks with absolute source paths, and tool arguments (which often
   * contain user-pasted clipboard secrets, API tokens, etc.). Enable the
   * capture only on workloads where you trust the local filesystem with
   * the captured content.
   */
  debugCapture?: boolean;
  /** Optional override paths for the debug-capture feature. Missing fields
   *  fall back to the documented defaults. Path strings may be absolute or
   *  relative to the project cwd. They are validated at enable-time
   *  (must be absolute, no `..` traversal, ≤ 4 KiB) — invalid overrides are
   *  silently dropped so a malformed setting never crashes startup. */
  debugCapturePaths?: DebugCapturePathOverrides;
}

/** Setter hooks used by applySettings to wire persisted values into in-memory state. */
export interface SettingsAppliers {
  setMaxConcurrent: (n: number) => void;
  setSessionLimits: (limits: { maxAgentsPerSession?: number; maxTotalTurnsPerSession?: number }) => void;
  setDefaultMaxTurns: (n: number) => void;
  setGraceTurns: (n: number) => void;
  setDefaultJoinMode: (mode: JoinMode) => void;
  setSchedulingEnabled: (b: boolean) => void;
  setTracingEnabled: (b: boolean) => void;
  setAnimationStyle: (style: "braille" | "dots" | "lines" | "classic" | "none") => void;
  setUiStyle: (style: "premium" | "retro" | "plain") => void;
  setShowActivityStream: (b: boolean) => void;
  setShowTokenUsage: (b: boolean) => void;
  setShowTurnProgress: (b: boolean) => void;
  setOrchestrationMode: (mode: OrchestrationMode) => void;
  setDashboardRefreshInterval: (interval: number) => void;
  setSessionMaxSpawns: (n: number) => void;
  setSessionMaxTurns: (n: number) => void;
  setPromptCompressionLevel: (level: PromptCompressionLevel) => void;
  setDebugCapture: (enabled: boolean) => void;
  setDebugCapturePaths: (paths: DebugCapturePathOverrides) => void;
}

/**
 * Read-side accessors for the settings that the /agents menu can change at
 * runtime. The UI reads these to display "current:" labels and the
 * buildSettingsSnapshot helper pulls from them to persist the next state.
 * Mirrors the runtime contract that `index.ts` exposes to the menu — keep
 * the two in sync when adding a new menu-editable setting.
 */
export interface SettingsGetters {
  getDefaultMaxTurns: () => number | undefined;
  getGraceTurns: () => number;
  getDefaultJoinMode: () => JoinMode;
  isSchedulingEnabled: () => boolean;
  isTracingEnabled: () => boolean;
}

/**
 * Write-side accessors for the same settings. The /agents menu calls these
 * after each user mutation. Setter shape diverges slightly from
 * `SettingsAppliers` because the menu accepts a wider input (e.g. 0/unlimited
 * for defaultMaxTurns, which `applySettings` would reject as 0 means
 * "unlimited" but here it means "unmark the default" so the call is
 * `setDefaultMaxTurns(undefined)`).
 */
export interface SettingsSetters {
  setDefaultMaxTurns: (n: number | undefined) => void;
  setGraceTurns: (n: number) => void;
  setDefaultJoinMode: (mode: JoinMode) => void;
  setSchedulingEnabled: (b: boolean) => void;
  setTracingEnabled: (b: boolean) => void;
}

/** Emit callback — a subset of `pi.events.emit` to keep helpers testable. */
export type SettingsEmit = (event: string, payload: unknown) => void;

const VALID_JOIN_MODES = ["async", "group", "smart", "swarm"] as const;
const VALID_ORCHESTRATION_MODES = ["auto", "single", "swarm", "crew"] as const;
const VALID_ANIMATION_STYLES = ["braille", "dots", "lines", "classic", "none"] as const;
const VALID_UI_STYLES = ["premium", "retro", "plain"] as const;
const VALID_COMPRESSION_LEVELS = ["minimal", "balanced", "aggressive"] as const;

// Sanity ceilings — prevent hand-edited configs from asking for values that
// make no operational sense (e.g. 1e6 concurrent subagents). Permissive enough
// that any realistic power-user setting passes through.
const MAX_CONCURRENT_CEILING = 1024;
const MAX_AGENTS_PER_SESSION_CEILING = 10_000;
const MAX_TURNS_CEILING = 10_000;
const MAX_TOTAL_TURNS_PER_SESSION_CEILING = 100_000;
const GRACE_TURNS_CEILING = 1_000;
const SESSION_MAX_SPAWNS_CEILING = 10_000;
const SESSION_MAX_TURNS_CEILING = 100_000;

function validateInt(raw: Record<string, unknown>, key: string, min: number, max: number, fallback: number): number {
  const val = raw[key];
  if (typeof val === "number" && Number.isInteger(val) && val >= min && val <= max) return val;
  return fallback;
}

function validateBool(raw: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const val = raw[key];
  if (typeof val === "boolean") return val;
  return fallback;
}

function validateEnum<T extends string>(
  raw: Record<string, unknown>,
  key: string,
  valid: readonly T[],
  fallback: T,
): T {
  const val = raw[key];
  if (typeof val === "string" && (valid as readonly string[]).includes(val)) return val as T;
  return fallback;
}

/** Int-field specs for sanitize: key + min + max. */
const INT_FIELD_SPECS = [
  { key: "maxConcurrent", min: 1, max: MAX_CONCURRENT_CEILING },
  { key: "maxAgentsPerSession", min: 1, max: MAX_AGENTS_PER_SESSION_CEILING },
  { key: "maxTotalTurnsPerSession", min: 1, max: MAX_TOTAL_TURNS_PER_SESSION_CEILING },
  { key: "graceTurns", min: 1, max: GRACE_TURNS_CEILING },
  { key: "dashboardRefreshInterval", min: 100, max: 60000 },
  { key: "sessionMaxSpawns", min: 1, max: SESSION_MAX_SPAWNS_CEILING },
  { key: "sessionMaxTurns", min: 1, max: SESSION_MAX_TURNS_CEILING },
] as const;

/** Enum-field specs for sanitize: key + valid values. */
const ENUM_FIELD_SPECS = [
  { key: "defaultJoinMode" as const, valid: VALID_JOIN_MODES as readonly string[] },
  { key: "animationStyle" as const, valid: VALID_ANIMATION_STYLES as readonly string[] },
  { key: "uiStyle" as const, valid: VALID_UI_STYLES as readonly string[] },
  { key: "orchestrationMode" as const, valid: VALID_ORCHESTRATION_MODES as readonly string[] },
  { key: "promptCompressionLevel" as const, valid: VALID_COMPRESSION_LEVELS as readonly string[] },
];

/** Boolean keys recognized by sanitize. */
const BOOL_KEYS = [
  "schedulingEnabled",
  "tracingEnabled",
  "showActivityStream",
  "showTokenUsage",
  "showTurnProgress",
  "debugCapture",
] as const;

/** Sanitize integer fields into the output object. */
function sanitizeIntFields(r: Record<string, unknown>, out: SubagentsSettings): void {
  for (const { key, min, max } of INT_FIELD_SPECS) {
    const v = validateInt(r, key, min, max, 0);
    if (v) (out as Record<string, unknown>)[key] = v;
  }
  const dmt = validateInt(r, "defaultMaxTurns", 0, MAX_TURNS_CEILING, -1);
  if (dmt >= 0) out.defaultMaxTurns = dmt;
}

/** Sanitize enum fields into the output object. */
function sanitizeEnumFields(r: Record<string, unknown>, out: SubagentsSettings): void {
  for (const { key, valid } of ENUM_FIELD_SPECS) {
    const v = validateEnum(r, key, valid, "");
    if (v) (out as Record<string, unknown>)[key] = v;
  }
}

/** Sanitize boolean fields into the output object. */
function sanitizeBoolFields(r: Record<string, unknown>, out: SubagentsSettings): void {
  for (const key of BOOL_KEYS) {
    if (typeof r[key] === "boolean") {
      out[key] = validateBool(r, key, false);
    }
  }
}

/** Sanitize the debugCapturePaths override map into the output object. */
function sanitizeDebugCapturePaths(r: Record<string, unknown>, out: SubagentsSettings): void {
  const rawPaths = r.debugCapturePaths;
  if (!rawPaths || typeof rawPaths !== "object") return;

  const outPaths: DebugCapturePathOverrides = {};
  const proj = (rawPaths as Record<string, unknown>).project;
  const pers = (rawPaths as Record<string, unknown>).personal;
  if (typeof proj === "string" && proj) outPaths.project = proj;
  if (typeof pers === "string" && pers) outPaths.personal = pers;
  if (outPaths.project !== undefined || outPaths.personal !== undefined) {
    out.debugCapturePaths = outPaths;
  }
}

/** Drop fields that don't match the expected shape. Silent — garbage becomes absent. */
function sanitize(raw: unknown): SubagentsSettings {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: SubagentsSettings = {};

  sanitizeIntFields(r, out);
  sanitizeEnumFields(r, out);
  sanitizeBoolFields(r, out);

  // debugCapturePaths is a free-form string→string map. Each key is optional;
  // missing fields intentionally fall through so the consumer (agent-registry)
  // can fall back to defaults. We accept any string shape because the
  // downstream sanitiser (`validateCapturePath` in `src/debug-capture.ts`)
  // rejects non-absolute / `..`-traversal / oversized values at enable time.
  sanitizeDebugCapturePaths(r, out);

  return out;
}

function globalPath(): string {
  return join(getAgentDir(), "subagents.json");
}

function projectPath(cwd: string): string {
  return join(cwd, ".pi", "subagents.json");
}

/**
 * Read a settings file. Missing file is silent (returns `{}`). A file that
 * exists but can't be parsed emits a warning to stderr so users aren't
 * silently reverted to defaults — and still returns `{}` so startup proceeds.
 */
function readSettingsFile(path: string): SubagentsSettings {
  if (!existsSync(path)) return {};
  try {
    return sanitize(JSON.parse(readFileSync(path, "utf-8")));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn(`Ignoring malformed settings at ${path}: ${reason}`);
    return {};
  }
}

/** Load merged settings: global provides defaults, project overrides. */
export function loadSettings(cwd: string = process.cwd()): SubagentsSettings {
  return { ...readSettingsFile(globalPath()), ...readSettingsFile(projectPath(cwd)) };
}

/**
 * Write project-local settings. Global is never touched from code.
 * Returns `true` on success, `false` if the write (or mkdir) failed so the
 * caller can surface a warning — persistence isn't fatal but isn't silent.
 */
export function saveSettings(s: SubagentsSettings, cwd: string = process.cwd()): boolean {
  const path = projectPath(cwd);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(s, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** Apply persisted settings to the in-memory state via caller-supplied setters. */
export function applySettings(s: SubagentsSettings, appliers: SettingsAppliers): void {
  if (typeof s.maxConcurrent === "number") appliers.setMaxConcurrent(s.maxConcurrent);
  if (typeof s.maxAgentsPerSession === "number" || typeof s.maxTotalTurnsPerSession === "number") {
    appliers.setSessionLimits({
      maxAgentsPerSession: s.maxAgentsPerSession,
      maxTotalTurnsPerSession: s.maxTotalTurnsPerSession,
    });
  }
  if (typeof s.defaultMaxTurns === "number") appliers.setDefaultMaxTurns(s.defaultMaxTurns);
  if (typeof s.graceTurns === "number") appliers.setGraceTurns(s.graceTurns);
  if (s.defaultJoinMode) appliers.setDefaultJoinMode(s.defaultJoinMode);
  if (typeof s.schedulingEnabled === "boolean") appliers.setSchedulingEnabled(s.schedulingEnabled);
  if (typeof s.tracingEnabled === "boolean") appliers.setTracingEnabled(s.tracingEnabled);
  if (s.animationStyle) appliers.setAnimationStyle(s.animationStyle);
  if (s.uiStyle) appliers.setUiStyle(s.uiStyle);
  if (typeof s.showActivityStream === "boolean") appliers.setShowActivityStream(s.showActivityStream);
  if (typeof s.showTokenUsage === "boolean") appliers.setShowTokenUsage(s.showTokenUsage);
  if (typeof s.showTurnProgress === "boolean") appliers.setShowTurnProgress(s.showTurnProgress);
  if (s.orchestrationMode) appliers.setOrchestrationMode(s.orchestrationMode);
  if (typeof s.dashboardRefreshInterval === "number") appliers.setDashboardRefreshInterval(s.dashboardRefreshInterval);
  if (typeof s.sessionMaxSpawns === "number") appliers.setSessionMaxSpawns(s.sessionMaxSpawns);
  if (typeof s.sessionMaxTurns === "number") appliers.setSessionMaxTurns(s.sessionMaxTurns);
  if (s.promptCompressionLevel) appliers.setPromptCompressionLevel(s.promptCompressionLevel);
  // Always fire debug-capture appliers when their key is present, even when
  // the values are empty objects, so the in-memory state reflects "user
  // explicitly overrode with an empty map" vs "user did not provide a value".
  if (typeof s.debugCapture === "boolean") appliers.setDebugCapture(s.debugCapture);
  if (s.debugCapturePaths !== undefined) appliers.setDebugCapturePaths(s.debugCapturePaths);
}

/**
 * Format the user-facing toast for a settings mutation. Pure function —
 * routes the success/failure of `saveSettings` into the right message + level
 * so the UI layer (index.ts) stays a thin wire between input and notification.
 */
export function persistToastFor(
  successMsg: string,
  persisted: boolean,
): { message: string; level: "info" | "warning" } {
  return persisted
    ? { message: successMsg, level: "info" }
    : { message: `${successMsg} (session only; failed to persist)`, level: "warning" };
}

/**
 * Load merged settings, apply them to in-memory state, and emit the
 * `subagents:settings_loaded` lifecycle event. Returns the loaded settings so
 * callers can log/inspect. Extension init wires this once.
 */
export function applyAndEmitLoaded(
  appliers: SettingsAppliers,
  emit: SettingsEmit,
  cwd: string = process.cwd(),
): SubagentsSettings {
  const settings = loadSettings(cwd);
  applySettings(settings, appliers);
  emit("subagents:settings_loaded", { settings });
  return settings;
}

/**
 * Persist a settings snapshot, emit the `subagents:settings_changed` event
 * (regardless of persist outcome so listeners see the in-memory change), and
 * return the toast the UI should display. Event payload carries the `persisted`
 * flag so listeners can react to write failures.
 */
export function saveAndEmitChanged(
  snapshot: SubagentsSettings,
  successMsg: string,
  emit: SettingsEmit,
  cwd: string = process.cwd(),
): { message: string; level: "info" | "warning" } {
  const persisted = saveSettings(snapshot, cwd);
  emit("subagents:settings_changed", { settings: snapshot, persisted });
  return persistToastFor(successMsg, persisted);
}
