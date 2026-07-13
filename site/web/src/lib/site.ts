export const CANONICAL_BASE_URL = "https://orchestrator.chefgroep.online";

export const PRODUCT_NAME = "Pi Agent Orchestrator";

export const NPM_PACKAGE = "@onlinechefgroep/pi-agent-orchestrator";

export function canonicalUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${CANONICAL_BASE_URL}${normalized === "/" ? "" : normalized}`;
}
