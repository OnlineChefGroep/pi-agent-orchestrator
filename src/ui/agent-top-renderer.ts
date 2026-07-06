/**
 * agent-top-renderer.ts — Shared live-agent-stats table renderer.
 *
 * Renders a top-like tabular view of agents with resource usage stats
 * (tokens, turns, tool uses, duration) and sortable columns.
 * Used by both /agents top (standalone) and the dashboard (press 't').
 */

import type { AgentRecord } from "../types.js";
import { getLifetimeTotal } from "../usage.js";
import { formatMs, formatTokens, formatTurns, getDisplayName } from "./agent-format.js";
import type { AgentActivity } from "./agent-ui-types.js";
import type { DashboardTheme } from "./theme.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type SortKey = "tokens" | "turns" | "duration" | "toolUses" | "name" | "lastSeen";

export interface AgentTopEntry {
  id: string;
  name: string;
  status: string;
  tokens: number;
  turns: number;
  toolUses: number;
  durationMs: number;
  lastSeenMs: number | undefined;
}

// ── Data extraction ───────────────────────────────────────────────────────────

export function getAgentTopEntries(agents: AgentRecord[], activity: Map<string, AgentActivity>): AgentTopEntry[] {
  const now = Date.now();
  return agents.map((r) => {
    const act = activity.get(r.id);
    const tokens = act
      ? getLifetimeTotal(act.lifetimeUsage)
      : (r.lifetimeUsage?.input ?? 0) + (r.lifetimeUsage?.output ?? 0);
    const turns = act?.turnCount ?? 0;
    const toolUses = act?.toolUses ?? r.toolUses;
    const durationMs = (r.completedAt ?? now) - (r.startedAt ?? now);
    return {
      id: r.id,
      name: getDisplayName(r.type),
      status: r.status,
      tokens,
      turns,
      toolUses,
      durationMs,
      lastSeenMs: act?.lastSeenMs,
    };
  });
}

export function sortEntries(entries: AgentTopEntry[], key: SortKey, asc: boolean): AgentTopEntry[] {
  return [...entries].sort((a, b) => {
    let cmp = 0;
    if (key === "name") cmp = a.name.localeCompare(b.name);
    else if (key === "tokens") cmp = a.tokens - b.tokens;
    else if (key === "turns") cmp = a.turns - b.turns;
    else if (key === "toolUses") cmp = a.toolUses - b.toolUses;
    else if (key === "duration") cmp = a.durationMs - b.durationMs;
    else if (key === "lastSeen") cmp = (a.lastSeenMs ?? 0) - (b.lastSeenMs ?? 0);
    return asc ? cmp : -cmp;
  });
}

// ── Theme adapter ─────────────────────────────────────────────────────────────

/**
 * DashboardTheme stores ANSI codes as strings (e.g. "\u001b[38;2;100;100;120m"),
 * not as functions. This adapter produces colored text by concatenating
 * the code + text + reset sequence — compatible with renderTopTable's fg/bold API.
 */
export function createTopThemeAdapter(th: DashboardTheme): {
  fg(color: string, text: string): string;
  bold(text: string): string;
} {
  return {
    fg(color: string, text: string): string {
      const code = (
        color === "title"
          ? th.title
          : color === "dim"
            ? th.dim
            : color === "muted"
              ? th.muted
              : color === "highlight"
                ? th.highlight
                : color === "accent"
                  ? th.accent
                  : color === "success"
                    ? th.success
                    : color === "error"
                      ? th.error
                      : color === "warning"
                        ? th.highlight
                        : color === "border"
                          ? th.border
                          : th.dim
      ) as string;
      return `${code}${text}${th.reset}`;
    },
    bold(text: string): string {
      return `${th.title}${text}${th.reset}`;
    },
  };
}

// ── Table rendering ───────────────────────────────────────────────────────────

function topStatusColor(status: string, fg: (c: string, t: string) => string): string {
  if (status === "running") return fg("accent", status);
  if (status === "queued") return fg("muted", status);
  if (status === "completed") return fg("success", status);
  if (status === "aborted") return fg("error", status);
  if (status === "steered") return fg("warning", status);
  return fg("dim", status);
}

