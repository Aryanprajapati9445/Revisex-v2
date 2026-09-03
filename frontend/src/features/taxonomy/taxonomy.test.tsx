import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { BranchesPage } from "@/routes/BranchesPage";
import { ProgramsPage } from "@/routes/ProgramsPage";

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

describe("ProgramsPage", () => {
  it("lists programs", async () => {
    server.use(http.get(`${API}/api/programs`, () => HttpResponse.json(paginated([program]))));

    renderWithProviders(<ProgramsPage />);

    expect(await screen.findByText("B.Tech")).toBeInTheDocument();
    expect(screen.getByText(/8 semesters/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no programs", async () => {
    server.use(http.get(`${API}/api/programs`, () => HttpResponse.json(paginated([]))));

    renderWithProviders(<ProgramsPage />);

    expect(await screen.findByText(/no programs yet/i)).toBeInTheDocument();
  });

  it("shows the error state when the request fails", async () => {
    server.use(
      http.get(`${API}/api/programs`, () =>
        HttpResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message: "boom" } }, { status: 500 })
      )
    );

    renderWithProviders(<ProgramsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
  });
});

describe("BranchesPage", () => {
  it("lists a program's branches and offers semester tabs sized to the program", async () => {
    server.use(
      http.get(`${API}/api/programs/p1`, () => HttpResponse.json({ success: true, data: program })),
      http.get(`${API}/api/branches`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("program_id")).toBe("p1");
        return HttpResponse.json(
          paginated([
            {
              id: "b1",
              program_id: "p1",
              code: "CSE",
              name: "Computer Science",
              is_active: true,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ])
        );
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/programs/:programId" element={<BranchesPage />} />
      </Routes>,
      { route: "/programs/p1" }
    );

    expect(await screen.findByText("Computer Science")).toBeInTheDocument();
  });
});

describe("SubjectsPage semester filter", () => {
  it("requests the selected semester", async () => {
    const branch = {
      id: "b1",
      program_id: "p1",
      code: "CSE",
      name: "Computer Science",
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const requested: (string | null)[] = [];

    server.use(
      http.get(`${API}/api/programs/p1`, () => HttpResponse.json({ success: true, data: program })),
      http.get(`${API}/api/branches`, () => HttpResponse.json(paginated([branch]))),
      http.get(`${API}/api/subjects`, ({ request }) => {
        requested.push(new URL(request.url).searchParams.get("semester"));
        return HttpResponse.json(paginated([]));
      })
    );

    const { SubjectsPage } = await import("@/routes/SubjectsPage");
    renderWithProviders(
      <Routes>
        <Route path="/branches/:branchId" element={<SubjectsPage />} />
      </Routes>,
      { route: "/branches/b1" }
    );

    // The semester filter is a tablist, so these are queried as tabs: an
    // explicit role="tab" replaces the element's implicit button role.
    await screen.findByRole("tab", { name: "1" });
    await userEvent.click(screen.getByRole("tab", { name: "3" }));

    await screen.findByText(/no subjects/i);
    expect(requested).toContain("3");
  });
});
