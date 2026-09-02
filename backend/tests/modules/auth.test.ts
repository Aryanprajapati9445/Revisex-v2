import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { createBranch, createProgram, createUserFixture } from "../helpers/fixtures.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/auth/register", () => {
  it("creates a student account and returns tokens", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);

    const res = await request(app).post("/api/auth/register").send({
      email: "student@test.edu",
      password: "password123",
      full_name: "Test Student",
      branch_id: branch.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe("student");
    expect(res.body.data.user).not.toHaveProperty("password_hash");
    expect(typeof res.body.data.accessToken).toBe("string");
    expect(typeof res.body.data.refreshToken).toBe("string");
  });

  it("rejects a duplicate email with 409", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "dupe@test.edu" });

    const res = await request(app).post("/api/auth/register").send({
      email: "dupe@test.edu",
      password: "password123",
      full_name: "Another Student",
      branch_id: branch.id,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects an invalid body with 422", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "not-an-email" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user } = await createUserFixture({
      role: "student",
      branchId: branch.id,
      email: "login@test.edu",
      password: "correctpassword",
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "login@test.edu",
      password: "correctpassword",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
    expect(typeof res.body.data.accessToken).toBe("string");
  });

  it("rejects a wrong password with 401", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "wrong@test.edu", password: "rightpass" });

    const res = await request(app).post("/api/auth/login").send({ email: "wrong@test.edu", password: "wrongpass" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an unknown email with 401 (not 404 — no account enumeration)", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nobody@test.edu", password: "whatever" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/refresh and GET /api/auth/me", () => {
  it("refreshes into a new usable access token", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "refresh@test.edu", password: "password123" });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "refresh@test.edu", password: "password123" });

    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: loginRes.body.data.refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.data.accessToken).toBe("string");

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${refreshRes.body.data.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe("refresh@test.edu");
  });

  it("rejects a malformed refresh token", async () => {
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken: "garbage" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns success with null data", async () => {
    const res = await request(app).post("/api/auth/logout").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
  });
});
