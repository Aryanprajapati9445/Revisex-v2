import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/lib/jwt.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { assignUserRole, createRoleFixture, createUserFixture, seedPermissionCatalog } from "../helpers/fixtures.js";

const app = createApp();

function authHeader(user: { id: string; role: string; program_id?: string | null; branch_id?: string | null }) {
  const token = signAccessToken({
    sub: user.id,
    role: user.role as never,
    program_id: user.program_id ?? null,
    branch_id: user.branch_id ?? null,
  });
  return `Bearer ${token}`;
}

beforeEach(async () => {
  await truncateAll();
  await seedPermissionCatalog();
});

afterAll(async () => {
  await pool.end();
});

describe("admin permission gate", () => {
  it("blocks a user with no admin role at 403, not merely hides UI", async () => {
    const { user } = await createUserFixture({ role: "superuser" });

    const res = await request(app).get("/api/admin/users").set("Authorization", authHeader(user));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects an unauthenticated request at 401", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("a role granting only users.read can list but not delete users", async () => {
    const role = await createRoleFixture(["users.read"], { name: "Read Only" });
    const { user: actor } = await createUserFixture({ role: "superuser" });
    await assignUserRole(actor.id, role.id);
    const { user: target } = await createUserFixture({ role: "superuser" });

    const list = await request(app).get("/api/admin/users").set("Authorization", authHeader(actor));
    expect(list.status).toBe(200);
    expect(list.body.data.items.some((u: { id: string }) => u.id === target.id)).toBe(true);

    const del = await request(app).delete(`/api/admin/users/${target.id}`).set("Authorization", authHeader(actor));
    expect(del.status).toBe(403);
    expect(del.body.error.code).toBe("FORBIDDEN");

    const stillThere = await pool.query("SELECT 1 FROM users WHERE id = $1", [target.id]);
    expect(stillThere.rowCount).toBe(1);
  });

  it("a permission change takes effect on the very next request, not on next login", async () => {
    const role = await createRoleFixture([], { name: "Empty" });
    const { user: actor } = await createUserFixture({ role: "superuser" });
    await assignUserRole(actor.id, role.id);

    const before = await request(app).get("/api/admin/users").set("Authorization", authHeader(actor));
    expect(before.status).toBe(403);

    // Same JWT, no re-login/refresh — only the DB-side grant changed.
    await pool.query("INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, 'users.read')", [role.id]);

    const after = await request(app).get("/api/admin/users").set("Authorization", authHeader(actor));
    expect(after.status).toBe(200);
  });
});

describe("role management (Super Admin)", () => {
  async function superAdmin() {
    const role = await createRoleFixture(["roles.manage"], { name: "Super Admin", isSystem: true });
    const { user } = await createUserFixture({ role: "superuser" });
    await assignUserRole(user.id, role.id);
    return user;
  }

  it("creates a role, grants it users.read only, assigns it to a user", async () => {
    const admin = await superAdmin();

    const createRes = await request(app)
      .post("/api/admin/roles")
      .set("Authorization", authHeader(admin))
      .send({ name: "Viewer Test", permissions: ["users.read"] });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.permissions).toEqual(["users.read"]);
    const roleId = createRes.body.data.id;

    const { user: target } = await createUserFixture({ role: "superuser" });
    const assignRes = await request(app)
      .put(`/api/admin/users/${target.id}/roles`)
      .set("Authorization", authHeader(admin))
      .send({ roles: [roleId] });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data).toHaveLength(1);
    expect(assignRes.body.data[0].id).toBe(roleId);

    // The newly-assigned user can list but not delete, proving the grant is live.
    const list = await request(app).get("/api/admin/users").set("Authorization", authHeader(target));
    expect(list.status).toBe(200);
    const del = await request(app).delete(`/api/admin/users/${admin.id}`).set("Authorization", authHeader(target));
    expect(del.status).toBe(403);
  });

  it("rejects an unknown permission id with 422", async () => {
    const admin = await superAdmin();
    const res = await request(app)
      .post("/api/admin/roles")
      .set("Authorization", authHeader(admin))
      .send({ name: "Bad Role", permissions: ["not.a.real.permission"] });
    expect(res.status).toBe(422);
  });

  it("refuses to delete a system role", async () => {
    const admin = await superAdmin();
    const systemRole = await createRoleFixture(["users.read"], { name: "System Role", isSystem: true });

    const res = await request(app).delete(`/api/admin/roles/${systemRole.id}`).set("Authorization", authHeader(admin));
    expect(res.status).toBe(403);
  });

  it("a non-Super-Admin cannot manage roles even with other admin permissions", async () => {
    const role = await createRoleFixture(["users.read", "users.create", "users.update", "users.delete"], {
      name: "Admin (no roles.manage)",
    });
    const { user } = await createUserFixture({ role: "superuser" });
    await assignUserRole(user.id, role.id);

    const res = await request(app).post("/api/admin/roles").set("Authorization", authHeader(user)).send({ name: "New" });
    expect(res.status).toBe(403);
  });
});

