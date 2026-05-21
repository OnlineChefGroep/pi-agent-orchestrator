/**
 * agent-registry.ts — Agent type definitions, configuration, and registry helpers.
 *
 * Provides functions for:
 * - Reloading custom agents from .pi/agents/*.md files
 * - Building type lists for tool descriptions
 * - Join mode and scheduling configuration
 */

import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { getAgentConfig, getAllTypes, getDefaultAgentNames, getUserAgentNames, registerAgents } from "./agent-types.js";
import { loadCustomAgents } from "./custom-agents.js";
import type { JoinMode } from "./types.js";

// ---- Join mode configuration ----

let defaultJoinMode: JoinMode = 'smart';

/** Get the default join mode for background agents. */
export function getDefaultJoinMode(): JoinMode {
  return defaultJoinMode;
}

/** Set the default join mode for background agents. */
export function setDefaultJoinMode(mode: JoinMode): void {
  defaultJoinMode = mode;
}

// ---- Scheduling switch ----

/**
 * Master switch for the schedule subagent feature. Defaults to enabled.
 * Read once at extension init (before tool registration) so the Agent tool's
 * param schema reflects the persisted setting. Runtime toggles via /agents
 * → Settings short-circuit the menu entry + the execute-time addJob path
 * immediately, but the schema-level removal only takes effect on next
 * extension load (next pi session).
 */
let schedulingEnabled = true;

/** Check if scheduling is enabled. */
export function isSchedulingEnabled(): boolean {
  return schedulingEnabled;
}

/** Enable or disable scheduling. */
export function setSchedulingEnabled(b: boolean): void {
  schedulingEnabled = b;
}

// ---- Custom agent reloading ----

/** Reload agents from .pi/agents/*.md and merge with defaults. */
export function reloadCustomAgents(): void {
  const userAgents = loadCustomAgents(process.cwd());
  registerAgents(userAgents);
}

// ---- Type list building ----

/** Derive a short model label from a model string. */
export function getModelLabelFromConfig(model: string): string {
  // Strip provider prefix (e.g. "anthropic/claude-sonnet-4-6" → "claude-sonnet-4-6")
  const name = model.includes("/") ? model.split("/").pop()! : model;
  // Strip trailing date suffix (e.g. "claude-haiku-4-5-20251001" → "claude-haiku-4-5")
  return name.replace(/-\d{8}$/, "");
}

/** Build the full type list text dynamically from the unified registry. */
export function buildTypeListText(): string {
  const defaultNames = getDefaultAgentNames();
  const userNames = getUserAgentNames();

  const defaultDescs = defaultNames.map((name) => {
    const cfg = getAgentConfig(name);
    const modelSuffix = cfg?.model ? ` (${getModelLabelFromConfig(cfg.model)})` : "";
    return `- ${name}: ${cfg?.description ?? name}${modelSuffix}`;
  });

  const customDescs = userNames.map((name) => {
    const cfg = getAgentConfig(name);
    return `- ${name}: ${cfg?.description ?? name}`;
  });

  return [
    "Default agents:",
    ...defaultDescs,
    ...(customDescs.length > 0 ? ["", "Custom agents:", ...customDescs] : []),
    "",
    `Custom agents can be defined in .pi/agents/<name>.md (project) or ${getAgentDir()}/agents/<name>.md (global) — they are picked up automatically. Project-level agents override global ones. Creating a .md file with the same name as a default agent overrides it.`,
  ].join("\n");
}