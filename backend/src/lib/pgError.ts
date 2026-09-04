/**
 * Reads the SQLSTATE off a driver error, following `cause` when it is wrapped.
 *
 * Raw `pool.query` rejects with the pg error itself, but Drizzle rejects with a
 * DrizzleQueryError carrying the pg error as `cause` — so a helper that only
 * looked at the top-level object classified every Drizzle write failure as
 * unknown, and a duplicate code surfaced as 500 instead of 409.
 */
function pgErrorCode(err: unknown): string | null {
  // Bounded rather than `while (true)`: a cyclic cause chain would otherwise hang.
  for (let current = err, depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return null;
    const code = (current as { code?: unknown }).code;
    // Drizzle's own wrapper does not set `code`, so a non-string one is skipped
    // rather than treated as the answer.
    if (typeof code === "string") return code;
    if (!("cause" in current)) return null;
    current = (current as { cause: unknown }).cause;
  }
  return null;
}

/** Postgres 23505: unique_violation */
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23505";
}

/** Postgres 23503: foreign_key_violation */
export function isForeignKeyViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23503";
}

/** Postgres 23514: check_violation */
export function isCheckViolation(err: unknown): boolean {
  return pgErrorCode(err) === "23514";
}

/** Postgres 22P02: invalid_text_representation (e.g. a malformed UUID literal). */
export function isInvalidTextRepresentation(err: unknown): boolean {
  return pgErrorCode(err) === "22P02";
}
