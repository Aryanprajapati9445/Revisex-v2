import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { ConsoleShell } from "@/components/layout/ConsoleShell";
import { AppRoutes } from "@/app/router";
import type { User, UserRole } from "@/lib/api-types";

function makeUser(role: UserRole, overrides: Partial<User> = {}): User {
  return {
    id: "a1",
    email: "admin@test.edu",
    full_name: "Ada Admin",
    role,
    program_id: role === "program_admin" ? "p1" : null,
    branch_id: role === "branch_admin" || role === "student" ? "b1" : null,
    enrollment_year: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const overview = {
  scope: { program_id: null, branch_id: null },
  totals: {
    programs: 2,
    branches: 3,
    subjects: 11,
    users: 42,
    notes: 130,
    pending_notes: 7,
    approved_notes: 120,
    rejected_notes: 3,
    files: 150,
    downloads: 900,
    storage_bytes: 5_242_880,
    uploads_last_7_days: 12,
  },
  programs: [
    {
      id: "p1",
      code: "BTECH",
      name: "Bachelor of Technology",
      duration_semesters: 8,
      is_active: true,
      branch_count: 2,
      subject_count: 9,
      note_count: 100,
      pending_note_count: 5,
      user_count: 30,
      branches: [
        {
          id: "b1",
          code: "CSE",
          name: "Computer Science",
          is_active: true,
          subject_count: 5,
          note_count: 60,
          pending_note_count: 3,
          student_count: 20,
        },
      ],
    },
  ],
  notes_by_type: [{ note_type: "lecture_notes" as const, count: 80 }],
  recent_activity: [],
};

/** Signs a session in and answers everything the console shell itself asks for. */
function signIn(user: User, permissions: string[]) {
  localStorage.setItem("refreshToken", "ref");
  server.use(
    http.post(`${API}/api/auth/refresh`, () =>
      HttpResponse.json({ success: true, data: { accessToken: "a", refreshToken: "r" } })
    ),
    http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: user })),
    http.get(`${API}/api/admin/permissions/me`, () =>
      HttpResponse.json({ success: true, data: { permissions } })
    ),
    http.get(`${API}/api/admin/overview`, () => HttpResponse.json({ success: true, data: overview }))
  );
}

function page<T>(items: T[]) {
  return {
    success: true,
    data: { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } },
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("console navigation", () => {
  it("shows a superuser with full permissions every section", async () => {
    signIn(makeUser("superuser"), ["users.read", "roles.manage", "audit.read"]);
    renderWithProviders(<ConsoleShell />, { route: "/admin" });

    const nav = await screen.findByRole("navigation", { name: "Console" });
    for (const label of [
      "Dashboard",
      "Programs & subjects",
      "Review queue",
      "Bulk upload",
      "Accounts",
      "Roles & permissions",
      "Audit log",
    ]) {
      expect(within(nav).getByRole("link", { name: new RegExp(label, "i") })).toBeInTheDocument();
    }
  });

  it("hides the permission-gated sections from an admin holding no console permissions", async () => {
    signIn(makeUser("branch_admin"), []);
    renderWithProviders(<ConsoleShell />, { route: "/admin" });

    const nav = await screen.findByRole("navigation", { name: "Console" });
    // Content sections come from the domain role, so a branch_admin keeps them.
    expect(within(nav).getByRole("link", { name: /programs & subjects/i })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /review queue/i })).toBeInTheDocument();
    // Accounts, roles and audit are the RBAC axis and this account has none.
    expect(within(nav).queryByRole("link", { name: /accounts/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /roles & permissions/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /audit log/i })).not.toBeInTheDocument();
  });

  it("turns a student away from the console entirely", async () => {
    signIn(makeUser("student"), []);
    renderWithProviders(<ConsoleShell />, { route: "/admin" });

    expect(await screen.findByText(/access to the console/i)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Console" })).not.toBeInTheDocument();
  });

  it("badges the review queue with the pending count", async () => {
    signIn(makeUser("superuser"), []);
    renderWithProviders(<ConsoleShell />, { route: "/admin" });

    const nav = await screen.findByRole("navigation", { name: "Console" });
    const queue = within(nav).getByRole("link", { name: /review queue/i });
    expect(within(queue).getByText("7")).toBeInTheDocument();
  });
});

