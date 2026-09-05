import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { OAuthCallbackPage } from "@/routes/OAuthCallbackPage";
import { LoginForm } from "./LoginForm";
import { ProtectedRoute } from "./ProtectedRoute";
import { RegisterForm } from "./RegisterForm";
import { RoleGate } from "./RoleGate";
import { useAuth } from "./useAuth";

const student = {
  id: "u1",
  email: "s@test.edu",
  full_name: "Student",
  role: "student" as const,
  program_id: null,
  branch_id: "b1",
  enrollment_year: null,
  email_verified: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  localStorage.clear();
});

function WhoAmI() {
  const { user, status } = useAuth();
  return <div>{status === "authenticated" ? `hello ${user!.full_name}` : status}</div>;
}

describe("login", () => {
  it("stores the session and exposes the user", async () => {
    server.use(
      http.post(`${API}/api/auth/login`, () =>
        HttpResponse.json({
          success: true,
          data: { user: student, accessToken: "acc", refreshToken: "ref" },
        })
      )
    );

    renderWithProviders(
      <>
        <LoginForm />
        <WhoAmI />
      </>
    );

    await userEvent.type(screen.getByLabelText(/email/i), "s@test.edu");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("hello Student")).toBeInTheDocument();
    expect(localStorage.getItem("refreshToken")).toBe("ref");
  });

  it("shows the backend message on bad credentials without clearing the form", async () => {
    server.use(
      http.post(`${API}/api/auth/login`, () =>
        HttpResponse.json(
          { success: false, error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect" } },
          { status: 401 }
        )
      )
    );

    renderWithProviders(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), "s@test.edu");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/email or password is incorrect/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveValue("s@test.edu");
  });
});

describe("register", () => {
  it("does not authenticate immediately — reports needsVerification instead", async () => {
    function paginated<T>(items: T[]) {
      return { success: true, data: { items, pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 } } };
    }
    const program = {
      id: "p1",
      code: "BTECH",
      name: "B.Tech",
      duration_semesters: 8,
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
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

    server.use(
      http.post(`${API}/api/auth/register`, () =>
        HttpResponse.json({
          success: true,
          data: { user: { ...student, email_verified: false }, needsVerification: true },
        })
      ),
      http.get(`${API}/api/programs`, () => HttpResponse.json(paginated([program]))),
      http.get(`${API}/api/branches`, () => HttpResponse.json(paginated([branch])))
    );

    let captured: { needsVerification: boolean; email: string } | undefined;

    function Harness() {
      return (
        <RegisterForm
          onRegistered={(email) => {
            captured = { needsVerification: true, email };
          }}
        />
      );
    }

    renderWithProviders(<Harness />);

    await userEvent.type(screen.getByLabelText(/full name/i), "New Student");
    await userEvent.type(screen.getByLabelText(/^email$/i), "new@test.edu");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.selectOptions(await screen.findByLabelText(/program/i), "p1");
    await userEvent.selectOptions(await screen.findByLabelText(/branch/i), "b1");
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await new Promise((r) => setTimeout(r, 0));
    expect(captured?.email).toBe("new@test.edu");
    expect(localStorage.getItem("refreshToken")).toBeNull();
  });
});

describe("session restore", () => {
  it("exchanges a stored refresh token on boot", async () => {
    localStorage.setItem("refreshToken", "stored-ref");
    server.use(
      http.post(`${API}/api/auth/refresh`, () =>
        HttpResponse.json({ success: true, data: { accessToken: "acc2", refreshToken: "ref2" } })
      ),
      http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: student }))
    );

    renderWithProviders(<WhoAmI />);

    expect(await screen.findByText("hello Student")).toBeInTheDocument();
    expect(localStorage.getItem("refreshToken")).toBe("ref2");
  });

  it("falls back to anonymous when the stored token is rejected", async () => {
    localStorage.setItem("refreshToken", "expired");
    server.use(
      http.post(`${API}/api/auth/refresh`, () =>
        HttpResponse.json(
          { success: false, error: { code: "INVALID_TOKEN", message: "expired" } },
          { status: 401 }
        )
      )
    );

    renderWithProviders(<WhoAmI />);

    expect(await screen.findByText("anonymous")).toBeInTheDocument();
    expect(localStorage.getItem("refreshToken")).toBeNull();
  });
});

