/**
 * context.ts — Extract parent conversation context for subagent inheritance.
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Extract plain text from a message content block array.
 *
 * Filters for objects with `type: "text"` and joins their `text` fields.
 * Non-text blocks (images, tool calls, etc.) are silently skipped.
 *
 * Single-pass loop instead of `.filter().map().join("\n")` — avoids
 * 3 intermediate array allocations per call. Called once per assistant
 * message in `buildParentContext`, so for a 200-message conversation
 * that's 200 × 3 = 600 fewer intermediate arrays.
 *
 * @param content - Array of message content blocks (typically from assistant messages)
 * @returns Concatenated text of all text blocks, joined by newlines
 */
interface TextContentBlock {
  type: string;
  text?: string;
}

export function extractText(content: unknown[]): string {
  if (!content || content.length === 0) return "";
  const parts: string[] = [];
  for (const c of content as TextContentBlock[]) {
    if (c && c.type === "text") {
      parts.push(c.text ?? "");
    }
  }
  return parts.join("\n");
}

/**
 * Format a message entry into a context part (e.g. "[User]: ...").
 * Returns an empty string when the message yields no usable text.
 */
function formatMessagePart(msg: { role: string; content?: string | unknown[] }): string {
  if (msg.role === "user") {
    const content = msg.content;
    const text = (typeof content === "string" ? content : extractText(Array.isArray(content) ? content : [])).trim();
    return text ? `[User]: ${text}` : "";
  }
  if (msg.role === "assistant") {
    const content = msg.content;
    const text = extractText(Array.isArray(content) ? content : []).trim();
    return text ? `[Assistant]: ${text}` : "";
  }
  // Skip toolResult messages — too verbose for context
  return "";
}

/**
 * Build a text representation of the parent conversation context.
 * Used when inherit_context is true to give the subagent visibility
 * into what has been discussed/done so far.
 */
export function buildParentContext(ctx: ExtensionContext): string {
  const entries = ctx.sessionManager.getBranch();
  if (!entries || entries.length === 0) return "";

  const parts: string[] = [];

  for (const entry of entries) {
    if (entry.type === "message") {
      const part = formatMessagePart(entry.message);
      if (part) parts.push(part);
    } else if (entry.type === "compaction") {
      // Include compaction summaries — they're already condensed
      if (entry.summary) {
        parts.push(`[Summary]: ${entry.summary}`);
      }
    }
  }

  if (parts.length === 0) return "";

  return `# Parent Conversation Context
The following is the conversation history from the parent session that spawned you.
Use this context to understand what has been discussed and decided so far.

${parts.join("\n\n")}

---
# Your Task (below)
`;
}
