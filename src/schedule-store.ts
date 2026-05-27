/**
 * schedule-store.ts — File-backed store for scheduled subagents.
 *
 * Session-scoped: each pi session owns its own schedules at
 * `<cwd>/.pi/subagent-schedules/<sessionId>.json`. `/new` starts a fresh
 * empty store; `/resume` reloads.
 *
 * Concurrency model: every mutation acquires an atomic lock directory,
 * re-reads the latest state from disk, applies the change, atomic-writes via
 * temp+rename, releases.
 */

import { existsSync, promises as fs, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { ScheduledSubagent, ScheduleStoreData } from "./types.js";

const LOCK_RETRY_MS = 50;
const LOCK_MAX_RETRIES = 100;
const LOCK_STALE_MS = 30_000;

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function writeLockOwner(lockPath: string): Promise<void> {
  await fs.writeFile(
    join(lockPath, "owner.json"),
    JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }, null, 2),
    "utf-8",
  );
}

async function recoverExistingLock(lockPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(lockPath);
    if (!stat.isDirectory()) {
      await fs.unlink(lockPath);
      return true;
    }
    if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
      await fs.rm(lockPath, { recursive: true, force: true });
      return true;
    }
  } catch {
    return true;
  }
  return false;
}

/** Acquire an atomic lock directory — async retry with stale-lock recovery. */
async function acquireLock(lockPath: string): Promise<void> {
  for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
    try {
      await fs.mkdir(lockPath);
      await writeLockOwner(lockPath);
      return;
    } catch (e: any) {
      if (e.code === "EEXIST") {
        if (await recoverExistingLock(lockPath)) continue;
        await sleep(LOCK_RETRY_MS);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Failed to acquire schedule lock: ${lockPath}`);
}

async function releaseLock(lockPath: string): Promise<void> {
  try {
    await fs.rm(lockPath, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/** Resolve the storage path for a session-scoped store. */
export function resolveStorePath(cwd: string, sessionId: string): string {
  return join(cwd, ".pi", "subagent-schedules", `${sessionId}.json`);
}

export class ScheduleStore {
  private filePath: string;
  private lockPath: string;
  private jobs = new Map<string, ScheduledSubagent>();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.lockPath = `${filePath}.lock`;
    this.loadSync();
  }

  /** Create the backing directory lazily — only when we're about to persist. */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
  }

  /** Synchronous initial load from disk for the constructor. */
  private loadSync(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const data: ScheduleStoreData = JSON.parse(
        readFileSync(this.filePath, "utf-8"),
      );
      this.jobs.clear();
      for (const j of data.jobs ?? []) this.jobs.set(j.id, j);
    } catch {
      /* corrupt — start fresh, next save rewrites */
    }
  }

  /** Reload from disk into the in-memory cache (async). */
  private async load(): Promise<void> {
    try {
      const data: ScheduleStoreData = JSON.parse(
        await fs.readFile(this.filePath, "utf-8"),
      );
      this.jobs.clear();
      for (const j of data.jobs ?? []) this.jobs.set(j.id, j);
    } catch {
      /* corrupt — start fresh, next save rewrites */
    }
  }

  /** Atomic write via temp file + rename (POSIX-atomic, Windows-safe). */
  private async save(): Promise<void> {
    const data: ScheduleStoreData = {
      version: 1,
      jobs: [...this.jobs.values()],
    };
    
    const targetDir = dirname(this.filePath);
    const tmpPath = join(
      targetDir,
      `${basename(this.filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
    );
    
    try {
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2));
      await fs.rename(tmpPath, this.filePath);
    } catch (error) {
      // Clean up temp file if write/rename fails
      try {
        await fs.unlink(tmpPath);
      } catch {
        /* ignore */
      }
      throw error;
    }
  }

  /** Acquire lock → reload → mutate → save → release. */
  private async withLock<T>(fn: () => T): Promise<T> {
    await this.ensureDir();
    await acquireLock(this.lockPath);
    try {
      await this.load();
      const result = fn();
      await this.save();
      return result;
    } finally {
      await releaseLock(this.lockPath);
    }
  }

  /** Read-only — returns a snapshot of the in-memory cache. */
  list(): ScheduledSubagent[] {
    return [...this.jobs.values()];
  }

  /** Read-only check — uses the cache. */
  hasName(name: string, exceptId?: string): boolean {
    for (const j of this.jobs.values()) {
      if (j.id !== exceptId && j.name === name) return true;
    }
    return false;
  }

  get(id: string): ScheduledSubagent | undefined {
    return this.jobs.get(id);
  }

  async add(job: ScheduledSubagent): Promise<void> {
    await this.withLock(() => {
      this.jobs.set(job.id, job);
    });
  }

  async update(
    id: string,
    patch: Partial<ScheduledSubagent>,
  ): Promise<ScheduledSubagent | undefined> {
    // No-op fast path — an unknown id changes nothing, so don't lock or touch
    // disk (which would otherwise lazily create the backing directory).
    if (!this.jobs.has(id)) return undefined;
    return this.withLock(() => {
      const existing = this.jobs.get(id);
      if (!existing) return undefined;
      const updated = { ...existing, ...patch };
      this.jobs.set(id, updated);
      return updated;
    });
  }

  async remove(id: string): Promise<boolean> {
    // No-op fast path — see update().
    if (!this.jobs.has(id)) return false;
    return this.withLock(() => this.jobs.delete(id));
  }

  /** Delete the backing file (used when no jobs remain, optional cleanup). */
  async deleteFileIfEmpty(): Promise<void> {
    if (this.jobs.size === 0) {
      try {
        await fs.unlink(this.filePath);
      } catch {
        /* ignore */
      }
    }
  }
}
