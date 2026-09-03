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

export async function getBranchById(id: string): Promise<Branch | null> {
  const [row] = await db.select().from(schema.branches).where(eq(schema.branches.id, id)).limit(1);
  return row ?? null;
}
