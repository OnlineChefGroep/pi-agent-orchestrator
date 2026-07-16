export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// PI_SUBAGENTS_LOG_LEVEL is read on every call so runtime changes take effect
// immediately. Only the TTY probe (the expensive part) is memoized. `ttyResolved`
// tracks whether the probe has run, since the cached value itself may legitimately
// be `undefined` (interactive terminals stay silent by default).
let cachedTtyLevel: LogLevel | undefined;
let ttyResolved = false;

/** Test-only: clear the memoized TTY default so env/TTY probes re-run. */
export function __test_resetLoggerCache(): void {
  cachedTtyLevel = undefined;
  ttyResolved = false;
}

function currentLevel(): LogLevel | undefined {
  const raw = process.env.PI_SUBAGENTS_LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }

  if (!ttyResolved) {
    cachedTtyLevel = process.stdout.isTTY || process.stderr.isTTY ? undefined : "warn";
    ttyResolved = true;
  }
  return cachedTtyLevel;
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
