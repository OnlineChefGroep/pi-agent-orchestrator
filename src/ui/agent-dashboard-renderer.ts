/**
 * agent-dashboard-renderer.ts — Barrel re-export file.
 *
 * All rendering logic has been split into focused component files
 * under ./dashboard/. This file re-exports everything for backward
 * compatibility so existing imports continue to work.
 */
export {
  activityText,
  agentStats,
  buildDashboardBodyLines,
  type DashboardBody,
  type DashboardRenderState,
  getDisplayName,
  renderCompactRow,
  renderDashboardDetailPanel,
  renderDashboardEmpty,
  renderDashboardFooter,
  renderDashboardHeader,
  renderDashboardHelp,
  renderProgressBar,
  renderRunningCard,
  renderSectionTitle,
  renderSwarmSection,
  renderTurnProgress,
  statusColor,
  statusIcon,
} from "./dashboard/index.js";
