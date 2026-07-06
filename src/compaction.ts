/**
 * compaction.ts — Dual-phase conversation compaction.
 *
 * Phase 1 (prune): Remove tool outputs older than N turns to free context
 * window without losing conversation structure.
 * Phase 2 (summary): Rely on the upstream LLM to summarize (handled by
 * pi-coding-agent's built-in compaction).
 */

/** Default number of conversation turns to keep fully intact during pruning. */
export const DEFAULT_KEEP_TURNS = 5;

/** Minimum number of turns that can be kept — protects against overly aggressive pruning. */
export const MIN_KEEP_TURNS = 2;

/** Result of a compaction operation with token reduction metrics. */
export interface CompactResult {
  originalTokens: number;
  compactedTokens: number;
  reductionPercent: number;
  turnCount: number;
}

/** Minimal message shape needed for compaction — works with any message-like object. */
export interface CompactableMessage {
  role: "user" | "assistant" | "toolResult";
  content: string | unknown[];
  toolName?: string;
}

/** Narrow unknown values to plain object records. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Estimate the character length contributed by a single content block. */
function blockLength(block: unknown): number {
  if (!isRecord(block)) return 50;

  const type = block["type"];
  if (type === "text") {
    const text = block["text"];
    return typeof text === "string" ? text.length : 50;
  }
  if (type === "tool_result") {
    return toolResultLength(block);
  }
  if (type === "tool_use") {
    const input = block["input"];
    return input != null ? JSON.stringify(input).length : 50;
  }
  return 50; // fast heuristic for other unknown blocks
}

/** Estimate the character length of a tool_result block. */
function toolResultLength(block: unknown): number {
  if (!isRecord(block)) return 50;

  const content = block["content"];
  if (typeof content === "string") {
    return content.length;
  }
  if (Array.isArray(content)) {
    let len = 0;
    for (const nested of content) {
      if (isRecord(nested) && nested["type"] === "text") {
        const text = nested["text"];
        len += typeof text === "string" ? text.length : 50;
      } else {
        len += 50;
      }
    }
    return len;
  }
  return 50; // default penalty for non-text tool results
}

/**
 * Estimate token count from message content.
 * Rough heuristic: 1 token ≈ 4 characters for English text.
 */
function estimateTokens(message: CompactableMessage): number {
  let len = 0;
  const { content } = message;

  if (typeof content === "string") {
    len = content.length;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      len += blockLength(block);
    }
  } else {
    len = JSON.stringify(content).length;
  }

  return Math.ceil(len / 4);
}

/** Sum estimated tokens across an array of messages. */
function totalTokens(messages: readonly CompactableMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m), 0);
}

/**
 * Prune old tool outputs from a conversation while keeping the last N turns intact.
 *
 * Walks messages in reverse. Each assistant message counts as one turn boundary.
 * Keeps the last `keepLastNTurns` turns fully intact (all message roles).
 * For older turns, removes tool result messages while preserving user and assistant messages.
 * Never removes user messages regardless of their position.
 */
export function pruneOldToolOutputs(
  messages: readonly CompactableMessage[],
  keepLastNTurns: number,
): CompactableMessage[] {
  if (!messages.length) return [];

  const keepTurns = Math.max(MIN_KEEP_TURNS, keepLastNTurns);
  const result: CompactableMessage[] = [];
  let assistantSeen = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg.role === "user") {
      result.push(msg); // Always keep user prompts
    } else if (msg.role === "assistant") {
      assistantSeen++;
      result.push(msg); // Always keep assistant reasoning
    } else if (assistantSeen < keepTurns) {
      result.push(msg); // Keep toolResult if it belongs to a recent turn
    }
  }

  return result.reverse();
}

/**
 * Estimate the reduction achieved by compaction.
 */
export function estimateReduction(
  original: readonly CompactableMessage[],
  compacted: readonly CompactableMessage[],
): CompactResult {
  const originalTokens = totalTokens(original);
  const compactedTokens = totalTokens(compacted);

  const reductionPercent =
    originalTokens > 0 ? Math.round(((originalTokens - compactedTokens) / originalTokens) * 100) : 0;

  const turnCount = original.filter((m) => m.role === "assistant").length;

  return { originalTokens, compactedTokens, reductionPercent, turnCount };
}

/** Check whether a conversation exceeds a given token threshold. */
export function shouldCompact(messages: readonly CompactableMessage[], thresholdTokens: number): boolean {
  return totalTokens(messages) > thresholdTokens;
}
