import bcrypt from "bcrypt";
import { pool } from "../../src/config/db.js";
import type { UserRole } from "../../src/types/index.js";

// Hashes directly via bcrypt rather than importing lib/password.ts (created
// in Task 3) — this file is created in Task 1, before that module exists,
// and fixture password hashes don't need to go through the app's configured
// salt-round setting.
const FIXTURE_SALT_ROUNDS = 4;

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now()}${counter}`;
}

export async function createProgram(
  overrides: Partial<{ code: string; name: string; duration_semesters: number }> = {}
) {
  const code = (overrides.code ?? unique("PRG")).toUpperCase().slice(0, 20);
  const { rows } = await pool.query(
    `INSERT INTO programs (code, name, duration_semesters) VALUES ($1, $2, $3) RETURNING *`,
    [code, overrides.name ?? "Test Program", overrides.duration_semesters ?? 8]
  );
  return rows[0];
}

export async function createBranch(
  programId: string,
  overrides: Partial<{ code: string; name: string }> = {}
) {
  const code = (overrides.code ?? unique("BR")).toUpperCase().slice(0, 20);
  const { rows } = await pool.query(
    `INSERT INTO branches (program_id, code, name) VALUES ($1, $2, $3) RETURNING *`,
    [programId, code, overrides.name ?? "Test Branch"]
  );
  return rows[0];
}

export async function createSubject(
  branchId: string,
  overrides: Partial<{ code: string; name: string; semester: number }> = {}
) {
  const code = (overrides.code ?? unique("SUB")).toUpperCase().slice(0, 20);
  const { rows } = await pool.query(
    `INSERT INTO subjects (branch_id, code, name, semester) VALUES ($1, $2, $3, $4) RETURNING *`,
    [branchId, code, overrides.name ?? "Test Subject", overrides.semester ?? 1]
  );
  return rows[0];
}

export interface CreateUserOptions {
  role: UserRole;
  programId?: string | null;
  branchId?: string | null;
  password?: string;
  email?: string;
}

export async function createUserFixture(options: CreateUserOptions) {
  const email = options.email ?? `${unique("user")}@test.edu`;
  const password = options.password ?? "password123";
  const passwordHash = await bcrypt.hash(password, FIXTURE_SALT_ROUNDS);
  const { rows } = await pool.query(
    `INSERT INTO users (email, full_name, password_hash, role, program_id, branch_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [email, "Test User", passwordHash, options.role, options.programId ?? null, options.branchId ?? null]
  );
  return { user: rows[0], password };
}

// Admin RBAC fixtures ---------------------------------------------------

/** Inserts the fixed permission catalog. Idempotent within a test run. */
export async function seedPermissionCatalog(): Promise<void> {
  await pool.query(
    `INSERT INTO permissions (id, description) VALUES
       ('users.read', 'View admin-managed user accounts'),
       ('users.create', 'Create admin-managed user accounts'),
       ('users.update', 'Edit admin-managed user accounts'),
       ('users.delete', 'Delete admin-managed user accounts'),
       ('roles.manage', 'Create, edit and assign admin roles'),
       ('audit.read', 'View the audit log'),
       ('settings.update', 'Change platform settings')
     ON CONFLICT (id) DO NOTHING`
  );
}

export async function createRoleFixture(permissionIds: string[] = [], overrides: { name?: string; isSystem?: boolean } = {}) {
  const name = overrides.name ?? unique("Role");
  const { rows } = await pool.query(
    `INSERT INTO roles (name, is_system) VALUES ($1, $2) RETURNING *`,
    [name, overrides.isSystem ?? false]
  );
  const role = rows[0];
  if (permissionIds.length > 0) {
    const values = permissionIds.map((_, i) => `($1, $${i + 2})`).join(", ");
    await pool.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ${values}`, [
      role.id,
      ...permissionIds,
    ]);
  }
  return role;
}

export async function assignUserRole(userId: string, roleId: string): Promise<void> {
  await pool.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`, [userId, roleId]);
}
