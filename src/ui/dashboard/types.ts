import type { AgentRecord } from "../../types.js";
import type { AgentActivity } from "../agent-ui-types.js";

export type DashboardBody = {
  lines: string[];
  focusLineByAgentId: Map<string, number>;
};

export type DashboardRenderState = {
  agents: AgentRecord[];
  selectedIndex: number;
  selectedIds: Set<string>;
  frame: number;
  agentActivity: Map<string, AgentActivity>;
};
