import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { makeNoteCard } from "@/test/fixtures";
import { NoteDetailPage } from "@/routes/NoteDetailPage";
import { SearchPage } from "@/routes/SearchPage";

const note = makeNoteCard({
  subject_name: "Operating Systems",
  subject_code: "CS201",
  semester: 4,
  branch_name: "Computer Science",
  program_name: "B.Tech",
});

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
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [file] }))
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

  it("draws the breadcrumb from the note itself, with no follow-up requests", async () => {
    server.use(
      http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [file] }))
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
      )
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

  it("previews a PDF inline in an iframe without triggering a download", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    server.use(
      http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [file] })),
      http.get(`${API}/api/notes/n1/files/f1/preview`, () =>
        HttpResponse.json({ success: true, data: { url: "https://s3.example/signed-preview" } })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>,
      { route: "/notes/n1" }
    );

    await userEvent.click(await screen.findByRole("button", { name: /preview/i }));

    const iframe = await screen.findByTitle("lecture.pdf");
    expect(iframe).toHaveAttribute("src", "https://s3.example/signed-preview");
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("returns keyboard focus to the Preview button after closing the dialog with Escape", async () => {
    server.use(
      http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [file] })),
      http.get(`${API}/api/notes/n1/files/f1/preview`, () =>
        HttpResponse.json({ success: true, data: { url: "https://s3.example/signed-preview" } })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>,
      { route: "/notes/n1" }
    );

    const previewButton = await screen.findByRole("button", { name: /preview/i });
    await userEvent.click(previewButton);
    await screen.findByTitle("lecture.pdf");

    await userEvent.keyboard("{Escape}");

    // The dialog's exit animation keeps its focus trap live for a few
    // frames after close, actively reclaiming focus — the fix re-asserts
    // focus across animation frames until it wins, so this has to poll
    // rather than assert immediately.
    await waitFor(() => expect(previewButton).toHaveFocus());
  });

  it("keeps the dialog header shrinkable so a long unbroken filename can truncate", async () => {
    // DialogContent is `display: grid`, and a grid item's default min-width
    // is its content's intrinsic size, not 0 — an unbreakable string (no
    // spaces, like a long filename) would force the whole dialog wider
    // instead of letting `truncate` do anything, unless the header can
    // shrink below that intrinsic width. jsdom doesn't run real layout, so
    // this can't assert the visual result (verified separately via
    // screenshot), but it guards the specific class that makes it possible.
    const longName = "L".repeat(251) + ".pdf";
    const longFile = { ...file, id: "f5", original_filename: longName };
    server.use(
      http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [longFile] })),
      http.get(`${API}/api/notes/n1/files/f5/preview`, () =>
        HttpResponse.json({ success: true, data: { url: "https://s3.example/signed-preview" } })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>,
      { route: "/notes/n1" }
    );

    await userEvent.click(await screen.findByRole("button", { name: /preview/i }));
    const title = await screen.findByRole("heading", { name: longName });

    expect(title).toHaveClass("truncate");
    expect(title.closest('[data-slot="dialog-header"]')).toHaveClass("min-w-0");
  });

  it("shows a too-large message instead of fetching a preview for an oversized file", async () => {
    const hugeFile = { ...file, id: "f2", original_filename: "scan.pdf", size_bytes: 30 * 1024 * 1024 };
    let previewRequested = false;
    server.use(
      http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [hugeFile] })),
      http.get(`${API}/api/notes/n1/files/f2/preview`, () => {
        previewRequested = true;
        return HttpResponse.json({ success: true, data: { url: "https://s3.example/signed-preview" } });
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>,
      { route: "/notes/n1" }
    );

    await userEvent.click(await screen.findByRole("button", { name: /preview/i }));

    expect(await screen.findByText(/too large to preview/i)).toBeInTheDocument();
    expect(previewRequested).toBe(false);
  });

  it("shows a no-preview message for an unsupported file type", async () => {
    const docFile = {
      ...file,
      id: "f3",
      original_filename: "notes.docx",
      mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    server.use(
      http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [docFile] }))
    );

    renderWithProviders(
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>,
      { route: "/notes/n1" }
    );

    await userEvent.click(await screen.findByRole("button", { name: /preview/i }));

    expect(await screen.findByText(/no preview available/i)).toBeInTheDocument();
  });

  it("previews an image file inline in an img tag", async () => {
    const imageFile = { ...file, id: "f4", original_filename: "diagram.png", mime_type: "image/png" };
    server.use(
      http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [imageFile] })),
      http.get(`${API}/api/notes/n1/files/f4/preview`, () =>
        HttpResponse.json({ success: true, data: { url: "https://s3.example/signed-image" } })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>,
      { route: "/notes/n1" }
    );

    await userEvent.click(await screen.findByRole("button", { name: /preview/i }));

    const img = await screen.findByAltText("diagram.png");
    expect(img).toHaveAttribute("src", "https://s3.example/signed-image");
  });

  it("shows a couldn't-load-preview message when the preview request fails", async () => {
    server.use(
      http.get(`${API}/api/notes/n1`, () => HttpResponse.json({ success: true, data: note })),
      http.get(`${API}/api/notes/n1/files`, () => HttpResponse.json({ success: true, data: [file] })),
      http.get(`${API}/api/notes/n1/files/f1/preview`, () =>
        HttpResponse.json(
          { success: false, error: { code: "FILE_TOO_LARGE", message: "This file is too large to preview." } },
          { status: 422 }
        )
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/notes/:noteId" element={<NoteDetailPage />} />
      </Routes>,
      { route: "/notes/n1" }
    );

    await userEvent.click(await screen.findByRole("button", { name: /preview/i }));

    expect(await screen.findByText(/couldn't load preview/i)).toBeInTheDocument();
    expect(screen.getByText(/this file is too large to preview\./i)).toBeInTheDocument();
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
