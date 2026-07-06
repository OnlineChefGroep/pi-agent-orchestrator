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

import { existsSync, promises as fs } from "node:fs";
import { basename, dirname, join } from "node:path";
import { lock } from "proper-lockfile";
import type { ScheduledSubagent, ScheduleStoreData } from "./types.js";

/** Resolve the storage path for a session-scoped store. */
export function resolveStorePath(cwd: string, sessionId: string): string {
  return join(cwd, ".pi", "subagent-schedules", `${sessionId}.json`);
}

async function removeLegacyFileLock(lockPath: string): Promise<void> {
  try {
    const stat = await fs.stat(lockPath);
    if (!stat.isDirectory()) await fs.unlink(lockPath);
  } catch {
    /* no legacy lock to migrate */
  }
}

export class ScheduleStore {
  private filePath: string;
  private lockPath: string;

  private jobs = new Map<string, ScheduledSubagent>();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.lockPath = `${filePath}.lock`;
  }

  static async create(filePath: string): Promise<ScheduleStore> {
    const store = new ScheduleStore(filePath);
    await store.load();
    return store;
  }

  /** Create the backing directory lazily — only when we're about to persist. */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
  }

  /** Reload from disk into the in-memory cache (async). */
  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      // CVE-005 FIX: Enforce max payload size to prevent DoS via JSON.parse
      if (content.length > 5 * 1024 * 1024) throw new Error("Schedule store payload too large");
      const data: ScheduleStoreData = JSON.parse(content);
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
    await removeLegacyFileLock(this.lockPath);

    // Ensure the file exists so proper-lockfile has something to lock onto
    if (!existsSync(this.filePath)) {
      await fs.writeFile(this.filePath, JSON.stringify({ version: 1, jobs: [] }));
    }

    const release = await lock(this.filePath, {
      retries: {
        retries: 100,
        factor: 1,
        minTimeout: 50,
        maxTimeout: 50,
      },
      stale: 30000,
    });

    try {
      await this.load();
      const result = fn();
      await this.save();
      return result;
    } finally {
      await release();
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

  async add(job: ScheduledSubagent, maxSchedules?: number): Promise<void> {
    await this.withLock(() => {
      // CVE-005 FIX: Enforce limits strictly inside the store lock to prevent TOCTOU race conditions
      if (maxSchedules !== undefined && this.jobs.size >= maxSchedules) {
        throw new Error(
          `Maximum number of schedules reached (${maxSchedules}). Remove existing schedules before adding new ones.`,
        );
      }
      for (const j of this.jobs.values()) {
        if (j.id !== job.id && j.name === job.name) {
          throw new Error(`A scheduled job named "${job.name}" already exists.`);
        }
      }
      this.jobs.set(job.id, job);
    });
  }

  async update(id: string, patch: Partial<ScheduledSubagent>): Promise<ScheduledSubagent | undefined> {
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
