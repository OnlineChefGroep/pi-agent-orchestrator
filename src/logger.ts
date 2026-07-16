export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

let cachedLevel: LogLevel | undefined | null = null;

export function __test_resetLoggerCache(): void {
  cachedLevel = null;
}

function currentLevel(): LogLevel | undefined {
  if (cachedLevel !== null) return cachedLevel;

  const raw = process.env.PI_SUBAGENTS_LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    cachedLevel = raw;
    return cachedLevel;
  }

  cachedLevel = process.stdout.isTTY || process.stderr.isTTY ? undefined : "warn";
  return cachedLevel;
}

function shouldLog(level: LogLevel): boolean {
  const configuredLevel = currentLevel();
  return configuredLevel !== undefined && LEVELS[level] >= LEVELS[configuredLevel];
}

function write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    component: "pi-subagents",
    message,
    ...(fields ?? {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
