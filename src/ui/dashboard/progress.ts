import type { DashboardTheme } from "../theme.js";

const BLOCK_FULL = "█";
const BLOCK_LIGHT = "░";

/**
 * Render a Unicode block progress bar.
 * Color-coded: green < 70%, gold 70-85%, red > 85%.
 */
export function renderProgressBar(
  value: number,
  max: number,
  width: number,
  th: DashboardTheme,
): string {
  if (max <= 0 || width <= 0) return "";
  const pct = Math.min(1, Math.max(0, value / max));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const color = pct >= 0.85 ? th.error : pct >= 0.7 ? th.highlight : th.accent;
  return `${color}${BLOCK_FULL.repeat(filled)}${th.dim}${BLOCK_LIGHT.repeat(empty)}${th.reset}`;
}

/**
 * Render a compact turn progress with bar.
 * Example output: ⟳5≤10 ████▓░░░
 */
export function renderTurnProgress(
  turnCount: number,
  maxTurns: number | null | undefined,
  barWidth: number,
  th: DashboardTheme,
): string {
  if (maxTurns == null || maxTurns <= 0) {
    return `${th.dim}⟳${turnCount}${th.reset}`;
  }
  const pct = Math.min(1, turnCount / maxTurns);
  const bar = renderProgressBar(turnCount, maxTurns, barWidth, th);
  const color = pct >= 0.85 ? th.error : pct >= 0.7 ? th.highlight : th.dim;
  return `${color}⟳${turnCount}≤${maxTurns}${th.reset} ${bar}`;
}
