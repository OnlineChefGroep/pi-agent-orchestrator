import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { HookRegistry } from "../hooks.js";

export function registerHooksCommand(pi: ExtensionAPI, hookRegistry: HookRegistry) {
  pi.registerCommand("hooks", {
    description: "Manage hooks",
    handler: async (_args, _ctx) => {
      const handlerMap = hookRegistry.getHandlers();
      const entries = [...handlerMap.entries()].sort(
        ([a], [b]) => a.localeCompare(b),
      );

      if (entries.length === 0) {
        pi.sendMessage({
          customType: "hooks-list",
          content: "No hooks registered.",
          display: true,
        });
        return;
      }

      const lines: string[] = ["## Registered Hooks\n"];
      for (const [event, handlers] of entries) {
        lines.push(`- **${event}**: ${handlers.length} handler${handlers.length === 1 ? "" : "s"}`);
      }
      lines.push(`\n*Total: ${entries.reduce((sum, [, h]) => sum + h.length, 0)} handler(s) across ${entries.length} event(s)*`);

      pi.sendMessage({
        customType: "hooks-list",
        content: lines.join("\n"),
        display: true,
      });
    },
  });
}
