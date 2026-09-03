import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { NoteDetailPage } from "@/routes/NoteDetailPage";
import { SearchPage } from "@/routes/SearchPage";

const note = {
  id: "n1",
  subject_id: "s1",
  uploader_id: "u1",
  title: "Unit 1 Notes",
  description: "Covers the basics",
  note_type: "lecture_notes" as const,
  exam_year: null,
  status: "approved" as const,
  reviewed_by: null,
  reviewed_at: "2026-01-02T00:00:00.000Z",
  rejection_reason: null,
  download_count: 3,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const file = {
  id: "f1",
  note_id: "n1",
  s3_bucket: "bucket",
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

const subject = {
  id: "s1",
  branch_id: "b1",
  code: "CS201",
  name: "Operating Systems",
  semester: 4,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const branch = {
  id: "b1",
  program_id: "p1",
  code: "CSE",
  name: "Computer Science",
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const program = {
  id: "p1",
  code: "BTECH",
  name: "B.Tech",
  duration_semesters: 8,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function paginated<T>(items: T[]) {
  return {
    success: true,
    data: { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } },
  };
}

describe("SearchPage", () => {
  it("passes the query and type filter to the API", async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${API}/api/notes`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json(paginated([note]));
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/search" element={<SearchPage />} />
      </Routes>,
      { route: "/search?q=unit" }
    );

    expect(await screen.findByText("Unit 1 Notes")).toBeInTheDocument();
    expect(seen[0]!.searchParams.get("q")).toBe("unit");

    await userEvent.selectOptions(screen.getByLabelText(/type/i), "pyq");

    await waitFor(() => {
      expect(seen.at(-1)!.searchParams.get("note_type")).toBe("pyq");
    });
  });

  it("issues one query for a typed word, not one per keystroke", async () => {
    const terms: (string | null)[] = [];
    server.use(
      http.get(`${API}/api/notes`, ({ request }) => {
        terms.push(new URL(request.url).searchParams.get("q"));
        return HttpResponse.json(paginated([note]));
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/search" element={<SearchPage />} />
      </Routes>,
      { route: "/search" }
    );

    await screen.findByRole("heading", { name: /search/i });
    await userEvent.type(screen.getByRole("searchbox"), "graphs");

    // Settles on the whole word rather than firing g, gr, gra, …
    await waitFor(() => expect(terms).toContain("graphs"));
    expect(terms.filter((term) => term !== null)).toEqual(["graphs"]);
  });

  it("shows an empty state when nothing matches", async () => {
    server.use(http.get(`${API}/api/notes`, () => HttpResponse.json(paginated([]))));

    renderWithProviders(
      <Routes>
        <Route path="/search" element={<SearchPage />} />
      </Routes>,
      { route: "/search?q=zzz" }
    );

    expect(await screen.findByText(/no notes matched/i)).toBeInTheDocument();
  });
});

describe("NoteDetailPage", () => {
  it("renders the note with its files and download count", async () => {
    server.use(
      http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [file] })),
      http.get(`${API}/api/subjects/s1`, () => HttpResponse.json({ success: true, data: subject })),
      http.get(`${API}/api/branches/b1`, () => HttpResponse.json({ success: true, data: branch })),
      http.get(`${API}/api/programs/p1`, () => HttpResponse.json({ success: true, data: program }))
    );

    renderWithProviders(
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>,
      { route: "/notes/n1" }
    );

    expect(await screen.findByRole("heading", { name: "Unit 1 Notes" })).toBeInTheDocument();
    expect(screen.getByText("lecture.pdf")).toBeInTheDocument();
    expect(screen.getByText(/3 downloads/i)).toBeInTheDocument();
  });

  it("shows the resolved subject/branch/program breadcrumb and note type/exam year", async () => {
    server.use(
      http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [file] })),
      http.get(`${API}/api/subjects/s1`, () => HttpResponse.json({ success: true, data: subject })),
      http.get(`${API}/api/branches/b1`, () => HttpResponse.json({ success: true, data: branch })),
      http.get(`${API}/api/programs/p1`, () => HttpResponse.json({ success: true, data: program }))
    );

    renderWithProviders(
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>,
      { route: "/notes/n1" }
    );

    expect(await screen.findByRole("link", { name: "Operating Systems" })).toHaveAttribute(
      "href",
      "/subjects/s1"
    );
    expect(await screen.findByRole("link", { name: "Computer Science" })).toHaveAttribute(
      "href",
      "/branches/b1"
    );
    expect(screen.getByRole("link", { name: "Programs" })).toHaveAttribute("href", "/browse");
    expect(await screen.findByRole("link", { name: "B.Tech" })).toHaveAttribute(
      "href",
      "/programs/p1"
    );
    expect(screen.getByText(/lecture notes/i)).toBeInTheDocument();
  });

  it("opens the presigned URL when a file is downloaded", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    server.use(
      http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [file] })),
      http.get(`${API}/api/notes/n1/files/f1/download`, () =>
        HttpResponse.json({ success: true, data: { url: "https://s3.example/signed" } })
      ),
      http.get(`${API}/api/subjects/s1`, () => HttpResponse.json({ success: true, data: subject })),
      http.get(`${API}/api/branches/b1`, () => HttpResponse.json({ success: true, data: branch })),
      http.get(`${API}/api/programs/p1`, () => HttpResponse.json({ success: true, data: program }))
    );

    renderWithProviders(
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>,
      { route: "/notes/n1" }
    );

    await userEvent.click(await screen.findByRole("button", { name: /download/i }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith("https://s3.example/signed", "_blank", "noopener,noreferrer");
    });
    open.mockRestore();
  });

  it("renders the neutral not-found panel for a masked note", async () => {
    server.use(
      http.get(`${API}/api/notes/n1`, () =>
        HttpResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Note not found" } }, { status: 404 })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>,
      { route: "/notes/n1" }
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not found/i);
    expect(alert.textContent ?? "").not.toMatch(/permission|forbidden|access/i);
  });
});
