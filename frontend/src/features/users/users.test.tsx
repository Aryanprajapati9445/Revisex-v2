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

function authenticateAdmin() {
  localStorage.setItem("refreshToken", "ref");
  server.use(
    http.post(`${API}/api/auth/refresh`, () =>
      HttpResponse.json({ success: true, data: { accessToken: "a", refreshToken: "r" } })
    ),
    http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: admin })),
    http.get(`${API}/api/users`, () =>
      HttpResponse.json({
        success: true,
        data: { items: [student], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
      })
    )
  );
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
