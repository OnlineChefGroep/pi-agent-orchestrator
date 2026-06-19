/**
 * debug-capture.ts — Local offline capture sink for evals and debugging.
 *
 * Design contract:
 * - Off by default; activated only via the `debugCapture` setting (project
 *   or personal). When off: every public function is a no-op, no folders
 *   are created, no files are written.
 * - Local-only by construction. The module writes only to directories the
 *   user/extension explicitly bound to via `enable({ projectPath, personalPath })`.
 *   Paths are validated: must be absolute, contain no `..` traversal
 *   segments or NUL bytes, and fit within a 4 KiB budget.
 * - Best-effort: every filesystem operation is wrapped in try/catch and
 *   swallows errors via `logger.debug`. A capture failure must never break
 *   the agent runtime, dashboard, or scheduler.
 * - Append-only JSONL for events/audit/errors (single-write atomic appends);
 *   atomic JSON upsert for `manifest.json`, `metrics.json`, `index.json`
 *   (write-temp-then-rename so partial writes never produce invalid JSON).
 * - Rotation: per-file 25 MiB ceiling. When exceeded, the tail half is kept
 *   so the most recent events survive older truncation — bounded storage
 *   with deterministic freshness.
 *
 * The module is a pure sink: it does NOT register hook or telemetry
 * handlers. Wiring lives in `src/index.ts` so the public DSL stays
 * dependency-free (testable in isolation without a HookRegistry/HookRuntime).
 */

import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Per-file rotation ceiling. 25 MiB is large enough to hold thousands of
 *  JSONL events per agent (typical event ≈ 200 bytes) and small enough that
 *  one misbehaving agent can't fill the disk. Rotation keeps the tail half
 *  (12.5 MiB ≈ 5k events) so the newest activity always survives. */
const MAX_BYTES_PER_FILE = 25 * 1024 * 1024;

/** Acceptable folder names: characters outside the allowlist are replaced
 *  with `-`; overflow (>200 chars) truncated. `..` traversal rejected
 *  upstream by `validateCapturePath`. */
const MAX_DIR_NAME_LENGTH = 200;

/** Hard cap on path length to keep `validateCapturePath` linear and reject
 *  pathological hand-edited settings. */
const MAX_PATH_LENGTH = 4096;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DebugCapturePaths {
  /** Project-local capture root. Absolute path. Optional. */
  projectPath?: string;
  /** Personal capture root. Absolute path. Optional. */
  personalPath?: string;
}

