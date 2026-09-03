import type { PoolClient } from "pg";
import { pool } from "../../config/db.js";
import { ApiError } from "../../lib/apiError.js";
import { PERMISSION_CATALOG } from "../../lib/permissions.js";
import { isForeignKeyViolation, isUniqueViolation } from "../../lib/pgError.js";
import type { Permission, Role } from "../../types/index.js";

const ROLE_COLUMNS = `id, name, description, is_system, created_at, updated_at`;

export interface RoleWithPermissions extends Role {
  permissions: string[];
}

async function attachPermissions(role: Role): Promise<RoleWithPermissions> {
  const { rows } = await pool.query<{ permission_id: string }>(
    `SELECT permission_id FROM role_permissions WHERE role_id = $1 ORDER BY permission_id`,
    [role.id]
  );
  return { ...role, permissions: rows.map((r) => r.permission_id) };
}

export async function listPermissions(): Promise<Permission[]> {
  const { rows } = await pool.query<Permission>(`SELECT id, description FROM permissions ORDER BY id`);
  return rows;
}

export async function listRoles(): Promise<RoleWithPermissions[]> {
  const { rows } = await pool.query<Role>(`SELECT ${ROLE_COLUMNS} FROM roles ORDER BY name`);
  return Promise.all(rows.map(attachPermissions));
}

export async function getRoleById(id: string): Promise<RoleWithPermissions | null> {
  const { rows } = await pool.query<Role>(`SELECT ${ROLE_COLUMNS} FROM roles WHERE id = $1`, [id]);
  const role = rows[0];
  return role ? attachPermissions(role) : null;
}

export interface CreateRoleInput {
  name: string;
  description: string | null;
  permissions: string[];
}

function assertKnownPermissions(permissionIds: string[]): void {
  const catalog = new Set<string>(PERMISSION_CATALOG.map((p) => p.id));
  const unknown = permissionIds.filter((p) => !catalog.has(p));
  if (unknown.length > 0) {
    throw new ApiError(422, "VALIDATION_ERROR", `Unknown permission id(s): ${unknown.join(", ")}`);
  }
}

export async function createRole(input: CreateRoleInput): Promise<RoleWithPermissions> {
  assertKnownPermissions(input.permissions);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let role: Role;
    try {
      const { rows } = await client.query<Role>(
        `INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING ${ROLE_COLUMNS}`,
        [input.name, input.description]
      );
      role = rows[0]!;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError(409, "ROLE_NAME_TAKEN", "A role with this name already exists");
      }
      throw err;
    }
    if (input.permissions.length > 0) {
      await insertRolePermissions(client, role.id, input.permissions);
    }
    await client.query("COMMIT");
    return { ...role, permissions: [...input.permissions].sort() };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
}

export async function updateRole(id: string, input: UpdateRoleInput): Promise<RoleWithPermissions> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  if (sets.length === 0) {
    const role = await getRoleById(id);
    if (!role) throw new ApiError(404, "NOT_FOUND", "Role not found");
    return role;
  }

  params.push(id);
  try {
    const { rows } = await pool.query<Role>(
      `UPDATE roles SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING ${ROLE_COLUMNS}`,
      params
    );
    const role = rows[0];
    if (!role) throw new ApiError(404, "NOT_FOUND", "Role not found");
    return attachPermissions(role);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ApiError(409, "ROLE_NAME_TAKEN", "A role with this name already exists");
    }
    throw err;
  }
}

/** Replaces a role's entire permission set. Validates against the fixed catalog. */
export async function setRolePermissions(roleId: string, permissionIds: string[]): Promise<RoleWithPermissions> {
  assertKnownPermissions(permissionIds);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: roleRows } = await client.query<Role>(`SELECT ${ROLE_COLUMNS} FROM roles WHERE id = $1`, [roleId]);
    const role = roleRows[0];
    if (!role) throw new ApiError(404, "NOT_FOUND", "Role not found");

    await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
    if (permissionIds.length > 0) {
      await insertRolePermissions(client, roleId, permissionIds);
    }
    await client.query("COMMIT");
    return { ...role, permissions: [...new Set(permissionIds)].sort() };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function insertRolePermissions(client: PoolClient, roleId: string, permissionIds: string[]): Promise<void> {
  const values = permissionIds.map((_, i) => `($1, $${i + 2})`).join(", ");
  await client.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ${values}`, [
    roleId,
    ...permissionIds,
  ]);
}

export async function deleteRole(id: string): Promise<void> {
  const { rows } = await pool.query<{ is_system: boolean }>(`SELECT is_system FROM roles WHERE id = $1`, [id]);
  const role = rows[0];
  if (!role) throw new ApiError(404, "NOT_FOUND", "Role not found");
  if (role.is_system) throw new ApiError(403, "FORBIDDEN", "This role is a system default and cannot be deleted");
  await pool.query(`DELETE FROM roles WHERE id = $1`, [id]);
}

export async function listUserRoles(userId: string): Promise<RoleWithPermissions[]> {
  const { rows } = await pool.query<Role>(
    `SELECT r.id, r.name, r.description, r.is_system, r.created_at, r.updated_at
       FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = $1
      ORDER BY r.name`,
    [userId]
  );
  return Promise.all(rows.map(attachPermissions));
}

/** Replaces the full set of admin roles held by a user. */
export async function setUserRoles(userId: string, roleIds: string[]): Promise<RoleWithPermissions[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    if (roleIds.length > 0) {
      const values = roleIds.map((_, i) => `($1, $${i + 2})`).join(", ");
      try {
        await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ${values}`, [userId, ...roleIds]);
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          throw new ApiError(422, "VALIDATION_ERROR", "One or more role ids do not exist");
        }
        throw err;
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return listUserRoles(userId);
}
