import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { HomePage } from "@/routes/HomePage";

const program = {
  id: "p1",
  code: "BTECH",
  name: "B.Tech",
  duration_semesters: 8,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const note = {
  id: "n1",
  subject_id: "s1",
  uploader_id: "u1",
  title: "Deadlock Handling — Unit 4",
  description: null,
  note_type: "lecture_notes" as const,
  exam_year: null,
  status: "approved" as const,
  reviewed_by: null,
  reviewed_at: null,
  rejection_reason: null,
  download_count: 12,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function paginated<T>(items: T[]) {
  return {
    success: true,
    data: { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } },
  };
}

describe("HomePage", () => {
  it("renders real programs and real approved notes, not hardcoded content", async () => {
    server.use(
      http.get(`${API}/api/programs`, () => HttpResponse.json(paginated([program]))),
      http.get(`${API}/api/notes`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("status")).toBe("approved");
        return HttpResponse.json(paginated([note]));
      })
    );

    renderWithProviders(<HomePage />);

    expect(await screen.findByText("B.Tech")).toBeInTheDocument();
    expect(await screen.findByText("Deadlock Handling — Unit 4")).toBeInTheDocument();
    // The old decorative panel hardcoded this exact count next to a fake note —
    // it must not appear as static markup independent of the mocked data.
    expect(screen.queryByText("12 notes")).not.toBeInTheDocument();
  });

  it("shows an empty homepage section gracefully when there are no approved notes yet", async () => {
    server.use(
      http.get(`${API}/api/programs`, () => HttpResponse.json(paginated([program]))),
      http.get(`${API}/api/notes`, () => HttpResponse.json(paginated([])))
    );

    renderWithProviders(<HomePage />);

    expect(await screen.findByText("B.Tech")).toBeInTheDocument();
    expect(await screen.findByText(/no approved notes yet/i)).toBeInTheDocument();
  });
});
