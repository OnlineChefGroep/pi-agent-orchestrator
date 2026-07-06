import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AgentRecord } from "../types.js";
import type { AgentActivity } from "./agent-ui-types.js";
import type { TUI } from "./tui-shim.js";

export async function viewAgentConversation(
  ctx: ExtensionCommandContext,
  record: AgentRecord,
  agentActivity: Map<string, AgentActivity>,
): Promise<void> {
  if (!record.session) {
    ctx.ui.notify(`Agent is ${record.status === "queued" ? "queued" : "expired"} — no session available.`, "info");
    return;
  }

  const { ConversationViewer, VIEWPORT_HEIGHT_PCT } = await import("./conversation-viewer.js");
  const session = record.session;
  const activity = agentActivity.get(record.id);

  await ctx.ui.custom<undefined>(
    (tui, theme, _keybindings, done) => {
      return new ConversationViewer(tui as TUI, session, record, activity, theme, done);
    },
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: "90%", maxHeight: `${VIEWPORT_HEIGHT_PCT}%` },
    },
  );
}
