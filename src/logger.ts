import { type BreadcrumbLevel, captureBreadcrumb } from "./error-tracking.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Patterns for sensitive data that should be scrubbed from log output.
// These prevent accidental leakage of secrets, tokens, and PII into logs.
const SENSITIVE_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // API keys, tokens, secrets (common formats)
  {
    pattern:
      /(api[_-]?key|secret|token|password|passwd|credential|auth[_-]?token|access[_-]?key|private[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9_\-./]{16,}/gi,
    replacement: "$1=[REDACTED]",
  },
  // Bearer tokens in headers
  { pattern: /(Bearer\s+)[A-Za-z0-9_\-./=]{16,}/g, replacement: "$1[REDACTED]" },
  // Authorization headers
  { pattern: /(Authorization:\s*)[^\s,;]+/gi, replacement: "$1[REDACTED]" },
  // JWT tokens (base64url-encoded with dots)
  { pattern: /eyJ[A-Za-z0-9_\-./=]+\.[A-Za-z0-9_\-./=]+\.[A-Za-z0-9_\-./=]+/g, replacement: "[JWT_REDACTED]" },
  // Email addresses
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: "[EMAIL_REDACTED]" },
  // URLs with credentials (https://user:pass@host)
  { pattern: /(https?:\/\/)[^:@\s]+:[^@\s]+@/g, replacement: "$1[REDACTED]:[REDACTED]@" },
  // npm tokens
  { pattern: /(npm_[A-Za-z0-9]{36,})/g, replacement: "[NPM_TOKEN_REDACTED]" },
  // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghf_)
  { pattern: /(gh[pousf]_[A-Za-z0-9_]{36,})/g, replacement: "[GH_TOKEN_REDACTED]" },
];

function currentLevel(): LogLevel {
  const raw = process.env.PI_SUBAGENTS_LOG_LEVEL?.toLowerCase();
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "warn";
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel()];
}

/**
 * Scrub sensitive data from log messages and fields.
 * Returns a new object with scrubbed values; does not mutate the input.
 * All string values are scanned against SENSITIVE_PATTERNS.
 */
function scrubFields(fields?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!fields) return undefined;
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "string") {
      let scrubbedValue = value;
      for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
        scrubbedValue = scrubbedValue.replace(pattern, replacement);
      }
      scrubbed[key] = scrubbedValue;
    } else if (typeof value === "object" && value !== null) {
      // Recurse into nested objects
      scrubbed[key] = scrubFields(value as Record<string, unknown>);
    } else {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}

/** Scrub a message string against sensitive patterns. */
function scrubMessage(message: string): string {
  let scrubbed = message;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  return scrubbed;
}

function write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  // Scrub sensitive data from log output before any processing
  const safeMessage = scrubMessage(message);
  const safeFields = scrubFields(fields);

  // Feed every log line as a breadcrumb into Sentry (no-op when disabled).
  // Breadcrumbs must respect the same redaction rules as console logs.
  captureBreadcrumb({
    message: safeMessage,
    level: level as BreadcrumbLevel,
    category: "logger",
    data: safeFields,
  });

  const entry = {
    ts: new Date().toISOString(),
    level,
    component: "pi-subagents",
    message: safeMessage,
    ...(safeFields ?? {}),
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
