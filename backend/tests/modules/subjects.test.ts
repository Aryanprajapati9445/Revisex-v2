import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { createBranch, createProgram, createSubject } from "../helpers/fixtures.js";

const app = createApp();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/subjects", () => {
  it("lists active subjects for a branch, ordered by semester then code", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createSubject(branch.id, { code: "S2B", semester: 2 });
    await createSubject(branch.id, { code: "S1B", semester: 1 });
    await createSubject(branch.id, { code: "S1A", semester: 1 });

    const res = await request(app).get(`/api/subjects?branch_id=${branch.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((s: { code: string }) => s.code)).toEqual(["S1A", "S1B", "S2B"]);
  });

  it("filters by semester when given", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createSubject(branch.id, { code: "ONE", semester: 1 });
    await createSubject(branch.id, { code: "TWO", semester: 2 });

    const res = await request(app).get(`/api/subjects?branch_id=${branch.id}&semester=2`);

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].code).toBe("TWO");
  });

  it("requires branch_id", async () => {
    const res = await request(app).get("/api/subjects");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a semester below 1", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const res = await request(app).get(`/api/subjects?branch_id=${branch.id}&semester=0`);
    expect(res.status).toBe(422);
  });
});

describe("GET /api/subjects/:id", () => {
  it("returns a single subject so the notes page can name it", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const subject = await createSubject(branch.id, { code: "CS101", semester: 3 });

    const res = await request(app).get(`/api/subjects/${subject.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(subject.id);
    expect(res.body.data.code).toBe("CS101");
    expect(res.body.data.semester).toBe(3);
    expect(res.body.data.branch_id).toBe(branch.id);
  });

  it("rejects a malformed id with 400, not 500", async () => {
    const res = await request(app).get("/api/subjects/not-a-uuid");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 for a well-formed but unknown id", async () => {
    const res = await request(app).get("/api/subjects/00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
