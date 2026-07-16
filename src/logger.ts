export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): LogLevel | undefined {
  const raw = process.env.PI_SUBAGENTS_LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return process.stdout.isTTY || process.stderr.isTTY ? undefined : "warn";
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
  if (level === "error" || level === "warn") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
};
