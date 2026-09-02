import { pool } from "../../src/config/db.js";

export async function truncateAll(): Promise<void> {
  await pool.query(
    `TRUNCATE TABLE files, notes, subjects, branches, programs, users RESTART IDENTITY CASCADE`
  );
}