describe("dashboard", () => {
  it("reports the totals and the program tree, with branches behind a disclosure", async () => {
    signIn(makeUser("superuser"), []);
    renderWithProviders(<AppRoutes />, { route: "/admin" });

    expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();

    const totals = screen.getByRole("region", { name: /totals/i });
    expect(within(totals).getByText("42")).toBeInTheDocument();
    expect(within(totals).getByText("130")).toBeInTheDocument();
    expect(within(totals).getByText("5.0 MB stored")).toBeInTheDocument();

    // The branch row is a child of the program and only rendered once opened.
    expect(screen.queryByText("Computer Science")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /bachelor of technology/i }));
    expect(screen.getByText("Computer Science")).toBeInTheDocument();
  });
});

describe("taxonomy management", () => {
  function taxonomyHandlers(onDelete?: () => void) {
    server.use(
      http.get(`${API}/api/programs`, () =>
        HttpResponse.json(
          page([
            {
              id: "p1",
              code: "BTECH",
              name: "Bachelor of Technology",
              duration_semesters: 8,
              is_active: true,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
              branch_count: 2,
              subject_count: 9,
              note_count: 100,
              pending_note_count: 5,
              user_count: 30,
            },
          ])
        )
      ),
      http.get(`${API}/api/branches`, () => HttpResponse.json(page([]))),
      http.get(`${API}/api/subjects`, () => HttpResponse.json(page([]))),
      http.delete(`${API}/api/programs/:id`, () => {
        onDelete?.();
        return HttpResponse.json({ success: true, data: { branches: 2, subjects: 9, notes: 100 } });
      })
    );
  }

  it("will not deactivate a program until its code is typed back", async () => {
    const onDelete = vi.fn();
    signIn(makeUser("superuser"), []);
    taxonomyHandlers(onDelete);
    renderWithProviders(<AppRoutes />, { route: "/admin/taxonomy" });

    await userEvent.click(await screen.findByRole("button", { name: /actions for bachelor of technology/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /deactivate/i }));

    const confirm = await screen.findByRole("button", { name: /^deactivate$/i });
    expect(confirm).toBeDisabled();

    // The blast radius is stated before the decision, not after it.
    expect(screen.getByText(/branches hidden from browse/i)).toBeInTheDocument();
    expect(screen.getByText(/notes that become unreachable/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/type .* to confirm/i), "BTECH");
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it("offers no add or remove controls to an admin who cannot manage programs", async () => {
    signIn(makeUser("branch_admin"), []);
    taxonomyHandlers();
    renderWithProviders(<AppRoutes />, { route: "/admin/taxonomy" });

    await screen.findByText("Bachelor of Technology");
    expect(screen.queryByRole("button", { name: /add a program/i })).not.toBeInTheDocument();
    // A branch_admin owns subjects, not programs, so the program row has no menu.
    expect(
      screen.queryByRole("button", { name: /actions for bachelor of technology/i })
    ).not.toBeInTheDocument();
  });
});

describe("bulk upload", () => {
  it("refuses to put more than ten files in a single note", async () => {
    signIn(makeUser("superuser"), []);
    server.use(
      http.get(`${API}/api/programs`, () => HttpResponse.json(page([]))),
      http.get(`${API}/api/branches`, () => HttpResponse.json(page([]))),
      http.get(`${API}/api/subjects`, () => HttpResponse.json(page([])))
    );
    renderWithProviders(<AppRoutes />, { route: "/admin/upload" });

    const input = await screen.findByLabelText(/choose files to upload/i);
    const files = Array.from(
      { length: 11 },
      (_, index) => new File(["x"], `note-${index}.pdf`, { type: "application/pdf" })
    );
    await userEvent.upload(input, files);

    // Per-file is the default, so eleven files is eleven notes and fine.
    expect(screen.queryByText(/at most 10 files/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /one note together/i }));
    expect(await screen.findByText(/at most 10 files/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload 11 files/i })).toBeDisabled();
  });

  it("locks the program and branch for an admin bounded to one branch", async () => {
    signIn(makeUser("branch_admin"), []);
    server.use(
      http.get(`${API}/api/programs`, () => HttpResponse.json(page([]))),
      http.get(`${API}/api/branches`, () => HttpResponse.json(page([]))),
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
      http.get(`${API}/api/subjects`, () => HttpResponse.json(page([])))
    );
    renderWithProviders(<AppRoutes />, { route: "/admin/upload" });

    // Neither tier is a dropdown for them — the boundary is shown, not just
    // enforced. Semester and subject are the only two selects left.
    expect(await screen.findByText("Computer Science")).toBeInTheDocument();
    // Semester, subject and the note-type filter remain; the two tiers above
    // their branch are not rendered as controls at all.
    expect(document.querySelector("#bulk-program")).toBeNull();
    expect(document.querySelector("#bulk-branch")).toBeNull();
    expect(document.querySelector("#bulk-subject")).not.toBeNull();
  });
});

