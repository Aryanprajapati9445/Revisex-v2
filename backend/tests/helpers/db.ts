import { pool } from "../../src/config/db.js";

export async function truncateAll(): Promise<void> {
  await pool.query(
    `TRUNCATE TABLE files, notes, subjects, branches, programs, users,
                   audit_log, user_roles, role_permissions, roles, permissions
     RESTART IDENTITY CASCADE`
  );
}
