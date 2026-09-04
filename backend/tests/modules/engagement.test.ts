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

/**
 * notes_review_consistency requires a moderated note to carry its audit trail:
 * approved needs reviewed_at, rejected additionally needs a reason. Inserting a
 * bare status would trip the constraint, so the fixture supplies them.
 */
async function createNoteRow(subjectId: string, uploaderId: string, status: "pending" | "approved" | "rejected") {
  const reviewedAt = status === "pending" ? null : new Date().toISOString();
  const reason = status === "rejected" ? "Not legible" : null;
  const { rows } = await pool.query(
    `INSERT INTO notes (subject_id, uploader_id, title, note_type, status, reviewed_at, rejection_reason)
     VALUES ($1, $2, $3, 'lecture_notes', $4, $5, $6) RETURNING *`,
    [subjectId, uploaderId, `Note ${Math.random().toString(36).slice(2, 8)}`, status, reviewedAt, reason]
  );
  return rows[0];
}

/** Same constraint applies on the way to rejected. */
async function rejectNote(noteId: string) {
  await pool.query(
    `UPDATE notes SET status = 'rejected', reviewed_at = now(), rejection_reason = 'Withdrawn' WHERE id = $1`,
    [noteId]
  );
}

async function setup() {
  const program = await createProgram({ duration_semesters: 8 });
  const branch = await createBranch(program.id);
  const subject = await createSubject(branch.id, { semester: 5 });

  const { user: uploader } = await createUserFixture({ role: "student", branchId: branch.id });
  const { user: reader } = await createUserFixture({ role: "student", branchId: branch.id });
  const { user: branchAdmin } = await createUserFixture({ role: "branch_admin", branchId: branch.id });

  const approved = await createNoteRow(subject.id, uploader.id, "approved");
  const pending = await createNoteRow(subject.id, uploader.id, "pending");

  return { program, branch, subject, uploader, reader, branchAdmin, approved, pending };
}

describe("bookmarks", () => {
  it("saves a note, is idempotent, and lists it back", async () => {
    const { reader, approved } = await setup();

    const first = await request(app)
      .put(`/api/bookmarks/${approved.id}`)
      .set("Authorization", authHeader(reader));
    expect(first.status).toBe(201);

    // Pressing save twice is a person being unsure, not an error.
    const second = await request(app)
      .put(`/api/bookmarks/${approved.id}`)
      .set("Authorization", authHeader(reader));
    expect(second.status).toBe(200);

    const list = await request(app).get("/api/bookmarks").set("Authorization", authHeader(reader));
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].id).toBe(approved.id);
    // The card carries where it sits, so a saved list needs no follow-up query.
    expect(list.body.data.items[0].subject_name).toBeTruthy();
    expect(list.body.data.items[0].program_name).toBeTruthy();
    expect(list.body.data.items[0].viewer_bookmarked).toBe(true);
  });

  it("refuses to save a pending note, so its title cannot leak into a saved list", async () => {
    const { reader, pending } = await setup();

    const res = await request(app).put(`/api/bookmarks/${pending.id}`).set("Authorization", authHeader(reader));
    // 404, not 403: a stranger must not learn the note exists.
    expect(res.status).toBe(404);
  });

  it("refuses even the uploader, who can see their own pending note", async () => {
    const { uploader, pending } = await setup();

    const res = await request(app).put(`/api/bookmarks/${pending.id}`).set("Authorization", authHeader(uploader));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NOTE_NOT_APPROVED");
  });

  it("hides a saved note that was rejected after it was saved", async () => {
    const { reader, approved } = await setup();
    await request(app).put(`/api/bookmarks/${approved.id}`).set("Authorization", authHeader(reader));

    await rejectNote(approved.id);

    const list = await request(app).get("/api/bookmarks").set("Authorization", authHeader(reader));
    expect(list.body.data.items).toHaveLength(0);
  });

  it("still lets that note be un-saved, so the entry is not stuck", async () => {
    const { reader, approved } = await setup();
    await request(app).put(`/api/bookmarks/${approved.id}`).set("Authorization", authHeader(reader));
    await rejectNote(approved.id);

    const res = await request(app)
      .delete(`/api/bookmarks/${approved.id}`)
      .set("Authorization", authHeader(reader));
    expect(res.status).toBe(200);
  });

  it("requires authentication", async () => {
    const { approved } = await setup();
    const res = await request(app).put(`/api/bookmarks/${approved.id}`);
    expect(res.status).toBe(401);
  });
});

