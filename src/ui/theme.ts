import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { getUiStyle } from "../agent-registry.js";

export type Theme = {
  fg(color: string, text: string): string;
  bold(text: string): string;
};

export type DashboardTheme = ReturnType<typeof getThemeColors>;

export type BoxChars = {
  tl: string;
  tr: string;
  bl: string;
  br: string;
  l: string;
  r: string;
  h: string;
  ml: string;
  mr: string;
};

export function getThemeColors() {
  const style = getUiStyle();
  if (style === "plain") {
    return {
      border: "",
      title: "",
      dim: "",
      muted: "",
      highlight: "",
      accent: "",
      success: "",
      error: "",
      reset: "",
      bgCard: "",
      bgSelected: "",
      bgHeader: "",
    };
  }
  if (style === "retro") {
    return {
      border: "\x1b[31m",
      title: "\x1b[1;37m",
      dim: "\x1b[2m",
      muted: "\x1b[37m",
      highlight: "\x1b[1;33m",
      accent: "\x1b[1;36m",
      success: "\x1b[1;32m",
      error: "\x1b[1;31m",
      reset: "\x1b[0m",
      bgCard: "",
      bgSelected: "",
      bgHeader: "",
    };
  }
  return {
    border: "\x1b[38;2;255;100;100m",
    title: "\x1b[1;38;2;220;220;220m",
    dim: "\x1b[38;2;100;100;120m",
    muted: "\x1b[38;2;160;160;170m",
    highlight: "\x1b[1;38;2;255;200;100m",
    accent: "\x1b[1;38;2;120;180;255m",
    success: "\x1b[1;38;2;80;220;140m",
    error: "\x1b[1;38;2;255;100;120m",
    reset: "\x1b[0m",
    bgCard: "\x1b[48;2;25;25;40m",
    bgSelected: "\x1b[48;2;35;35;55m",
    bgHeader: "\x1b[48;2;20;20;35m",
  };
}

export function getBoxChars(): BoxChars {
  const style = getUiStyle();
  if (style === "retro" || style === "plain") {
    return { tl: "+", tr: "+", bl: "+", br: "+", l: "|", r: "|", h: "-", ml: "+", mr: "+" };
  }
  return { tl: "╭", tr: "╮", bl: "╰", br: "╯", l: "│", r: "│", h: "─", ml: "├", mr: "┤" };
}

export function plainTheme(): Theme {
  return {
    fg: (_color, text) => text,
    bold: text => text,
  };
}

export function activeTheme(theme: Theme): Theme {
  return getUiStyle() === "plain" ? plainTheme() : theme;
}

export function padAndTruncate(str: string, maxWidth: number): string {
  const vis = visibleWidth(str);
  if (vis === maxWidth) return str;
  if (vis < maxWidth) return str + " ".repeat(maxWidth - vis);
  return fastTruncate(str, maxWidth);
}

export function padVisible(content: string, width: number): string {
  return content + " ".repeat(Math.max(0, width - visibleWidth(content)));
}

/** Skip expensive truncateToWidth when the string already fits. */
export function fastTruncate(str: string, maxWidth: number): string {
  if (visibleWidth(str) <= maxWidth) return str;
  return truncateToWidth(str, maxWidth);
}

export function framedRow(content: string, innerW: number, th: DashboardTheme, box: BoxChars): string {
  const body = padAndTruncate(content, innerW);
  return `${th.border}${box.l}${th.reset} ${body} ${th.border}${box.r}${th.reset}`;
}

export function borderLine(width: number, th: DashboardTheme, box: BoxChars, pos: "top" | "mid" | "bottom"): string {
  const left = pos === "top" ? box.tl : pos === "bottom" ? box.bl : box.ml;
  const right = pos === "top" ? box.tr : pos === "bottom" ? box.br : box.mr;
  return `${th.border}${left}${box.h.repeat(Math.max(0, width - 2))}${right}${th.reset}`;
}
