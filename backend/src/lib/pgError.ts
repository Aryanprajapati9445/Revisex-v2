function pgErrorCode(err: unknown): string | null {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === "string" ? code : null;
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
