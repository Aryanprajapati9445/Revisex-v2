import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { Program } from "../../types/index.js";

export async function listActivePrograms(
  limit: number,
  offset: number
): Promise<{ rows: Program[]; total: number }> {
  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.is_active, true))
      .orderBy(asc(schema.programs.code))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(schema.programs).where(eq(schema.programs.is_active, true)),
  ]);
  // count() always returns exactly one row.
  return { rows, total: countRows[0]!.total };
}

export async function getProgramById(id: string): Promise<Program | null> {
  const [row] = await db.select().from(schema.programs).where(eq(schema.programs.id, id)).limit(1);
  return row ?? null;
}
