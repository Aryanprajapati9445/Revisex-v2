import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { signAccessToken } from "../../src/lib/jwt.js";
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
 * Builds one program with a branch and a subject, plus an admin at each tier,
 * so a test can assert what the tier above and below is allowed to touch.
 */
async function buildTree(programCode = "PRGA") {
  const program = await createProgram({ code: programCode, duration_semesters: 8 });
  const branch = await createBranch(program.id, { code: `${programCode}CSE` });
  const subject = await createSubject(branch.id, { code: `${programCode}S1`, semester: 1 });
  const { user: superuser } = await createUserFixture({ role: "superuser" });
  const { user: programAdmin } = await createUserFixture({ role: "program_admin", programId: program.id });
  const { user: branchAdmin } = await createUserFixture({ role: "branch_admin", branchId: branch.id });
  const { user: student } = await createUserFixture({ role: "student", branchId: branch.id });
  return { program, branch, subject, superuser, programAdmin, branchAdmin, student };
}

describe("POST /api/programs", () => {
  it("lets a superuser create a program and upper-cases the code", async () => {
    const { superuser } = await buildTree();

    const res = await request(app)
      .post("/api/programs")
      .set("Authorization", authHeader(superuser))
      .send({ code: "mba", name: "Master of Business Administration", duration_semesters: 4 });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe("MBA");
    expect(res.body.data.is_active).toBe(true);
  });

  it("refuses a program_admin — programs are the superuser's tier", async () => {
    const { programAdmin } = await buildTree();
    const res = await request(app)
      .post("/api/programs")
      .set("Authorization", authHeader(programAdmin))
      .send({ code: "MCA", name: "Master of Computer Applications", duration_semesters: 4 });
    expect(res.status).toBe(403);
  });

  it("rejects a duplicate code with 409, not 500", async () => {
    const { superuser, program } = await buildTree();
    const res = await request(app)
      .post("/api/programs")
      .set("Authorization", authHeader(superuser))
      .send({ code: program.code, name: "Clash", duration_semesters: 4 });
    expect(res.status).toBe(409);
  });

  it("records an audit entry for the creation", async () => {
    const { superuser } = await buildTree();
    await request(app)
      .post("/api/programs")
      .set("Authorization", authHeader(superuser))
      .send({ code: "AUD", name: "Audited", duration_semesters: 2 });

    const { rows } = await pool.query(`SELECT action, outcome FROM audit_log WHERE action = 'program.create'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe("success");
  });
});

describe("DELETE /api/programs/:id", () => {
  it("soft-deletes and cascades to branches and subjects", async () => {
    const { superuser, program, branch, subject } = await buildTree();

    const res = await request(app).delete(`/api/programs/${program.id}`).set("Authorization", authHeader(superuser));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ branches: 1, subjects: 1 });

    const rows = await pool.query(
      `SELECT (SELECT is_active FROM programs WHERE id = $1) AS p,
              (SELECT is_active FROM branches WHERE id = $2) AS b,
              (SELECT is_active FROM subjects WHERE id = $3) AS s`,
      [program.id, branch.id, subject.id]
    );
    expect(rows.rows[0]).toEqual({ p: false, b: false, s: false });
  });

  it("keeps the rows — a soft delete must not destroy uploaded history", async () => {
    const { superuser, program } = await buildTree();
    await request(app).delete(`/api/programs/${program.id}`).set("Authorization", authHeader(superuser));
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM programs WHERE id = $1`, [program.id]);
    expect(rows[0].n).toBe(1);
  });

  it("hides the deactivated program from the public listing but a superuser can still restore it", async () => {
    const { superuser, program } = await buildTree();
    await request(app).delete(`/api/programs/${program.id}`).set("Authorization", authHeader(superuser));

    const publicList = await request(app).get("/api/programs");
    expect(publicList.body.data.items.map((p: { id: string }) => p.id)).not.toContain(program.id);

    const restored = await request(app)
      .patch(`/api/programs/${program.id}`)
      .set("Authorization", authHeader(superuser))
      .send({ is_active: true });
    expect(restored.status).toBe(200);
    expect(restored.body.data.is_active).toBe(true);
  });
});

