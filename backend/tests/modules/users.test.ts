import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/lib/jwt.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { createBranch, createProgram, createUserFixture } from "../helpers/fixtures.js";

const app = createApp();

function authHeader(user: { id: string; role: string; program_id: string | null; branch_id: string | null }) {
  const token = signAccessToken({
    sub: user.id,
    role: user.role as never,
    program_id: user.program_id,
    branch_id: user.branch_id,
  });
  return `Bearer ${token}`;
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/users/me and PATCH /api/users/me", () => {
  it("returns and updates the caller's own profile", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user } = await createUserFixture({ role: "student", branchId: branch.id });

    const meRes = await request(app).get("/api/users/me").set("Authorization", authHeader(user));
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.id).toBe(user.id);

    const patchRes = await request(app)
      .patch("/api/users/me")
      .set("Authorization", authHeader(user))
      .send({ full_name: "Updated Name" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.full_name).toBe("Updated Name");
  });
});

describe("GET /api/users (roster)", () => {
  it("forbids a student from listing users", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: student } = await createUserFixture({ role: "student", branchId: branch.id });

    const res = await request(app).get("/api/users").set("Authorization", authHeader(student));
    expect(res.status).toBe(403);
  });

  it("scopes a branch_admin's roster to their own branch", async () => {
    const program = await createProgram();
    const branchA = await createBranch(program.id, { code: "BA" });
    const branchB = await createBranch(program.id, { code: "BB" });
    const { user: admin } = await createUserFixture({ role: "branch_admin", branchId: branchA.id });
    await createUserFixture({ role: "student", branchId: branchA.id });
    await createUserFixture({ role: "student", branchId: branchB.id });

    const res = await request(app).get("/api/users").set("Authorization", authHeader(admin));

    expect(res.status).toBe(200);
    // The admin's own row plus the one student in branchA — none from branchB.
    expect(res.body.data.items.every((u: { branch_id: string }) => u.branch_id === branchA.id)).toBe(true);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it("superuser sees everyone", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: superuser } = await createUserFixture({ role: "superuser" });
    await createUserFixture({ role: "student", branchId: branch.id });

    const res = await request(app).get("/api/users").set("Authorization", authHeader(superuser));

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(2);
  });
});

describe("POST /api/users (admin-created accounts)", () => {
  it("lets a branch_admin create a student in their own branch", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: admin } = await createUserFixture({ role: "branch_admin", branchId: branch.id });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
      .send({
        email: "newstudent@test.edu",
        password: "password123",
        full_name: "New Student",
        role: "student",
        branch_id: branch.id,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe("student");
  });

  it("forbids a branch_admin from creating a student in a different branch", async () => {
    const program = await createProgram();
    const branchA = await createBranch(program.id, { code: "BA" });
    const branchB = await createBranch(program.id, { code: "BB" });
    const { user: admin } = await createUserFixture({ role: "branch_admin", branchId: branchA.id });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
      .send({
        email: "sneaky@test.edu",
        password: "password123",
        full_name: "Sneaky",
        role: "student",
        branch_id: branchB.id,
      });

    expect(res.status).toBe(403);
  });

  it("forbids a branch_admin from creating an equal-or-higher role", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: admin } = await createUserFixture({ role: "branch_admin", branchId: branch.id });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
      .send({
        email: "escalate@test.edu",
        password: "password123",
        full_name: "Escalate",
        role: "branch_admin",
        branch_id: branch.id,
      });

    expect(res.status).toBe(403);
  });

  it("lets a program_admin create a branch_admin for a branch inside their program", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: admin } = await createUserFixture({ role: "program_admin", programId: program.id });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", authHeader(admin))
      .send({
        email: "newadmin@test.edu",
        password: "password123",
        full_name: "New Admin",
        role: "branch_admin",
        branch_id: branch.id,
      });

    expect(res.status).toBe(201);
  });
});

describe("DELETE /api/users/:id", () => {
  it("lets a superuser delete any user", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: superuser } = await createUserFixture({ role: "superuser" });
    const { user: target } = await createUserFixture({ role: "student", branchId: branch.id });

    const res = await request(app).delete(`/api/users/${target.id}`).set("Authorization", authHeader(superuser));
    expect(res.status).toBe(200);

    const getRes = await request(app).get("/api/users/me").set("Authorization", authHeader(target));
    expect(getRes.status).toBe(404); // token still parses, but the account is gone on any DB-backed lookup
  });
});
