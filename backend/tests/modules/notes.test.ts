import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/lib/jwt.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { createBranch, createProgram, createSubject, createUserFixture } from "../helpers/fixtures.js";

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

async function setup() {
  const program = await createProgram();
  const branch = await createBranch(program.id);
  const subject = await createSubject(branch.id);
  const { user: student } = await createUserFixture({ role: "student", branchId: branch.id });
  const { user: branchAdmin } = await createUserFixture({ role: "branch_admin", branchId: branch.id });
  return { program, branch, subject, student, branchAdmin };
}

describe("POST /api/notes", () => {
  it("creates a pending note for the authenticated uploader", async () => {
    const { subject, student } = await setup();

    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader(student))
      .send({ subject_id: subject.id, title: "Unit 1 Notes", note_type: "lecture_notes" });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");
    expect(res.body.data.uploader_id).toBe(student.id);
  });

  it("rejects an unauthenticated request", async () => {
    const { subject } = await setup();
    const res = await request(app).post("/api/notes").send({ subject_id: subject.id, title: "X" });
    expect(res.status).toBe(401);
  });

  it("rejects a subject_id that doesn't exist", async () => {
    const { student } = await setup();
    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader(student))
      .send({ subject_id: "11111111-1111-1111-1111-111111111111", title: "X" });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/notes visibility", () => {
  it("hides pending notes from an anonymous request", async () => {
    const { subject, student } = await setup();
    await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Pending Note', 'pending')`,
      [subject.id, student.id]
    );

    const res = await request(app).get("/api/notes");
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it("shows approved notes to anonymous requests", async () => {
    const { subject, student } = await setup();
    await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status, reviewed_at) VALUES ($1, $2, 'Approved Note', 'approved', now())`,
      [subject.id, student.id]
    );

    const res = await request(app).get("/api/notes");
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].title).toBe("Approved Note");
  });

  it("lets the uploader see their own pending note via status filter", async () => {
    const { subject, student } = await setup();
    await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Mine', 'pending')`,
      [subject.id, student.id]
    );

    const res = await request(app).get("/api/notes?status=pending").set("Authorization", authHeader(student));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });

  it("does not let a different student see someone else's pending note", async () => {
    const { subject, student, branch } = await setup();
    await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Not Mine', 'pending')`,
      [subject.id, student.id]
    );
    const { user: otherStudent } = await createUserFixture({ role: "student", branchId: branch.id });

    const res = await request(app).get("/api/notes?status=pending").set("Authorization", authHeader(otherStudent));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it("lets an in-scope branch_admin see pending notes in their branch", async () => {
    const { subject, student, branchAdmin } = await setup();
    await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Needs Review', 'pending')`,
      [subject.id, student.id]
    );

    const res = await request(app).get("/api/notes?status=pending").set("Authorization", authHeader(branchAdmin));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });
});

describe("PATCH /api/notes/:id and DELETE /api/notes/:id", () => {
  it("lets the owner edit their own pending note", async () => {
    const { subject, student } = await setup();
    const { rows } = await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Draft', 'pending') RETURNING id`,
      [subject.id, student.id]
    );

    const res = await request(app)
      .patch(`/api/notes/${rows[0].id}`)
      .set("Authorization", authHeader(student))
      .send({ title: "Updated Title" });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Updated Title");
  });

  it("forbids the owner from editing an already-approved note", async () => {
    const { subject, student } = await setup();
    const { rows } = await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status, reviewed_at) VALUES ($1, $2, 'Done', 'approved', now()) RETURNING id`,
      [subject.id, student.id]
    );

    const res = await request(app)
      .patch(`/api/notes/${rows[0].id}`)
      .set("Authorization", authHeader(student))
      .send({ title: "Try to change" });

    expect(res.status).toBe(403);
  });

  it("forbids a different student from deleting someone else's note", async () => {
    const { subject, student, branch } = await setup();
    const { rows } = await pool.query(
      `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Mine', 'pending') RETURNING id`,
      [subject.id, student.id]
    );
    const { user: otherStudent } = await createUserFixture({ role: "student", branchId: branch.id });

    const res = await request(app).delete(`/api/notes/${rows[0].id}`).set("Authorization", authHeader(otherStudent));
    expect(res.status).toBe(403);
  });
});