export interface DebugCaptureManifest {
  /** ISO-8601 timestamp the capture started. */
  enabledAt: string;
  /** Stable identifier for this capture session. Used to correlate captures
   *  across the project and personal roots. */
  sessionUuid: string;
  /** Paths actually accepted by `enable()` (after validation + mkdirSync). */
  paths: { project: string | null; personal: string | null };
  options: { maxBytesPerFile: number };
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let enabled = false;
let projectRoot: string | null = null;
let personalRoot: string | null = null;
let manifest: DebugCaptureManifest | null = null;

// ---------------------------------------------------------------------------
// Public API — lifecycle
// ---------------------------------------------------------------------------

/** True if capture is active. Handlers and direct callers should short-
 *  circuit when this is false to keep the no-op path zero-cost. */
export function isDebugCaptureEnabled(): boolean {
  return enabled;
}

/** Snapshot of the manifest written at enable time. Null while disabled. */
export function getDebugCaptureManifest(): DebugCaptureManifest | null {
  return manifest ? { ...manifest, paths: { ...manifest.paths } } : null;
}

/**
 * Activate capture for the given paths. Idempotent: calling twice without
 * disable() in between is a no-op that returns the existing manifest.
 * Returns null when no path is writable — capture stays disabled in that
 * case so we never silently drop data on the floor.
 */
export function enable(
  paths: DebugCapturePaths,
  sessionUuidHint?: string,
): DebugCaptureManifest | null {
  if (enabled) return manifest;

  const nextManifest: DebugCaptureManifest = {
    enabledAt: new Date().toISOString(),
    sessionUuid: sessionUuidHint || randomUUID(),
    paths: { project: null, personal: null },
    options: { maxBytesPerFile: MAX_BYTES_PER_FILE },
  };

  let nextProject: string | null = null;
  let nextPersonal: string | null = null;

  if (paths.projectPath) {
    const safe = safeEnsureDir(paths.projectPath);
    if (safe) {
      nextProject = safe;
      nextManifest.paths.project = safe;
    }
  }
  if (paths.personalPath) {
    const safe = safeEnsureDir(paths.personalPath);
    if (safe) {
      nextPersonal = safe;
      nextManifest.paths.personal = safe;
    }
  }

  if (!nextProject && !nextPersonal) {
    logger.debug("debug-capture: enable aborted — no writable paths");
    return null;
  }

  manifest = nextManifest;
  projectRoot = nextProject;
  personalRoot = nextPersonal;
  enabled = true;

  // Sweep stale `.tmp` siblings from a prior crash. Both `writeJsonAtomic`
  // and `rotateIfNeeded` use the temp-then-rename pattern; if the process
  // dies between write + rename, the leftover `.tmp` lingers indefinitely.
  // Removing them on enable keeps the capture directory clean. Best-effort:
  // any failure here just means we skip the cleanup.
  for (const root of activeRoots()) {
    cleanupStaleTempFiles(root);
  }

  // Write manifest atomically into both roots so each can be inspected
  // standalone. Best-effort: if a write fails, capture still continues.
  for (const root of activeRoots()) {
    writeJsonAtomic(join(root, "manifest.json"), manifest);
  }

  logger.debug("debug-capture enabled", {
    sessionUuid: manifest?.sessionUuid,
    project: projectRoot,
    personal: personalRoot,
  });

  return getDebugCaptureManifest();
}

/**
 * Deactivate capture. Optionally writes a closing `index.json` next to the
 * manifest (default: yes) so the two roots can be cross-checked offline.
 */
export function disable(writeFinalIndex: boolean = true): void {
  if (!enabled) return;
  if (writeFinalIndex && manifest) {
    const index = {
      closedAt: new Date().toISOString(),
      sessionUuid: manifest.sessionUuid,
      capturedAt: manifest.enabledAt,
      durationMs: Date.now() - Date.parse(manifest.enabledAt),
    };
    for (const root of activeRoots()) {
      writeJsonAtomic(join(root, "index.json"), index);
    }
  }
  logger.debug("debug-capture disabled", { sessionUuid: manifest?.sessionUuid });
  manifest = null;
  projectRoot = null;
  personalRoot = null;
  enabled = false;
}

/**
 * Reset internal state without touching the filesystem. Used by tests
 * between cases — production callers don't need this because `enable()`
 * and `disable()` are already idempotent + safe to repeat.
 */
export function resetDebugCapture(): void {
  enabled = false;
  projectRoot = null;
  personalRoot = null;
  manifest = null;
}

// ---------------------------------------------------------------------------
// Public API — append sinks
// ---------------------------------------------------------------------------

/**
 * Append one JSONL line per active root to
 * `<root>/agents/<agentId>/events.jsonl`. No-op when capture is disabled.
 */
export function appendAgentEvent(
  agentId: string,
  event: string,
  data?: unknown,
): void {
  if (!enabled) return;
  const payload = {
    ts: new Date().toISOString(),
    event,
    agentId,
    ...optionalField("data", cloneSafe(data)),
  };
  appendToPath("agents", agentId, "events.jsonl", payload);
}

/**
 * Append a structured error record (with stack trace for Error instances) to
 * `<root>/agents/<agentId>/errors.log`. No-op when capture is disabled.
 */
export function appendError(
  agentId: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!enabled || !agentId) return;
  const error = err instanceof Error
    ? { name: err.name, message: err.message, stack: err.stack }
    : { raw: String(err) };
  const payload = {
    ts: new Date().toISOString(),
    agentId,
    error,
    ...optionalField("context", context ? cloneSafe(context) : undefined),
  };
  appendToPath("agents", agentId, "errors.log", payload);
}

