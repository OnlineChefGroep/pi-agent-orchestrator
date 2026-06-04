import type { LifetimeUsage, SessionLike } from "../usage.js";
import type { Theme } from "./theme.js";

export type UICtx = {
  setStatus(key: string, text: string | undefined): void;
  setWidget(
    key: string,
    content: undefined | ((tui: any, theme: Theme) => { render(): string[]; invalidate(): void }),
    options?: { placement?: "aboveEditor" | "belowEditor" },
  ): void;
};

export interface AgentActivity {
  activeTools: Map<string, string>;
  toolUses: number;
  responseText: string;
  session?: SessionLike;
  turnCount: number;
  maxTurns?: number;
  lifetimeUsage: LifetimeUsage;
  /** Timestamp (ms) of the most recent activity for heatmap rendering. */
  lastSeenMs?: number;
}

export interface AgentDetails {
  displayName: string;
  description: string;
  subagentType: string;
  toolUses: number;
  tokens: string;
  durationMs: number;
  status: "queued" | "running" | "completed" | "steered" | "aborted" | "stopped" | "error" | "background";
  activity?: string;
  spinnerFrame?: number;
  modelName?: string;
  tags?: string[];
  turnCount?: number;
  maxTurns?: number;
  agentId?: string;
  error?: string;
  validated?: boolean;
}
