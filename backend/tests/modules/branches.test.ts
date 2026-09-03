import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { createBranch, createProgram } from "../helpers/fixtures.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/branches", () => {
  it("lists active branches for a program, ordered by code", async () => {
    const program = await createProgram();
    await createBranch(program.id, { code: "MECH" });
    await createBranch(program.id, { code: "CSE" });

    const res = await request(app).get(`/api/branches?program_id=${program.id}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items.map((b: { code: string }) => b.code)).toEqual(["CSE", "MECH"]);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it("does not leak branches from another program", async () => {
    const programA = await createProgram({ code: "PA" });
    const programB = await createProgram({ code: "PB" });
    await createBranch(programA.id, { code: "AAA" });
    await createBranch(programB.id, { code: "BBB" });

    const res = await request(app).get(`/api/branches?program_id=${programA.id}`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].code).toBe("AAA");
  });

  it("requires program_id", async () => {
    const res = await request(app).get("/api/branches");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a malformed program_id with 422, not 500", async () => {
    const res = await request(app).get("/api/branches?program_id=not-a-uuid");
    expect(res.status).toBe(422);
  });

  it("returns an empty page for a program with no branches", async () => {
    const program = await createProgram();
    const res = await request(app).get(`/api/branches?program_id=${program.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });
});
