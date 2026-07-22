import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getAgentConversation } from "../agent-runner.js";
import { formatLifetimeTokens, textResult } from "../tool-result-helpers.js";
import { formatDuration, getDisplayName } from "../ui/agent-format.js";
import { getSessionContextPercent } from "../usage.js";
import type { ToolContext } from "./context.js";

function createAbortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error && reason.name === "AbortError") return reason;

  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "get_subagent_result wait aborted";
  return new DOMException(message, "AbortError");
}

function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === "AbortError";
}

async function waitForPromiseOrAbort(promise: Promise<unknown>, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await promise;
    return;
  }

  if (signal.aborted) throw createAbortError(signal);

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => settle(() => reject(createAbortError(signal)));

    signal.addEventListener("abort", onAbort, { once: true });

    // Close the race between the initial aborted check and listener registration.
    if (signal.aborted) {
      onAbort();
      return;
    }

    promise.then(
      () => settle(resolve),
      error => settle(() => reject(error)),
    );
  });
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
          description: "If true, wait for the agent to complete before returning. Press Esc to cancel the wait. Default: false.",
        }),
      ),
      verbose: Type.Optional(
        Type.Boolean({
          description: "If true, include the agent's full conversation (messages + tool calls). Default: false.",
        }),
      ),
    }),
    execute: async (_toolCallId, params, signal, _onUpdate, _ctx) => {
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
        const wasResultConsumed = record.resultConsumed;
        record.resultConsumed = true;
        ctx.cancelNudge(params.agent_id);

        try {
          await waitForPromiseOrAbort(record.promise, signal);
        } catch (error) {
          if (signal?.aborted && isAbortError(error)) {
            // Esc cancels only this blocking wait, not the background agent or its eventual result.
            // Restore notification eligibility so steering can continue without losing completion output.
            record.resultConsumed = wasResultConsumed;

            // If completion won the record-state race while the abort won the wait race,
            // onComplete already skipped its notification because resultConsumed was true.
            if (!wasResultConsumed && record.status !== "running" && record.status !== "queued") {
              ctx.sendIndividualNudge(record);
            }
          }
          throw error;
        }
      }

      const displayName = getDisplayName(record.type);
      const duration = formatDuration(record.startedAt ?? 0, record.completedAt);
      const tokens = formatLifetimeTokens(record);
      const contextPercent = getSessionContextPercent(record.session);
      const statsParts = [`Tool uses: ${record.toolUses}`];
      if (tokens) statsParts.push(tokens);
      if (contextPercent !== null) statsParts.push(`Context: ${Math.round(contextPercent)}%`);
      if (record.compactionCount) statsParts.push(`Compactions: ${record.compactionCount}`);
      statsParts.push(`Duration: ${duration}`);

      let output =
        `Agent: ${record.id}\n` +
        `Type: ${displayName} | Status: ${record.status} | ${statsParts.join(" | ")}\n` +
        `Description: ${record.description}\n\n`;

      if (record.status === "running") {
        output += "Agent is still running. Use wait: true (Esc to cancel) or check back later.";
      } else if (record.status === "error") {
        output += `Error: ${record.error}`;
      } else {
        output += record.result?.trim() || "No output.";
      }

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
