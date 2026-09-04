import { screen, within } from "@testing-library/react";
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

  it("sends an anonymous visitor away from the protected /home dashboard to login", async () => {
    renderWithProviders(<AppRoutes />, { route: "/home" });

    expect(await screen.findByRole("heading", { name: /log in/i })).toBeInTheDocument();
  });

  it("shows signed-out actions in the nav for an anonymous visitor", async () => {
    noPrograms();
    renderWithProviders(<AppRoutes />, { route: "/" });

    // The landing page itself also has "Log in" CTAs now, so scope this
    // assertion to the header (TopNav) rather than the whole document.
    const header = await screen.findByRole("banner");
    expect(within(header).getByRole("link", { name: /log in/i })).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: /sign up/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /console/i })).not.toBeInTheDocument();
  });

  it("reveals the console link once an admin is signed in", async () => {
    noPrograms();
    authenticateAs(admin);
    renderWithProviders(<AppRoutes />, { route: "/" });

    // Moderation and user management used to be separate top-nav links; they
    // are sections of the console now, so the site nav has one entry to it.
    expect(await screen.findByRole("link", { name: /console/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^moderate$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^log in$/i })).not.toBeInTheDocument();
  });

  it("sends a signed-in student from the landing page to their home", async () => {
    noPrograms();
    authenticateAs({ ...admin, id: "u1", role: "student" as never });
    renderWithProviders(<AppRoutes />, { route: "/" });

    expect(await screen.findByRole("heading", { name: /start with a program/i })).toBeInTheDocument();
  });

  it("sends a signed-in administrator to the console instead of the student home", async () => {
    noPrograms();
    authenticateAs(admin);
    server.use(
      http.get(`${API}/api/admin/permissions/me`, () =>
        HttpResponse.json({ success: true, data: { permissions: [] } })
      ),
      http.get(`${API}/api/admin/overview`, () =>
        HttpResponse.json({
          success: true,
          data: {
            scope: { program_id: null, branch_id: "b1" },
            totals: {
              programs: 0, branches: 0, subjects: 0, users: 0, notes: 0,
              pending_notes: 0, approved_notes: 0, rejected_notes: 0,
              files: 0, downloads: 0, storage_bytes: 0, uploads_last_7_days: 0,
            },
            programs: [],
            notes_by_type: [],
            recent_activity: [],
          },
        })
      )
    );
    renderWithProviders(<AppRoutes />, { route: "/" });

    // /home is the student home — an admin's home is the console dashboard.
    expect(await screen.findByRole("heading", { name: /^dashboard$/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /start with a program/i })).not.toBeInTheDocument();
  });

  it("hides the admin links from a student", async () => {
    noPrograms();
    authenticateAs({ ...admin, id: "u1", role: "student" as never });
    renderWithProviders(<AppRoutes />, { route: "/" });

    // My uploads appears for any signed-in user, so it proves the session
    // resolved before we assert the admin links are absent.
    expect(await screen.findByRole("link", { name: /my uploads/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /console/i })).not.toBeInTheDocument();
  });
});
