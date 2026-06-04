import { visibleWidth } from "@earendil-works/pi-tui";
import type { AgentManager } from "../../agent-manager.js";
import { type BoxChars, borderLine, type DashboardTheme, framedRow } from "../theme.js";
import { activityText, agentStats, getDisplayName } from "./helpers.js";
import { renderTurnProgress } from "./progress.js";
import type { DashboardRenderState } from "./types.js";

// ── Detail Panel ────────────────────────────────────────────────────────────

export function renderDashboardDetailPanel(
  width: number,
  th: DashboardTheme,
  box: BoxChars,
  state: DashboardRenderState,
  manager?: AgentManager,
): string[] {
  const innerW = Math.max(1, width - 4);
  const rec = state.agents[state.selectedIndex];
  const title = rec ? `◆ ${getDisplayName(rec.type)} · Details` : "◆ Details";
  const lines: string[] = [];
  lines.push(borderLine(width, th, box, "mid"));
  lines.push(framedRow(`${th.title}${title}${th.reset}`, innerW, th, box));
  if (!rec) {
    lines.push(framedRow(`${th.dim}No agent selected${th.reset}`, innerW, th, box));
    return lines;
  }

  const activity = state.agentActivity.get(rec.id);
  const statusStr = rec.status === "running" ? `${th.accent}● ${rec.status}${th.reset}`
    : rec.status === "completed" ? `${th.success}✓ ${rec.status}${th.reset}`
    : rec.status === "error" || rec.status === "aborted" ? `${th.error}✗ ${rec.status}${th.reset}`
    : `${th.dim}${rec.status}${th.reset}`;
  const metaLine1 = `${statusStr}  ${th.dim}${agentStats(rec, activity)}${th.reset}`;
  lines.push(framedRow(metaLine1, innerW, th, box));
  // Turn progress bar in detail panel
  if (activity?.maxTurns && rec.status === "running") {
    const progress = renderTurnProgress(activity.turnCount, activity.maxTurns, 20, th);
    lines.push(framedRow(`  ${progress}`, innerW, th, box));
  }

  const details: string[] = [];
  if (rec.description) details.push(`${th.muted}${rec.description}${th.reset}`);
  if (rec.worktree) details.push(`${th.dim}worktree: ${rec.worktree.branch}${th.reset}`);
  if (rec.swarmId) {
    const count = state.agents.filter(a => a.swarmId === rec.swarmId).length;
    details.push(`${th.dim}swarm: ${rec.swarmId} (${count} members)${th.reset}`);
  }
  if (rec.groupId) details.push(`${th.dim}group: ${rec.groupId}${th.reset}`);
  if (rec.joinMode) details.push(`${th.dim}mode: ${rec.joinMode}${th.reset}`);
  if (rec.validationResults) {
    details.push(rec.validated === false
      ? `${th.error}validation: FAILED${th.reset}`
      : `${th.success}validation: passed${th.reset}`);
  }
  if (rec.outputFile) details.push(`${th.dim}output: ${rec.outputFile}${th.reset}`);
  if (details.length > 0) {
    lines.push(framedRow(details.join(`  ${th.border}│${th.reset}  `), innerW, th, box));
  }

  // Session usage section
  if (manager) {
    const usage = manager.getSessionUsage();
    const maxAgents = manager.getSessionMaxSpawns();
    const maxTurns = manager.getSessionMaxTurns();

    if (maxAgents > 0 || maxTurns > 0) {
      const usageParts: string[] = [];
      if (maxAgents > 0) {
        const pct = Math.round((usage.spawnedAgents / maxAgents) * 100);
        const color = pct >= 90 ? th.error : pct >= 75 ? th.dim : th.accent;
        usageParts.push(`${color}⬡ agents: ${usage.spawnedAgents}/${maxAgents} (${pct}%)${th.reset}`);
      }
      if (maxTurns > 0) {
        const pct = Math.round((usage.totalTurns / maxTurns) * 100);
        const color = pct >= 90 ? th.error : pct >= 75 ? th.dim : th.dim;
        usageParts.push(`${color}⟳ turns: ${usage.totalTurns}/${maxTurns} (${pct}%)${th.reset}`);
      }
      if (usageParts.length > 0) {
        lines.push(framedRow(`${th.dim}session:  ${usageParts.join(`  ${th.border}│${th.reset}  `)}${th.reset}`, innerW, th, box));
      }
    }
  }

  const act = activityText(rec, activity);
  if (act) lines.push(framedRow(`${th.dim}└ ${act}${th.reset}`, innerW, th, box));
  return lines;
}

// ── Footer ──────────────────────────────────────────────────────────────────

