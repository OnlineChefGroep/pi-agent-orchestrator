/**
 * conversation-viewer.ts — Live conversation overlay for viewing agent sessions.
 *
 * Displays a scrollable, live-updating view of an agent's conversation.
 * Subscribes to session events for real-time streaming updates.
 */

import type { AgentSession } from "@mariozechner/pi-coding-agent";
import { type Component, matchesKey, type TUI, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { extractText } from "../context.js";
import type { AgentRecord } from "../types.js";
import { getLifetimeTotal, getSessionContextPercent } from "../usage.js";
import type { Theme } from "./agent-widget.js";
import { type AgentActivity, buildInvocationTags, describeActivity, formatDuration, formatSessionTokens, getDisplayName, getPromptModeLabel, SPINNER } from "./agent-widget.js";
import { getUiStyle } from "../agent-registry.js";

/** Base lines consumed by chrome: top border + header + header sep + footer sep + footer + bottom border. */
const CHROME_LINES_BASE = 6;
const MIN_VIEWPORT = 3;
/** Height ceiling shared by the overlay's `maxHeight` and the viewer's internal viewport cap. */
export const VIEWPORT_HEIGHT_PCT = 70;

export class ConversationViewer implements Component {
  private scrollOffset = 0;
  private autoScroll = true;
  private unsubscribe: (() => void) | undefined;
  private lastInnerW = 0;
  private closed = false;

  constructor(
    private tui: TUI,
    private session: AgentSession,
    private record: AgentRecord,
    private activity: AgentActivity | undefined,
    private theme: Theme,
    private done: (result: undefined) => void,
  ) {
    this.unsubscribe = session.subscribe(() => {
      if (this.closed) return;
      this.tui.requestRender();
    });
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.closed = true;
      this.done(undefined);
      return;
    }

    const totalLines = this.buildContentLines(this.lastInnerW).length;
    const viewportHeight = this.viewportHeight();
    const maxScroll = Math.max(0, totalLines - viewportHeight);

    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.autoScroll = this.scrollOffset >= maxScroll;
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 1);
      this.autoScroll = this.scrollOffset >= maxScroll;
    } else if (matchesKey(data, "pageUp") || matchesKey(data, "shift+up")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - viewportHeight);
      this.autoScroll = false;
    } else if (matchesKey(data, "pageDown") || matchesKey(data, "shift+down")) {
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + viewportHeight);
      this.autoScroll = this.scrollOffset >= maxScroll;
    } else if (matchesKey(data, "home")) {
      this.scrollOffset = 0;
      this.autoScroll = false;
    } else if (matchesKey(data, "end")) {
      this.scrollOffset = maxScroll;
      this.autoScroll = true;
    }
  }

  render(width: number): string[] {
    if (width < 6) return []; // too narrow for any meaningful rendering
    const activeUiStyle = getUiStyle();
    const plainTheme: Theme = {
      fg: (color, text) => text,
      bold: (text) => text,
    };
    const th = activeUiStyle === "plain" ? plainTheme : this.theme;

    const innerW = width - 4; // border + padding
    this.lastInnerW = innerW;
    const lines: string[] = [];

    const pad = (s: string, len: number) => {
      const vis = visibleWidth(s);
      return s + " ".repeat(Math.max(0, len - vis));
    };

    let c_tl = "╭", c_tr = "╮", c_bl = "╰", c_br = "╯", c_l = "│", c_r = "│", c_h = "─";
    if (activeUiStyle === "retro") {
      c_tl = "+"; c_tr = "+"; c_bl = "+"; c_br = "+"; c_l = "|"; c_r = "|"; c_h = "-";
    }

    const row = (content: string) => {
      if (activeUiStyle === "plain") {
        return "  " + truncateToWidth(pad(content, innerW), innerW) + "  ";
      }
      return th.fg("border", c_l) + " " + truncateToWidth(pad(content, innerW), innerW) + " " + th.fg("border", c_r);
    };

    let hrTop = "";
    let hrBot = "";
    let hrMid = "";
    if (activeUiStyle === "plain") {
      hrTop = "-".repeat(width);
      hrBot = "-".repeat(width);
      hrMid = "-".repeat(innerW + 4);
    } else {
      hrTop = th.fg("border", `${c_tl}${c_h.repeat(width - 2)}${c_tr}`);
      hrBot = th.fg("border", `${c_bl}${c_h.repeat(width - 2)}${c_br}`);
      hrMid = row(th.fg("dim", c_h.repeat(innerW)));
    }

    // Header
    lines.push(hrTop);
    const name = getDisplayName(this.record.type);
    const modeLabel = getPromptModeLabel(this.record.type);
    const modeTag = modeLabel ? ` ${th.fg("dim", `(${modeLabel})`)}` : "";
    const statusIcon = this.record.status === "running"
      ? th.fg("accent", "●")
      : this.record.status === "completed"
        ? th.fg("success", "✓")
        : this.record.status === "error"
          ? th.fg("error", "✗")
          : th.fg("dim", "○");
    const duration = formatDuration(this.record.startedAt, this.record.completedAt);

    const headerParts: string[] = [duration];
    const toolUses = this.activity?.toolUses ?? this.record.toolUses;
    if (toolUses > 0) headerParts.unshift(`${toolUses} tool${toolUses === 1 ? "" : "s"}`);
    const tokens = getLifetimeTotal(this.activity?.lifetimeUsage);
    if (tokens > 0) {
      const percent = getSessionContextPercent(this.activity?.session);
      headerParts.push(formatSessionTokens(tokens, percent, th, this.record.compactionCount));
    }

    lines.push(row(
      `${statusIcon} ${th.bold(name)}${modeTag}  ${th.fg("muted", this.record.description)} ${th.fg("dim", "·")} ${th.fg("dim", headerParts.join(" · "))}`,
    ));
    const invocationLine = this.invocationLine();
    if (invocationLine) lines.push(row(invocationLine));
    lines.push(hrMid);

    // Content area — rebuild every render (live data, no cache needed)
    const contentLines = this.buildContentLines(innerW);
    const viewportHeight = this.viewportHeight();
    const maxScroll = Math.max(0, contentLines.length - viewportHeight);

    if (this.autoScroll) {
      this.scrollOffset = maxScroll;
    }

    const visibleStart = Math.min(this.scrollOffset, maxScroll);
    const visible = contentLines.slice(visibleStart, visibleStart + viewportHeight);

    for (let i = 0; i < viewportHeight; i++) {
      lines.push(row(visible[i] ?? ""));
    }

    // Footer
    lines.push(hrMid);
    const scrollPct = contentLines.length <= viewportHeight
      ? "100%"
      : `${Math.round(((visibleStart + viewportHeight) / contentLines.length) * 100)}%`;
    const footerLeft = th.fg("dim", `${contentLines.length} lines · ${scrollPct}`);
    const footerRight = th.fg("dim", "↑↓ scroll · PgUp/PgDn or Shift+↑↓ · Esc close");
    const footerGap = Math.max(1, innerW - visibleWidth(footerLeft) - visibleWidth(footerRight));
    lines.push(row(footerLeft + " ".repeat(footerGap) + footerRight));
    lines.push(hrBot);

    return lines;
  }

  invalidate(): void { /* no cached state to clear */ }

  dispose(): void {
    this.closed = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  // ---- Private ----

  private viewportHeight(): number {
    // Cap mirrors the overlay's maxHeight — otherwise the viewer would render
    // more lines than the overlay shows and clip the footer.
    const maxRows = Math.floor((this.tui.terminal.rows * VIEWPORT_HEIGHT_PCT) / 100);
    return Math.max(MIN_VIEWPORT, maxRows - this.chromeLines());
  }

  private chromeLines(): number {
    return CHROME_LINES_BASE + (this.invocationLine() ? 1 : 0);
  }

  private invocationLine(): string | undefined {
    const activeUiStyle = getUiStyle();
    const plainTheme: Theme = {
      fg: (color, text) => text,
      bold: (text) => text,
    };
    const th = activeUiStyle === "plain" ? plainTheme : this.theme;
    const { modelName, tags } = buildInvocationTags(this.record.invocation);
    const parts = modelName ? [modelName, ...tags] : tags;
    if (parts.length === 0) return undefined;
    const arrow = activeUiStyle === "plain" ? "-> " : "  ↳ ";
    return th.fg("dim", `${arrow}${parts.join(" · ")}`);
  }

  private buildContentLines(width: number): string[] {
    if (width <= 0) return [];

    const activeUiStyle = getUiStyle();
    const plainTheme: Theme = {
      fg: (color, text) => text,
      bold: (text) => text,
    };
    const th = activeUiStyle === "plain" ? plainTheme : this.theme;
    const messages = this.session.messages;
    const lines: string[] = [];

    if (messages.length === 0) {
      lines.push(th.fg("dim", "(waiting for first message...)"));
      return lines;
    }

    let needsSeparator = false;
    for (const msg of messages) {
      if (needsSeparator) {
        lines.push("");
      }
      if (msg.role === "user") {
        const text = typeof msg.content === "string"
          ? msg.content
          : extractText(msg.content);
        if (!text.trim()) continue;
        
        let header = " \x1b[48;2;0;100;160;38;2;255;255;255;1m 👤 USER \x1b[0m";
        let border = " \x1b[38;2;0;160;220m│\x1b[0m";
        if (activeUiStyle === "retro") {
          header = " \x1b[44;37;1m 👤 USER \x1b[0m";
          border = " \x1b[36m|\x1b[0m";
        } else if (activeUiStyle === "plain") {
          header = " 👤 USER ";
          border = " |";
        }

        lines.push(header);
        for (const line of wrapTextWithAnsi(text.trim(), width - 3)) {
          lines.push(`${border} ${line}`);
        }
      } else if (msg.role === "assistant") {
        const textParts: string[] = [];
        const toolCalls: string[] = [];
        for (const c of msg.content) {
          if (c.type === "text" && c.text) textParts.push(c.text);
          else if (c.type === "toolCall") {
            toolCalls.push((c as any).name ?? (c as any).toolName ?? "unknown");
          }
        }
        
        let header = " \x1b[48;2;100;50;180;38;2;255;255;255;1m 🤖 HERMES \x1b[0m";
        let border = " \x1b[38;2;150;80;220m│\x1b[0m";
        if (activeUiStyle === "retro") {
          header = " \x1b[45;37;1m 🤖 HERMES \x1b[0m";
          border = " \x1b[35m|\x1b[0m";
        } else if (activeUiStyle === "plain") {
          header = " 🤖 HERMES ";
          border = " |";
        }

        lines.push(header);
        if (textParts.length > 0) {
          for (const line of wrapTextWithAnsi(textParts.join("\n").trim(), width - 3)) {
            lines.push(`${border} ${line}`);
          }
        }
        for (const name of toolCalls) {
          let callLine = ` \x1b[38;2;150;80;220m│\x1b[0m   \x1b[38;2;220;120;0m⚡ [Tool Invoke: ${name}]\x1b[0m`;
          if (activeUiStyle === "retro") {
            callLine = ` \x1b[35m|\x1b[0m   \x1b[33m⚡ [Tool Invoke: ${name}]\x1b[0m`;
          } else if (activeUiStyle === "plain") {
            callLine = ` |   ⚡ [Tool Invoke: ${name}]`;
          }
          lines.push(callLine);
        }
      } else if (msg.role === "toolResult") {
        const text = extractText(msg.content);
        const truncated = text.length > 800 ? text.slice(0, 800) + "\n... (truncated)" : text;
        if (!truncated.trim()) continue;
        
        const innerW = width - 6;
        if (innerW > 10) {
          const headerText = ` 🔧 Tool Result `;
          const dashCount = Math.max(2, innerW - headerText.length - 2);

          let topBorder = `\x1b[38;2;220;120;0m╭──${headerText}${"─".repeat(dashCount)}╮\x1b[0m`;
          let bottomBorder = `\x1b[38;2;220;120;0m╰${"─".repeat(innerW + 2)}╯\x1b[0m`;
          let leftBorder = "\x1b[38;2;220;120;0m│\x1b[0m";
          let rightBorder = "\x1b[38;2;220;120;0m│\x1b[0m";

          if (activeUiStyle === "retro") {
            topBorder = `\x1b[33m+--${headerText}${"-".repeat(dashCount)}+\x1b[0m`;
            bottomBorder = `\x1b[33m+${"-".repeat(innerW + 2)}+\x1b[0m`;
            leftBorder = "\x1b[33m|\x1b[0m";
            rightBorder = "\x1b[33m|\x1b[0m";
          } else if (activeUiStyle === "plain") {
            topBorder = `+--${headerText}${"-".repeat(dashCount)}+`;
            bottomBorder = `+${"-".repeat(innerW + 2)}+`;
            leftBorder = "|";
            rightBorder = "|";
          }
          
          lines.push("   " + topBorder);
          for (const line of wrapTextWithAnsi(truncated.trim(), innerW)) {
            const paddedLine = line + " ".repeat(Math.max(0, innerW - visibleWidth(line)));
            lines.push(`   ${leftBorder} ${paddedLine} ${rightBorder}`);
          }
          lines.push("   " + bottomBorder);
        } else {
          lines.push(th.fg("warning", "[Result]"));
          for (const line of wrapTextWithAnsi(truncated.trim(), width)) {
            lines.push(th.fg("dim", line));
          }
        }
      } else if ((msg as any).role === "bashExecution") {
        const bash = msg as any;
        const command = bash.command || "";
        const output = bash.output || "";
        
        const innerW = width - 6;
        if (innerW > 10) {
          const headerText = ` 💻 Bash Command `;
          const dashCount = Math.max(2, innerW - headerText.length - 2);

          let topBorder = `\x1b[38;2;0;160;220m╭──${headerText}${"─".repeat(dashCount)}╮\x1b[0m`;
          let bottomBorder = `\x1b[38;2;0;160;220m╰${"─".repeat(innerW + 2)}╯\x1b[0m`;
          let leftBorder = "\x1b[38;2;0;160;220m│\x1b[0m";
          let rightBorder = "\x1b[38;2;0;160;220m│\x1b[0m";
          let midBorder = `\x1b[38;2;0;160;220m├${"─".repeat(innerW + 2)}┤\x1b[0m`;
          let cmdPrefix = "\x1b[1m$ ";
          let cmdSuffix = "\x1b[0m";
          let outPrefix = "\x1b[2m";
          let outSuffix = "\x1b[0m";

          if (activeUiStyle === "retro") {
            topBorder = `\x1b[36m+--${headerText}${"-".repeat(dashCount)}+\x1b[0m`;
            bottomBorder = `\x1b[36m+${"-".repeat(innerW + 2)}+\x1b[0m`;
            leftBorder = "\x1b[36m|\x1b[0m";
            rightBorder = "\x1b[36m|\x1b[0m";
            midBorder = `\x1b[36m+${"-".repeat(innerW + 2)}+\x1b[0m`;
          } else if (activeUiStyle === "plain") {
            topBorder = `+--${headerText}${"-".repeat(dashCount)}+`;
            bottomBorder = `+${"-".repeat(innerW + 2)}+`;
            leftBorder = "|";
            rightBorder = "|";
            midBorder = `+${"-".repeat(innerW + 2)}+`;
            cmdPrefix = "$ ";
            cmdSuffix = "";
            outPrefix = "";
            outSuffix = "";
          }
          
          lines.push("   " + topBorder);
          const cmdLineStr = `${cmdPrefix}${command.slice(0, innerW - 2)}${cmdSuffix}`;
          lines.push(`   ${leftBorder} ${cmdLineStr}` + " ".repeat(Math.max(0, innerW - visibleWidth(`${cmdPrefix}${command.slice(0, innerW - 2)}${cmdSuffix}`))) + ` ${rightBorder}`);
          
          if (output.trim()) {
            lines.push(`   ` + midBorder);
            const outTrunc = output.length > 800 ? output.slice(0, 800) + "\n... (truncated)" : output;
            for (const line of wrapTextWithAnsi(outTrunc.trim(), innerW)) {
              const paddedLine = line + " ".repeat(Math.max(0, innerW - visibleWidth(line)));
              lines.push(`   ${leftBorder} ${outPrefix}${paddedLine}${outSuffix} ${rightBorder}`);
            }
          }
          lines.push("   " + bottomBorder);
        } else {
          lines.push(th.fg("accent", `$ ${command}`));
          if (output.trim()) {
            for (const line of wrapTextWithAnsi(output.trim(), width)) {
              lines.push(th.fg("dim", line));
            }
          }
        }
      } else {
        continue;
      }
      needsSeparator = true;
    }

    if (this.record.status === "running" && this.activity) {
      const spinnerFrame = SPINNER[Math.floor(Date.now() / 80) % SPINNER.length];
      const act = describeActivity(this.activity.activeTools, this.activity.responseText);
      lines.push("");
      
      let runningLineStr = `  \x1b[38;2;255;165;0m${spinnerFrame}\x1b[0m \x1b[38;2;168;100;255mHermes is working:\x1b[0m \x1b[3m${act}\x1b[0m`;
      if (activeUiStyle === "retro") {
        runningLineStr = `  \x1b[33m${spinnerFrame}\x1b[0m \x1b[35;1mHermes is working:\x1b[0m \x1b[3m${act}\x1b[0m`;
      } else if (activeUiStyle === "plain") {
        runningLineStr = `  ${spinnerFrame} Hermes is working: ${act}`;
      }
      lines.push(truncateToWidth(runningLineStr, width));
    }

    return lines.map(l => truncateToWidth(l, width));
  }
}
