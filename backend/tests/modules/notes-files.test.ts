import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { s3Client } from "../../src/lib/s3.js";
import { signAccessToken } from "../../src/lib/jwt.js";
import { pool } from "../../src/config/db.js";
import { truncateAll } from "../helpers/db.js";
import { createBranch, createProgram, createSubject, createUserFixture } from "../helpers/fixtures.js";

const app = createApp();
const s3Mock = mockClient(s3Client);

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
  s3Mock.reset();
  s3Mock.on(PutObjectCommand).resolves({});
  s3Mock.on(GetObjectCommand).resolves({});
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
  const { user: otherBranchAdmin } = await createUserFixture({
    role: "branch_admin",
    branchId: (await createBranch(program.id, { code: "OTH" })).id,
  });
  return { program, branch, subject, student, branchAdmin, otherBranchAdmin };
}

async function createPendingNote(subjectId: string, uploaderId: string) {
  const { rows } = await pool.query(
    `INSERT INTO notes (subject_id, uploader_id, title, status) VALUES ($1, $2, 'Test Note', 'pending') RETURNING *`,
    [subjectId, uploaderId]
  );
  return rows[0];
}

describe("POST /api/notes/:id/files", () => {
  it("lets the owner request a presigned upload URL", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "lecture1.pdf", mime_type: "application/pdf" }] });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].file.upload_status).toBe("pending");
    expect(typeof res.body.data[0].putUrl).toBe("string");
  });

  it("forbids a non-owner from requesting an upload URL", async () => {
    const { subject, student, branch } = await setup();
    const note = await createPendingNote(subject.id, student.id);
    const { user: otherStudent } = await createUserFixture({ role: "student", branchId: branch.id });

    const res = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(otherStudent))
      .send({ files: [{ original_filename: "x.pdf", mime_type: "application/pdf" }] });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/notes/:id/files/:fileId/complete", () => {
  it("marks the file uploaded", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const requestRes = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "lecture1.pdf", mime_type: "application/pdf" }] });
    const fileId = requestRes.body.data[0].file.id;

    const completeRes = await request(app)
      .post(`/api/notes/${note.id}/files/${fileId}/complete`)
      .set("Authorization", authHeader(student))
      .send({ size_bytes: 12345 });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.upload_status).toBe("uploaded");
    expect(completeRes.body.data.size_bytes).toBe(12345);
  });

  it("forbids completing a file after its note has already been rejected", async () => {
    const { subject, student, branchAdmin } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const requestRes = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "lecture1.pdf", mime_type: "application/pdf" }] });
    const fileId = requestRes.body.data[0].file.id;

    await request(app)
      .post(`/api/notes/${note.id}/review`)
      .set("Authorization", authHeader(branchAdmin))
      .send({ decision: "rejected", rejection_reason: "Not clear enough" });

    const completeRes = await request(app)
      .post(`/api/notes/${note.id}/files/${fileId}/complete`)
      .set("Authorization", authHeader(student))
      .send({ size_bytes: 12345 });

    expect(completeRes.status).toBe(403);
  });

  it("rejects re-completing an already-uploaded file", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const requestRes = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "lecture1.pdf", mime_type: "application/pdf" }] });
    const fileId = requestRes.body.data[0].file.id;

    const firstComplete = await request(app)
      .post(`/api/notes/${note.id}/files/${fileId}/complete`)
      .set("Authorization", authHeader(student))
      .send({ size_bytes: 12345 });
    expect(firstComplete.status).toBe(200);

    const secondComplete = await request(app)
      .post(`/api/notes/${note.id}/files/${fileId}/complete`)
      .set("Authorization", authHeader(student))
      .send({ size_bytes: 999999 });

    expect(secondComplete.status).toBe(409);

    const { rows } = await pool.query(`SELECT size_bytes FROM files WHERE id = $1`, [fileId]);
    expect(rows[0].size_bytes).toBe(12345);
  });
});

