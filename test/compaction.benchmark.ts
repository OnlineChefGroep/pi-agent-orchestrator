import { pruneOldToolOutputs } from "../src/compaction.js";

const toolResult = (contentLength = 1000, toolName = "read") => ({
  role: "toolResult" as const,
  content: "x".repeat(contentLength),
  toolName,
});
const assistant = (text = "response") => ({ role: "assistant" as const, content: text });
const user = (text = "question") => ({ role: "user" as const, content: text });

function buildConversation(turnCount: number) {
  const messages = [];
  for (let i = 1; i <= turnCount; i++) {
    messages.push(user(`question ${i}`));
    messages.push(assistant(`response ${i}`));
    messages.push(toolResult(800, "read"));
    messages.push(toolResult(600, "write"));
  }
  return messages;
}

const original = buildConversation(50000);

console.time("pruneOldToolOutputs");
pruneOldToolOutputs(original, 5);
console.timeEnd("pruneOldToolOutputs");
