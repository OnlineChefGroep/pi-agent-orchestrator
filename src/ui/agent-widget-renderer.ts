import { truncateToWidth } from "@earendil-works/pi-tui";
import { getUiStyle } from "../agent-registry.js";
import type { AgentRecord } from "../types.js";
import { getLifetimeTotal, getSessionContextPercent } from "../usage.js";
import { describeActivity, formatMs, formatSessionTokens, formatTurns, getDisplayName, getPromptModeLabel } from "./agent-format.js";
import type { AgentActivity } from "./agent-ui-types.js";
import { getSpinnerFrame } from "./animation.js";
import { activeTheme, type Theme } from "./theme.js";

const MAX_WIDGET_LINES = 12;

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
};

function renderFinishedLine(a: AgentRecord, activity: AgentActivity | undefined, theme: Theme): string {
  const name = getDisplayName(a.type);
  const modeLabel = getPromptModeLabel(a.type);    const duration = formatMs(((a.completedAt ?? Date.now()) - (a.startedAt ?? 0)));
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
  const running = options.agents.filter(a => a.status === "running");
  const queued = options.agents.filter(a => a.status === "queued");
  const finished = options.agents.filter(a =>
    a.status !== "running" && a.status !== "queued" && a.completedAt
    && options.shouldShowFinished(a.id, a.status),
  );

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
  const truncate = (line: string) => truncateToWidth(line, w);
  const headingColor = hasActive ? "accent" : "dim";
  const frame = getSpinnerFrame(options.frame);

  const finishedLines: string[] = [];
  for (const a of finished) {
    finishedLines.push(truncate(`${theme.fg("dim", c_tree)} ${renderFinishedLine(a, options.agentActivity.get(a.id), theme)}`));
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
    const tokenText = tokens > 0 ? formatSessionTokens(tokens, contextPercent, theme, a.compactionCount) : "";

    const parts: string[] = [];
    if (bg) parts.push(formatTurns(bg.turnCount, bg.maxTurns));
    if (toolUses > 0) parts.push(`${toolUses} tool use${toolUses === 1 ? "" : "s"}`);
    if (tokenText) parts.push(tokenText);
    parts.push(elapsed);
    const statsText = parts.join(" · ");

    const activity = bg ? describeActivity(bg.activeTools, bg.responseText) : "thinking…";

    runningLines.push([
      truncate(`${theme.fg("dim", c_tree)} ${theme.fg("accent", frame)} ${theme.bold(name)}${modeTag}  ${theme.fg("muted", a.description)} ${theme.fg("dim", "·")} ${theme.fg("dim", statsText)}`),
      truncate(theme.fg("dim", c_bar) + theme.fg("dim", `${c_ind}${activity}`)),
    ]);
  }

  const queuedLine = queued.length > 0
    ? truncate(`${theme.fg("dim", c_tree)} ${theme.fg("muted", "◦")} ${theme.fg("dim", `${queued.length} queued`)}`)
    : undefined;

  const maxBody = MAX_WIDGET_LINES - 1;
  const totalBody = finishedLines.length + runningLines.length * 2 + (queuedLine ? 1 : 0);
  const lines: string[] = [truncate(`${theme.fg(headingColor, headingIcon)} ${theme.fg(headingColor, "Agents")}`)];

  if (totalBody <= maxBody) {
    lines.push(...finishedLines);
    for (const pair of runningLines) lines.push(...pair);
    if (queuedLine) lines.push(queuedLine);

    if (lines.length > 1) {
      const last = lines.length - 1;
      lines[last] = lines[last].replace(c_tree, c_angle);
      if (runningLines.length > 0 && !queuedLine && last >= 2) {
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

    if (queuedLine && budget >= 1) {
      lines.push(queuedLine);
      budget--;
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

  return lines;
}
