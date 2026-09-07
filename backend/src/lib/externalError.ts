import { ApiError } from "./apiError.js";
import { logger } from "./logger.js";

/**
 * Every call out to something we don't control — SMTP, an OAuth provider,
 * the DB driver's own connection-level failures (as opposed to the
 * application-level pg errors handled in pgError.ts) — goes through here on
 * failure. It logs the real cause server-side (redacted by logger.ts) with a
 * request ID for correlation, and returns a generic ApiError that's always
 * safe to send straight to the client: no hostnames, no provider response
 * text, no stack trace, no internal codes.
 *
 * Centralizing this in one place (rather than a try/catch per call site)
 * means every external integration gets the same treatment automatically —
 * a new call site is one `wrapExternal` call away from being safe by
 * default instead of one missed catch away from leaking a stack trace.
 */
export function wrapExternalError(
  err: unknown,
  opts: { category: string; status: number; code: string; message: string }
): ApiError {
  const providerCode =
    typeof err === "object" && err !== null
      ? ((err as { code?: unknown }).code ?? (err as { responseCode?: unknown }).responseCode)
      : undefined;

  logger.error("external_service_failure", {
    category: opts.category,
    providerCode,
    cause: err,
  });

  return new ApiError(opts.status, opts.code, opts.message, { cause: err });
}
