import { and, asc, count, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { Subject } from "../../types/index.js";

export interface ListSubjectsOptions {
  branchId: string;
  semester?: number;
}

export async function listActiveSubjects(
  options: ListSubjectsOptions,
  limit: number,
  offset: number
): Promise<{ rows: Subject[]; total: number }> {
  const conditions = [eq(schema.subjects.branch_id, options.branchId), eq(schema.subjects.is_active, true)];
  if (options.semester !== undefined) {
    conditions.push(eq(schema.subjects.semester, options.semester));
  }
  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(schema.subjects)
      .where(where)
      .orderBy(asc(schema.subjects.semester), asc(schema.subjects.code))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(schema.subjects).where(where),
  ]);
  // count() always returns exactly one row.
  return { rows, total: countRows[0]!.total };
}

export async function getSubjectById(id: string): Promise<Subject | null> {
  const [row] = await db.select().from(schema.subjects).where(eq(schema.subjects.id, id)).limit(1);
  return row ?? null;
}
