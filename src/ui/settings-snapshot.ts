import type { AgentManager } from "../agent-manager.js";
import { getAnimationStyle, getDashboardRefreshInterval, getOrchestrationMode, getUiStyle } from "../agent-registry.js";
import type { SubagentsSettings } from "../settings.js";
import type { JoinMode } from "../types.js";

/**
 * Build a settings snapshot for persistence.
 */
export function buildSettingsSnapshot(
  manager: AgentManager,
  getDefaultMaxTurns: () => number | undefined,
  getGraceTurns: () => number,
  getDefaultJoinMode: () => JoinMode,
  isSchedulingEnabled: () => boolean,
): SubagentsSettings {
  return {
    maxConcurrent: manager.getMaxConcurrent(),
    ...manager.getSessionLimits(),
    // 0 = unlimited — per SubagentsSettings.defaultMaxTurns docstring and
    // normalizeMaxTurns() in agent-runner.ts (which maps 0 → undefined).
    defaultMaxTurns: getDefaultMaxTurns() ?? 0,
    graceTurns: getGraceTurns(),
    defaultJoinMode: getDefaultJoinMode(),
    schedulingEnabled: isSchedulingEnabled(),
    animationStyle: getAnimationStyle(),
    uiStyle: getUiStyle(),
    orchestrationMode: getOrchestrationMode(),
    dashboardRefreshInterval: getDashboardRefreshInterval(),
    sessionMaxSpawns: manager.getSessionMaxSpawns(),
    sessionMaxTurns: manager.getSessionMaxTurns(),
  };
}
