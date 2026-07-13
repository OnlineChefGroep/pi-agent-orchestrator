/** Live, responsive top-like resource view for orchestrated agents. */
import type { AgentRecord } from "../types.js";
import { getLifetimeTotal } from "../usage.js";
import { formatMs, formatTokens, formatTurns, getDisplayName } from "./agent-format.js";
import type { AgentActivity } from "./agent-ui-types.js";
import { ANIMATION_INTERVAL, getAgentSpinnerFrame } from "./animation.js";
import { type DashboardTheme, fastTruncate, padAndTruncate } from "./theme.js";
import { visibleWidth } from "./tui-shim.js";

export type SortKey = "tokens" | "turns" | "duration" | "toolUses" | "name" | "lastSeen";

export interface AgentTopEntry {
  id: string;
  type: string;
  name: string;
  status: string;
  tokens: number;
  turns: number;
  toolUses: number;
  durationMs: number;
  lastSeenMs: number | undefined;
}

type TopTheme = ReturnType<typeof createTopThemeAdapter>;
type ColumnKey = "name" | "status" | "tokens" | "turns" | "toolUses" | "duration" | "lastSeen" | "load";
type TopColumn = { key: ColumnKey; label: string; width: number; align: "left" | "right" };

export function getAgentTopEntries(
  agents: AgentRecord[],
  activity: Map<string, AgentActivity>,
): AgentTopEntry[] {
  const now = Date.now();
  return agents.map((record) => {
    const agentActivity = activity.get(record.id);
    const tokens = agentActivity
      ? getLifetimeTotal(agentActivity.lifetimeUsage)
      : (record.lifetimeUsage?.input ?? 0) + (record.lifetimeUsage?.output ?? 0);
    return {
      id: record.id,
      type: record.type,
      name: getDisplayName(record.type),
      status: record.status,
      tokens,
      turns: agentActivity?.turnCount ?? 0,
      toolUses: agentActivity?.toolUses ?? record.toolUses,
      durationMs: (record.completedAt ?? now) - (record.startedAt ?? now),
      lastSeenMs: agentActivity?.lastSeenMs,
    };
  });
}

export function sortEntries(entries: AgentTopEntry[], key: SortKey, asc: boolean): AgentTopEntry[] {
  return [...entries].sort((left, right) => {
    let comparison = 0;
    if (key === "name") comparison = left.name.localeCompare(right.name);
    else if (key === "tokens") comparison = left.tokens - right.tokens;
    else if (key === "turns") comparison = left.turns - right.turns;
    else if (key === "toolUses") comparison = left.toolUses - right.toolUses;
    else if (key === "duration") comparison = left.durationMs - right.durationMs;
    else comparison = (left.lastSeenMs ?? 0) - (right.lastSeenMs ?? 0);
    return asc ? comparison : -comparison;
  });
}

export function createTopThemeAdapter(th: DashboardTheme): {
  fg(color: string, text: string): string;
  bold(text: string): string;
} {
  return {
    fg(color: string, text: string): string {
      const code = color === "title" ? th.title
        : color === "dim" ? th.dim
        : color === "muted" ? th.muted
        : color === "highlight" ? th.highlight
        : color === "accent" ? th.accent
        : color === "success" ? th.success
        : color === "error" ? th.error
        : color === "warning" ? th.highlight
        : color === "border" ? th.border
        : th.dim;
      return `${code}${text}${th.reset}`;
    },
    bold(text: string): string {
      return `${th.title}${text}${th.reset}`;
    },
  };
}

function formatLastSeen(lastSeenMs: number | undefined): string {
  if (lastSeenMs === undefined) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - lastSeenMs) / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function statusText(entry: AgentTopEntry, theme: TopTheme): string {
  const frame = Math.floor(Date.now() / ANIMATION_INTERVAL);
  const withGlyph = (glyph: string, label: string): string => glyph ? `${glyph} ${label}` : label;
  if (entry.status === "running") {
    return theme.fg("accent", withGlyph(getAgentSpinnerFrame(entry.id, frame, "agent", entry.type), "RUN"));
  }
  if (entry.status === "queued") {
    return theme.fg("warning", withGlyph(getAgentSpinnerFrame(entry.id, frame, "queue", entry.type), "QUEUE"));
  }
  if (entry.status === "completed") return theme.fg("success", "✓ DONE");
  if (entry.status === "steered") return theme.fg("warning", "↳ STEER");
  if (entry.status === "aborted" || entry.status === "error") return theme.fg("error", "✕ FAIL");
  return theme.fg("dim", `■ ${entry.status.toUpperCase()}`);
}