describe("ratings", () => {
  it("records a rating and reports the aggregate back", async () => {
    const { reader, approved } = await setup();

    const res = await request(app)
      .put(`/api/ratings/${approved.id}`)
      .set("Authorization", authHeader(reader))
      .send({ rating: 4 });

    expect(res.status).toBe(200);
    expect(res.body.data.rating_avg).toBe(4);
    expect(res.body.data.rating_count).toBe(1);
    expect(res.body.data.viewer_rating).toBe(4);
  });

  it("replaces rather than duplicates when someone changes their mind", async () => {
    const { reader, approved } = await setup();

    await request(app)
      .put(`/api/ratings/${approved.id}`)
      .set("Authorization", authHeader(reader))
      .send({ rating: 2 });
    const res = await request(app)
      .put(`/api/ratings/${approved.id}`)
      .set("Authorization", authHeader(reader))
      .send({ rating: 5 });

    expect(res.body.data.rating_count).toBe(1);
    expect(res.body.data.rating_avg).toBe(5);
  });

  it("refuses a self-rating, the cheapest way to game the top-rated sort", async () => {
    const { uploader, approved } = await setup();

    const res = await request(app)
      .put(`/api/ratings/${approved.id}`)
      .set("Authorization", authHeader(uploader))
      .send({ rating: 5 });

    expect(res.status).toBe(403);
  });

  it("rejects an out-of-range rating as a field error, not a constraint crash", async () => {
    const { reader, approved } = await setup();

    const res = await request(app)
      .put(`/api/ratings/${approved.id}`)
      .set("Authorization", authHeader(reader))
      .send({ rating: 9 });

    expect(res.status).toBe(422);
  });

  it("lets a rating be withdrawn", async () => {
    const { reader, approved } = await setup();
    await request(app)
      .put(`/api/ratings/${approved.id}`)
      .set("Authorization", authHeader(reader))
      .send({ rating: 3 });

    const res = await request(app)
      .delete(`/api/ratings/${approved.id}`)
      .set("Authorization", authHeader(reader));

    expect(res.status).toBe(200);
    expect(res.body.data.rating_count).toBe(0);
    expect(res.body.data.viewer_rating).toBeNull();
  });
});

describe("comments", () => {
  it("posts and lists a comment with its author", async () => {
    const { reader, approved } = await setup();

    const created = await request(app)
      .post("/api/comments")
      .set("Authorization", authHeader(reader))
      .send({ note_id: approved.id, body: "Unit 3 starts on page 40." });
    expect(created.status).toBe(201);

    const list = await request(app).get(`/api/comments?note_id=${approved.id}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].author_name).toBe("Test User");
    expect(list.body.data.items[0].edited).toBe(false);
  });

  it("keeps the thread readable after its author's account is deleted", async () => {
    const { reader, approved } = await setup();
    await request(app)
      .post("/api/comments")
      .set("Authorization", authHeader(reader))
      .send({ note_id: approved.id, body: "Still useful." });

    // comments.user_id is ON DELETE SET NULL by deliberate design.
    await pool.query(`DELETE FROM users WHERE id = $1`, [reader.id]);

    const list = await request(app).get(`/api/comments?note_id=${approved.id}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].author_name).toBeNull();
    expect(list.body.data.items[0].body).toBe("Still useful.");
  });

  it("will not list a thread on a pending note", async () => {
    const { pending } = await setup();
    const res = await request(app).get(`/api/comments?note_id=${pending.id}`);
    expect(res.status).toBe(404);
  });

  it("lets the author edit, and marks it edited", async () => {
    const { reader, approved } = await setup();
    const created = await request(app)
      .post("/api/comments")
      .set("Authorization", authHeader(reader))
      .send({ note_id: approved.id, body: "Frist draft" });

    const res = await request(app)
      .patch(`/api/comments/${created.body.data.id}`)
      .set("Authorization", authHeader(reader))
      .send({ body: "First draft" });

    expect(res.status).toBe(200);
    expect(res.body.data.body).toBe("First draft");
    expect(res.body.data.edited).toBe(true);
  });

  it("refuses to let anyone else rewrite someone's words", async () => {
    const { reader, branchAdmin, approved } = await setup();
    const created = await request(app)
      .post("/api/comments")
      .set("Authorization", authHeader(reader))
      .send({ note_id: approved.id, body: "Mine." });

    const res = await request(app)
      .patch(`/api/comments/${created.body.data.id}`)
      .set("Authorization", authHeader(branchAdmin))
      .send({ body: "Not mine." });

    expect(res.status).toBe(403);
  });

  it("lets an in-scope moderator delete a comment they did not write", async () => {
    const { reader, branchAdmin, approved } = await setup();
    const created = await request(app)
      .post("/api/comments")
      .set("Authorization", authHeader(reader))
      .send({ note_id: approved.id, body: "Off topic." });

    const res = await request(app)
      .delete(`/api/comments/${created.body.data.id}`)
      .set("Authorization", authHeader(branchAdmin));

    expect(res.status).toBe(200);
  });

  it("rejects an empty comment", async () => {
    const { reader, approved } = await setup();
    const res = await request(app)
      .post("/api/comments")
      .set("Authorization", authHeader(reader))
      .send({ note_id: approved.id, body: "   " });
    expect(res.status).toBe(422);
  });
});