describe("POST /api/notes/:id/review", () => {
  it("lets an in-scope branch_admin approve a note", async () => {
    const { subject, student, branchAdmin } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app)
      .post(`/api/notes/${note.id}/review`)
      .set("Authorization", authHeader(branchAdmin))
      .send({ decision: "approved" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("approved");
    expect(res.body.data.reviewed_by).toBe(branchAdmin.id);
  });

  it("requires a rejection_reason when rejecting", async () => {
    const { subject, student, branchAdmin } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app)
      .post(`/api/notes/${note.id}/review`)
      .set("Authorization", authHeader(branchAdmin))
      .send({ decision: "rejected" });

    expect(res.status).toBe(422);
  });

  it("masks an out-of-scope branch_admin's review attempt as 404", async () => {
    const { subject, student, otherBranchAdmin } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app)
      .post(`/api/notes/${note.id}/review`)
      .set("Authorization", authHeader(otherBranchAdmin))
      .send({ decision: "approved" });

    expect(res.status).toBe(404);
  });

  it("forbids a student from reviewing", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app)
      .post(`/api/notes/${note.id}/review`)
      .set("Authorization", authHeader(student))
      .send({ decision: "approved" });

    expect(res.status).toBe(403);
  });
});

describe("GET /api/notes/:id/files/:fileId/download", () => {
  it("returns a presigned URL and increments download_count for an approved note", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const requestRes = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "lecture1.pdf", mime_type: "application/pdf" }] });
    const fileId = requestRes.body.data[0].file.id;

    await request(app)
      .post(`/api/notes/${note.id}/files/${fileId}/complete`)
      .set("Authorization", authHeader(student))
      .send({ size_bytes: 100 });

    await pool.query(`UPDATE notes SET status = 'approved', reviewed_at = now() WHERE id = $1`, [note.id]);

    const downloadRes = await request(app).get(`/api/notes/${note.id}/files/${fileId}/download`);

    expect(downloadRes.status).toBe(200);
    expect(typeof downloadRes.body.data.url).toBe("string");

    const { rows } = await pool.query(`SELECT download_count FROM notes WHERE id = $1`, [note.id]);
    expect(rows[0].download_count).toBe(1);
  });

  it("hides the download for a pending note from an anonymous request", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const requestRes = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "lecture1.pdf", mime_type: "application/pdf" }] });
    const fileId = requestRes.body.data[0].file.id;

    const res = await request(app).get(`/api/notes/${note.id}/files/${fileId}/download`);
    expect(res.status).toBe(404);
  });

  it("masks an out-of-scope branch_admin's download attempt as 404", async () => {
    const { subject, student, otherBranchAdmin } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const requestRes = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "lecture1.pdf", mime_type: "application/pdf" }] });
    const fileId = requestRes.body.data[0].file.id;

    await request(app)
      .post(`/api/notes/${note.id}/files/${fileId}/complete`)
      .set("Authorization", authHeader(student))
      .send({ size_bytes: 100 });

    const res = await request(app)
      .get(`/api/notes/${note.id}/files/${fileId}/download`)
      .set("Authorization", authHeader(otherBranchAdmin));

    expect(res.status).toBe(404);
  });
});

describe("GET /api/notes/:id/files", () => {
  it("lists uploaded files for an approved note anonymously", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const requestRes = await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "one.pdf", mime_type: "application/pdf" }] });
    const fileId = requestRes.body.data[0].file.id;

    await request(app)
      .post(`/api/notes/${note.id}/files/${fileId}/complete`)
      .set("Authorization", authHeader(student))
      .send({ size_bytes: 100 });

    await pool.query(`UPDATE notes SET status = 'approved', reviewed_at = now() WHERE id = $1`, [note.id]);

    const res = await request(app).get(`/api/notes/${note.id}/files`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(fileId);
    expect(res.body.data[0].upload_status).toBe("uploaded");
  });

  it("omits files that were never completed", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    await request(app)
      .post(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student))
      .send({ files: [{ original_filename: "pending.pdf", mime_type: "application/pdf" }] });

    await pool.query(`UPDATE notes SET status = 'approved', reviewed_at = now() WHERE id = $1`, [note.id]);

    const res = await request(app).get(`/api/notes/${note.id}/files`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("hides a pending note's files from an anonymous request", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app).get(`/api/notes/${note.id}/files`);

    expect(res.status).toBe(404);
  });

  it("lets the owner list their own pending note's files", async () => {
    const { subject, student } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app)
      .get(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(student));

    expect(res.status).toBe(200);
  });

  it("masks an out-of-scope admin with 404", async () => {
    const { subject, student, otherBranchAdmin } = await setup();
    const note = await createPendingNote(subject.id, student.id);

    const res = await request(app)
      .get(`/api/notes/${note.id}/files`)
      .set("Authorization", authHeader(otherBranchAdmin));

    expect(res.status).toBe(404);
  });
});
