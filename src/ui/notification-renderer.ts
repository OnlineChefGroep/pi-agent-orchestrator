/**
 * notification-renderer.ts — Custom message renderer for subagent-completion notifications.
 *
 * Formatted as Claude Code-style task notifications with icon, stats,
 * result preview and output-file links.
 */

import type { NotificationDetails } from "../types.js";
import { formatMs, formatTokens, formatTurns } from "./agent-format.js";
import { Text } from "./tui-shim.js";

/** Build a single notification line from NotificationDetails. */
function renderOne(d: NotificationDetails, expanded: boolean, theme: any): string {
  const isError = d.status === "error" || d.status === "stopped" || d.status === "aborted";
  const icon = isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
  const statusText = isError
    ? d.status
    : d.status === "steered"
      ? "completed (steered)"
      : "completed";
  const validationIcon = d.validated === undefined
    ? ""
    : (d.validated ? theme.fg("success", " ✅") : theme.fg("error", " ❌"));

  // Line 1: icon + agent description + validation + status
  let line = `${icon} ${theme.bold(d.description)}${validationIcon} ${theme.fg("dim", statusText)}`;

  // Line 2: stats
  const parts: string[] = [];
  if (d.turnCount > 0) parts.push(formatTurns(d.turnCount, d.maxTurns));
  if (d.toolUses > 0) parts.push(`${d.toolUses} tool use${d.toolUses === 1 ? "" : "s"}`);
  if (d.totalTokens > 0) parts.push(formatTokens(d.totalTokens));
  if (d.durationMs > 0) parts.push(formatMs(d.durationMs));
  if (parts.length) {
    line += `\n  ${parts.map(p => theme.fg("dim", p)).join(` ${theme.fg("dim", "·")} `)}`;
  }

  // Line 3: result preview (collapsed) or full (expanded)
  if (expanded) {
    const lines = d.resultPreview.split("\n").slice(0, 30);
    const expandedParts: string[] = [];
    for (const l of lines) expandedParts.push(`\n${theme.fg("dim", `  ${l}`)}`);
    line += expandedParts.join("");
  } else {
    const preview = d.resultPreview.split("\n")[0]?.slice(0, 80) ?? "";
    line += `\n  ${theme.fg("dim", `⎿  ${preview}`)}`;
  }

  // Line 4: output file link (if present)
  if (d.outputFile) {
    line += `\n  ${theme.fg("muted", `transcript: ${d.outputFile}`)}`;
  }

  return line;
}

/** Factory that returns the renderer function for pi.registerMessageRenderer. */
export function createNotificationRenderer(theme: any) {
  return (message: { details?: NotificationDetails }, { expanded }: { expanded: boolean }) => {
    const d = message.details;
    if (!d) return undefined;
    const all = [d, ...(d.others ?? [])];
    return new Text(all.map(item => renderOne(item, expanded, theme)).join("\n"), 0, 0);
  };
}
