import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { AppRoutes } from "./router";

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

function noPrograms() {
  server.use(
    http.get(`${API}/api/programs`, () =>
      HttpResponse.json({
        success: true,
        data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
      })
    )
  );
}

function authenticateAs(actor: typeof admin) {
  localStorage.setItem("refreshToken", "ref");
  server.use(
    http.post(`${API}/api/auth/refresh`, () =>
      HttpResponse.json({ success: true, data: { accessToken: "a", refreshToken: "r" } })
    ),
    http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: actor }))
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("routing", () => {
  it("renders a real not-found page for an unknown URL", async () => {
    renderWithProviders(<AppRoutes />, { route: "/no/such/page" });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not found/i);
    // The catch-all previously said "not built yet", which tells a visitor an
    // unknown URL is unfinished rather than wrong.
    expect(alert.textContent ?? "").not.toMatch(/not built yet|coming soon/i);
    // 404 copy must never hint at permissions — the API masks scope as 404.
    expect(alert.textContent ?? "").not.toMatch(/permission|forbidden|access/i);
    expect(screen.getByRole("link", { name: /back to browse/i })).toBeInTheDocument();
  });

  it("sends an anonymous visitor from a protected route to login", async () => {
    renderWithProviders(<AppRoutes />, { route: "/upload" });

    expect(await screen.findByRole("heading", { name: /log in/i })).toBeInTheDocument();
  });

  it("shows signed-out actions in the nav for an anonymous visitor", async () => {
    noPrograms();
    renderWithProviders(<AppRoutes />, { route: "/" });

    expect(await screen.findByRole("link", { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign up/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /moderate/i })).not.toBeInTheDocument();
  });

  it("reveals the admin links once an admin is signed in", async () => {
    noPrograms();
    authenticateAs(admin);
    renderWithProviders(<AppRoutes />, { route: "/" });

    expect(await screen.findByRole("link", { name: /moderate/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /users/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^log in$/i })).not.toBeInTheDocument();
  });

  it("hides the admin links from a student", async () => {
    noPrograms();
    authenticateAs({ ...admin, id: "u1", role: "student" as never });
    renderWithProviders(<AppRoutes />, { route: "/" });

    // My uploads appears for any signed-in user, so it proves the session
    // resolved before we assert the admin links are absent.
    expect(await screen.findByRole("link", { name: /my uploads/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /moderate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /users/i })).not.toBeInTheDocument();
  });
});
