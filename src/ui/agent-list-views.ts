import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AgentManager } from "../agent-manager.js";
import { getAgentConfig, getAllTypes } from "../agent-types.js";
import type { ModelRegistry } from "../model-resolver.js";
import { getModelLabel } from "./agent-file-helpers.js";
import { formatDuration, getDisplayName } from "./agent-format.js";
import type { AgentActivity } from "./agent-ui-types.js";
import { viewAgentConversation } from "./agent-viewer.js";

export async function showAllAgentsList(ctx: ExtensionCommandContext, modelRegistry?: ModelRegistry): Promise<void> {
  const allNames = getAllTypes();
  if (allNames.length === 0) {
    ctx.ui.notify("No agents.", "info");
    return;
  }

  // Source indicators: defaults unmarked, custom agents get • (project) or ◦ (global)
  // Disabled agents get ✕ prefix
  const sourceIndicator = (cfg: import("../types.js").AgentConfig | undefined) => {
    const disabled = cfg?.enabled === false;
    if (cfg?.source === "project") return disabled ? "✕• " : "•  ";
    if (cfg?.source === "global") return disabled ? "✕◦ " : "◦  ";
    if (disabled) return "✕  ";
    return "   ";
  };

  const entries = allNames.map((name) => {
    const cfg = getAgentConfig(name);
    const disabled = cfg?.enabled === false;
    const model = getModelLabel(name, modelRegistry);
    const indicator = sourceIndicator(cfg);
    const prefix = `${indicator}${name} · ${model}`;
    const desc = disabled ? "(disabled)" : (cfg?.description ?? name);
    return { name, prefix, desc };
  });
  const maxPrefix = Math.max(...entries.map((e) => e.prefix.length));

  const hasCustom = allNames.some((n) => {
    const c = getAgentConfig(n);
    return c && !c.isDefault && c.enabled !== false;
  });
  const hasDisabled = allNames.some((n) => getAgentConfig(n)?.enabled === false);
  const legendParts: string[] = [];
  if (hasCustom) legendParts.push("• = project  ◦ = global");
  if (hasDisabled) legendParts.push("✕ = disabled");
  const legend = legendParts.length ? `\n${legendParts.join("  ")}` : "";

  const options = entries.map(({ prefix, desc }) => `${prefix.padEnd(maxPrefix)} — ${desc}`);
  if (legend) options.push(legend);

  const choice = await ctx.ui.select("Agent types", options);
  if (!choice) return;

  const agentName = choice
    .split(" · ")[0]
    .replace(/^[•◦✕\s]+/, "")
    .trim();
  if (getAgentConfig(agentName)) {
    const { showAgentDetail } = await import("./agent-detail.js");
    await showAgentDetail(ctx, agentName);
    await showAllAgentsList(ctx, modelRegistry);
  }
}

export async function showRunningAgents(
  ctx: ExtensionCommandContext,
  manager: AgentManager,
  agentActivity: Map<string, AgentActivity>,
): Promise<void> {
  const agents = manager.listAgents();
  if (agents.length === 0) {
    ctx.ui.notify("No agents.", "info");
    return;
  }

  const options = agents.map((a) => {
    const dn = getDisplayName(a.type);
    const dur = formatDuration(a.startedAt ?? 0, a.completedAt);
    return `${dn} (${a.description}) · ${a.toolUses} tools · ${a.status} · ${dur}`;
  });

  const choice = await ctx.ui.select("Running agents", options);
  if (!choice) return;

  // Find the selected agent by matching the option index
  const idx = options.indexOf(choice);
  if (idx < 0) return;
  const record = agents[idx];

  await viewAgentConversation(ctx, record, agentActivity);
  // Back-navigation: re-show the list
  await showRunningAgents(ctx, manager, agentActivity);
}