export function renderDashboardFooter(
  width: number,
  th: DashboardTheme,
  box: BoxChars,
  agentActivity?: Map<string, { turnCount: number; lastSeenMs?: number }>,
): string[] {
  const innerW = Math.max(1, width - 4);
  const primary = "↑↓/jk navigate  ·  space select  ·  enter view  ·  s steer  ·  Shift+K kill";
  const secondary = "p perms  ·  w swarm  ·  r refresh  ·  ? help  ·  q/esc close";
  const both = `${primary}  ·  ${secondary}`;
  const footerText = both.length <= innerW ? both : primary;

  // Activity heatmap: show a compact bar of recent agent activity.
  // Each segment represents ~30 seconds of activity, colored by intensity.
  // Only shown when there is activity to visualize.
  const heatmapLines: string[] = [];
  if (agentActivity && agentActivity.size > 0) {
    const now = Date.now();
    const WINDOW_MS = 5 * 60_000; // 5-minute heatmap window
    const SEGMENT_MS = 30_000;    // each segment = 30 seconds
    const SEGMENT_COUNT = 12;     // show 12 segments (6 minutes total)

    const buckets = new Array(SEGMENT_COUNT).fill(0);
    let activeCount = 0;

    for (const [, act] of agentActivity) {
      if (!act.lastSeenMs) continue;
      const age = now - act.lastSeenMs;
      if (age > WINDOW_MS) continue;
      activeCount++;
      const bucketIdx = Math.min(SEGMENT_COUNT - 1, Math.floor((WINDOW_MS - age) / SEGMENT_MS));
      buckets[bucketIdx]++;
    }

    if (activeCount > 0) {
      const maxBucket = Math.max(1, ...buckets);
      // Unicode block chars for 4-level heat intensity
      const blocks = ["░", "▒", "▓", "█"];
      const heatBar = buckets.map((count) => {
        const level = count === 0 ? 0 : count < maxBucket * 0.33 ? 1 : count < maxBucket * 0.66 ? 2 : 3;
        return `${th.dim}${blocks[level]}${th.reset}`;
      }).join("");

      const activeLabel = `${th.accent}◉ ${activeCount} active${th.reset}`;
      const heatLabel = `${th.dim}heat:${th.reset} ${heatBar}`;
      const sep = "  ";
      const label = activeLabel + sep + heatLabel;
      heatmapLines.push(framedRow(label, innerW, th, box));
    }
  }

  return [
    borderLine(width, th, box, "mid"),
    ...heatmapLines,
    framedRow(`${th.dim}${footerText}${th.reset}`, innerW, th, box),
    borderLine(width, th, box, "bottom"),
  ];
}

// ── Help Screen ─────────────────────────────────────────────────────────────

export function renderDashboardHelp(
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
): string[] {
  const key = (k: string, desc: string) => {
    const pad = " ".repeat(Math.max(1, 22 - k.length));
    return `  ${th.highlight}${k}${th.reset}${th.dim}${pad}${desc}${th.reset}`;
  };
  const section = (label: string) => `  ${th.title}${label}${th.reset}`;
  const helpLines = [
    section("Navigation"),
    key("↑ / k", "Move selection up"),
    key("↓ / j", "Move selection down"),
    key("PgUp / Shift+↑", "Page up"),
    key("PgDn / Shift+↓", "Page down"),
    key("Home / End", "Jump to first/last"),
    "",
    section("Actions"),
    key("Enter", "View full conversation"),
    key("Space", "Toggle multi-select"),
    key("Shift+K", "Kill selected (or current)"),
    key("s", "Steer selected agent"),
    key("p", "Show permissions & scope"),
    key("w", "Create swarm from selection"),
    "",
    section("General"),
    key("r", "Force refresh"),
    key("?", "Toggle this help"),
    key("q / Esc", "Close dashboard"),
  ];
  return helpLines.map(h => framedRow(h ? h : "", innerW, th, box));
}

// ── Empty State ─────────────────────────────────────────────────────────────

export function renderDashboardEmpty(
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
): string[] {
  const icon = " ◈ ";
  const msg = "No agents in this session";
  const hint = "Spawn some with the Agent tool or /agents → Create";
  const iconPad = " ".repeat(Math.max(0, Math.floor((innerW - visibleWidth(icon + msg)) / 2)));
  const hintPad = " ".repeat(Math.max(0, Math.floor((innerW - visibleWidth(hint)) / 2)));
  return [
    framedRow("", innerW, th, box),
    framedRow("", innerW, th, box),
    framedRow(`${iconPad}${th.title}${icon}${msg}${th.reset}`, innerW, th, box),
    framedRow(`${hintPad}${th.dim}${hint}${th.reset}`, innerW, th, box),
    framedRow("", innerW, th, box),
    framedRow("", innerW, th, box),
  ];
}