describe("tags", () => {
  it("normalizes on the way in so near-duplicates collapse to one tag", async () => {
    const { uploader, subject } = await setup();

    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader(uploader))
      .send({
        subject_id: subject.id,
        title: "Tagged note",
        note_type: "lecture_notes",
        tags: ["Unit 1", "unit  1", " HANDWRITTEN "],
      });
    expect(created.status).toBe(201);

    const { rows } = await pool.query(`SELECT name FROM tags ORDER BY name`);
    expect(rows.map((r) => r.name)).toEqual(["handwritten", "unit 1"]);
  });

  it("filters the note list by tag", async () => {
    const { uploader, subject } = await setup();
    const created = await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader(uploader))
      .send({ subject_id: subject.id, title: "PYQ 2023", note_type: "pyq", tags: ["pyq"] });
    await pool.query(`UPDATE notes SET status = 'approved', reviewed_at = now() WHERE id = $1`, [
      created.body.data.id,
    ]);

    const hit = await request(app).get("/api/notes?tag=pyq");
    expect(hit.body.data.items).toHaveLength(1);
    expect(hit.body.data.items[0].tags).toEqual(["pyq"]);

    const miss = await request(app).get("/api/notes?tag=nonexistent");
    expect(miss.body.data.items).toHaveLength(0);
  });

  it("only offers tags that lead somewhere public", async () => {
    const { uploader, subject } = await setup();
    // Tagged but left pending — a filter offering this would return nothing.
    await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader(uploader))
      .send({ subject_id: subject.id, title: "Draft", note_type: "other", tags: ["secret"] });

    const res = await request(app).get("/api/tags");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe("note listing and detail", () => {
  it("carries stats and taxonomy on every card", async () => {
    const { reader, approved } = await setup();
    await request(app)
      .put(`/api/ratings/${approved.id}`)
      .set("Authorization", authHeader(reader))
      .send({ rating: 5 });

    const res = await request(app).get("/api/notes");
    const card = res.body.data.items[0];

    expect(card.rating_avg).toBe(5);
    expect(card.rating_count).toBe(1);
    expect(card.subject_name).toBeTruthy();
    expect(card.branch_name).toBeTruthy();
    expect(card.program_name).toBeTruthy();
    // Numbers, not the strings Postgres returns for NUMERIC and COUNT.
    expect(typeof card.rating_avg).toBe("number");
    expect(typeof card.rating_count).toBe("number");
  });

  it("returns the breadcrumb inline on detail, so the page needs one request", async () => {
    const { approved, subject, branch, program } = await setup();

    const res = await request(app).get(`/api/notes/${approved.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.subject_id).toBe(subject.id);
    expect(res.body.data.branch_id).toBe(branch.id);
    expect(res.body.data.program_id).toBe(program.id);
    expect(res.body.data.program_name).toBe(program.name);
  });

  it("tells a signed-out viewer nothing about anyone's bookmarks", async () => {
    const { reader, approved } = await setup();
    await request(app).put(`/api/bookmarks/${approved.id}`).set("Authorization", authHeader(reader));

    const res = await request(app).get(`/api/notes/${approved.id}`);
    expect(res.body.data.viewer_bookmarked).toBe(false);
    expect(res.body.data.viewer_rating).toBeNull();
    // The public count is still visible — that is the point of it.
    expect(res.body.data.bookmark_count).toBe(1);
  });

  it("sorts by rating when asked", async () => {
    const { subject, uploader, reader, branchAdmin, approved } = await setup();
    const other = await createNoteRow(subject.id, uploader.id, "approved");

    await request(app)
      .put(`/api/ratings/${other.id}`)
      .set("Authorization", authHeader(reader))
      .send({ rating: 5 });
    await request(app)
      .put(`/api/ratings/${approved.id}`)
      .set("Authorization", authHeader(branchAdmin))
      .send({ rating: 1 });

    const res = await request(app).get("/api/notes?sort=top_rated");
    expect(res.body.data.items[0].id).toBe(other.id);
  });

  it("filters by branch and semester, which is what a student's home asks for", async () => {
    const { branch, approved } = await setup();

    const hit = await request(app).get(`/api/notes?branch_id=${branch.id}&semester=5`);
    expect(hit.body.data.items.map((n: { id: string }) => n.id)).toContain(approved.id);

    const miss = await request(app).get(`/api/notes?branch_id=${branch.id}&semester=7`);
    expect(miss.body.data.items).toHaveLength(0);
  });
});

describe("PATCH /api/users/me current_semester", () => {
  it("accepts a semester within the student's program", async () => {
    const { reader } = await setup();

    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", authHeader(reader))
      .send({ current_semester: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.current_semester).toBe(5);
  });

  it("refuses one past the program's duration, which no CHECK can catch", async () => {
    const { reader } = await setup();

    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", authHeader(reader))
      .send({ current_semester: 12 });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain("8 semesters");
  });

  it("lets it be cleared", async () => {
    const { reader } = await setup();
    await request(app)
      .patch("/api/users/me")
      .set("Authorization", authHeader(reader))
      .send({ current_semester: 3 });

    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", authHeader(reader))
      .send({ current_semester: null });

    expect(res.body.data.current_semester).toBeNull();
  });

  it("still updates the name on its own", async () => {
    const { reader } = await setup();
    const res = await request(app)
      .patch("/api/users/me")
      .set("Authorization", authHeader(reader))
      .send({ full_name: "Renamed Student" });

    expect(res.status).toBe(200);
    expect(res.body.data.full_name).toBe("Renamed Student");
  });
});