describe("audit log", () => {
  async function superAdmin() {
    const role = await createRoleFixture(["roles.manage", "audit.read"], { name: "Super Admin" });
    const { user } = await createUserFixture({ role: "superuser" });
    await assignUserRole(user.id, role.id);
    return user;
  }

  it("records exactly one entry per admin write, with actor, action, resource and timestamp", async () => {
    const admin = await superAdmin();

    const createRes = await request(app)
      .post("/api/admin/roles")
      .set("Authorization", authHeader(admin))
      .send({ name: "Audited Role", permissions: [] });
    expect(createRes.status).toBe(201);

    const { rows } = await pool.query("SELECT * FROM audit_log WHERE action = 'roles.create'");
    expect(rows).toHaveLength(1);
    const entry = rows[0];
    expect(entry.actor_user_id).toBe(admin.id);
    expect(entry.resource).toBe("role");
    expect(entry.outcome).toBe("success");
    expect(entry.created_at).toBeTruthy();
  });

  it("records a failed write as outcome=failure, still exactly once", async () => {
    const admin = await superAdmin();
    const systemRole = await createRoleFixture([], { name: "Protected", isSystem: true });

    const res = await request(app).delete(`/api/admin/roles/${systemRole.id}`).set("Authorization", authHeader(admin));
    expect(res.status).toBe(403);

    const { rows } = await pool.query("SELECT * FROM audit_log WHERE action = 'roles.delete'");
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe("failure");
  });

  it("never stores a password or token in metadata", async () => {
    const role = await createRoleFixture(["users.create"], { name: "Creator" });
    const { user: admin } = await createUserFixture({ role: "superuser" });
    await assignUserRole(admin.id, role.id);

    const res = await request(app)
      .post("/api/admin/users")
      .set("Authorization", authHeader(admin))
      .send({ email: "new.hire@test.edu", password: "super-secret-pw", full_name: "New Hire", role: "superuser" });
    expect(res.status).toBe(201);

    const { rows } = await pool.query("SELECT metadata FROM audit_log WHERE action = 'users.create'");
    const serialized = JSON.stringify(rows[0].metadata);
    expect(serialized).not.toContain("super-secret-pw");
    expect(serialized.toLowerCase()).not.toContain("password");
  });

  it("filters by actor, action and date range, and paginates", async () => {
    const admin = await superAdmin();
    await request(app).post("/api/admin/roles").set("Authorization", authHeader(admin)).send({ name: "R1" });
    await request(app).post("/api/admin/roles").set("Authorization", authHeader(admin)).send({ name: "R2" });

    const byAction = await request(app)
      .get("/api/admin/audit-log")
      .query({ action: "roles.create" })
      .set("Authorization", authHeader(admin));
    expect(byAction.status).toBe(200);
    expect(byAction.body.data.pagination.total).toBe(2);

    const byActor = await request(app)
      .get("/api/admin/audit-log")
      .query({ actor_user_id: admin.id })
      .set("Authorization", authHeader(admin));
    expect(byActor.body.data.pagination.total).toBe(2);

    const future = await request(app)
      .get("/api/admin/audit-log")
      .query({ from: "2999-01-01T00:00:00.000Z" })
      .set("Authorization", authHeader(admin));
    expect(future.body.data.items).toEqual([]);
  });

  it("is itself permission-gated behind audit.read", async () => {
    const role = await createRoleFixture(["users.read"], { name: "No Audit Access" });
    const { user } = await createUserFixture({ role: "superuser" });
    await assignUserRole(user.id, role.id);

    const res = await request(app).get("/api/admin/audit-log").set("Authorization", authHeader(user));
    expect(res.status).toBe(403);
  });
});