function buildColumns(width: number): TopColumn[] {
  const columns: TopColumn[] = [
    { key: "name", label: "AGENT", width: 20, align: "left" },
    { key: "status", label: "STATE", width: 10, align: "left" },
    { key: "tokens", label: "TOKENS", width: 10, align: "right" },
    { key: "turns", label: "TURNS", width: 9, align: "right" },
    { key: "toolUses", label: "TOOLS", width: 8, align: "right" },
    { key: "duration", label: "RUNTIME", width: 11, align: "right" },
    { key: "lastSeen", label: "SEEN", width: 7, align: "right" },
    { key: "load", label: "LOAD", width: 8, align: "left" },
  ];

  if (width < 102) columns.splice(columns.findIndex((column) => column.key === "load"), 1);
  if (width < 92) columns.splice(columns.findIndex((column) => column.key === "lastSeen"), 1);
  if (width < 78) columns.splice(columns.findIndex((column) => column.key === "toolUses"), 1);
  if (width < 68) columns.splice(columns.findIndex((column) => column.key === "turns"), 1);

  const separators = Math.max(0, columns.length - 1) * 3;
  const fixedWidth = columns.reduce((sum, column) => sum + (column.key === "name" ? 0 : column.width), 0);
  const nameColumn = columns.find((column) => column.key === "name");
  if (nameColumn) nameColumn.width = Math.max(12, width - fixedWidth - separators - 2);
  return columns;
}

function columnSortKey(key: ColumnKey): SortKey | undefined {
  if (key === "toolUses") return "toolUses";
  if (key === "lastSeen") return "lastSeen";
  if (key === "duration") return "duration";
  if (key === "name" || key === "tokens" || key === "turns") return key;
  return undefined;
}

function renderCell(content: string, column: TopColumn): string {
  const truncated = fastTruncate(content, column.width);
  if (column.align === "right") {
    return `${" ".repeat(Math.max(0, column.width - visibleWidth(truncated)))}${truncated}`;
  }
  return padAndTruncate(truncated, column.width);
}

function renderLoadBar(tokens: number, maximum: number, theme: TopTheme): string {
  const width = 6;
  const filled = maximum <= 0 ? 0 : Math.max(0, Math.min(width, Math.round((tokens / maximum) * width)));
  return `${theme.fg("accent", "■".repeat(filled))}${theme.fg("dim", "·".repeat(width - filled))}`;
}

function renderSummary(entries: AgentTopEntry[], theme: TopTheme): string {
  let running = 0;
  let queued = 0;
  let totalTokens = 0;
  let totalTurns = 0;
  let totalTools = 0;
  for (const entry of entries) {
    if (entry.status === "running") running++;
    else if (entry.status === "queued") queued++;
    totalTokens += entry.tokens;
    totalTurns += entry.turns;
    totalTools += entry.toolUses;
  }
  return [
    theme.fg("accent", `${running} active`),
    theme.fg("warning", `${queued} queued`),
    theme.fg("muted", `${formatTokens(totalTokens)} tokens`),
    theme.fg("muted", `${totalTurns} turns`),
    theme.fg("muted", `${totalTools} tools`),
  ].join(` ${theme.fg("border", "│")} `);
}

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
  const safeWidth = Math.max(60, width - 2);
  const columns = buildColumns(safeWidth);
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(entries.length / safePageSize));
  const currentPage = Math.max(0, Math.min(page, totalPages - 1));
  const start = currentPage * safePageSize;
  const slice = entries.slice(start, start + safePageSize);
  const maximumTokens = Math.max(0, ...entries.map((entry) => entry.tokens));
  const direction = sortAsc ? "↑" : "↓";
  const lines: string[] = [];

  lines.push(
    `${theme.fg("title", theme.bold(" AGENT TOP "))}  ${theme.fg("dim", `sort ${sortKey} ${direction} · page ${currentPage + 1}/${totalPages}`)}` +
    (helpLine ? `  ${theme.fg("dim", helpLine)}` : ""),
  );
  lines.push(` ${renderSummary(entries, theme)}`);

  const header = columns.map((column) => {
    const mappedSortKey = columnSortKey(column.key);
    const marker = mappedSortKey === sortKey ? direction : " ";
    return renderCell(theme.fg(mappedSortKey === sortKey ? "highlight" : "muted", `${marker}${column.label}`), column);
  }).join(` ${theme.fg("border", "│")} `);
  lines.push(header);
  lines.push(theme.fg("border", "─".repeat(safeWidth - 2)));

  if (entries.length === 0) {
    lines.push(theme.fg("muted", "  No agents have entered this session yet."));
    return lines;
  }

  for (const entry of slice) {
    const cells = columns.map((column) => {
      if (column.key === "name") return renderCell(theme.fg("accent", entry.name), column);
      if (column.key === "status") return renderCell(statusText(entry, theme), column);
      if (column.key === "tokens") return renderCell(theme.fg("muted", formatTokens(entry.tokens)), column);
      if (column.key === "turns") return renderCell(theme.fg("muted", formatTurns(entry.turns)), column);
      if (column.key === "toolUses") return renderCell(theme.fg("muted", `${entry.toolUses}`), column);
      if (column.key === "duration") return renderCell(theme.fg("dim", formatMs(entry.durationMs)), column);
      if (column.key === "lastSeen") {
        const lastSeen = formatLastSeen(entry.lastSeenMs);
        const color = lastSeen === "now" ? "success" : lastSeen === "—" ? "dim" : "muted";
        return renderCell(theme.fg(color, lastSeen), column);
      }
      return renderCell(renderLoadBar(entry.tokens, maximumTokens, theme), column);
    });
    lines.push(cells.join(` ${theme.fg("border", "│")} `));
  }

  return lines;
}
