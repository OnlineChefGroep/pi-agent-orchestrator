import { getUiStyle } from "../agent-registry.js";
import type { AgentRecord } from "../types.js";
import { getLifetimeTotal, getSessionContextPercent } from "../usage.js";
import { describeActivity, formatMs, formatSessionTokens, formatTurns, getDisplayName, getPromptModeLabel } from "./agent-format.js";
import type { AgentActivity } from "./agent-ui-types.js";
import { getSpinnerFrame } from "./animation.js";
import { activeTheme, fastTruncate, type Theme } from "./theme.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_WIDGET_LINES = 12;

/** Compact batch rendering: agents with the same type+status are grouped when count exceeds this. */
const BATCH_COMPACT_THRESHOLD = 3;

/** Minimum batch size for showing a compact summary line (uses `BATCH_COMPACT_THRESHOLD`). */

export const ERROR_STATUSES = new Set(["error", "aborted", "steered", "stopped"]);

type WidgetTuiLike = {
  terminal: {
    columns: number;
  };
};

type RenderAgentWidgetOptions = {
  agents: AgentRecord[];
  agentActivity: Map<string, AgentActivity>;
  frame: number;
  shouldShowFinished(agentId: string, status: string): boolean;
  theme: Theme;
  tui: WidgetTuiLike;
  /** Current page index for pagination heading (0 = first page). */
  pageIndex?: number;
  /** Total page count for pagination heading. */
  pageCount?: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format elapsed seconds as tokens/sec burn rate (e.g. "2.3K/s"). */
function formatBurnRate(tokens: number, elapsedMs: number, theme: Theme): string {
  const secs = elapsedMs / 1000;
  if (secs < 1) return "";
  const rate = tokens / secs;
  if (rate >= 1_000_000) return theme.fg("error", `${(rate / 1_000_000).toFixed(1)}M/s`);
  if (rate >= 1_000) return theme.fg("warning", `${(rate / 1_000).toFixed(1)}K/s`);
  return theme.fg("dim", `${rate.toFixed(0)}/s`);
}

/** Format lastSeenMs as a relative time string (e.g. "now", "5s", "2m"). */
function formatLastSeen(lastSeenMs: number | undefined, theme: Theme): string {
  if (lastSeenMs === undefined) return "";
  const secs = Math.floor((Date.now() - lastSeenMs) / 1000);
  if (secs < 5) return theme.fg("success", "now");
  if (secs < 60) return theme.fg("muted", `${secs}s`);
  const mins = Math.floor(secs / 60);
  if (mins < 60) return theme.fg("muted", `${mins}m`);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return theme.fg("dim", `${hrs}h`);
  return theme.fg("dim", `${Math.floor(hrs / 24)}d`);
}

/**
 * Render a compact activity heatmap of recent agent activity.
 * Shows 10 segments (each = 30 seconds, 5-minute window) with Unicode block intensity.
 */
function renderActivityHeatmap(
  agentActivity: Map<string, AgentActivity>,
  theme: Theme,
  availableWidth: number,
): string | undefined {
  if (agentActivity.size === 0) return undefined;

  const now = Date.now();
  const WINDOW_MS = 5 * 60_000;
  const SEGMENT_MS = 30_000;
  const SEGMENT_COUNT = 10;

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

  if (activeCount === 0) return undefined;

  const maxBucket = Math.max(1, ...buckets);
  const blocks = ["░", "▒", "▓", "█"];
  const heatBar = buckets.map((count) => {
    const level = count === 0 ? 0 : count < maxBucket * 0.33 ? 1 : count < maxBucket * 0.66 ? 2 : 3;
    return blocks[level];
  }).join("");

  const label = `${theme.fg("dim", "heat:")} ${heatBar}  ${theme.fg("accent", `◉ ${activeCount} active`)}`;

  // Truncate if needed
  const w = availableWidth;
  if (label.length > w) {
    const heatOnly = `${theme.fg("dim", "heat:")} ${heatBar}`;
    const extra = activeCount > 1 ? ` +${activeCount - 1}` : "";
    const compact = `${heatOnly}  ${theme.fg("accent", `◉ ${activeCount}`)}${extra}`;
    return compact.length > w ? `${compact.slice(0, w - 1)}…` : compact;
  }

  return label;
}

function renderFinishedLine(a: AgentRecord, activity: AgentActivity | undefined, theme: Theme): string {
  const name = getDisplayName(a.type);
  const modeLabel = getPromptModeLabel(a.type);
  const duration = formatMs(((a.completedAt ?? Date.now()) - (a.startedAt ?? 0)));
  const activeUiStyle = getUiStyle();

  let icon: string;
  let statusText: string;
  if (a.status === "completed") {
    icon = theme.fg("success", "✓");
    statusText = "";
  } else if (a.status === "steered") {
    icon = theme.fg("warning", "✓");
    statusText = theme.fg("warning", " (turn limit)");
  } else if (a.status === "stopped") {
    icon = theme.fg("dim", "■");
    statusText = theme.fg("dim", " stopped");
  } else if (a.status === "error") {
    icon = theme.fg("error", "✗");
    const errMsg = a.error ? `: ${a.error.slice(0, 60)}` : "";
    statusText = theme.fg("error", ` error${errMsg}`);
  } else {
    icon = theme.fg("error", "✗");
    statusText = theme.fg("warning", " aborted");
  }

  const parts: string[] = [];
  if (activity) parts.push(formatTurns(activity.turnCount, activity.maxTurns));
  if (a.toolUses > 0) parts.push(`${a.toolUses} tool use${a.toolUses === 1 ? "" : "s"}`);
  parts.push(duration);

  const modeTag = modeLabel ? ` ${theme.fg("dim", `(${modeLabel})`)}` : "";
  const validationIcon = a.validationResults
    ? a.validated
      ? ` ${theme.fg("success", activeUiStyle === "plain" ? "✓" : "✅")}`
      : ` ${theme.fg("error", activeUiStyle === "plain" ? "✗" : "❌")}`
    : "";
  return `${icon} ${theme.fg("dim", name)}${validationIcon}${modeTag}  ${theme.fg("dim", a.description)} ${theme.fg("dim", "·")} ${theme.fg("dim", parts.join(" · "))}${statusText}`;
}

export function renderAgentWidget(options: RenderAgentWidgetOptions): string[] {
  const running: AgentRecord[] = [];
  const queued: AgentRecord[] = [];
  const finished: AgentRecord[] = [];
  for (let i = 0; i < options.agents.length; i++) {
    const a = options.agents[i];
    if (a.status === "running") running.push(a);
    else if (a.status === "queued") queued.push(a);
    else if (a.completedAt && options.shouldShowFinished(a.id, a.status)) finished.push(a);
  }

  const hasActive = running.length > 0 || queued.length > 0;
  const hasFinished = finished.length > 0;
  if (!hasActive && !hasFinished) return [];

  const activeUiStyle = getUiStyle();
  const theme = activeTheme(options.theme);

  let c_tree = "├──";
  let c_angle = "╰──";
  let c_bar = "│  ";
  let c_ind = "  ⎿  ";
  let headingIcon = hasActive ? "●" : "○";

  if (activeUiStyle === "retro") {
    c_tree = "|--";
    c_angle = "`--";
    c_bar = "|  ";
    c_ind = "  `--";
  } else if (activeUiStyle === "plain") {
    c_tree = "- ";
    c_angle = "- ";
    c_bar = "  ";
    c_ind = "  - ";
    headingIcon = "*";
  }

  const w = options.tui.terminal.columns;
  const truncate = (line: string) => fastTruncate(line, w);
  const headingColor = hasActive ? "accent" : "dim";
  const frame = getSpinnerFrame(options.frame);

  const finishedLines: string[] = [];
  for (const a of finished) {
    finishedLines.push(truncate(`${theme.fg("dim", c_tree)} ${renderFinishedLine(a, options.agentActivity.get(a.id), theme)}`));
  }

  // ── Compact batch rendering ──
  // Group queued agents by type for compact display (e.g. "5× Explore agents queued").
  const queuedByType = new Map<string, { type: string; name: string; count: number }>();
  for (const a of queued) {
    const key = a.type;
    const existing = queuedByType.get(key);
    if (existing) {
      existing.count++;
    } else {
      queuedByType.set(key, { type: key, name: getDisplayName(key), count: 1 });
    }
  }

  // Show compact queued line(s): "5× Explore" for large batches, individual for small.
  // Two-pass: first push compact lines for large groups, then a single O(N) pass
  // for individual lines (was O(K×N) with an inner `for` loop per unique type).
  const queuedLines: string[] = [];
  for (const [, group] of queuedByType) {
    if (group.count >= BATCH_COMPACT_THRESHOLD) {
      queuedLines.push(
        truncate(`${theme.fg("dim", c_tree)} ${theme.fg("muted", "◦")} ${theme.fg("accent", `${group.count}× ${group.name}`)} ${theme.fg("dim", "queued")}`),
      );
    }
  }
  for (const a of queued) {
    const group = queuedByType.get(a.type);
    if (!group || group.count >= BATCH_COMPACT_THRESHOLD) continue; // already rendered as compact
    queuedLines.push(
      truncate(`${theme.fg("dim", c_tree)} ${theme.fg("muted", "◦")} ${theme.fg("dim", group.name)}  ${theme.fg("muted", a.description)}`),
    );
  }

  const runningLines: string[][] = [];
  for (const a of running) {
    const name = getDisplayName(a.type);
    const modeLabel = getPromptModeLabel(a.type);
    const modeTag = modeLabel ? ` ${theme.fg("dim", `(${modeLabel})`)}` : "";
    const elapsed = formatMs(Date.now() - (a.startedAt ?? 0));

    const bg = options.agentActivity.get(a.id);
    const toolUses = bg?.toolUses ?? a.toolUses;
    const tokens = getLifetimeTotal(bg?.lifetimeUsage);
    const contextPercent = getSessionContextPercent(bg?.session);
    const elapsedMs = Date.now() - (a.startedAt ?? 0);
    const tokenText = tokens > 0 ? formatSessionTokens(tokens, contextPercent, theme, a.compactionCount) : "";
    const burnRate = tokens > 0 ? formatBurnRate(tokens, elapsedMs, theme) : "";
    const lastSeen = bg?.lastSeenMs !== undefined ? formatLastSeen(bg.lastSeenMs, theme) : "";

    const parts: string[] = [];
    if (bg) parts.push(formatTurns(bg.turnCount, bg.maxTurns));
    if (toolUses > 0) parts.push(`${toolUses} tool`);
    if (tokenText) parts.push(tokenText);
    if (burnRate) parts.push(burnRate);
    if (lastSeen) parts.push(lastSeen);
    parts.push(elapsed);
    const statsText = parts.join(" · ");

    // Thinking level indicator
    const thinkingLabel = a.invocation?.thinking
      ? ` ${theme.fg("dim", `🧠${a.invocation.thinking}`)}`
      : "";

    const activity = bg ? describeActivity(bg.activeTools, bg.responseText) : "thinking…";

    runningLines.push([
      truncate(`${theme.fg("dim", c_tree)} ${theme.fg("accent", frame)} ${theme.bold(name)}${modeTag}${thinkingLabel}  ${theme.fg("muted", a.description)} ${theme.fg("dim", "·")} ${theme.fg("dim", statsText)}`),
      truncate(theme.fg("dim", c_bar) + theme.fg("dim", `${c_ind}${activity}`)),
    ]);
  }

  // Activity heatmap: shown when there are active (running/queued) agents
  const heatLine = hasActive
    ? renderActivityHeatmap(options.agentActivity, theme, w)
    : undefined;

  const totalQueuedLines = queuedLines.length;

  // ── Safety cap: prevent runaway memory in pathological cases ──
  if (finishedLines.length > 100) finishedLines.length = 100;
  if (runningLines.length > 50) runningLines.length = 50;
  if (queuedLines.length > 50) queuedLines.length = 50;

  const pageIndex = options.pageIndex ?? 0;
  const pageCount = options.pageCount ?? 1;

  // ── Build heading with optional page indicator ──
  const lines: string[] = [];
  if (heatLine) {
    lines.push(truncate(heatLine));
  } else if (pageCount > 1) {
    lines.push(truncate(
      `${theme.fg(headingColor, headingIcon)} ${theme.fg(headingColor, "Agents")}  ${theme.fg("dim", `[${pageIndex + 1}/${pageCount}]`)}`,
    ));
  } else {
    lines.push(truncate(`${theme.fg(headingColor, headingIcon)} ${theme.fg(headingColor, "Agents")}`));
  }

  const maxBody = MAX_WIDGET_LINES - (heatLine ? 1 : 0);
  const totalBody = finishedLines.length + runningLines.length * 2 + totalQueuedLines;

  if (totalBody <= maxBody) {
    lines.push(...finishedLines);
    for (const pair of runningLines) lines.push(...pair);
    for (const ql of queuedLines) lines.push(ql);

    if (lines.length > 1) {
      const last = lines.length - 1;
      lines[last] = lines[last].replace(c_tree, c_angle);
      if (runningLines.length > 0 && totalQueuedLines === 0 && last >= 2) {
        lines[last - 1] = lines[last - 1].replace(c_tree, c_angle);
        lines[last] = lines[last].replace(c_bar, " ".repeat(c_bar.length));
      }
    }
  } else {
    let budget = maxBody - 1;
    let hiddenRunning = 0;
    let hiddenFinished = 0;

    for (const pair of runningLines) {
      if (budget >= 2) {
        lines.push(...pair);
        budget -= 2;
      } else {
        hiddenRunning++;
      }
    }

    for (const ql of queuedLines) {
      if (budget >= 1) {
        lines.push(ql);
        budget--;
      }
    }

    for (const fl of finishedLines) {
      if (budget >= 1) {
        lines.push(fl);
        budget--;
      } else {
        hiddenFinished++;
      }
    }

    const overflowParts: string[] = [];
    if (hiddenRunning > 0) overflowParts.push(`${hiddenRunning} running`);
    if (hiddenFinished > 0) overflowParts.push(`${hiddenFinished} finished`);
    const overflowText = overflowParts.join(", ");
    lines.push(truncate(`${theme.fg("dim", c_angle)} ${theme.fg("dim", `+${hiddenRunning + hiddenFinished} more (${overflowText})`)}`));
  }

  // ── Scroll hint: show when there are multiple pages ──
  if (pageCount > 1 && lines.length < MAX_WIDGET_LINES) {
    const hasPrev = pageIndex > 0;
    const hasNext = pageIndex < pageCount - 1;
    const hint = hasPrev && hasNext
      ? `${theme.fg("dim", "↑↓ scroll for more")}`
      : hasPrev
        ? `${theme.fg("dim", "↑ scroll up")}`
        : `${theme.fg("dim", "↓ scroll down")}`;
    lines.push(truncate(`${theme.fg("dim", c_angle)} ${hint}`));
  }

  return lines;
}