/**
 * conversation-viewer.ts — Live conversation overlay for viewing agent sessions.
 *
 * Displays a scrollable, live-updating view of an agent's conversation.
 * Subscribes to session events for real-time streaming updates.
 */

import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { type Component, matchesKey, type TUI, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { getUiStyle } from "../agent-registry.js";
import { extractText } from "../context.js";
import type { AgentRecord } from "../types.js";
import { getLifetimeTotal, getSessionContextPercent } from "../usage.js";
import { buildInvocationTags, describeActivity, formatDuration, formatSessionTokens, getDisplayName, getPromptModeLabel } from "./agent-format.js";
import type { AgentActivity } from "./agent-ui-types.js";
import { getTimeSpinnerFrame } from "./animation.js";
import { activeTheme, fastTruncate, getBoxChars, padVisible, type Theme } from "./theme.js";

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

  // ── Performance: debounced render ──

  /** Timestamp of the last actual render for rate limiting. */
  private lastRenderTime = 0;

  /** True while a microtask render is pending. */
  private renderPending = false;

  /** Coalesce timer handle for scheduling a render after rate-limit window. */
  private coalesceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Minimum gap between consecutive renders (60 fps cap). */
  private static readonly MIN_RENDER_GAP_MS = 16;

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
      this.requestRender();
    });
  }

  /**
   * Debounced render request with rate limiting.
   * Coalesces rapid session events into a single render via queueMicrotask.
   * Falls back to setTimeout when rate-limited to ensure the final state
   * is always rendered, even if session events stop during a rate-limit window.
   * Never renders more than ~60fps.
   */
  private requestRender(): void {
    if (this.closed) return;

    const now = Date.now();
    const elapsed = now - this.lastRenderTime;

    // Rate limit: if we rendered within the last MIN_RENDER_GAP_MS,
    // schedule a coalesced render after the window expires.
    if (this.lastRenderTime > 0 && elapsed < ConversationViewer.MIN_RENDER_GAP_MS) {
      if (!this.coalesceTimer && !this.renderPending) {
        this.coalesceTimer = setTimeout(() => {
          this.coalesceTimer = null;
          this.lastRenderTime = 0; // force allow
          this.requestRender();
        }, ConversationViewer.MIN_RENDER_GAP_MS - elapsed);
      }
      return;
    }

    // Avoid stacking multiple microtasks during synchronous event bursts.
    if (this.renderPending) return;

    this.renderPending = true;

    queueMicrotask(() => {
      this.renderPending = false;
      if (this.closed) return;
      this.lastRenderTime = Date.now();
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
    const th = activeTheme(this.theme);
    const box = getBoxChars();
    const activeUiStyle = getUiStyle();

    const innerW = width - 4; // border + padding
    this.lastInnerW = innerW;
    const lines: string[] = [];

    const row = (content: string) => {
      const body = fastTruncate(padVisible(content, innerW), innerW);
      if (activeUiStyle === "plain") {
        return `  ${body}  `;
      }
      return `${th.fg("border", box.l)} ${body} ${th.fg("border", box.r)}`;
    };

    let hrTop = "";
    let hrBot = "";
    let hrMid = "";
    if (activeUiStyle === "plain") {
      hrTop = "-".repeat(width);
      hrBot = "-".repeat(width);
      hrMid = "-".repeat(innerW + 4);
    } else {
      hrTop = th.fg("border", `${box.tl}${box.h.repeat(width - 2)}${box.tr}`);
      hrBot = th.fg("border", `${box.bl}${box.h.repeat(width - 2)}${box.br}`);
      hrMid = row(th.fg("dim", box.h.repeat(innerW)));
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
    const duration = formatDuration(this.record.startedAt ?? 0, this.record.completedAt);

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
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
    }
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
    const th = activeTheme(this.theme);
    const { modelName, tags } = buildInvocationTags(this.record.invocation);
    const parts = modelName ? [modelName, ...tags] : tags;
    if (parts.length === 0) return undefined;
    const arrow = activeUiStyle === "plain" ? "-> " : "  ↳ ";
    return th.fg("dim", `${arrow}${parts.join(" · ")}`);
  }

  private buildContentLines(width: number): string[] {
    if (width <= 0) return [];

    const activeUiStyle = getUiStyle();
    const th = activeTheme(this.theme);
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
        const truncated = text.length > 800 ? `${text.slice(0, 800)}\n... (truncated)` : text;
        if (!truncated.trim()) continue;
        
        const innerW = width - 6;
        if (innerW > 10) {
          const headerText = ` 🔧 Tool Result `;
          const dashCount = Math.max(2, innerW - headerText.length - 2);

          const box = getBoxChars();
          let topBorder = `\x1b[38;2;220;120;0m${box.tl}${box.h}${box.h}${headerText}${box.h.repeat(dashCount)}${box.tr}\x1b[0m`;
          let bottomBorder = `\x1b[38;2;220;120;0m${box.bl}${box.h.repeat(innerW + 2)}${box.br}\x1b[0m`;
          let leftBorder = "\x1b[38;2;220;120;0m│\x1b[0m";
          let rightBorder = "\x1b[38;2;220;120;0m│\x1b[0m";

          if (activeUiStyle === "retro") {
            topBorder = `\x1b[33m${box.tl}${box.h}${box.h}${headerText}${box.h.repeat(dashCount)}${box.tr}\x1b[0m`;
            bottomBorder = `\x1b[33m${box.bl}${box.h.repeat(innerW + 2)}${box.br}\x1b[0m`;
            leftBorder = "\x1b[33m|\x1b[0m";
            rightBorder = "\x1b[33m|\x1b[0m";
          } else if (activeUiStyle === "plain") {
            topBorder = `${box.tl}${box.h}${box.h}${headerText}${box.h.repeat(dashCount)}${box.tr}`;
            bottomBorder = `${box.bl}${box.h.repeat(innerW + 2)}${box.br}`;
            leftBorder = "|";
            rightBorder = "|";
          }
          
          lines.push(`   ${topBorder}`);
          for (const line of wrapTextWithAnsi(truncated.trim(), innerW)) {
            const paddedLine = line + " ".repeat(Math.max(0, innerW - visibleWidth(line)));
            lines.push(`   ${leftBorder} ${paddedLine} ${rightBorder}`);
          }
          lines.push(`   ${bottomBorder}`);
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
          
          lines.push(`   ${topBorder}`);
          const cmdLineStr = `${cmdPrefix}${command.slice(0, innerW - 2)}${cmdSuffix}`;
          lines.push(`   ${leftBorder} ${cmdLineStr}${" ".repeat(Math.max(0, innerW - visibleWidth(`${cmdPrefix}${command.slice(0, innerW - 2)}${cmdSuffix}`)))} ${rightBorder}`);
          
          if (output.trim()) {
            lines.push(`   ${midBorder}`);
            const outTrunc = output.length > 800 ? `${output.slice(0, 800)}\n... (truncated)` : output;
            for (const line of wrapTextWithAnsi(outTrunc.trim(), innerW)) {
              const paddedLine = line + " ".repeat(Math.max(0, innerW - visibleWidth(line)));
              lines.push(`   ${leftBorder} ${outPrefix}${paddedLine}${outSuffix} ${rightBorder}`);
            }
          }
          lines.push(`   ${bottomBorder}`);
        } else {
          lines.push(th.fg("accent", `$ ${command}`));
          const trimmedOutput = output.trim();
          if (trimmedOutput) {
            for (const line of wrapTextWithAnsi(trimmedOutput, width)) {
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
      const spinnerFrame = getTimeSpinnerFrame();
      const act = describeActivity(this.activity.activeTools, this.activity.responseText);
      lines.push("");
      
      let runningLineStr = `  \x1b[38;2;255;165;0m${spinnerFrame}\x1b[0m \x1b[38;2;168;100;255mHermes is working:\x1b[0m \x1b[3m${act}\x1b[0m`;
      if (activeUiStyle === "retro") {
        runningLineStr = `  \x1b[33m${spinnerFrame}\x1b[0m \x1b[35;1mHermes is working:\x1b[0m \x1b[3m${act}\x1b[0m`;
      } else if (activeUiStyle === "plain") {
        runningLineStr = `  ${spinnerFrame} Hermes is working: ${act}`;
      }
      lines.push(fastTruncate(runningLineStr, width));
    }

    return lines.map(l => fastTruncate(l, width));
  }
}
