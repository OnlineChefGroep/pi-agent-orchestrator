import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { getUiStyle } from "../agent-registry.js";
import type { AgentRecord } from "../types.js";
import { getLifetimeTotal } from "../usage.js";
import { describeActivity, formatDuration, formatTokens, formatTurns, getDisplayName } from "./agent-format.js";
import type { AgentActivity } from "./agent-ui-types.js";
import { getSpinnerFrame } from "./animation.js";
import { type BoxChars, borderLine, type DashboardTheme, framedRow, padVisible } from "./theme.js";

export type DashboardBody = {
  lines: string[];
  focusLineByAgentId: Map<string, number>;
};

export type DashboardRenderState = {
  agents: AgentRecord[];
  selectedIndex: number;
  selectedIds: Set<string>;
  frame: number;
  agentActivity: Map<string, AgentActivity>;
};

function statusIcon(rec: AgentRecord, frame: number): string {
  if (rec.status === "running") return getSpinnerFrame(frame);
  if (rec.status === "queued") return "◔";
  if (rec.status === "completed" || rec.status === "steered") return "✓";
  if (rec.status === "stopped") return "■";
  return "✗";
}

function statusColor(rec: AgentRecord, th: DashboardTheme): string {
  if (rec.status === "running") return th.accent;
  if (rec.status === "completed" || rec.status === "steered") return th.success;
  if (rec.status === "error" || rec.status === "aborted") return th.error;
  return th.dim;
}

function agentStats(rec: AgentRecord, activity?: AgentActivity): string {
  const parts: string[] = [];
  if (activity) parts.push(formatTurns(activity.turnCount, activity.maxTurns));
  if (activity?.lifetimeUsage) parts.push(formatTokens(getLifetimeTotal(activity.lifetimeUsage)));
  if (rec.toolUses > 0) parts.push(`${rec.toolUses} tool${rec.toolUses === 1 ? "" : "s"}`);
  parts.push(formatDuration(rec.startedAt, rec.completedAt));
  return parts.filter(Boolean).join(" · ");
}

function activityText(rec: AgentRecord, activity?: AgentActivity): string {
  if (activity && rec.status === "running") return describeActivity(activity.activeTools, activity.responseText);
  if (rec.result && (rec.status === "completed" || rec.status === "steered")) return rec.result.replace(/\n/g, " ").slice(0, 120);
  if (rec.error) return `Error: ${rec.error.slice(0, 100)}`;
  if (rec.status === "queued") return "waiting for an available slot";
  return rec.status;
}

export function renderDashboardHeader(width: number, th: DashboardTheme, box: BoxChars, state: DashboardRenderState): string[] {
  const innerW = Math.max(1, width - 4);
  const style = getUiStyle();
  const selected = state.selectedIds.size > 0 ? ` · ${state.selectedIds.size} selected` : "";
  const left = `${th.title}AGENT DASHBOARD${th.reset}`;
  const right = `${th.dim}${style} · ${state.agents.length} agents${selected}${th.reset}`;
  const gap = Math.max(1, innerW - visibleWidth(left) - visibleWidth(right));
  return [
    borderLine(width, th, box, "top"),
    framedRow(`${left}${" ".repeat(gap)}${right}`, innerW, th, box),
    borderLine(width, th, box, "mid"),
  ];
}

export function renderSectionTitle(label: string, count: string, innerW: number, th: DashboardTheme, box: BoxChars): string {
  const text = `${th.title}${label}${th.reset}`;
  const suffix = `${th.dim}${count}${th.reset}`;
  const fill = box.h.repeat(Math.max(2, innerW - visibleWidth(text) - visibleWidth(suffix) - 4));
  return `${text} ${th.border}${fill}${th.reset} ${suffix}`;
}

function renderRunningCard(rec: AgentRecord, innerW: number, th: DashboardTheme, box: BoxChars, state: DashboardRenderState): string[] {
  const cardW = Math.max(24, innerW - 4);
  const contentW = Math.max(1, cardW - 4);
  const activity = state.agentActivity.get(rec.id);
  const selected = state.agents[state.selectedIndex]?.id === rec.id;
  const checked = state.selectedIds.has(rec.id) ? `${th.success}✓ ${th.reset}` : "  ";
  const icon = `${statusColor(rec, th)}${statusIcon(rec, state.frame)}${th.reset}`;
  const name = `${th.title}${getDisplayName(rec.type)}${th.reset}`;
  const stats = `${th.dim}${agentStats(rec, activity)}${th.reset}`;
  const gap = Math.max(1, contentW - visibleWidth(`${checked}${icon}  ${name}`) - visibleWidth(stats));
  const focus = selected ? ` ${th.highlight}◀${th.reset}` : "";
  const top = `${th.border}${box.tl}${box.h.repeat(Math.max(0, cardW - 2))}${box.tr}${th.reset}${focus}`;
  const line1 = `${th.border}${box.l}${th.reset} ${truncateToWidth(padVisible(`${checked}${icon}  ${name}${" ".repeat(gap)}${stats}`, contentW), contentW)} ${th.border}${box.r}${th.reset}`;
  const description = rec.description || "(no description)";
  const line2 = `${th.border}${box.l}${th.reset} ${truncateToWidth(padVisible(`${th.muted}${description}${th.reset}`, contentW), contentW)} ${th.border}${box.r}${th.reset}`;
  const act = activityText(rec, activity);
  const line3 = `${th.border}${box.l}${th.reset} ${truncateToWidth(padVisible(`${th.dim}└ ${act}${th.reset}`, contentW), contentW)} ${th.border}${box.r}${th.reset}`;
  const bottom = `${th.border}${box.bl}${box.h.repeat(Math.max(0, cardW - 2))}${box.br}${th.reset}`;
  return [`  ${top}`, `  ${line1}`, `  ${line2}`, `  ${line3}`, `  ${bottom}`];
}

