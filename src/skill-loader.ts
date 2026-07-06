/**
 * skill-loader.ts — Preload named skills.
 *
 * Roots, in precedence order:
 *   - <cwd>/.pi/skills           (project, Pi's standard)
 *   - <cwd>/.agents/skills       (project, cross-tool Agent Skills spec — https://agentskills.io)
 *   - getAgentDir()/skills       (user, default ~/.pi/agent/skills — Pi's standard)
 *   - ~/.agents/skills           (user, cross-tool Agent Skills spec)
 *   - ~/.pi/skills               (legacy global, pre-Pi)
 *
 * Layout per root:
 *   - <root>/<name>.md            (flat file at the top level)
 *   - <root>/.../<name>/SKILL.md  (directory skill, may be nested — Pi's standard)
 *
 * Recursion skips dotfile entries and node_modules. A directory that itself contains
 * SKILL.md is a skill — we don't descend into it (Pi: skills don't nest).
 *
 * Symlinks are rejected for security (deviation from Pi, which follows them).
 */

import type { Dirent } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { isSymlink, isUnsafeName, safeReadFile } from "./memory.js";

export interface PreloadedSkill {
  name: string;
  content: string;
}

/**
 * Pre-built index of root-level skill directories, shared across all skill
 * name lookups to avoid redundant readdirSync calls.
 */
interface RootSkillIndex {
  /** Root-level skill directories: Map<dirname, abspath> for O(1) lookup. */
  skillDirs: Map<string, string>;
  /** Root-level non-skill directories, seeded as the BFS queue start. */
  nonSkillDirs: string[];
}

/**
 * Shared context for a single preloadSkills() call, holding all caches
 * that are built lazily and reused across skill name lookups.
 */
interface SkillLoaderContext {
  /** Root-level directory indices, lazily built and cached per root path. */
  rootIndices: Map<string, RootSkillIndex>;
  /** Directory listings cached across BFS traversals. Map<dirPath, Dirent[]>. */
  dirEntries: Map<string, Dirent<string>[]>;
}

/** Build a RootSkillIndex for the given root directory (one-time I/O). */
function buildRootIndex(root: string): RootSkillIndex | undefined {
  if (isSymlink(root)) return undefined; // reject symlinked roots (security)
  if (!existsSync(root)) return undefined;

  let entries: Dirent<string>[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return undefined;
  }

  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const skillDirs = new Map<string, string>();
  const nonSkillDirs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;

    const path = join(root, entry.name);
    const skillMd = join(path, "SKILL.md");

    if (existsSync(skillMd)) {
      skillDirs.set(entry.name, path);
    } else {
      nonSkillDirs.push(path);
    }
  }

  return { skillDirs, nonSkillDirs };
}

export function preloadSkills(skillNames: string[], cwd: string): PreloadedSkill[] {
  // Shared context: caches are lazily built on first access and reused
  // across all skill names, eliminating redundant readdirSync calls while
  // preserving early-exit (roots beyond the first match are never visited).
  const ctx: SkillLoaderContext = {
    rootIndices: new Map(),
    dirEntries: new Map(),
  };

  return skillNames.map((name) => ({
    name,
    content: loadSkillContent(name, cwd, ctx),
  }));
}

function getSkillRoots(cwd: string): string[] {
  return [
    join(cwd, ".pi", "skills"), // project — Pi standard
    join(cwd, ".agents", "skills"), // project — Agent Skills spec
    join(getAgentDir(), "skills"), // user — Pi standard
    join(homedir(), ".agents", "skills"), // user — Agent Skills spec
    join(homedir(), ".pi", "skills"), // legacy global, pre-Pi
  ];
}

function loadSkillContent(name: string, cwd: string, ctx: SkillLoaderContext): string {
  if (isUnsafeName(name)) {
    return `(Skill "${name}" skipped: name contains path traversal characters)`;
  }
  for (const root of getSkillRoots(cwd)) {
    const content = findInRoot(root, name, ctx);
    if (content !== undefined) return content;
  }
  return `(Skill "${name}" not found in .pi/skills/, .agents/skills/, or global skill locations)`;
}

