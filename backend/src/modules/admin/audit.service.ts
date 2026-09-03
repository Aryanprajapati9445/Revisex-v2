import { pool } from "../../config/db.js";
import type { AuditLogEntry } from "../../types/index.js";

export interface AuditFilters {
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
}

export async function listAuditLog(
  filters: AuditFilters,
  limit: number,
  offset: number
): Promise<{ rows: AuditLogEntry[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.actorUserId) {
    params.push(filters.actorUserId);
    conditions.push(`actor_user_id = $${params.length}`);
  }
  if (filters.action) {
    params.push(filters.action);
    conditions.push(`action = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`created_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`created_at <= $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<AuditLogEntry>(
    `SELECT id, actor_user_id, action, resource, resource_id, outcome, metadata, created_at
       FROM audit_log ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_log ${where}`,
    params
  );
  return { rows, total: Number(countRows[0]?.count ?? 0) };
}