function renderCompactRow(rec: AgentRecord, innerW: number, th: DashboardTheme, state: DashboardRenderState): string {
  const activity = state.agentActivity.get(rec.id);
  const selected = state.agents[state.selectedIndex]?.id === rec.id;
  const checked = state.selectedIds.has(rec.id) ? `${th.success}✓${th.reset}` : " ";
  const pointer = selected ? `${th.highlight}▶${th.reset}` : " ";
  const icon = `${statusColor(rec, th)}${statusIcon(rec, state.frame)}${th.reset}`;
  const name = truncateToWidth(getDisplayName(rec.type), 18);
  const desc = truncateToWidth(rec.description || activityText(rec, activity), Math.max(12, innerW - 48));
  const stats = agentStats(rec, activity);
  return truncateToWidth(`${pointer}${checked} ${icon} ${th.title}${name}${th.reset}  ${th.muted}${desc}${th.reset} ${th.dim}· ${stats}${th.reset}`, innerW);
}

function renderSwarmSection(innerW: number, th: DashboardTheme, box: BoxChars, state: DashboardRenderState, focus: Map<string, number>, baseLine = 0): string[] {
  const grouped = new Map<string, AgentRecord[]>();
  for (const rec of state.agents) {
    if (!rec.swarmId) continue;
    const list = grouped.get(rec.swarmId) ?? [];
    list.push(rec);
    grouped.set(rec.swarmId, list);
  }
  if (grouped.size === 0) return [];

  const total = Array.from(grouped.values()).reduce((sum, list) => sum + list.length, 0);
  const lines = ["", renderSectionTitle("⌬ SWARMS", `${grouped.size} swarms · ${total} agents`, innerW, th, box)];
  for (const [swarmId, members] of grouped) {
    const cardW = Math.max(28, innerW - 2);
    const contentW = Math.max(1, cardW - 4);
    const mode = members[0]?.joinMode ?? "group";
    const header = ` ${swarmId} · ${mode} · ${members.length} agents `;
    const dash = box.h.repeat(Math.max(2, cardW - visibleWidth(header) - 2));
    lines.push(` ${th.border}${box.tl}${box.h}${th.reset}${th.highlight}${header}${th.reset}${th.border}${dash}${box.tr}${th.reset}`);
    for (const member of members) {
      focus.set(member.id, baseLine + lines.length);
      const activity = state.agentActivity.get(member.id);
      const selected = state.agents[state.selectedIndex]?.id === member.id;
      const prefix = selected ? `${th.highlight}▶${th.reset}` : " ";
      const checked = state.selectedIds.has(member.id) ? `${th.success}✓${th.reset}` : " ";
      const icon = `${statusColor(member, th)}${statusIcon(member, state.frame)}${th.reset}`;
      const name = truncateToWidth(getDisplayName(member.type), 16);
      const act = truncateToWidth(activityText(member, activity), Math.max(8, contentW - 38));
      const stats = agentStats(member, activity);
      lines.push(` ${th.border}${box.l}${th.reset} ${truncateToWidth(padVisible(`${prefix}${checked} ${icon} ${th.title}${name}${th.reset}  ${th.muted}${act}${th.reset} ${th.dim}${stats}${th.reset}`, contentW), contentW)} ${th.border}${box.r}${th.reset}`);
    }
    lines.push(` ${th.border}${box.bl}${box.h.repeat(Math.max(0, cardW - 2))}${box.br}${th.reset}`);
  }
  return lines;
}

