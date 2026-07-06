import { describe, expect, it } from "vitest";
import {
  type CompactableMessage,
  DEFAULT_KEEP_TURNS,
  estimateReduction,
  MIN_KEEP_TURNS,
  pruneOldToolOutputs,
  shouldCompact,
} from "../src/compaction.js";

/** Create a simple assistant message. */
function assistant(text = "response"): CompactableMessage {
  return { role: "assistant", content: text };
}

/** Create a simple user message. */
function user(text = "question"): CompactableMessage {
  return { role: "user", content: text };
}

/** Create a tool result message with the given length. */
function toolResult(contentLength = 1000, toolName = "read"): CompactableMessage {
  return {
    role: "toolResult",
    content: "x".repeat(contentLength),
    toolName,
  };
}

/**
 * Build a conversation with N turns where each turn is:
 * user → assistant → 2 tool results
 */
function buildConversation(turnCount: number): CompactableMessage[] {
  const messages: CompactableMessage[] = [];
  for (let i = 1; i <= turnCount; i++) {
    messages.push(user(`question ${i}`));
    messages.push(assistant(`response ${i}`));
    messages.push(toolResult(800, "read"));
    messages.push(toolResult(600, "write"));
  }
  return messages;
}

describe("compaction", () => {
  describe("pruneOldToolOutputs", () => {
    it("keeps last 3 turns intact", () => {
      const conversation = buildConversation(5);
      const result = pruneOldToolOutputs(conversation, 3);

      // Last 3 turns (3 * 4 = 12 messages) should all be present
      const lastMessages = conversation.slice(-12);
      const resultFromEnd = result.slice(-12);

      expect(resultFromEnd.length).toBe(12);
      for (let i = 0; i < lastMessages.length; i++) {
        expect(resultFromEnd[i].role).toBe(lastMessages[i].role);
        expect(resultFromEnd[i].content).toBe(lastMessages[i].content);
      }
    });

    it("removes tool outputs from turns older than keepLastNTurns", () => {
      const conversation = buildConversation(5);
      const result = pruneOldToolOutputs(conversation, 3);

      // Total: 5 turns * 4 messages = 20 messages
      // After pruning with keepTurns=3, last 3 turns (12 msgs) intact
      // First 2 turns keep user + assistant (2 each = 4 msgs), drop 4 tool results
      // Expected: 12 (intact) + 4 (user+assistant from old turns) = 16
      expect(result.length).toBe(16);

      // Verify no toolResult from the first 2 turns remains
      const firstTurnToolResults = result.filter(
        (m) => m.role === "toolResult" && (m.content as string).length === 800,
      );
      // Only tool results from turns 3-5 should survive
      expect(firstTurnToolResults.length).toBe(3);
    });

    it("never removes user messages", () => {
      // Build a conversation with 10 turns
      const conversation = buildConversation(10);
      const originalUserCount = conversation.filter((m) => m.role === "user").length;
      const result = pruneOldToolOutputs(conversation, 2);
      const resultUserCount = result.filter((m) => m.role === "user").length;

      expect(originalUserCount).toBe(10);
      expect(resultUserCount).toBe(10);
    });

    it("handles empty message array", () => {
      const result = pruneOldToolOutputs([], 5);
      expect(result).toEqual([]);
    });

    it("clamps keepLastNTurns to MIN_KEEP_TURNS when too small", () => {
      const conversation = buildConversation(5);
      // keepLastNTurns=1 should be clamped to MIN_KEEP_TURNS=2
      const result = pruneOldToolOutputs(conversation, 1);
      const resultUserCount = result.filter((m) => m.role === "user").length;

      // Should still have all 5 user messages
      expect(resultUserCount).toBe(5);
      // Should still have all 5 assistant messages
      const resultAssistantCount = result.filter((m) => m.role === "assistant").length;
      expect(resultAssistantCount).toBe(5);
      // Only last 2 turns' tool results should survive (2 turns × 2 tool results each = 4)
      const toolCount = result.filter((m) => m.role === "toolResult").length;
      expect(toolCount).toBe(4);
    });

    it("keeps all messages when keepLastNTurns exceeds total turns", () => {
      const conversation = buildConversation(3);
      const result = pruneOldToolOutputs(conversation, 10);
      expect(result.length).toBe(conversation.length);
    });

    it("preserves assistant messages even from old turns", () => {
      const conversation = buildConversation(5);
      const result = pruneOldToolOutputs(conversation, 2);
      const resultAssistantCount = result.filter((m) => m.role === "assistant").length;

      // All assistant messages should survive
      expect(resultAssistantCount).toBe(5);
    });

    it("handles content as array (non-string)", () => {
      const messages: CompactableMessage[] = [
        user("hello"),
        assistant("hi"),
        { role: "toolResult" as const, content: [{ type: "text", text: "data" }], toolName: "read" },
        assistant("done"),
      ];
      // keepLastNTurns=1 is clamped to MIN_KEEP_TURNS=2, so both turns survive fully
      const result = pruneOldToolOutputs(messages, 1);

      // Walking in reverse with keepTurns=2:
      // i=3: assistant("done") → assistantSeen=1 → keep
      // i=2: toolResult → assistantSeen=1 → 1<2 → keep
      // i=1: assistant("hi") → assistantSeen=2 → keep
      // i=0: user("hello") → always keep
      // Result: 4 messages (all intact since both turns fit in the window)
      expect(result.length).toBe(4);
    });

    it("prunes tool results with array content from old turns", () => {
      // 3-turn conversation, keep only last 2 turns
      const messages: CompactableMessage[] = [
        user("q1"),
        assistant("a1"),
        { role: "toolResult" as const, content: [{ type: "text", text: "old tool output" }], toolName: "read" },
        user("q2"),
        assistant("a2"),
        { role: "toolResult" as const, content: [{ type: "text", text: "new tool output" }], toolName: "write" },
      ];
      const result = pruneOldToolOutputs(messages, MIN_KEEP_TURNS);

      // Last 2 turns survive: q1,a1,tool(kept?), q2,a2,tool(kept)
      // Wait — keepTurns=2, so tool results from the last 2 turns stay
      // Turn 2: assistant("a2") → tool result kept
      // Turn 1: assistant("a1") → assistantSeen=2, tool result at assistantSeen=1 → kept
      // All 6 messages remain
      expect(result.length).toBe(6);
    });

    it("does not mutate the original array", () => {
      const original = buildConversation(3);
      const copy = [...original];
      pruneOldToolOutputs(original, 2);
      expect(original).toEqual(copy);
    });
  });

  describe("estimateReduction", () => {
    it("calculates reduction percent correctly", () => {
      const original: CompactableMessage[] = [
        user("question"),
        assistant("answer"),
        toolResult(10000), // ~2500 tokens
        toolResult(8000), // ~2000 tokens
      ];
      const compacted: CompactableMessage[] = [user("question"), assistant("answer")];

      const result = estimateReduction(original, compacted);
      expect(result.originalTokens).toBeGreaterThan(result.compactedTokens);
      expect(result.reductionPercent).toBeGreaterThan(0);
      expect(result.turnCount).toBe(1);
    });

    it("returns 0 when no messages removed", () => {
      const identical: CompactableMessage[] = [user("question"), assistant("answer")];
      const result = estimateReduction(identical, identical);
      expect(result.originalTokens).toBe(result.compactedTokens);
      expect(result.reductionPercent).toBe(0);
    });

    it("handles empty arrays", () => {
      const result = estimateReduction([], []);
      expect(result.originalTokens).toBe(0);
      expect(result.compactedTokens).toBe(0);
      expect(result.reductionPercent).toBe(0);
      expect(result.turnCount).toBe(0);
    });

    it("counts turns from original message array", () => {
      const original: CompactableMessage[] = [
        user("q1"),
        assistant("a1"),
        user("q2"),
        assistant("a2"),
        user("q3"),
        assistant("a3"),
      ];
      const compacted = [user("q1"), assistant("a1")];
      const result = estimateReduction(original, compacted);
      expect(result.turnCount).toBe(3);
    });
  });

  describe("shouldCompact", () => {
    it("returns true when token estimate exceeds threshold", () => {
      const messages: CompactableMessage[] = [toolResult(10000)]; // ~2500 tokens
      expect(shouldCompact(messages, 1000)).toBe(true);
    });

    it("returns false when token estimate is under threshold", () => {
      const messages: CompactableMessage[] = [user("hi")];
      expect(shouldCompact(messages, 1000)).toBe(false);
    });

    it("returns false for empty messages", () => {
      expect(shouldCompact([], 0)).toBe(false);
      expect(shouldCompact([], 100)).toBe(false);
    });
  });

  describe("constants", () => {
    it("DEFAULT_KEEP_TURNS is correct value", () => {
      expect(DEFAULT_KEEP_TURNS).toBe(5);
    });

    it("MIN_KEEP_TURNS is correct value", () => {
      expect(MIN_KEEP_TURNS).toBe(2);
    });

    it("MIN_KEEP_TURNS ≤ DEFAULT_KEEP_TURNS", () => {
      expect(MIN_KEEP_TURNS).toBeLessThanOrEqual(DEFAULT_KEEP_TURNS);
    });
  });
});