/** Format lastSeenMs as a relative time string (e.g. "now", "5s", "2m", "1h"). */
function formatLastSeen(lastSeenMs: number | undefined): string {
  if (lastSeenMs === undefined) return "—";
  const secs = Math.floor((Date.now() - lastSeenMs) / 1000);
  if (secs < 5) return "now";
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/**
 * Render the agent top table as an array of display lines.
 *
 * @param entries          Agent entries to display
 * @param sortKey          Current sort column
 * @param sortAsc          Sort direction (true = ascending)
 * @param page             Current page (0-based)
 * @param pageSize         Rows per page
 * @param th               Dashboard theme (ANSI codes as strings)
 * @param width            Available terminal width
 * @param helpLine         Optional help line to append below the table (for dashboard inline mode)
 */
export function renderTopTable(
  entries: AgentTopEntry[],
  sortKey: SortKey,
  sortAsc: boolean,
  page: number,
  pageSize: number,
  th: DashboardTheme,
  width: number,
  helpLine?: string,
): string[] {
  const theme = createTopThemeAdapter(th);

  const headers = ["NAME", "STATUS", "TOKENS", "TURNS", "TOOLS", "DURATION", "LAST"];
  const colWidths = [18, 10, 10, 10, 10, 12, 7];
  const minW = colWidths.reduce((a, b) => a + b, 0) + 20;
  const w = Math.max(width, minW);

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const start = page * pageSize;
  const slice = entries.slice(start, start + pageSize);

  const lines: string[] = [];

  // Title line
  lines.push(
    `${theme.fg("title", theme.bold(" AGENT TOP "))}  ` +
      `${theme.fg("dim", `sorted by ${sortKey} ${sortAsc ? "↑" : "↓"}  page ${page + 1}/${totalPages}`)}` +
      (helpLine ? `  ${theme.fg("dim", helpLine)}` : ""),
  );

  // Column headers
  const renderHeaderCell = (label: string, colW: number) => {
    const key: string = label === "TOOLS" ? "toolUses" : label === "LAST" ? "lastSeen" : label.toLowerCase();
    const marker = sortKey === key ? "*" : "";
    return theme.fg("highlight", `${marker}${label}`.padEnd(colW));
  };
  lines.push(
    renderHeaderCell(headers[0], colWidths[0]) +
      " " +
      renderHeaderCell(headers[1], colWidths[1]) +
      " " +
      renderHeaderCell(headers[2], colWidths[2]) +
      " " +
      renderHeaderCell(headers[3], colWidths[3]) +
      " " +
      renderHeaderCell(headers[4], colWidths[4]) +
      " " +
      renderHeaderCell(headers[5], colWidths[5]) +
      " " +
      renderHeaderCell(headers[6], colWidths[6]),
  );

  // Divider
  lines.push(theme.fg("border", "─".repeat(w - 2)));

  if (entries.length === 0) {
    lines.push(theme.fg("muted", "  No agents to display"));
    return lines;
  }

  for (const e of slice) {
    const name =
      e.name.length > colWidths[0] - 2 ? `${e.name.slice(0, colWidths[0] - 2)}…` : e.name.padEnd(colWidths[0]);
    const status = topStatusColor(e.status, theme.fg).padEnd(colWidths[1]);
    const tokens = formatTokens(e.tokens).padStart(colWidths[2]);
    const turns = formatTurns(e.turns).padStart(colWidths[3]);
    const tools = `${e.toolUses}`.padStart(colWidths[4]);
    const dur = formatMs(e.durationMs).padStart(colWidths[5]);
    const last = formatLastSeen(e.lastSeenMs);
    // Color "now" / recent activity green, stale activity muted
    const lastColor = last === "now" ? "success" : last === "—" ? "dim" : "muted";
    lines.push(
      `${theme.fg("dim", "│")} ${theme.fg("accent", name)} ${theme.fg("dim", "|")} ` +
        `${status} ${theme.fg("dim", "|")} ` +
        `${theme.fg("muted", tokens)} ${theme.fg("dim", "|")} ` +
        `${theme.fg("muted", turns)} ${theme.fg("dim", "|")} ` +
        `${theme.fg("muted", tools)} ${theme.fg("dim", "|")} ` +
        `${theme.fg("dim", dur)} ${theme.fg("dim", "|")} ` +
        `${theme.fg(lastColor, last.padStart(colWidths[6]))}`,
    );
  }

  return lines;
}