describe("the sections inherited by the console", () => {
  it("renders the review queue, roles and audit log inside the console shell", async () => {
    server.use(
      http.get(`${API}/api/notes`, () => HttpResponse.json(page([]))),
      http.get(`${API}/api/admin/roles`, () => HttpResponse.json({ success: true, data: [] })),
      http.get(`${API}/api/admin/permissions`, () => HttpResponse.json({ success: true, data: [] })),
      http.get(`${API}/api/admin/audit-log`, () => HttpResponse.json(page([])))
    );

    for (const [route, heading] of [
      ["/admin/moderation", /review queue/i],
      ["/admin/roles", /roles & permissions/i],
      ["/admin/audit-log", /audit log/i],
    ] as const) {
      signIn(makeUser("superuser"), ["roles.manage", "audit.read"]);
      const { unmount } = renderWithProviders(<AppRoutes />, { route });
      // The sidebar proves the page mounted inside the console rather than the
      // site shell it used to live in.
      expect(await screen.findByRole("navigation", { name: "Console" })).toBeInTheDocument();
      expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
      unmount();
    }
  });
});

describe("accounts on the scoped surface", () => {
  /** A program_admin holding no console permissions falls back to /api/users. */
  function signInScoped() {
    signIn(makeUser("program_admin"), []);
    server.use(
      http.get(`${API}/api/admin/users`, () => HttpResponse.json({ success: false }, { status: 403 })),
      http.get(`${API}/api/users`, () =>
        HttpResponse.json(
          page([
            {
              id: "u1",
              email: "diya@test.edu",
              full_name: "Diya Nair",
              role: "student",
              program_id: null,
              branch_id: "b1",
              enrollment_year: 2022,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ])
        )
      ),
      http.get(`${API}/api/programs`, () => HttpResponse.json(page([])))
    );
  }

  it("lists their own program's people and says so", async () => {
    signInScoped();
    renderWithProviders(<AppRoutes />, { route: "/admin/accounts" });

    expect(await screen.findByText("Diya Nair")).toBeInTheDocument();
    expect(screen.getByText(/inside the program you administer/i)).toBeInTheDocument();
  });

  it("drops the program filter, which that surface cannot honour", async () => {
    signInScoped();
    renderWithProviders(<AppRoutes />, { route: "/admin/accounts" });

    await screen.findByText("Diya Nair");
    // /api/users takes no program_id — Zod strips it silently, so offering the
    // control would look broken rather than absent. Role and text remain.
    expect(screen.queryByRole("combobox", { name: /program/i })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /role/i })).toBeInTheDocument();
  });

  it("shows the backend's own message when a create is refused", async () => {
    signInScoped();
    server.use(
      http.post(`${API}/api/users`, () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "You may only create students in your own branch" },
          },
          { status: 403 }
        )
      ),
      // The form will not submit until the role's required scope is chosen, so
      // both pickers need something to choose.
      http.get(`${API}/api/programs`, () =>
        HttpResponse.json(
          page([
            {
              id: "p1",
              code: "BTECH",
              name: "Bachelor of Technology",
              duration_semesters: 8,
              is_active: true,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
            },
          ])
        )
      ),
      http.get(`${API}/api/branches`, () =>
        HttpResponse.json(
          page([
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
        )
      )
    );
    renderWithProviders(<AppRoutes />, { route: "/admin/accounts" });

    await userEvent.click(await screen.findByRole("button", { name: /add user/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), "New Student");
    await userEvent.type(screen.getByLabelText(/email/i), "new@test.edu");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.selectOptions(await screen.findByLabelText(/^program$/i), "p1");
    await userEvent.selectOptions(await screen.findByLabelText(/^branch$/i), "b1");

    // The scope rules live server-side; the form must relay what it is told
    // rather than substituting a generic failure.
    await userEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(
      await screen.findByText(/only create students in your own branch/i)
    ).toBeInTheDocument();
  });

  it("offers only roles below the actor's own, which is all that surface accepts", async () => {
    signInScoped();
    renderWithProviders(<AppRoutes />, { route: "/admin/accounts" });

    await userEvent.click(await screen.findByRole("button", { name: /add user/i }));

    const roleSelect = await screen.findByLabelText(/domain role/i);
    const offered = [...roleSelect.querySelectorAll("option")].map((option) => option.value);
    // /api/users refuses "a role equal to or above your own" with a 403.
    expect(offered).toEqual(["branch_admin", "student"]);
  });
});