/**
 * Atomic upsert of `<root>/agents/<agentId>/metrics.json`. Replaces the
 * previous metrics atomically (write temp → rename) so concurrent reads
 * never see a half-written JSON object. No-op when capture is disabled.
 */
export function upsertAgentMetrics(
  agentId: string,
  metrics: Record<string, unknown>,
): void {
  if (!enabled || !agentId) return;
  // Cast: cloneSafe returns `unknown` (it accepts primitives + arrays + records);
  // we know metrics is a record, so the spread is safe.
  const payload = {
    ts: new Date().toISOString(),
    agentId,
    ...(cloneSafe(metrics) as Record<string, unknown>),
  };
  for (const root of activeRoots()) {
    writeJsonAtomic(join(root, "agents", sanitizeDirName(agentId), "metrics.json"), payload);
  }
}

/**
 * Append one execution record to `<root>/schedules/<jobName>/executions.jsonl`.
 * The jobId is included for correlation across renames; the jobName doubles
 * as the friendly filesystem key. No-op when capture is disabled.
 */
export function appendScheduleEvent(
  jobId: string,
  jobName: string,
  event: string,
  data?: unknown,
): void {
  if (!enabled) return;
  const payload = {
    ts: new Date().toISOString(),
    event,
    jobId,
    jobName,
    ...optionalField("data", cloneSafe(data)),
  };
  appendToPath("schedules", jobName || jobId, "executions.jsonl", payload);
}

/**
 * Append one RPC audit record to `<root>/rpc/audit.jsonl`. No-op when
 * capture is disabled.
 */
export function appendRpcAudit(payload: Record<string, unknown>): void {
  if (!enabled) return;
  // Same cast rationale as upsertAgentMetrics — payload is a record, but
  // `cloneSafe` is typed `unknown` so the inline spread needs a cast.
  const entry = {
    ts: new Date().toISOString(),
    ...(cloneSafe(payload) as Record<string, unknown>),
  };
  for (const root of activeRoots()) {
    appendAtomicWithRotate(join(root, "rpc", "audit.jsonl"), entry);
  }
}

// ---------------------------------------------------------------------------
// Internals — path safety + atomic I/O
// ---------------------------------------------------------------------------

/** Validate the absolute path + ensure the directory exists. Returns the
 *  absolute path on success, null on any validation or mkdir failure. */