describe("session teardown", () => {
  it("discards cached data on logout so the next user cannot read it", async () => {
    localStorage.setItem("refreshToken", "stored-ref");
    server.use(
      http.post(`${API}/api/auth/refresh`, () =>
        HttpResponse.json({ success: true, data: { accessToken: "a", refreshToken: "r" } })
      ),
      http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: student })),
      http.post(`${API}/api/auth/logout`, () => HttpResponse.json({ success: true, data: null }))
    );

    function LogoutButton() {
      const { logout } = useAuth();
      return (
        <button type="button" onClick={logout}>
          sign out
        </button>
      );
    }

    const { queryClient } = renderWithProviders(
      <>
        <WhoAmI />
        <LogoutButton />
      </>
    );

    await screen.findByText("hello Student");

    // Stand in for anything scoped the app had already fetched — the user
    // roster and the moderation queue are cached exactly like this.
    queryClient.setQueryData(["users", { page: 1 }], { items: [{ email: "private@test.edu" }] });
    expect(queryClient.getQueryData(["users", { page: 1 }])).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(await screen.findByText("anonymous")).toBeInTheDocument();
    expect(queryClient.getQueryData(["users", { page: 1 }])).toBeUndefined();
  });
});

describe("ProtectedRoute", () => {
  it("redirects an anonymous visitor to /login", async () => {
    renderWithProviders(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/upload" element={<div>upload page</div>} />
        </Route>
        <Route path="/login" element={<div>login page</div>} />
      </Routes>,
      { route: "/upload" }
    );

    expect(await screen.findByText("login page")).toBeInTheDocument();
  });
});

describe("RoleGate", () => {
  it("renders nothing for a role outside the allow list", async () => {
    localStorage.setItem("refreshToken", "stored-ref");
    server.use(
      http.post(`${API}/api/auth/refresh`, () =>
        HttpResponse.json({ success: true, data: { accessToken: "a", refreshToken: "r" } })
      ),
      http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: student }))
    );

    renderWithProviders(
      <>
        <WhoAmI />
        <RoleGate allow={["superuser", "program_admin", "branch_admin"]}>
          <div>admin link</div>
        </RoleGate>
      </>
    );

    await screen.findByText("hello Student");
    expect(screen.queryByText("admin link")).not.toBeInTheDocument();
  });

  it("renders children for an allowed role", async () => {
    localStorage.setItem("refreshToken", "stored-ref");
    server.use(
      http.post(`${API}/api/auth/refresh`, () =>
        HttpResponse.json({ success: true, data: { accessToken: "a", refreshToken: "r" } })
      ),
      http.get(`${API}/api/auth/me`, () =>
        HttpResponse.json({ success: true, data: { ...student, role: "branch_admin" } })
      )
    );

    renderWithProviders(
      <RoleGate allow={["superuser", "program_admin", "branch_admin"]}>
        <div>admin link</div>
      </RoleGate>
    );

    expect(await screen.findByText("admin link")).toBeInTheDocument();
  });
});

describe("OAuth callback", () => {
  it("reads tokens from the URL fragment and authenticates", async () => {
    server.use(http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: student })));

    window.location.hash = "accessToken=abc&refreshToken=def";

    renderWithProviders(
      <>
        <OAuthCallbackPage />
        <WhoAmI />
      </>
    );

    expect(await screen.findByText("hello Student")).toBeInTheDocument();
    expect(localStorage.getItem("refreshToken")).toBe("def");
  });
});
