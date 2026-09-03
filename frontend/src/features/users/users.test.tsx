import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { UsersPage } from "@/routes/UsersPage";

const admin = {
  id: "a1",
  email: "admin@test.edu",
  full_name: "Admin",
  role: "branch_admin" as const,
  program_id: null,
  branch_id: "b1",
  enrollment_year: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const student = { ...admin, id: "u1", email: "s@test.edu", full_name: "Student", role: "student" as const };

// A program_admin is program-scoped and has NO branch of its own; a superuser
// has neither. Both must therefore choose the target account's scope.
const programAdmin = {
  ...admin,
  id: "pa1",
  email: "pa@test.edu",
  full_name: "Program Admin",
  role: "program_admin" as const,
  program_id: "p1",
  branch_id: null,
};

const superuser = {
  ...admin,
  id: "su1",
  email: "su@test.edu",
  full_name: "Super User",
  role: "superuser" as const,
  program_id: null,
  branch_id: null,
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
    data: { items, pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 } },
  };
}

function authenticateAs(actor: typeof admin | typeof programAdmin | typeof superuser) {
  localStorage.setItem("refreshToken", "ref");
  server.use(
    http.post(`${API}/api/auth/refresh`, () =>
      HttpResponse.json({ success: true, data: { accessToken: "a", refreshToken: "r" } })
    ),
    http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: actor })),
    http.get(`${API}/api/users`, () =>
      HttpResponse.json({
        success: true,
        data: { items: [student], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
      })
    ),
    http.get(`${API}/api/programs`, () => HttpResponse.json(paginated([program]))),
    http.get(`${API}/api/branches`, () => HttpResponse.json(paginated([branch])))
  );
}

function authenticateAdmin() {
  authenticateAs(admin);
}

beforeEach(() => {
  localStorage.clear();
});

describe("UsersPage", () => {
  it("lists the scoped roster", async () => {
    authenticateAdmin();
    renderWithProviders(<UsersPage />);

    // The fixture's full_name is "Student", which also matches the role pill
    // and the remove button, so the name is asserted through that button's
    // accessible name and the row is pinned by the unique email.
    expect(await screen.findByText("s@test.edu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove student/i })).toBeInTheDocument();
    expect(screen.getByText("Student", { selector: "span.font-medium" })).toBeInTheDocument();
  });

  it("shows the backend's message when a create is refused", async () => {
    authenticateAdmin();
    server.use(
      http.post(`${API}/api/users`, () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "You may only create students in your own branch" },
          },
          { status: 403 }
        )
      )
    );

    renderWithProviders(<UsersPage />);

    await userEvent.click(await screen.findByRole("button", { name: /add user/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), "New Person");
    await userEvent.type(screen.getByLabelText(/email/i), "new@test.edu");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByText(/only create students in your own branch/i)).toBeInTheDocument();
  });

  // The backend's users_role_scope rule requires a student/branch_admin to
  // carry a branch and a program_admin to carry a program. Deriving that scope
  // from the actor only works for a branch_admin adding to their own branch —
  // every other actor has a null branch and would send an invalid combination.
  it("sends the chosen branch when a program_admin creates a student", async () => {
    authenticateAs(programAdmin);
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/api/users`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, data: student }, { status: 201 });
      })
    );

    renderWithProviders(<UsersPage />);

    await userEvent.click(await screen.findByRole("button", { name: /add user/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), "New Person");
    await userEvent.type(screen.getByLabelText(/email/i), "new@test.edu");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    // No program picker: a program_admin is pinned to their own program.
    expect(screen.queryByLabelText(/program/i)).not.toBeInTheDocument();
    // Role first — changing it clears any branch already chosen.
    await userEvent.selectOptions(screen.getByLabelText(/role/i), "student");
    await userEvent.selectOptions(await screen.findByLabelText(/branch/i), "b1");
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ role: "student", branch_id: "b1", program_id: null });
  });

  it("sends a program and no branch when a superuser creates a program_admin", async () => {
    authenticateAs(superuser);
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/api/users`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, data: student }, { status: 201 });
      })
    );

    renderWithProviders(<UsersPage />);

    await userEvent.click(await screen.findByRole("button", { name: /add user/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), "New Admin");
    await userEvent.type(screen.getByLabelText(/email/i), "pa2@test.edu");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    // program_admin is the superuser's first allowed role, so it is preselected.
    await userEvent.selectOptions(await screen.findByLabelText(/program/i), "p1");
    // A program_admin has no branch, so no branch picker is offered.
    expect(screen.queryByLabelText(/branch/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ role: "program_admin", program_id: "p1", branch_id: null });
  });

  it("deletes a user after confirmation", async () => {
    authenticateAdmin();
    let deleted: string | null = null;
    server.use(
      http.delete(`${API}/api/users/:id`, ({ params }) => {
        deleted = params.id as string;
        return HttpResponse.json({ success: true, data: null });
      })
    );

    renderWithProviders(<UsersPage />);

    await userEvent.click(await screen.findByRole("button", { name: /remove student/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => expect(deleted).toBe("u1"));
  });
});
