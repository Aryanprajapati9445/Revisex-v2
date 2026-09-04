import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { makeNoteCard } from "@/test/fixtures";
import { NoteDetailPage } from "@/routes/NoteDetailPage";
import { SavedPage } from "@/routes/SavedPage";
import type { NoteCard, User } from "@/lib/api-types";

const student: User = {
  id: "u2",
  email: "reader@college.edu",
  full_name: "Reader Student",
  role: "student",
  program_id: null,
  branch_id: "b1",
  enrollment_year: null,
  current_semester: 5,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const pdfFile = {
  id: "f1",
  note_id: "n1",
  s3_bucket: "college-notes",
  s3_key: "notes/n1/abc-lecture.pdf",
  original_filename: "lecture.pdf",
  mime_type: "application/pdf",
  size_bytes: 24576,
  checksum_sha256: null,
  page_count: null,
  sort_order: 0,
  upload_status: "uploaded" as const,
  uploaded_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
};

const zipFile = { ...pdfFile, id: "f2", original_filename: "bundle.zip", mime_type: "application/zip" };

function paginated<T>(items: T[], total = items.length) {
  return {
    success: true,
    data: { items, pagination: { page: 1, limit: 20, total, totalPages: 1 } },
  };
}

function signIn(user: User | null = student) {
  if (user) {
    localStorage.setItem("refreshToken", "ref");
    server.use(
      http.post(`${API}/api/auth/refresh`, () =>
        HttpResponse.json({ success: true, data: { accessToken: "a", refreshToken: "r" } })
      ),
      http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: user }))
    );
  }
  server.use(
    http.get(`${API}/api/admin/permissions/me`, () => HttpResponse.json({ success: true, data: [] })),
    http.get(`${API}/api/comments`, () => HttpResponse.json(paginated([])))
  );
}

function serveNote(note: NoteCard, files = [pdfFile]) {
  server.use(
    http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
    http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: files })),
    http.get(`${API}/api/notes/n1/files/:fileId/preview`, ({ params }) =>
      HttpResponse.json({
        success: true,
        data: {
          url: `https://storage.example/${String(params.fileId)}?sig=abc`,
          mime_type: params.fileId === "f2" ? "application/zip" : "application/pdf",
          original_filename: params.fileId === "f2" ? "bundle.zip" : "lecture.pdf",
          size_bytes: 24576,
        },
      })
    )
  );
}

