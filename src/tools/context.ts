import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentManager } from "../agent-manager.js";
import type { BatchOrchestrator } from "../batch-orchestrator.js";
import type { HookRegistry } from "../hooks.js";
import type { SubagentScheduler } from "../schedule.js";
import type { SwarmCoordinator } from "../swarm-join.js";
import type { AgentRecord } from "../types.js";
import type { AgentTopWidget } from "../ui/agent-top-widget.js";
import type { AgentActivity } from "../ui/agent-ui-types.js";
import type { AgentWidget } from "../ui/agent-widget.js";

export interface ToolContext {
  pi: ExtensionAPI;
  manager: AgentManager;
  widget: AgentWidget;
  topWidget: AgentTopWidget;
  agentActivity: Map<string, AgentActivity>;
  batchOrchestrator: BatchOrchestrator;
  scheduler: SubagentScheduler;
  swarmJoin: SwarmCoordinator;
  hookRegistry: HookRegistry;
  sendIndividualNudge: (record: AgentRecord) => void;
  cancelNudge: (key: string) => void;
  scheduleNudge: (key: string, fn: () => void) => void;
}
