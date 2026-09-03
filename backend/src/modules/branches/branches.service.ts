import { and, asc, count, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { Branch } from "../../types/index.js";

export async function listActiveBranches(
  programId: string,
  limit: number,
  offset: number
): Promise<{ rows: Branch[]; total: number }> {
  const where = and(eq(schema.branches.program_id, programId), eq(schema.branches.is_active, true));

  const [rows, countRows] = await Promise.all([
    db.select().from(schema.branches).where(where).orderBy(asc(schema.branches.code)).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.branches).where(where),
  ]);
  // count() always returns exactly one row.
  return { rows, total: countRows[0]!.total };
}

// Soft-removed branches (is_active = false) stay hidden here too, so the
// detail route cannot resolve what the list route deliberately omits.
export async function getBranchById(id: string): Promise<Branch | null> {
  const [row] = await db
    .select()
    .from(schema.branches)
    .where(and(eq(schema.branches.id, id), eq(schema.branches.is_active, true)))
    .limit(1);
  return row ?? null;
}
