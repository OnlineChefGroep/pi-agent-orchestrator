import type { AgentRecord } from "../../types.js";
import { getLifetimeTotal } from "../../usage.js";
import {
  describeActivity,
  formatDuration,
  formatTokens,
  formatTurns,
  getDisplayName,
} from "../agent-format.js";
import type { AgentActivity } from "../agent-ui-types.js";
import { getAgentSpinnerFrame, getSpinnerFrameForStyle } from "../animation.js";
import type { DashboardTheme } from "../theme.js";

export { getDisplayName };

export function statusIcon(rec: AgentRecord, frame: number): string {
  if (rec.status === "running") return getAgentSpinnerFrame(rec.id, frame);
  if (rec.status === "queued") return getAgentSpinnerFrame(rec.id, frame, "queue");
  if (rec.status === "completed" || rec.status === "steered") return "✓";
  if (rec.status === "stopped") return "■";
  if (rec.status === "error" || rec.status === "aborted") return "✕";
  return getSpinnerFrameForStyle("pulse", frame);
}

export function statusLabel(rec: AgentRecord): string {
  if (rec.status === "running") return "RUN";
  if (rec.status === "queued") return "QUEUE";
  if (rec.status === "completed") return "DONE";
  if (rec.status === "steered") return "STEERED";
  if (rec.status === "stopped") return "STOPPED";
  return "FAILED";
}

export function statusColor(rec: AgentRecord, th: DashboardTheme): string {
  if (rec.status === "running") return th.accent;
  if (rec.status === "completed" || rec.status === "steered") return th.success;
  if (rec.status === "error" || rec.status === "aborted") return th.error;
  if (rec.status === "queued") return th.highlight;
  return th.dim;
}

export function agentStats(rec: AgentRecord, activity?: AgentActivity): string {
  const parts: string[] = [];
  if (activity) parts.push(formatTurns(activity.turnCount, activity.maxTurns));
  if (activity?.lifetimeUsage) parts.push(formatTokens(getLifetimeTotal(activity.lifetimeUsage)));
  if (rec.toolUses > 0) parts.push(`${rec.toolUses} tool${rec.toolUses === 1 ? "" : "s"}`);
  if (rec.startedAt) parts.push(formatDuration(rec.startedAt, rec.completedAt));
  return parts.filter(Boolean).join(" · ");
}

export function activityText(rec: AgentRecord, activity?: AgentActivity): string {
  if (activity && rec.status === "running") return describeActivity(activity.activeTools, activity.responseText);
  if (rec.result && (rec.status === "completed" || rec.status === "steered")) {
    return rec.result.replace(/\n/g, " ").slice(0, 120);
  }
  if (rec.error) return `Error: ${rec.error.slice(0, 100)}`;
  if (rec.status === "queued") return "waiting for an available execution slot";
  return rec.status;
}
