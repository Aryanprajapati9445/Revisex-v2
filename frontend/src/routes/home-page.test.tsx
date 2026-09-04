import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { makeNoteCard } from "@/test/fixtures";
import { HomePage } from "@/routes/HomePage";
import type { User } from "@/lib/api-types";

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

const subject = {
  id: "s1",
  branch_id: "b1",
  code: "KCS-501",
  name: "Database Systems",
  semester: 5,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function makeStudent(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    email: "diya@college.edu",
    full_name: "Diya Nair",
    role: "student",
    program_id: null,
    branch_id: "b1",
    enrollment_year: null,
    current_semester: 5,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function paginated<T>(items: T[], total = items.length) {
  return {
    success: true,
    data: { items, pagination: { page: 1, limit: 20, total, totalPages: 1 } },
  };
}

function signIn(user: User) {
  localStorage.setItem("refreshToken", "ref");
  server.use(
    http.post(`${API}/api/auth/refresh`, () =>
      HttpResponse.json({ success: true, data: { accessToken: "a", refreshToken: "r" } })
    ),
    http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: user })),
    http.get(`${API}/api/admin/permissions/me`, () => HttpResponse.json({ success: true, data: [] })),
    http.get(`${API}/api/branches/b1`, () => HttpResponse.json({ success: true, data: branch })),
    http.get(`${API}/api/programs/p1`, () => HttpResponse.json({ success: true, data: program })),
    http.get(`${API}/api/subjects`, () => HttpResponse.json(paginated([subject]))),
    http.get(`${API}/api/bookmarks`, () => HttpResponse.json(paginated([]))),
    http.get(`${API}/api/notes`, () => HttpResponse.json(paginated([])))
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("StudentHome", () => {
  it("greets the student and names the course they are actually on", async () => {
    signIn(makeStudent());

    renderWithProviders(<HomePage />);

    expect(await screen.findByRole("heading", { name: /welcome back, diya/i })).toBeInTheDocument();
    expect(await screen.findByText(/computer science · b\.tech/i)).toBeInTheDocument();
  });

  it("shows the subjects for the semester the student says they are in", async () => {
    signIn(makeStudent({ current_semester: 5 }));

    renderWithProviders(<HomePage />);

    expect(await screen.findByText("Database Systems")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /your semester 5 subjects/i })
    ).toBeInTheDocument();
  });

  it("asks for a semester rather than guessing one when it is not set", async () => {
    signIn(makeStudent({ current_semester: null }));

    renderWithProviders(<HomePage />);

    expect(await screen.findByText(/which semester are you in\?/i)).toBeInTheDocument();
  });

  it("saves the chosen semester to the account", async () => {
    const patched: unknown[] = [];
    signIn(makeStudent({ current_semester: null }));
    server.use(
      http.patch(`${API}/api/users/me`, async ({ request }) => {
        patched.push(await request.json());
        return HttpResponse.json({ success: true, data: makeStudent({ current_semester: 3 }) });
      })
    );

    renderWithProviders(<HomePage />);

    await userEvent.selectOptions(await screen.findByLabelText(/your current semester/i), "3");

    expect(patched).toEqual([{ current_semester: 3 }]);
  });

  it("offers only the semesters the student's program actually runs", async () => {
    signIn(makeStudent());

    renderWithProviders(<HomePage />);

    const picker = await screen.findByLabelText(/your current semester/i);
    // 8 semesters plus the "Not set" option.
    expect(picker.querySelectorAll("option")).toHaveLength(9);
  });

  it("surfaces uploads still waiting for review", async () => {
    signIn(makeStudent());
    server.use(
      http.get(`${API}/api/notes`, ({ request }) => {
        const status = new URL(request.url).searchParams.get("status");
        return HttpResponse.json(status === "pending" ? paginated([makeNoteCard()], 2) : paginated([]));
      })
    );

    renderWithProviders(<HomePage />);

    expect(await screen.findByText(/2 uploads waiting for review/i)).toBeInTheDocument();
  });

  it("shows saved notes so a student can pick up where they left off", async () => {
    signIn(makeStudent());
    server.use(
      http.get(`${API}/api/bookmarks`, () =>
        HttpResponse.json(paginated([makeNoteCard({ title: "Deadlock Handling — Unit 4" })]))
      )
    );

    renderWithProviders(<HomePage />);

    expect(await screen.findByText("Deadlock Handling — Unit 4")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /^saved \(1\)$/i })).toBeInTheDocument();
  });

  it("does not offer sign-up calls to action to someone already signed in", async () => {
    signIn(makeStudent());

    renderWithProviders(<HomePage />);

    await screen.findByRole("heading", { name: /welcome back/i });
    // The page this replaced was the marketing landing page behind an
    // authenticated route, so its "Create an account" button could never fire.
    expect(screen.queryByRole("link", { name: /create an account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /join now/i })).not.toBeInTheDocument();
  });

  it("shows the error state rather than silently hiding a failed subject list", async () => {
    signIn(makeStudent());
    server.use(
      http.get(`${API}/api/subjects`, () =>
        HttpResponse.json(
          { success: false, error: { code: "INTERNAL_ERROR", message: "boom" } },
          { status: 500 }
        )
      )
    );

    renderWithProviders(<HomePage />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
