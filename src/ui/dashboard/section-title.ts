import type { BoxChars, DashboardTheme } from "../theme.js";
import { visibleWidth } from "../tui-shim.js";

export function renderSectionTitle(
  label: string,
  count: string,
  innerW: number,
  th: DashboardTheme,
  box: BoxChars,
): string {
  const text = ` ${th.title}${label}${th.reset} `;
  const suffix = ` ${th.dim}${count}${th.reset} `;
  const fillLen = Math.max(2, innerW - visibleWidth(text) - visibleWidth(suffix) - 2);
  const fill = box.h.repeat(fillLen);
  return `  ${th.border}${box.tl}${box.h}${th.reset}${text}${th.border}${fill}${th.reset}${suffix}${th.border}${box.h}${box.tr}${th.reset}`;
}
