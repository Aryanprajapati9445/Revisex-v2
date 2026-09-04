import { pool } from "../../src/config/db.js";

export async function truncateAll(): Promise<void> {
  await pool.query(
    // bookmarks, ratings, comments and note_tags come along via CASCADE, since
    // they all reference notes or users. `tags` does not — nothing links it
    // back up the graph — so without naming it here tag rows leak between
    // tests and a "which tags exist" assertion depends on run order.
    `TRUNCATE TABLE files, notes, subjects, branches, programs, users, tags,
                   audit_log, user_roles, role_permissions, roles, permissions
     RESTART IDENTITY CASCADE`
  );
}