function safeEnsureDir(path: string): string | null {
  const safe = validateCapturePath(path);
  if (!safe) return null;
  try {
    mkdirSync(safe, { recursive: true, mode: 0o700 });
    return safe;
  } catch (err) {
    logger.debug(`debug-capture: cannot use ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Sanitize a path. Rejects non-absolute, `..` traversal, NUL bytes, and
 *  paths longer than `MAX_PATH_LENGTH`. */
function validateCapturePath(p: unknown): string | null {
  if (typeof p !== "string" || !p) return null;
  if (p.length > MAX_PATH_LENGTH) return null;
  if (!isAbsolute(p)) return null;
  if (p.includes("\0")) return null;
  // Split on both POSIX and Windows separators; reject any `..` segment.
  const segments = p.split(/[\\/]+/);
  if (segments.includes("..")) return null;
  return p;
}

/** Sanitize a folder name (agent id, job name) for safe nesting under
 *  `<root>/agents/<name>/...` or `<root>/schedules/<name>/...`. */
function sanitizeDirName(name: string): string {
  if (!name) return "_";
  const cleaned = name
    // Strip NUL early.
    .replace(/\0/g, "")
    // Strip the path separator characters that would split into nested dirs.
    .replace(/[\\/]/g, "-")
    // Replace common illegal-characters on NTFS/FAT (defensive — POSIX allows them but
    // Windows tools often choke, and rotation/test environments may run on either).
    .replace(/[:*?"<>|]/g, "-")
    // Collapse double dashes so the result is at least loosely readable.
    .replace(/-+/g, "-")
    // Trim surrounding dashes (a name that started/ended with a path char).
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_DIR_NAME_LENGTH);
  return cleaned || "_";
}

function activeRoots(): string[] {
  const out: string[] = [];
  if (projectRoot) out.push(projectRoot);
  if (personalRoot) out.push(personalRoot);
  return out;
}

function appendToPath(topLevel: string, dirName: string, file: string, payload: unknown): void {
  const safeDir = sanitizeDirName(dirName);
  for (const root of activeRoots()) {
    appendAtomicWithRotate(join(root, topLevel, safeDir, file), payload);
  }
}

function appendAtomicWithRotate(path: string, payload: unknown): void {
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    // Single-write atomic append. On POSIX this is one syscall below
    // `PIPE_BUF` (4096 bytes on Linux), so concurrent readers see no torn
    // lines (typical JSON event ≈200 bytes — well under the threshold).
    // On Windows NTFS, atomicity is sector-bounded (typically 512 bytes);
    // if a future schema grows past this, switch to temp-then-rename.
    const line = `${JSON.stringify(payload)}\n`;
    if (!existsSync(path)) {
      writeFileSync(path, "", "utf-8");
    }
    appendFileSync(path, line, "utf-8");
    rotateIfNeeded(path);
  } catch (err) {
    logger.debug(`debug-capture: write failed for ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function writeJsonAtomic(path: string, payload: unknown): void {
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const tmp = `${path}.${randomUUID()}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf-8");
    // Atomic on POSIX (same filesystem); on Windows the destination is
    // overwritten if it exists. Acceptable for a debug capture sink — the
    // half-written scenario we'd avoid doesn't exist on Windows because
    // rename throw replaces.
    renameSync(tmp, path);
  } catch (err) {
    logger.debug(`debug-capture: atomic write failed for ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Trim file when it exceeds the ceiling. Atomic via temp-then-rename:
 *  write the tail half to a sibling `.tmp`, then `renameSync` it over the
 *  destination so a crash mid-rotation cannot leave a half-truncated file.
 *  Lossy by design (older events discarded) but crash-safe. */
function rotateIfNeeded(path: string): void {
  try {
    const st = statSync(path);
    if (st.size <= MAX_BYTES_PER_FILE) return;
    const keep = Math.floor(MAX_BYTES_PER_FILE / 2);
    const fd = readFileSync(path);
    if (fd.length <= keep) return;
    const tail = fd.subarray(fd.length - keep);
    const tmp = `${path}.${randomUUID()}.tmp`;
    writeFileSync(tmp, tail, "utf-8");
    renameSync(tmp, path);
  } catch {
    // Rotation is best-effort: any failure (EBUSY, EACCES, ENOSPC) just
    // means the next append will fail and log the same way. Capture is
    // designed never to crash the runtime.
  }
}

/** Build an `{ [key]: value }` object only when `value` is defined.
 *  Used as a helper to spread optional keys into object literals without
 *  TypeScript tripping over the conditional type inference for `unknown`
 *  values returned from `cloneSafe`. */
function optionalField(key: string, value: unknown): Record<string, unknown> {
  return value !== undefined ? { [key]: value } : {};
}

/** Sweep stale `<root>/*.tmp` siblings left behind by an interrupted rename.
 *  Best-effort: readdir/unlink errors are swallowed by the helper. */
function cleanupStaleTempFiles(root: string): void {
  try {
    const entries = readdirSync(root);
    for (const name of entries) {
      if (name.endsWith(".tmp")) {
        try { unlinkSync(join(root, name)); } catch { /* skip */ }
      }
    }
  } catch { /* skip — directory unreadable is fine, capture proceeds */ }
}

/** Shallow-clone plain objects for safe JSON.stringify. Removes class
 *  instances + functions + symbols that JSON.stringify would otherwise
 *  quietly drop (losing semantics) or include as `undefined` (bloat). */
function cloneSafe(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneSafe);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === "function" || typeof v === "symbol" || typeof v === "undefined") continue;
    out[k] = cloneSafe(v);
  }
  return out;
}
