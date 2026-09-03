import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { API, server } from "@/test/msw";
import { uploadNote } from "./upload";

const note = {
  id: "n1",
  subject_id: "s1",
  uploader_id: "u1",
  title: "Unit 1",
  description: null,
  note_type: "lecture_notes" as const,
  exam_year: null,
  status: "pending" as const,
  reviewed_by: null,
  reviewed_at: null,
  rejection_reason: null,
  download_count: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function makeFile(name = "lecture.pdf") {
  return new File(["hello world"], name, { type: "application/pdf" });
}

describe("uploadNote", () => {
  it("runs create, presign, PUT, and complete in order", async () => {
    const calls: string[] = [];

    server.use(
      http.post(`${API}/api/notes`, async () => {
        calls.push("create");
        return HttpResponse.json({ success: true, data: note });
      }),
      http.post(`${API}/api/notes/n1/files`, async ({ request }) => {
        calls.push("presign");
        const body = (await request.json()) as { files: { original_filename: string; mime_type: string }[] };
        expect(body.files[0]!.original_filename).toBe("lecture.pdf");
        expect(body.files[0]!.mime_type).toBe("application/pdf");
        return HttpResponse.json({
          success: true,
          data: [{ file: { id: "f1", note_id: "n1" }, putUrl: "https://s3.example/put/f1" }],
        });
      }),
      http.put("https://s3.example/put/f1", ({ request }) => {
        calls.push("put");
        // A presigned URL carries its own signature; an Authorization header
        // would invalidate it.
        expect(request.headers.get("Authorization")).toBeNull();
        return new HttpResponse(null, { status: 200 });
      }),
      http.post(`${API}/api/notes/n1/files/f1/complete`, async ({ request }) => {
        calls.push("complete");
        const body = (await request.json()) as { size_bytes: number };
        expect(body.size_bytes).toBeGreaterThan(0);
        return HttpResponse.json({ success: true, data: { id: "f1", upload_status: "uploaded" } });
      })
    );

    const created = await uploadNote(
      { subject_id: "s1", title: "Unit 1", description: null, note_type: "lecture_notes", exam_year: null },
      [makeFile()]
    );

    expect(created.id).toBe("n1");
    expect(calls).toEqual(["create", "presign", "put", "complete"]);
  });

  it("treats a 409 on complete as already-done, not a failure", async () => {
    server.use(
      http.post(`${API}/api/notes`, () => HttpResponse.json({ success: true, data: note })),
      http.post(`${API}/api/notes/n1/files`, () =>
        HttpResponse.json({
          success: true,
          data: [{ file: { id: "f1", note_id: "n1" }, putUrl: "https://s3.example/put/f1" }],
        })
      ),
      http.put("https://s3.example/put/f1", () => new HttpResponse(null, { status: 200 })),
      // The backend's complete is single-shot (WHERE upload_status = 'pending'),
      // so a retried complete answers 409. That is success from here.
      http.post(`${API}/api/notes/n1/files/f1/complete`, () =>
        HttpResponse.json(
          { success: false, error: { code: "CONFLICT", message: "This file has already been marked as uploaded" } },
          { status: 409 }
        )
      )
    );

    await expect(
      uploadNote(
        { subject_id: "s1", title: "Unit 1", description: null, note_type: "lecture_notes", exam_year: null },
        [makeFile()]
      )
    ).resolves.toMatchObject({ id: "n1" });
  });

  it("reports progress per file", async () => {
    server.use(
      http.post(`${API}/api/notes`, () => HttpResponse.json({ success: true, data: note })),
      http.post(`${API}/api/notes/n1/files`, () =>
        HttpResponse.json({
          success: true,
          data: [
            { file: { id: "f1", note_id: "n1" }, putUrl: "https://s3.example/put/f1" },
            { file: { id: "f2", note_id: "n1" }, putUrl: "https://s3.example/put/f2" },
          ],
        })
      ),
      http.put("https://s3.example/put/f1", () => new HttpResponse(null, { status: 200 })),
      http.put("https://s3.example/put/f2", () => new HttpResponse(null, { status: 200 })),
      http.post(`${API}/api/notes/n1/files/:fileId/complete`, () =>
        HttpResponse.json({ success: true, data: { upload_status: "uploaded" } })
      )
    );

    const seen: { index: number; state: string }[] = [];
    await uploadNote(
      { subject_id: "s1", title: "Unit 1", description: null, note_type: "lecture_notes", exam_year: null },
      [makeFile("a.pdf"), makeFile("b.pdf")],
      (index, state) => seen.push({ index, state })
    );

    expect(seen).toContainEqual({ index: 0, state: "done" });
    expect(seen).toContainEqual({ index: 1, state: "done" });
  });

  it("surfaces an S3 failure with the note id so the caller can retry", async () => {
    server.use(
      http.post(`${API}/api/notes`, () => HttpResponse.json({ success: true, data: note })),
      http.post(`${API}/api/notes/n1/files`, () =>
        HttpResponse.json({
          success: true,
          data: [{ file: { id: "f1", note_id: "n1" }, putUrl: "https://s3.example/put/f1" }],
        })
      ),
      http.put("https://s3.example/put/f1", () => new HttpResponse(null, { status: 503 }))
    );

    await expect(
      uploadNote(
        { subject_id: "s1", title: "Unit 1", description: null, note_type: "lecture_notes", exam_year: null },
        [makeFile()]
      )
    ).rejects.toMatchObject({ noteId: "n1" });
  });
});