describe("GET /api/programs?with_counts=true", () => {
  it("returns the tree sizes a superuser's dashboard shows", async () => {
    const { superuser } = await buildTree();
    const res = await request(app)
      .get("/api/programs?with_counts=true")
      .set("Authorization", authHeader(superuser));

    expect(res.status).toBe(200);
    expect(res.body.data.items[0]).toMatchObject({ branch_count: 1, subject_count: 1, note_count: 0 });
  });

  it("narrows a program_admin to their own program", async () => {
    const a = await buildTree("PRGA");
    await buildTree("PRGB");

    const res = await request(app)
      .get("/api/programs?with_counts=true")
      .set("Authorization", authHeader(a.programAdmin));

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].id).toBe(a.program.id);
  });

  it("refuses the administrative view to a student", async () => {
    const { student } = await buildTree();
    const res = await request(app)
      .get("/api/programs?with_counts=true")
      .set("Authorization", authHeader(student));
    expect(res.status).toBe(403);
  });

  it("refuses include_inactive to an anonymous caller", async () => {
    await buildTree();
    const res = await request(app).get("/api/programs?include_inactive=true");
    expect(res.status).toBe(403);
  });
});

describe("branch writes", () => {
  it("lets a program_admin create a branch in their own program", async () => {
    const { programAdmin, program } = await buildTree();
    const res = await request(app)
      .post("/api/branches")
      .set("Authorization", authHeader(programAdmin))
      .send({ program_id: program.id, code: "ECE", name: "Electronics" });
    expect(res.status).toBe(201);
  });

  it("stops a program_admin creating a branch in another program", async () => {
    const a = await buildTree("PRGA");
    const b = await buildTree("PRGB");
    const res = await request(app)
      .post("/api/branches")
      .set("Authorization", authHeader(a.programAdmin))
      .send({ program_id: b.program.id, code: "ECE", name: "Electronics" });
    expect(res.status).toBe(403);
  });

  it("answers 404, not 403, when a program_admin edits another program's branch", async () => {
    const a = await buildTree("PRGA");
    const b = await buildTree("PRGB");
    const res = await request(app)
      .patch(`/api/branches/${b.branch.id}`)
      .set("Authorization", authHeader(a.programAdmin))
      .send({ name: "Renamed" });
    // Masked as missing so an admin cannot probe another program's ids.
    expect(res.status).toBe(404);
  });

  it("lets a branch_admin rename their own branch but not deactivate it", async () => {
    const { branchAdmin, branch } = await buildTree();

    const rename = await request(app)
      .patch(`/api/branches/${branch.id}`)
      .set("Authorization", authHeader(branchAdmin))
      .send({ name: "Computer Science & Engineering" });
    expect(rename.status).toBe(200);

    const deactivateViaPatch = await request(app)
      .patch(`/api/branches/${branch.id}`)
      .set("Authorization", authHeader(branchAdmin))
      .send({ is_active: false });
    expect(deactivateViaPatch.status).toBe(403);

    const deactivateViaDelete = await request(app)
      .delete(`/api/branches/${branch.id}`)
      .set("Authorization", authHeader(branchAdmin));
    expect(deactivateViaDelete.status).toBe(403);
  });
});

