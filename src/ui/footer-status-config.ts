export interface FooterStatusConfig {
  /** When false, the Pi footer status slot is never updated. */
  enabled: boolean;
  /** Pi status slot key (default `subagents`). */
  slot: string;
  /** When true, show a zero-count line while no agents are active. */
  showWhenIdle: boolean;
  /**
   * Optional template with `{running}`, `{queued}`, and `{total}` placeholders.
   * When omitted, uses the built-in English summary.
   */
  template?: string;
}

export const DEFAULT_FOOTER_STATUS_CONFIG: FooterStatusConfig = {
  enabled: true,
  slot: "subagents",
  showWhenIdle: false,
};

export function sanitizeFooterStatusConfig(raw: unknown): Partial<FooterStatusConfig> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const config: Partial<FooterStatusConfig> = {};

  if (typeof source.enabled === "boolean") config.enabled = source.enabled;
  if (typeof source.showWhenIdle === "boolean") config.showWhenIdle = source.showWhenIdle;
  if (typeof source.slot === "string" && source.slot.length > 0 && source.slot.length <= 64) {
    config.slot = source.slot;
  }
  if (typeof source.template === "string" && source.template.length > 0 && source.template.length <= 256) {
    config.template = source.template;
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

export function resolveFooterStatusConfig(
  override?: Partial<FooterStatusConfig>,
): FooterStatusConfig {
  return {
    ...DEFAULT_FOOTER_STATUS_CONFIG,
    ...override,
  };
}

export function formatFooterStatusText(
  config: FooterStatusConfig,
  runningCount: number,
  queuedCount: number,
): string | undefined {
  if (!config.enabled) return undefined;
  const total = runningCount + queuedCount;
  if (total === 0 && !config.showWhenIdle) return undefined;

  if (config.template) {
    return config.template
      .replaceAll("{running}", String(runningCount))
      .replaceAll("{queued}", String(queuedCount))
      .replaceAll("{total}", String(total));
  }

  if (total === 0) return "0 agents";
  const parts: string[] = [];
  if (runningCount > 0) parts.push(`${runningCount} running`);
  if (queuedCount > 0) parts.push(`${queuedCount} queued`);
  return `${parts.join(", ")} agent${total === 1 ? "" : "s"}`;
}
