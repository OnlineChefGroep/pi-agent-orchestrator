import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getAgentConversation } from "../agent-runner.js";
import { formatLifetimeTokens, textResult } from "../tool-result-helpers.js";
import type { AgentRecord } from "../types.js";
import { formatDuration, getDisplayName } from "../ui/agent-format.js";
import { getSessionContextPercent } from "../usage.js";
import type { ToolContext } from "./context.js";

/**
 * Build the stats summary string for an agent record.
 * Includes tool uses, lifetime tokens, context fill percent, compaction count, and duration.
 *
 * @param record - The agent record to summarize
 * @param contextPercent - Context-window fill percent, or null when unavailable
 * @returns Array of formatted stat strings
 */
function buildStatsParts(record: AgentRecord, contextPercent: number | null): string[] {
  const tokens = formatLifetimeTokens(record);
  const duration = formatDuration(record.startedAt ?? 0, record.completedAt);
  const statsParts = [`Tool uses: ${record.toolUses}`];
  if (tokens) statsParts.push(tokens);
  if (contextPercent !== null) statsParts.push(`Context: ${Math.round(contextPercent)}%`);
  if (record.compactionCount) statsParts.push(`Compactions: ${record.compactionCount}`);
  statsParts.push(`Duration: ${duration}`);
  return statsParts;
}

/**
 * Build the status-dependent output body for an agent record.
 * Returns a status-specific message for running/error agents, otherwise the result text.
 *
 * @param record - The agent record whose body should be rendered
 * @returns The status-specific output body string
 */
function buildStatusBody(record: AgentRecord): string {
  if (record.status === "running") {
    return "Agent is still running. Use wait: true or check back later.";
  }
  if (record.status === "error") {
    return `Error: ${record.error}`;
  }
  return record.result?.trim() || "No output.";
}

export function createGetResultTool(ctx: ToolContext) {
  return defineTool({
    name: "get_subagent_result",
    label: "Get Agent Result",
    description:
      "Check status and retrieve results from a background agent. Use the agent ID returned by Agent with run_in_background.",
    parameters: Type.Object({
      agent_id: Type.String({
        description: "The agent ID to check.",
      }),
      wait: Type.Optional(
        Type.Boolean({
          description: "If true, wait for the agent to complete before returning. Default: false.",
        }),
      ),
      verbose: Type.Optional(
        Type.Boolean({
          description: "If true, include the agent's full conversation (messages + tool calls). Default: false.",
        }),
      ),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const record = ctx.manager.getRecord(params.agent_id);
      if (!record) {
        return textResult(`Agent not found: "${params.agent_id}". It may have been cleaned up.`);
      }

      // Wait for completion if requested.
      // This pre-mark is critical to avoid a race condition where onComplete sees resultConsumed as falsy
      // Pre-mark resultConsumed BEFORE awaiting: onComplete fires inside .then()
      // (attached earlier at spawn time) and always runs before this await resumes.
      // Setting the flag here prevents a redundant follow-up notification.
      if (params.wait && record.status === "running" && record.promise) {
        record.resultConsumed = true;
        ctx.cancelNudge(params.agent_id);
        await record.promise;
      }

      const displayName = getDisplayName(record.type);
      const contextPercent = getSessionContextPercent(record.session);
      const statsParts = buildStatsParts(record, contextPercent);

      let output =
        `Agent: ${record.id}\n` +
        `Type: ${displayName} | Status: ${record.status} | ${statsParts.join(" | ")}\n` +
        `Description: ${record.description}\n\n`;

      output += buildStatusBody(record);

      // Mark result as consumed — suppresses the completion notification
      if (record.status !== "running" && record.status !== "queued") {
        record.resultConsumed = true;
        ctx.cancelNudge(params.agent_id);
      }

      // Verbose: include full conversation
      if (params.verbose && record.session) {
        const conversation = getAgentConversation(record.session);
        if (conversation) {
          output += `\n\n--- Agent Conversation ---\n${conversation}`;
        }
      }

      return textResult(output);
    },
  });
}
