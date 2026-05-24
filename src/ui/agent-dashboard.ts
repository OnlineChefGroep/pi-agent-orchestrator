/**
 * agent-dashboard.ts — Rich interactive TUI dashboard for subagent management.
 *
 * First slice (per plan): 
 * - Full Component implementation modeled exactly after ConversationViewer
 * - Vim + arrow keyboard navigation (matchesKey)
 * - Themed rendering (premium/retro/plain via getUiStyle)
 * - Overlay via ctx.ui.custom (same pattern)
 * - Safe, additive, no changes to existing behavior
 *
 * Later slices: live data from AgentManager + AgentActivity, steering, kill/bulk actions,
 * handoff visualization, global shortcut registration, tighter cinematic synergy.
 */

import type { AgentManager } from "../agent-manager.js";
import type { AgentActivity } from "./agent-widget.js";
import { getUiStyle } from "../agent-registry.js";
import {
  type Component,
  matchesKey,
  type TUI,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import type { AgentRecord } from "../types.js";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

const MIN_VIEWPORT = 5;
export const DASHBOARD_HEIGHT_PCT = 85;

/** Theme helper (mirrors patterns in conversation-viewer + schedule-menu). */
function getThemeColors() {
  const style = getUiStyle();
  if (style === "plain") {
    return {
      border: "",
      title: "",
      dim: "",
      highlight: "",
      reset: "",
    };
  }
  if (style === "retro") {
    return {
      border: "\x1b[31m",
      title: "\x1b[1;37m",
      dim: "\x1b[2m",
      highlight: "\x1b[1;33m",
      reset: "\x1b[0m",
    };
  }
  // premium
  return {
    border: "\x1b[38;2;255;100;100m",
    title: "\x1b[1;38;2;220;220;220m",
    dim: "\x1b[2m",
    highlight: "\x1b[1;38;2;255;200;100m",
    reset: "\x1b[0m",
  };
}

export interface AgentDashboardOptions {
  manager: AgentManager;
  agentActivity: Map<string, AgentActivity>;
  onViewConversation?: (record: AgentRecord) => Promise<void>;
}

export class AgentDashboard implements Component {
  private scrollOffset = 0;
  private selectedIndex = 0;
  private closed = false;
  private agents: AgentRecord[] = [];

  constructor(
    private readonly tui: TUI,
    private readonly options: AgentDashboardOptions,
    private readonly done: () => void,
  ) {
    this.refreshAgents();
  }

  private refreshAgents(): void {
    this.agents = this.options.manager.listAgents();
    // Clamp selection
    if (this.selectedIndex >= this.agents.length) {
      this.selectedIndex = Math.max(0, this.agents.length - 1);
    }
  }

  handleInput(data: string): void {
    const maxScroll = Math.max(0, this.agents.length - this.getViewportHeight());
    const wasClosed = this.closed;

    if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.closed = true;
      this.done();
      return;
    }

    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      if (this.selectedIndex < this.scrollOffset) {
        this.scrollOffset = this.selectedIndex;
      }
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      if (this.agents.length === 0) return;
      this.selectedIndex = Math.min(this.agents.length - 1, this.selectedIndex + 1);
      if (this.selectedIndex >= this.scrollOffset + this.getViewportHeight()) {
        this.scrollOffset = this.selectedIndex - this.getViewportHeight() + 1;
      }
    } else if (matchesKey(data, "pageUp") || matchesKey(data, "shift+up")) {
      this.selectedIndex = Math.max(0, this.selectedIndex - this.getViewportHeight());
      this.scrollOffset = Math.max(0, this.scrollOffset - this.getViewportHeight());
    } else if (matchesKey(data, "pageDown") || matchesKey(data, "shift+down")) {
      if (this.agents.length === 0) return;
      this.selectedIndex = Math.min(
        this.agents.length - 1,
        this.selectedIndex + this.getViewportHeight(),
      );
      this.scrollOffset = Math.min(
        maxScroll,
        this.scrollOffset + this.getViewportHeight(),
      );
    } else if (matchesKey(data, "home")) {
      this.selectedIndex = 0;
      this.scrollOffset = 0;
    } else if (matchesKey(data, "end")) {
      if (this.agents.length === 0) return;
      this.selectedIndex = this.agents.length - 1;
      this.scrollOffset = maxScroll;
    } else if (matchesKey(data, "enter") || matchesKey(data, "return")) {
      const rec = this.agents[this.selectedIndex];
      if (rec && this.options.onViewConversation) {
        // Close dashboard first, then hand off to conversation viewer
        this.closed = true;
        this.done();
        // Fire-and-forget; the caller (menu wiring) will handle sequencing
        void this.options.onViewConversation(rec);
        return;
      }
    } else if (matchesKey(data, "r") || matchesKey(data, "R")) {
      // Refresh (useful while developing / testing live updates)
      this.refreshAgents();
      this.tui.requestRender();
    }

    if (!wasClosed && this.closed) {
      this.done();
    }
  }

  private getViewportHeight(): number {
    const rows = this.tui.terminal.rows;
    const maxRows = Math.floor((rows * DASHBOARD_HEIGHT_PCT) / 100);
    return Math.max(MIN_VIEWPORT, maxRows - this.chromeLines());
  }

  private chromeLines(): number {
    return 6; // header + title + footer + padding
  }

  render(width: number): string[] {
    this.refreshAgents(); // always fresh on render
    const th = getThemeColors();
    const lines: string[] = [];

    const title = `${th.title}Agent Dashboard${th.reset}  ${th.dim}(rich TUI — ${getUiStyle()})${th.reset}`;
    lines.push(title);
    lines.push(`${th.border}${"─".repeat(Math.min(60, width))}${th.reset}`);

    const vh = this.getViewportHeight();
    const maxScroll = Math.max(0, this.agents.length - vh);
    const start = Math.min(this.scrollOffset, maxScroll);
    const end = Math.min(start + vh, this.agents.length);

    if (this.agents.length === 0) {
      lines.push(`${th.dim}No agents yet. Create some via /agents or spawn via tools.${th.reset}`);
    } else {
      for (let i = start; i < end; i++) {
        const rec = this.agents[i];
        const isSel = i === this.selectedIndex;
        const prefix = isSel ? `${th.highlight}▶ ` : "  ";
        const dn = rec.description || rec.type;
        const status = `${rec.status}`;
        const dur = rec.completedAt
          ? `${Math.round((rec.completedAt - rec.startedAt) / 1000)}s`
          : "running";
        const tokens = rec.lifetimeUsage
          ? `${rec.lifetimeUsage.input + rec.lifetimeUsage.output} tok`
          : "";
        const line = `${prefix}${dn} ${th.dim}· ${status} · ${dur} · ${tokens}${th.reset}`;
        lines.push(truncateToWidth(line, width - 2));
      }
    }

    // Footer
    lines.push(`${th.border}${"─".repeat(Math.min(60, width))}${th.reset}`);
    const footer = `${th.dim}↑↓/k j nav · PgUp/PgDn · Enter view · r refresh · q/esc close${th.reset}`;
    lines.push(footer);

    return lines;
  }
}

/** Launch helper (mirrors viewAgentConversation pattern exactly). */
export async function showAgentDashboard(
  ctx: ExtensionCommandContext,
  manager: AgentManager,
  agentActivity: Map<string, AgentActivity>,
  onViewConversation?: (record: AgentRecord) => Promise<void>,
): Promise<void> {
  const { AgentDashboard, DASHBOARD_HEIGHT_PCT } = await import("./agent-dashboard.js");

  await ctx.ui.custom<undefined>(
    (tui, _theme, _keybindings, done) => {
      return new AgentDashboard(tui, { manager, agentActivity, onViewConversation }, done);
    },
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "92%",
        maxHeight: `${DASHBOARD_HEIGHT_PCT}%`,
      },
    },
  );
}
