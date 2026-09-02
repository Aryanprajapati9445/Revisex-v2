import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { signAccessToken } from "../../src/lib/jwt.js";
import { optionalAuth, requireAuth, requireRole, requireScope } from "../../src/middleware/auth.js";
import { errorHandler } from "../../src/middleware/errorHandler.js";

function buildTestApp() {
  const app = express();
  app.use(express.json());

  app.get("/protected", requireAuth, (req, res) => {
    res.json({ userId: req.user!.id, role: req.user!.role });
  });

  app.get("/admin-only", requireAuth, requireRole("superuser", "program_admin"), (_req, res) => {
    res.json({ ok: true });
  });

  app.get(
    "/scoped/:branchId",
    requireAuth,
    requireScope(async (req) => ({ programId: null, branchId: req.params.branchId })),
    (_req, res) => {
      res.json({ ok: true });
    }
  );

  app.get("/public", optionalAuth, (req, res) => {
    res.json({ userId: req.user?.id ?? null });
  });

  app.use(errorHandler);
  return app;
}

const payload = {
  sub: "11111111-1111-1111-1111-111111111111",
  role: "student" as const,
  program_id: null,
  branch_id: "22222222-2222-2222-2222-222222222222",
};

describe("requireAuth", () => {
  it("rejects a missing Authorization header", async () => {
    const res = await request(buildTestApp()).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects a malformed token", async () => {
    const res = await request(buildTestApp()).get("/protected").set("Authorization", "Bearer not-a-token");
    expect(res.status).toBe(401);
  });

  it("attaches req.user for a valid token", async () => {
    const token = signAccessToken(payload);
    const res = await request(buildTestApp()).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: payload.sub, role: payload.role });
  });
});

describe("requireRole", () => {
  it("rejects a role not in the allowed set", async () => {
    const token = signAccessToken(payload); // role: student
    const res = await request(buildTestApp()).get("/admin-only").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("allows a role in the allowed set", async () => {
    const token = signAccessToken({ ...payload, role: "superuser" });
    const res = await request(buildTestApp()).get("/admin-only").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("requireScope", () => {
  it("allows when scope matches", async () => {
    const token = signAccessToken(payload);
    const res = await request(buildTestApp())
      .get(`/scoped/${payload.branch_id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("masks a scope mismatch as 404", async () => {
    const token = signAccessToken(payload);
    const res = await request(buildTestApp())
      .get("/scoped/33333333-3333-3333-3333-333333333333")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("superuser bypasses scope checks", async () => {
    const token = signAccessToken({ ...payload, role: "superuser" });
    const res = await request(buildTestApp())
      .get("/scoped/33333333-3333-3333-3333-333333333333")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("optionalAuth", () => {
  it("proceeds unauthenticated with no header", async () => {
    const res = await request(buildTestApp()).get("/public");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: null });
  });

  it("attaches req.user when a valid token is present", async () => {
    const token = signAccessToken(payload);
    const res = await request(buildTestApp()).get("/public").set("Authorization", `Bearer ${token}`);
    expect(res.body).toEqual({ userId: payload.sub });
  });
});
