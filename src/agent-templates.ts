/**
 * agent-templates.ts — Agent Templates Registry.
 *
 * Manages a curated set of versioned agent templates that users can
 * list, install, update, and remove. Installed templates become
 * regular .pi/agents/*.md files with version tracking in a manifest.
 *
 * Template metadata is bundled inline so listing works without filesystem
 * access. Template .md files are read from .agents/templates/ at install time.
 */

import { existsSync, mkdirSync } from "node:fs";
import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Template metadata from the built-in registry. */
export interface TemplateInfo {
  name: string;
  displayName: string;
  description: string;
  version: string;
  category: string;
  tags: string[];
}

/** Entry in the installed-templates manifest. */
export interface InstalledTemplate {
  name: string;
  version: string;
  installedAt: string;
}

/** Full manifest shape for .pi/agent-templates.json. */
interface InstalledManifest {
  version: 1;
  templates: Record<string, InstalledTemplate>;
}

// ── Built-in template data (bundled inline — no filesystem needed for listing) ──

const BUILTIN_TEMPLATES: TemplateInfo[] = [
  {
    name: "adversarial-validator",
    displayName: "Adversarial Validator",
    description: "Read-only security validator for code changes",
    version: "1.0.0",
    category: "security",
    tags: ["security", "validator", "read-only"],
  },
  {
    name: "worktree-isolated-editor",
    displayName: "Worktree-Isolated Editor",
    description: "File-editing agent configured for git worktree isolation",
    version: "1.0.0",
    category: "editing",
    tags: ["editor", "worktree", "isolated"],
  },
  {
    name: "validator-chain-reviewer",
    displayName: "Validator Chain Reviewer",
    description: "Adversarial validator for plan -> implementer handoff chains",
    version: "1.0.0",
    category: "validation",
    tags: ["validator", "chain", "handoff"],
  },
  {
    name: "handoff-chain-implementer",
    displayName: "Handoff Chain Implementer",
    description: "Worktree-isolated implementer for structured handoff follow-up",
    version: "1.0.0",
    category: "editing",
    tags: ["implementer", "handoff", "worktree", "chain"],
  },
  {
    name: "scheduled-explorer",
    displayName: "Scheduled Explorer",
    description: "Read-only codebase explorer for scheduled monitoring",
    version: "1.0.0",
    category: "monitoring",
    tags: ["explorer", "scheduled", "monitoring", "read-only"],
  },
  {
    name: "handoff-chain-researcher",
    displayName: "Handoff Chain Researcher",
    description: "Read-only researcher that produces structured handoff JSON",
    version: "1.0.0",
    category: "research",
    tags: ["researcher", "handoff", "read-only", "chain"],
  },
];

const BUILTIN_MAP = new Map(BUILTIN_TEMPLATES.map((t) => [t.name, t]));

// ── Path resolution ──────────────────────────────────────────────────────

/** Resolve the .agents/templates/ directory (for reading template .md files). */
function getBuiltinTemplatesDir(): string {
  const srcDir = dirname(fileURLToPath(import.meta.url));
  return join(srcDir, "..", ".agents", "templates");
}

function getInstalledManifestPath(cwd: string): string {
  return join(cwd, ".pi", "agent-templates.json");
}

function getAgentsDir(cwd: string): string {
  return join(cwd, ".pi", "agents");
}

// ── Manifest I/O ─────────────────────────────────────────────────────────

async function readInstalledManifest(cwd: string): Promise<InstalledManifest> {
  const path = getInstalledManifestPath(cwd);
  if (!existsSync(path)) return { version: 1, templates: {} };
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as InstalledManifest;
}

async function writeInstalledManifest(cwd: string, manifest: InstalledManifest): Promise<void> {
  const path = getInstalledManifestPath(cwd);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await writeFile(path, JSON.stringify(manifest, null, 2));
}

// ── Public API ───────────────────────────────────────────────────────────

export function listTemplates(): TemplateInfo[] {
  return BUILTIN_TEMPLATES;
}

export function getTemplateInfo(name: string): TemplateInfo | undefined {
  return BUILTIN_MAP.get(name);
}

export async function listInstalledTemplates(cwd: string): Promise<InstalledTemplate[]> {
  const manifest = await readInstalledManifest(cwd);
  return Object.values(manifest.templates);
}

export async function checkForUpdate(
  name: string,
  cwd: string,
): Promise<{ installed: string; available: string } | null> {
  const installed = await readInstalledManifest(cwd);
  const entry = installed.templates[name];
  if (!entry) return null;

  const info = getTemplateInfo(name);
  if (!info) return null;

  if (compareVersions(info.version, entry.version) > 0) {
    return { installed: entry.version, available: info.version };
  }
  return null;
}

export async function installTemplate(name: string, cwd: string): Promise<{ ok: boolean; error?: string; wasUpdate?: boolean }> {
  const info = getTemplateInfo(name);
  if (!info) return { ok: false, error: `Template "${name}" not found in registry.` };

  const templatePath = join(getBuiltinTemplatesDir(), `${name}.md`);
  if (!existsSync(templatePath)) return { ok: false, error: `Template file for "${name}" is missing.` };

  const agentsDir = getAgentsDir(cwd);
  if (!existsSync(agentsDir)) mkdirSync(agentsDir, { recursive: true });

  const destPath = join(agentsDir, `${name}.md`);

  const installed = await readInstalledManifest(cwd);
  const existing = installed.templates[name];
  const wasUpdate = existing !== undefined;

  if (existing && compareVersions(info.version, existing.version) <= 0) {
    return { ok: false, error: `Template "${name}" is already at version ${existing.version} (available: ${info.version}).` };
  }

  await copyFile(templatePath, destPath);

  installed.templates[name] = {
    name,
    version: info.version,
    installedAt: new Date().toISOString(),
  };
  await writeInstalledManifest(cwd, installed);

  return { ok: true, wasUpdate };
}

export async function removeTemplate(name: string, cwd: string): Promise<{ ok: boolean; error?: string }> {
  const installed = await readInstalledManifest(cwd);
  if (!installed.templates[name]) {
    return { ok: false, error: `Template "${name}" is not installed.` };
  }

  const agentPath = join(getAgentsDir(cwd), `${name}.md`);
  if (existsSync(agentPath)) {
    await rm(agentPath);
  }

  delete installed.templates[name];
  await writeInstalledManifest(cwd, installed);

  return { ok: true };
}

export async function checkAllUpdates(
  cwd: string,
): Promise<{ name: string; installed: string; available: string }[]> {
  const installed = await readInstalledManifest(cwd);

  const updates: { name: string; installed: string; available: string }[] = [];
  for (const name of Object.keys(installed.templates)) {
    const check = await checkForUpdate(name, cwd);
    if (check) updates.push({ name, ...check });
  }
  return updates;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const av = aParts[i] || 0;
    const bv = bParts[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}
