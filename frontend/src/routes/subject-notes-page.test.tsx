import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { SubjectNotesPage } from "@/routes/SubjectNotesPage";

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

function paginated<T>(items: T[]) {
  return {
    success: true,
    data: { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } },
  };
}

describe("SubjectNotesPage", () => {
  it("shows an empty state that acknowledges hidden pending/rejected notes", async () => {
    server.use(
      http.get(`${API}/api/subjects/s1`, () => HttpResponse.json({ success: true, data: subject })),
      http.get(`${API}/api/notes`, () => HttpResponse.json(paginated([]))),
      http.get(`${API}/api/branches/b1`, () =>
        HttpResponse.json({
          success: true,
          data: {
            id: "b1",
            program_id: "p1",
            code: "CSE",
            name: "Computer Science",
            is_active: true,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        })
      ),
      http.get(`${API}/api/programs/p1`, () =>
        HttpResponse.json({
          success: true,
          data: {
            id: "p1",
            code: "BTECH",
            name: "B.Tech",
            duration_semesters: 8,
            is_active: true,
            created_at: "2026-01-01T00:00:00.000Z",
            updated_at: "2026-01-01T00:00:00.000Z",
          },
        })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/subjects/:subjectId" element={<SubjectNotesPage />} />
      </Routes>,
      { route: "/subjects/s1" }
    );

    expect(await screen.findByRole("heading", { name: "Operating Systems" })).toBeInTheDocument();
    expect(screen.getByText(/no approved notes yet/i)).toBeInTheDocument();
  });
});
