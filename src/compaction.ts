/**
 * compaction.ts — Dual-phase conversation compaction.
 *
 * Phase 1 (prune): Remove tool outputs older than N turns to free context
 *                  window without losing conversation structure.
 * Phase 2 (summary): Rely on the upstream LLM to summarize (handled by
 *                    pi-coding-agent's built-in compaction).
 */

/** Default number of conversation turns to keep fully intact during pruning. */
export const DEFAULT_KEEP_TURNS = 5;

/** Minimum number of turns that can be kept — protects against overly aggressive pruning. */
export const MIN_KEEP_TURNS = 2;

/** Result of a compaction operation with token reduction metrics. */
export interface CompactResult {
  /** Estimated token count before compaction. */
  originalTokens: number;
  /** Estimated token count after compaction. */
  compactedTokens: number;
  /** Percentage reduction (0–100). */
  reductionPercent: number;
  /** Total number of conversation turns processed. */
  turnCount: number;
}

/** Minimal message shape needed for compaction — works with any message-like object. */
export interface CompactableMessage {
  role: "user" | "assistant" | "toolResult";
  content: string | unknown[];
  toolName?: string;
}

/**
 * Estimate token count from message content.
 * Rough heuristic: 1 token ≈ 4 characters for English text.
 */
function estimateTokens(message: CompactableMessage): number {
  let len = 0;
  if (typeof message.content === "string") {
    len = message.content.length;
  } else if (Array.isArray(message.content)) {
    for (let i = 0; i < message.content.length; i++) {
      const c = message.content[i] as any;
      if (c && c.type === "text" && typeof c.text === "string") {
        len += c.text.length;
      } else if (c && c.type === "tool_result" && typeof c.content === "string") {
        len += c.content.length;
      } else if (c && c.type === "tool_result" && Array.isArray(c.content)) {
        // Simple recursion for nested content arrays
        len += estimateTokens({ ...message, content: c.content }) * 4;
      } else if (c && c.type === "tool_use" && c.input != null) {
        len += JSON.stringify(c.input).length;
      } else {
        len += 50; // fast heuristic for other non-text blocks to avoid slow JSON stringify
      }
    }
  } else {
    len = JSON.stringify(message.content).length;
  }
  return Math.ceil(len / 4);
}

/**
 * Sum estimated tokens across an array of messages.
 */
function totalTokens(messages: CompactableMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m), 0);
}

/**
 * Prune old tool outputs from a conversation while keeping the last N turns intact.
 *
 * Walks messages in reverse. Each assistant message counts as one turn boundary.
 * Keeps the last `keepLastNTurns` turns fully intact (all message roles).
 * For older turns, removes tool result messages while preserving user and assistant messages.
 * Never removes user messages regardless of their position.
 *
 * Returns a new array — does not mutate the input.
 */
export function pruneOldToolOutputs(
  messages: CompactableMessage[],
  keepLastNTurns: number,
): CompactableMessage[] {
  // Guard: empty array
  if (messages.length === 0) return [];

  // Clamp to MIN_KEEP_TURNS to prevent overly aggressive pruning
  const keepTurns = Math.max(MIN_KEEP_TURNS, keepLastNTurns);

  // Walk in reverse, counting assistant messages as turn boundaries.
  // Tool results that appear BEFORE the Nth assistant (in reverse) belong to
  // turn N+1 from the end. They have assistantSeen = N at that point.
  // Keeping them requires: assistantSeen < keepTurns.
  const result: CompactableMessage[] = [];
  let assistantSeen = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    // Never remove user messages
    if (msg.role === "user") {
      result.push(msg);
      continue;
    }

    if (msg.role === "assistant") {
      assistantSeen++;
      // Assistant messages are always kept (even from old turns)
      result.push(msg);
      continue;
    }

    // Tool results — kept only if they belong to a turn within the keep window.
    // A tool result belongs to the NEXT assistant encountered going forward,
    // which is the PREVIOUS assistant encountered going backward.
    // At this point, assistantSeen is the count of assistants already seen
    // (i.e., the turn index from the end for the NEXT assistant in reverse).
    // The tool result belongs to turn (assistantSeen + 1) from the end,
    // which should be kept when (assistantSeen + 1) ≤ keepTurns → assistantSeen < keepTurns.
    if (assistantSeen < keepTurns) {
      result.push(msg);
    }
    // else: skip — this tool output is from an old turn
  }

  return result.reverse();
}

/**
 * Estimate the reduction achieved by compaction.
 *
 * @param original - Original message array before compaction.
 * @param compacted - Message array after compaction (e.g. from pruneOldToolOutputs).
 * @returns CompactResult with token estimates and reduction percentage.
 */
export function estimateReduction(
  original: CompactableMessage[],
  compacted: CompactableMessage[],
): CompactResult {
  const originalTokens = totalTokens(original);
  const compactedTokens = totalTokens(compacted);
  const reductionPercent = originalTokens > 0
    ? Math.round(((originalTokens - compactedTokens) / originalTokens) * 100)
    : 0;

  // Count total turns (assistant messages) in the original
  const turnCount = original.filter((m) => m.role === "assistant").length;

  return { originalTokens, compactedTokens, reductionPercent, turnCount };
}

/**
 * Check whether a conversation exceeds a given token threshold.
 * Hook point — callers can use this to decide whether to trigger compaction
 * mid-session before context window overflow.
 */
export function shouldCompact(messages: CompactableMessage[], thresholdTokens: number): boolean {
  return totalTokens(messages) > thresholdTokens;
}
