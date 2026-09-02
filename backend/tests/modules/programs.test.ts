import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { createProgram } from "../helpers/fixtures.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/programs", () => {
  it("returns the standard success envelope with pagination", async () => {
    await createProgram({ code: "BTECH" });
    await createProgram({ code: "MBA" });

    const res = await request(app).get("/api/programs");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
  });

  it("paginates with page and limit query params", async () => {
    await createProgram({ code: "A1" });
    await createProgram({ code: "A2" });
    await createProgram({ code: "A3" });

    const res = await request(app).get("/api/programs?page=2&limit=2");

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });
});

describe("GET /api/programs/:id", () => {
  it("returns 404 in the standard error envelope for a missing program", async () => {
    const res = await request(app).get("/api/programs/00000000-0000-0000-0000-000000000000");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: "NOT_FOUND", message: expect.any(String) } });
  });

  it("returns 400 for a malformed id", async () => {
    const res = await request(app).get("/api/programs/not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("unmatched route", () => {
  it("returns the standard error envelope", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: "NOT_FOUND", message: expect.any(String) } });
  });
});