function findInRoot(root: string, name: string, ctx: SkillLoaderContext): string | undefined {
  if (isSymlink(root)) return undefined; // reject symlinked roots entirely
  const flat = safeReadFile(join(root, `${name}.md`))?.trim();
  if (flat !== undefined) return flat;
  return findSkillDirectory(root, name, ctx);
}

/**
 * Process a single directory entry during BFS.
 * Returns the skill content if this entry is the target skill, otherwise undefined.
 * Pushes sub-directories onto the queue for further traversal.
 */
function processBfsEntry(entry: Dirent<string>, current: string, name: string, queue: string[]): string | undefined {
  if (!entry.isDirectory()) return undefined;
  if (entry.name.startsWith(".") || entry.name === "node_modules") return undefined;

  // Symlinked dirs already filtered by entry.isDirectory() — Dirent uses lstat semantics.
  const path = join(current, entry.name);
  const skillMd = join(path, "SKILL.md");

  if (existsSync(skillMd)) {
    if (entry.name === name) {
      const content = safeReadFile(skillMd)?.trim();
      if (content !== undefined) return content;
    }
    return undefined; // Pi rule: skills don't nest — don't descend into a skill dir
  }

  queue.push(path);
  return undefined;
}

/**
 * Core BFS loop: traverse `initialQueue` directories looking for a dir
 * named `name` that contains SKILL.md. Pi-conforming filters.
 *
 * Uses ctx.dirEntries to cache readdirSync results across BFS traversals,
 * so subsequent skill names skip redundant I/O on already-scanned dirs.
 */
function bfsForSkill(name: string, initialQueue: string[], ctx: SkillLoaderContext): string | undefined {
  const queue = [...initialQueue];
  // Index-based head pointer: O(1) per pop vs Array.shift() which is O(N).
  // At depth D with B total branches, the old shift() made the BFS O(B*D^2)
  // — significant in the reversed-order distractor case.
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];

    // Check readdir cache before issuing I/O
    let entries = ctx.dirEntries.get(current);
    if (!entries) {
      try {
        entries = readdirSync(current, { withFileTypes: true });
        // Deterministic byte-order traversal — locale-independent.
        // Sort on cache miss only: entries are immutable post-readdirSync,
        // so caching the sorted result and reusing it across BFS visits
        // is sound and saves an O(K log K) sort per visit.
        entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        ctx.dirEntries.set(current, entries);
      } catch {
        continue;
      }
    }

    for (const entry of entries) {
      const result = processBfsEntry(entry, current, name, queue);
      if (result !== undefined) return result;
    }
  }

  return undefined;
}

/**
 * Find a skill directory named `name` under `root` containing SKILL.md.
 *
 * Lazily builds + caches a RootSkillIndex on first per-root access, then
 * shares it across subsequent skill name lookups via ctx.rootIndices.
 * BFS readdirSync results are cached in ctx.dirEntries.
 *
 * Strategy:
 *   1. O(1) Map lookup for root-level skill directories (no readdirSync)
 *   2. Falls back to BFS only for nested skills (cached directory listings)
 *   3. Both caches are populated lazily, reused by later names
 */
function findSkillDirectory(root: string, name: string, ctx: SkillLoaderContext): string | undefined {
  // Get or lazily build the root-level index
  let index = ctx.rootIndices.get(root);
  if (!index) {
    const built = buildRootIndex(root);
    if (!built) return undefined; // root doesn't exist or can't be read
    ctx.rootIndices.set(root, built);
    index = built;
  }

  // O(1) root-level lookup — no readdirSync needed
  const candidate = index.skillDirs.get(name);
  if (candidate) {
    const content = safeReadFile(join(candidate, "SKILL.md"))?.trim();
    if (content !== undefined) return content;
  }

  // BFS for nested skills, seeded with pre-scanned non-skill dirs
  return bfsForSkill(name, index.nonSkillDirs, ctx);
}
