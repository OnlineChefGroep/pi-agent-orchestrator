/**
 * health-view.ts — TUI overlay for the `/agents → Health check` command.
 *
 * Renders a `HealthReport` as a read-only scrollable text buffer using
 * `ctx.ui.editor(...)`. The editor is the same primitive used by
 * "View execution tree" and the prompt-compression comparison view, so
 * the rendering cost is one offscreen buffer and keybindings come for
 * free (Esc/Enter to close).
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AgentManager } from "../agent-manager.js";
import { buildHealthReport, formatHealthReport, type HealthReport } from "../health-report.js";
import type { SubagentScheduler } from "../schedule.js";
import type { SettingsGetters } from "../settings.js";
import type { SwarmCoordinator } from "../swarm-join.js";

/**
 * Open the health-check overlay. Builds a fresh report (cheap) and
 * surfaces it as a read-only editor buffer. When the editor closes the
 * caller is free to re-open the menu.
 */
export async function showHealth(
  ctx: ExtensionCommandContext,
  deps: {
    manager: AgentManager;
    scheduler: SubagentScheduler;
    swarmJoin?: SwarmCoordinator | null;
    getters: SettingsGetters;
  },
): Promise<HealthReport> {
  const report = buildHealthReport(deps);
  const text = formatHealthReport(report);
  await ctx.ui.editor("Health check", text);
  return report;
}
