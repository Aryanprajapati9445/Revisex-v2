import { pool } from "../config/db.js";
import type { AuditOutcome } from "../types/index.js";

export interface AuditEntryInput {
  actorUserId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  /**
   * A JSON-serializable snapshot of what changed. Callers MUST NOT include
   * password_hash, tokens, or any other secret here — this is the one
   * function that writes audit_log, so that rule holds in exactly one place.
   */
  metadata?: Record<string, unknown> | null;
}

export async function recordAudit(entry: AuditEntryInput): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (actor_user_id, action, resource, resource_id, outcome, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.actorUserId,
      entry.action,
      entry.resource,
      entry.resourceId,
      entry.outcome,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ]
  );
}

/**
 * Runs a write and records exactly one audit entry for it — 'success' if it
 * resolves, 'failure' (with the error message, never a stack trace or
 * request body) if it throws. The error is always rethrown after logging.
 */
export async function withAudit<T>(
  entry: Omit<AuditEntryInput, "outcome" | "metadata"> & { metadata?: Record<string, unknown> | null },
  run: () => Promise<T>
): Promise<T> {
  try {
    const result = await run();
    await recordAudit({ ...entry, outcome: "success" });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await recordAudit({ ...entry, outcome: "failure", metadata: { ...entry.metadata, error: message } });
    throw err;
  }
}
