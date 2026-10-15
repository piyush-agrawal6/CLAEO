import { env } from "@/lib/env";

/**
 * Structured JSON logging with secret redaction.
 *
 * Rules:
 * - Every log line is machine-parseable JSON.
 * - Keys that look sensitive (passwords, tokens, API keys, cookies...) are
 *   redacted before serialization, on every level, including nested objects.
 * - Strings containing URL basic-auth credentials (DataForSEO uses
 *   `https://login:password@...`) are scrubbed defensively.
 * - Provider responses are logged only through this module so redaction is
 *   always applied.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const REDACTED = "[REDACTED]";

/** Keys whose values are never allowed into logs. */
const SENSITIVE_KEY_PATTERN =
  /(pass(word|wd)?|secret|token|api[-_ ]?key|apikey|authorization|cookie|credential|session|private[-_ ]?key|access[-_ ]?key|refresh|id_token|signature|salt|hash)/i;

/** URLs that embed credentials: `scheme://user:pass@host`. */
const URL_CREDENTIALS_PATTERN = /\/\/([^/@\s]+):([^/@\s]+)@/g;

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 2_000;

function scrubString(value: string): string {
  const withScrubbedUrls = value.replace(URL_CREDENTIALS_PATTERN, `//[REDACTED]@`);
  if (withScrubbedUrls.length > MAX_STRING_LENGTH) {
    return `${withScrubbedUrls.slice(0, MAX_STRING_LENGTH)}…[truncated]`;
  }
  return withScrubbedUrls;
}

function redactValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[depth-limit]";

  if (typeof value === "string") return scrubString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();

  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message),
      code: "code" in value ? String((value as { code?: unknown }).code) : undefined,
      stack: env.NODE_ENV === "production" ? undefined : value.stack,
      cause: value.cause ? redactValue(value.cause, depth + 1) : undefined,
    };
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`…${value.length - MAX_ARRAY_ITEMS} more`);
    }
    return items;
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = REDACTED;
        continue;
      }
      result[key] = redactValue(inner, depth + 1);
    }
    return result;
  }

  return String(value);
}

/** Redact an arbitrary context object before it may be logged or displayed. */
export function redact(context: Record<string, unknown>): Record<string, unknown> {
  return redactValue(context, 0) as Record<string, unknown>;
}

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

function write(level: Exclude<LogLevel, "silent">, base: LogContext, message: string, context?: LogContext): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[env.LOG_LEVEL]) return;

  const payload = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...redact({ ...base, ...(context ?? {}) }),
  };

  const line = JSON.stringify(payload);
  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
  }
}

function createLogger(baseContext: LogContext): Logger {
  return {
    debug: (message, context) => write("debug", baseContext, message, context),
    info: (message, context) => write("info", baseContext, message, context),
    warn: (message, context) => write("warn", baseContext, message, context),
    error: (message, context) => write("error", baseContext, message, context),
    child: (context) => createLogger({ ...baseContext, ...context }),
  };
}

/** Root logger. Prefer `logger.child({...})` to attach request context. */
export const logger: Logger = createLogger({});
