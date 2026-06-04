// Dashboard component barrel exports

export { buildDashboardBodyLines } from "./body.js";
export { renderCompactRow } from "./compact-row.js";
export { renderDashboardHeader } from "./header.js";
export {
  activityText,
  agentStats,
  getDisplayName,
  statusColor,
  statusIcon,
} from "./helpers.js";
export {
  renderDashboardDetailPanel,
  renderDashboardEmpty,
  renderDashboardFooter,
  renderDashboardHelp,
} from "./panels.js";
export { renderProgressBar, renderTurnProgress } from "./progress.js";
export { renderRunningCard } from "./running-card.js";
export { renderSectionTitle } from "./section-title.js";
export { renderSwarmSection } from "./swarm-section.js";
export type { DashboardBody, DashboardRenderState } from "./types.js";
