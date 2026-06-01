import { estimateReduction } from "../src/compaction.js";

const toolResult = (contentLength = 1000, toolName = "read") => ({
    role: "toolResult",
    content: "x".repeat(contentLength),
    toolName,
});
const assistant = (text = "response") => ({ role: "assistant", content: text });
const user = (text = "question") => ({ role: "user", content: text });

function buildConversation(turnCount) {
  const messages = [];
  for (let i = 1; i <= turnCount; i++) {
    messages.push(user(`question ${i}`));
    messages.push(assistant(`response ${i}`));
    // Use object format to trigger stringify
    messages.push({
      role: "toolResult",
      toolName: "read",
      content: { randomData: "x".repeat(800), nested: { arr: Array(100).fill("test") } }
    });
    messages.push({
      role: "toolResult",
      toolName: "write",
      content: { randomData: "y".repeat(600), nested: { arr: Array(100).fill("test") } }
    });
  }
  return messages;
}

const original = buildConversation(5000);
const compacted = [...original];

console.time("estimateReduction");
estimateReduction(original, compacted);
console.timeEnd("estimateReduction");
