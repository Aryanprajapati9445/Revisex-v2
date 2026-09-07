// Centralized, redacting server-side logger. Every log call goes through
// `redact` first so secrets (passwords, tokens, auth headers, cookies,
// connection strings) can never leave the process even if a caller passes
// a raw error/object that happens to carry one — the alternative is trusting
// every call site to remember to strip them, which is how they leak.
import { getRequestId } from "./requestContext.js";

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential/i;
const CONNECTION_STRING = /(:\/\/[^:@/\s]+:)[^@/\s]+(@)/g; // scheme://user:pass@ → scheme://user:***@
// Catches secrets embedded in free text (an error message, a URL query
// string) rather than as a distinct object key — e.g. "...password=hunter2"
// or "token: abc.def.ghi" inside a caught exception's .message.
const INLINE_SECRET = /(pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential)\s*[:=]\s*\S+/gi;

function redactString(value: string): string {
  return value
    .replace(CONNECTION_STRING, (_m, prefix: string, suffix: string) => `${prefix}***${suffix}`)
    .replace(INLINE_SECRET, (_m, key: string) => `${key}=[redacted]`);
}

function redact(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (value == null || depth > 6) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "[circular]";
  seen.add(value as object);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      code: (value as { code?: unknown }).code,
      stack: value.stack ? redactString(value.stack) : undefined,
    };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, seen, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(val, seen, depth + 1);
  }
  return out;
}

export type LogMeta = Record<string, unknown>;

function write(level: "error" | "warn" | "info", event: string, meta?: LogMeta): void {
  const requestId = getRequestId();
  const line = {
    level,
    event,
    ...(requestId ? { requestId } : {}),
    ...((redact(meta) as LogMeta) ?? {}),
    time: new Date().toISOString(),
  };
  // eslint-disable-next-line no-console
  console[level === "info" ? "log" : level](JSON.stringify(line));
}

export const logger = {
  error: (event: string, meta?: LogMeta) => write("error", event, meta),
  warn: (event: string, meta?: LogMeta) => write("warn", event, meta),
  info: (event: string, meta?: LogMeta) => write("info", event, meta),
};
