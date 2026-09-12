import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
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
  email_verified: true,
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
