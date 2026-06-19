import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentManager } from "../agent-manager.js";
import { getDefaultJoinMode, isSchedulingEnabled, setDefaultJoinMode, setSchedulingEnabled } from "../agent-registry.js";
import { getDefaultMaxTurns, getGraceTurns, setDefaultMaxTurns, setGraceTurns } from "../agent-runner.js";
import { showAgentsMenu } from "../output-handler.js";
import type { SubagentScheduler } from "../schedule.js";
import type { AgentActivity } from "../ui/agent-ui-types.js";

export function registerAgentsCommand(
  pi: ExtensionAPI,
  manager: AgentManager,
  scheduler: SubagentScheduler,
  agentActivity: Map<string, AgentActivity>,
) {
  pi.registerCommand("agents", {
    description: "Manage agents",
    handler: async (_args, ctx) => {
      await showAgentsMenu(ctx, {
        pi,
        manager,
        scheduler,
        agentActivity,
        isSchedulingEnabled,
        getDefaultMaxTurns,
        getGraceTurns,
        getDefaultJoinMode,
        setDefaultMaxTurns,
        setGraceTurns,
        setDefaultJoinMode,
        setSchedulingEnabled,
      });
    },
  });
}
