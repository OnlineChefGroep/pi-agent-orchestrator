/**
 * notification-renderer.ts — Custom renderer for subagent completion handoffs.
 */

import type { NotificationDetails } from "../types.js";
import { formatMs, formatTokens, formatTurns } from "./agent-format.js";
import { getTimeSpinnerFrameForRole } from "./animation.js";
import { Text } from "./tui-shim.js";

interface NotificationTheme {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

function renderOne(details: NotificationDetails, expanded: boolean, theme: NotificationTheme): string {
  const isError = details.status === "error" || details.status === "stopped" || details.status === "aborted";
  const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
  const statusText = isError
    ? details.status
    : details.status === "steered"
      ? "completed (steered)"
      : "completed";
  const validationIcon = details.validated === undefined
    ? ""
    : details.validated
      ? theme.fg("success", " ✅")
      : theme.fg("error", " ❌");

  let line = `${icon} ${theme.bold(details.description)}${validationIcon} ${theme.fg("dim", statusText)}`;

  const stats: string[] = [];
  if (details.turnCount > 0) stats.push(formatTurns(details.turnCount, details.maxTurns));
  if (details.toolUses > 0) stats.push(`${details.toolUses} tool use${details.toolUses === 1 ? "" : "s"}`);
  if (details.totalTokens > 0) stats.push(formatTokens(details.totalTokens));
  if (details.durationMs > 0) stats.push(formatMs(details.durationMs));
  if (stats.length > 0) line += `\n  ${stats.map((part) => theme.fg("dim", part)).join(` ${theme.fg("dim", "·")} `)}`;

  const handoffGlyph = getTimeSpinnerFrameForRole("handoff", details.id, Date.now(), 180) || "⎿";
  if (expanded) {
    const resultLines = details.resultPreview.split("\n").slice(0, 30);
    line += resultLines.map((resultLine, index) =>
      `\n${theme.fg(index === 0 ? "accent" : "dim", `  ${index === 0 ? `${handoffGlyph} ` : "  "}${resultLine}`)}`,
    ).join("");
  } else {
    const preview = details.resultPreview.split("\n")[0]?.slice(0, 80) ?? "";
    line += `\n  ${theme.fg("dim", `${handoffGlyph}  ${preview}`)}`;
  }

  if (details.outputFile) line += `\n  ${theme.fg("muted", `transcript: ${details.outputFile}`)}`;
  return line;
}

export function createNotificationRenderer(theme: NotificationTheme) {
  return (message: { details?: NotificationDetails }, { expanded }: { expanded: boolean }) => {
    const details = message.details;
    if (!details) return undefined;
    const all = [details, ...(details.others ?? [])];
    return new Text(all.map((item) => renderOne(item, expanded, theme)).join("\n"), 0, 0);
  };
}