function renderAgentSections(innerW: number, th: DashboardTheme, box: BoxChars, state: DashboardRenderState, focus: Map<string, number>, baseLine = 0): string[] {
  const solo = state.agents.filter(a => !a.swarmId);
  const running = solo.filter(a => a.status === "running");
  const queued = solo.filter(a => a.status === "queued");
  const done = solo.filter(a => a.status !== "running" && a.status !== "queued");
  const lines: string[] = [];
  const appendCompact = (label: string, records: AgentRecord[]) => {
    if (records.length === 0) return;
    lines.push("");
    lines.push(renderSectionTitle(label, `${records.length}`, innerW, th, box));
    for (const rec of records) {
      focus.set(rec.id, baseLine + lines.length);
      lines.push(`  ${renderCompactRow(rec, innerW - 2, th, state)}`);
    }
  };

  if (running.length > 0) {
    lines.push("");
    lines.push(renderSectionTitle("▶ RUNNING", `${running.length} active`, innerW, th, box));
    for (const rec of running) {
      focus.set(rec.id, baseLine + lines.length + 1);
      lines.push(...renderRunningCard(rec, innerW, th, box, state));
    }
  }
  appendCompact("◔ QUEUED", queued);
  appendCompact("✓ DONE", done);
  return lines;
}

export function buildDashboardBodyLines(innerW: number, th: DashboardTheme, box: BoxChars, state: DashboardRenderState): DashboardBody {
  const focusLineByAgentId = new Map<string, number>();
  const swarmLines = renderSwarmSection(innerW, th, box, state, focusLineByAgentId);
  const agentLines = renderAgentSections(innerW, th, box, state, focusLineByAgentId, swarmLines.length);
  return { lines: [...swarmLines, ...agentLines], focusLineByAgentId };
}

export function renderDashboardDetailPanel(width: number, th: DashboardTheme, box: BoxChars, state: DashboardRenderState): string[] {
  const innerW = Math.max(1, width - 4);
  const rec = state.agents[state.selectedIndex];
  const title = rec ? `DETAIL · ${getDisplayName(rec.type)}` : "DETAIL";
  const lines = [borderLine(width, th, box, "mid")];
  lines.push(framedRow(`${th.title}${title}${th.reset}`, innerW, th, box));
  if (!rec) {
    lines.push(framedRow(`${th.dim}No agent selected${th.reset}`, innerW, th, box));
    return lines;
  }

  const activity = state.agentActivity.get(rec.id);
  const meta: string[] = [rec.status, agentStats(rec, activity)];
  if (rec.worktree) meta.push(`worktree ${rec.worktree.branch}`);
  if (rec.groupId) meta.push(`group ${rec.groupId}`);
  if (rec.swarmId) {
    const count = state.agents.filter(a => a.swarmId === rec.swarmId).length;
    meta.push(`swarm ${rec.swarmId} (${count})`);
  }
  if (rec.joinMode) meta.push(`mode ${rec.joinMode}`);
  if (rec.validationResults) meta.push(rec.validated === false ? "validation FAILED" : "validation OK");
  if (rec.outputFile) meta.push("output file");
  lines.push(framedRow(`${th.dim}${meta.filter(Boolean).join(" · ")}${th.reset}`, innerW, th, box));
  lines.push(framedRow(`${th.muted}${activityText(rec, activity)}${th.reset}`, innerW, th, box));
  return lines;
}

export function renderDashboardFooter(width: number, th: DashboardTheme, box: BoxChars): string[] {
  const innerW = Math.max(1, width - 4);
  const footer = "↑↓/jk move · space select · enter view · s steer · Shift+K kill · p perms · w swarm · r refresh · ? help · q/esc close";
  return [
    framedRow(`${th.dim}${footer}${th.reset}`, innerW, th, box),
    borderLine(width, th, box, "bottom"),
  ];
}

export function renderDashboardHelp(innerW: number, th: DashboardTheme, box: BoxChars): string[] {
  const helpLines = [
    `${th.title}Keyboard Shortcuts${th.reset}`,
    "",
    "↑ / k                 Move selection up",
    "↓ / j                 Move selection down",
    "PageUp / Shift+↑      Page up",
    "PageDown / Shift+↓    Page down",
    "Home / End            Jump to first/last",
    "",
    "Enter                 View full conversation",
    "Space                 Toggle multi-select",
    "Shift+K               Kill selected (or current)",
    "s / S                 Steer selected agent",
    "p / P                 Show permissions & scope",
    "w / W                 Create swarm from selection",
    "r / R                 Force refresh",
    "?                     Toggle this help",
    "q / Esc               Close dashboard",
  ];
  return helpLines.map(h => framedRow(h ? `${th.dim}${h}${th.reset}` : "", innerW, th, box));
}

export function renderDashboardEmpty(innerW: number, th: DashboardTheme, box: BoxChars): string[] {
  return [
    framedRow("", innerW, th, box),
    framedRow(`${th.dim}No agents in this session. Spawn some with the Agent tool or /agents → Create.${th.reset}`, innerW, th, box),
    framedRow("", innerW, th, box),
  ];
}