describe("subject writes", () => {
  it("lets a branch_admin add a subject to their own branch", async () => {
    const { branchAdmin, branch } = await buildTree();
    const res = await request(app)
      .post("/api/subjects")
      .set("Authorization", authHeader(branchAdmin))
      .send({ branch_id: branch.id, code: "CS201", name: "Data Structures", semester: 3 });
    expect(res.status).toBe(201);
    expect(res.body.data.semester).toBe(3);
  });

  it("stops a branch_admin adding a subject to another branch", async () => {
    const { branchAdmin, program } = await buildTree();
    const other = await createBranch(program.id, { code: "OTHER" });
    const res = await request(app)
      .post("/api/subjects")
      .set("Authorization", authHeader(branchAdmin))
      .send({ branch_id: other.id, code: "CS201", name: "Data Structures", semester: 3 });
    expect(res.status).toBe(403);
  });

  it("rejects a semester past the program's duration with 422", async () => {
    const { superuser, branch } = await buildTree();
    const res = await request(app)
      .post("/api/subjects")
      .set("Authorization", authHeader(superuser))
      // The tree's program runs 8 semesters; the DB trigger enforces the ceiling.
      .send({ branch_id: branch.id, code: "CS999", name: "Too Late", semester: 12 });
    expect(res.status).toBe(422);
  });

  it("refuses a student outright", async () => {
    const { student, branch } = await buildTree();
    const res = await request(app)
      .post("/api/subjects")
      .set("Authorization", authHeader(student))
      .send({ branch_id: branch.id, code: "CS301", name: "Nope", semester: 2 });
    expect(res.status).toBe(403);
  });

  it("deactivating a subject reports how many notes it takes out of browse", async () => {
    const { superuser, subject, student } = await buildTree();
    await pool.query(`INSERT INTO notes (subject_id, uploader_id, title, note_type) VALUES ($1, $2, $3, 'other')`, [
      subject.id,
      student.id,
      "A note",
    ]);

    const res = await request(app).delete(`/api/subjects/${subject.id}`).set("Authorization", authHeader(superuser));
    expect(res.status).toBe(200);
    expect(res.body.data.notes).toBe(1);

    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM notes WHERE subject_id = $1`, [subject.id]);
    expect(rows[0].n).toBe(1);
  });
});

describe("POST /api/notes scope", () => {
  it("stops a student uploading into another branch's subject", async () => {
    const a = await buildTree("PRGA");
    const b = await buildTree("PRGB");

    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader(a.student))
      .send({ subject_id: b.subject.id, title: "Cross-branch upload", note_type: "other" });

    expect(res.status).toBe(403);
  });

  it("still lets a student upload into their own branch's subject", async () => {
    const { student, subject } = await buildTree();
    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader(student))
      .send({ subject_id: subject.id, title: "Own-branch upload", note_type: "other" });
    expect(res.status).toBe(201);
  });

  it("lets a superuser upload anywhere", async () => {
    const a = await buildTree("PRGA");
    const b = await buildTree("PRGB");
    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader(a.superuser))
      .send({ subject_id: b.subject.id, title: "Platform-wide upload", note_type: "other" });
    expect(res.status).toBe(201);
  });

  it("answers 422 for a subject id that does not exist", async () => {
    const { student } = await buildTree();
    const res = await request(app)
      .post("/api/notes")
      .set("Authorization", authHeader(student))
      .send({ subject_id: "00000000-0000-0000-0000-000000000000", title: "Nowhere", note_type: "other" });
    expect(res.status).toBe(422);
  });
});

describe("GET /api/admin/overview", () => {
  it("gives a superuser platform-wide totals and the program tree", async () => {
    const a = await buildTree("PRGA");
    await buildTree("PRGB");

    const res = await request(app).get("/api/admin/overview").set("Authorization", authHeader(a.superuser));

    expect(res.status).toBe(200);
    expect(res.body.data.totals).toMatchObject({ programs: 2, branches: 2, subjects: 2 });
    expect(res.body.data.programs).toHaveLength(2);
    expect(res.body.data.programs[0].branches).toHaveLength(1);
  });

  it("narrows a program_admin to their own program", async () => {
    const a = await buildTree("PRGA");
    await buildTree("PRGB");

    const res = await request(app).get("/api/admin/overview").set("Authorization", authHeader(a.programAdmin));

    expect(res.body.data.totals.programs).toBe(1);
    expect(res.body.data.programs.map((p: { id: string }) => p.id)).toEqual([a.program.id]);
  });

  it("narrows a branch_admin to their own branch", async () => {
    const a = await buildTree("PRGA");
    await createBranch(a.program.id, { code: "SECOND" });

    const res = await request(app).get("/api/admin/overview").set("Authorization", authHeader(a.branchAdmin));

    expect(res.body.data.totals.branches).toBe(1);
    expect(res.body.data.scope.branch_id).toBe(a.branch.id);
  });

  it("refuses a student", async () => {
    const { student } = await buildTree();
    const res = await request(app).get("/api/admin/overview").set("Authorization", authHeader(student));
    expect(res.status).toBe(403);
  });
});