function renderNote() {
  return renderWithProviders(
    <Routes>
      <Route path="/notes/:noteId" element={<NoteDetailPage />} />
    </Routes>,
    { route: "/notes/n1" }
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("file preview", () => {
  it("shows the first previewable file without being asked", async () => {
    signIn();
    serveNote(makeNoteCard());

    renderNote();

    const frame = await screen.findByTitle(/preview of lecture\.pdf/i);
    expect(frame).toHaveAttribute("src", expect.stringContaining("https://storage.example/f1"));
  });

  it("leaves the PDF frame unsandboxed, because Chrome will not render one otherwise", async () => {
    signIn();
    serveNote(makeNoteCard());

    renderNote();

    const frame = await screen.findByTitle(/preview of lecture\.pdf/i);
    // Verified in a real browser: every sandbox value — including
    // "allow-same-origin allow-scripts" — leaves a broken-document icon rather
    // than the PDF. The file is served from the storage origin, so it cannot
    // reach this origin's storage regardless.
    expect(frame).not.toHaveAttribute("sandbox");
    expect(frame).toHaveAttribute("referrerPolicy", "no-referrer");
  });

  it("does sandbox a text preview, which needs no plugin", async () => {
    const textFile = { ...pdfFile, id: "f4", original_filename: "syllabus.txt", mime_type: "text/plain" };
    signIn();
    serveNote(makeNoteCard(), [textFile]);
    server.use(
      http.get(`${API}/api/notes/n1/files/:fileId/preview`, () =>
        HttpResponse.json({
          success: true,
          data: {
            url: "https://storage.example/f4?sig=abc",
            mime_type: "text/plain",
            original_filename: "syllabus.txt",
            size_bytes: 120,
          },
        })
      )
    );

    renderNote();

    expect(await screen.findByTitle(/preview of syllabus\.txt/i)).toHaveAttribute("sandbox", "");
  });

  it("never treats HTML as previewable, so an upload is never framed as a document", async () => {
    const htmlFile = { ...pdfFile, id: "f5", original_filename: "page.html", mime_type: "text/html" };
    signIn();
    serveNote(makeNoteCard(), [htmlFile]);

    renderNote();

    expect(await screen.findByText(/can't be shown here/i)).toBeInTheDocument();
    expect(screen.queryByTitle(/preview of page\.html/i)).not.toBeInTheDocument();
  });

  it("previews through an endpoint that is not the download one", async () => {
    const hits: string[] = [];
    signIn();
    serveNote(makeNoteCard());
    server.use(
      http.get(`${API}/api/notes/n1/files/:fileId/download`, () => {
        hits.push("download");
        return HttpResponse.json({ success: true, data: { url: "https://storage.example/dl" } });
      })
    );

    renderNote();
    await screen.findByTitle(/preview of lecture\.pdf/i);

    // Viewing a note must not count as a download — it would inflate the count
    // on every card and corrupt the most-downloaded sort.
    expect(hits).toEqual([]);
  });

  it("offers a download that does go through the download endpoint", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    signIn();
    serveNote(makeNoteCard());
    server.use(
      http.get(`${API}/api/notes/n1/files/f1/download`, () =>
        HttpResponse.json({ success: true, data: { url: "https://storage.example/signed-dl" } })
      )
    );

    renderNote();
    await userEvent.click(await screen.findByRole("button", { name: /^download$/i }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith("https://storage.example/signed-dl", "_blank", "noopener,noreferrer");
    });
    open.mockRestore();
  });

  it("says so plainly for a file type it cannot show, rather than an empty frame", async () => {
    signIn();
    serveNote(makeNoteCard(), [zipFile]);

    renderNote();

    expect(await screen.findByText(/can't be shown here/i)).toBeInTheDocument();
    expect(screen.queryByTitle(/preview of/i)).not.toBeInTheDocument();
  });

  it("switches the preview when another file is chosen", async () => {
    signIn();
    serveNote(makeNoteCard(), [pdfFile, { ...pdfFile, id: "f3", original_filename: "tutorial.pdf" }]);

    renderNote();
    await screen.findByTitle(/preview of lecture\.pdf/i);

    const list = screen.getByRole("list", { name: "" }).closest("ul") ?? document.body;
    const rows = within(list).getAllByRole("listitem");
    await userEvent.click(within(rows[1]!).getByRole("button", { name: /^view$/i }));

    expect(await screen.findByTitle(/preview of tutorial\.pdf/i)).toBeInTheDocument();
  });
});

describe("saving a note", () => {
  it("saves and reflects it back", async () => {
    const calls: string[] = [];
    signIn();
    serveNote(makeNoteCard({ viewer_bookmarked: false }));
    server.use(
      http.put(`${API}/api/bookmarks/n1`, () => {
        calls.push("put");
        return HttpResponse.json({ success: true, data: { note_id: "n1", bookmarked: true } });
      })
    );

    renderNote();
    await userEvent.click(await screen.findByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(calls).toEqual(["put"]));
  });

  it("is not offered to a signed-out visitor, who has nowhere to save to", async () => {
    serveNote(makeNoteCard());
    server.use(http.get(`${API}/api/comments`, () => HttpResponse.json(paginated([]))));

    renderNote();
    await screen.findByRole("heading", { name: "Unit 1 Notes" });

    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
  });
});

describe("rating a note", () => {
  it("submits the chosen score", async () => {
    const bodies: unknown[] = [];
    signIn();
    serveNote(makeNoteCard());
    server.use(
      http.put(`${API}/api/ratings/n1`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({
          success: true,
          data: { note_id: "n1", rating_avg: 4, rating_count: 1, viewer_rating: 4 },
        });
      })
    );

    renderNote();
    await userEvent.click(await screen.findByRole("radio", { name: "4 stars" }));

    await waitFor(() => expect(bodies).toEqual([{ rating: 4 }]));
  });

  it("refuses to let an uploader rate their own note, and says why", async () => {
    signIn();
    serveNote(makeNoteCard({ uploader_id: student.id }));

    renderNote();

    expect(await screen.findByText(/you uploaded this note, so you can't rate it/i)).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "5 stars" })).not.toBeInTheDocument();
  });

  it("reports the score to a screen reader as one value, not five graphics", async () => {
    signIn();
    serveNote(makeNoteCard({ rating_avg: 4.5, rating_count: 12 }));

    renderNote();

    expect(await screen.findByLabelText(/rated 4\.5 out of 5 by 12 people/i)).toBeInTheDocument();
  });
});

describe("discussion", () => {
  it("posts a comment", async () => {
    const bodies: unknown[] = [];
    signIn();
    serveNote(makeNoteCard());
    server.use(
      http.post(`${API}/api/comments`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ success: true, data: {} }, { status: 201 });
      })
    );

    renderNote();
    await userEvent.type(await screen.findByLabelText(/add a comment/i), "Page 40 has the answer.");
    await userEvent.click(screen.getByRole("button", { name: /^post$/i }));

    await waitFor(() =>
      expect(bodies).toEqual([{ note_id: "n1", body: "Page 40 has the answer." }])
    );
  });

  it("renders a comment whose author has left, rather than crashing on a null name", async () => {
    signIn();
    serveNote(makeNoteCard());
    server.use(
      http.get(`${API}/api/comments`, () =>
        HttpResponse.json(
          paginated([
            {
              id: "c1",
              note_id: "n1",
              user_id: null,
              author_name: null,
              body: "Still useful.",
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
              edited: false,
            },
          ])
        )
      )
    );

    renderNote();

    expect(await screen.findByText("Still useful.")).toBeInTheDocument();
    expect(screen.getByText("Former member")).toBeInTheDocument();
  });

  it("asks a signed-out reader to log in instead of showing a dead box", async () => {
    serveNote(makeNoteCard());

    renderNote();
    await screen.findByRole("heading", { name: "Unit 1 Notes" });

    expect(screen.queryByLabelText(/add a comment/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /log in/i })).toBeInTheDocument();
  });
});

describe("SavedPage", () => {
  it("lists saved notes with the subject they belong to", async () => {
    signIn();
    server.use(
      http.get(`${API}/api/bookmarks`, () =>
        HttpResponse.json(paginated([makeNoteCard({ title: "Deadlock Handling" })]))
      )
    );

    renderWithProviders(<SavedPage />);

    expect(await screen.findByText("Deadlock Handling")).toBeInTheDocument();
    expect(screen.getByText(/database systems · semester 5/i)).toBeInTheDocument();
  });

  it("points somewhere useful when nothing is saved", async () => {
    signIn();
    server.use(http.get(`${API}/api/bookmarks`, () => HttpResponse.json(paginated([]))));

    renderWithProviders(<SavedPage />);

    expect(await screen.findByText(/nothing saved yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /find notes to save/i })).toBeInTheDocument();
  });
});
