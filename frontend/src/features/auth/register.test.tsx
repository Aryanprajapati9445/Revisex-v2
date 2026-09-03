import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { RegisterForm } from "./RegisterForm";

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

function paginated<T>(items: T[]) {
  return {
    success: true,
    data: { items, pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 } },
  };
}

function taxonomy() {
  server.use(
    http.get(`${API}/api/programs`, () => HttpResponse.json(paginated([program]))),
    http.get(`${API}/api/branches`, () => HttpResponse.json(paginated([branch])))
  );
}

async function fillRequiredFields() {
  await userEvent.type(screen.getByLabelText(/full name/i), "New Student");
  await userEvent.type(screen.getByLabelText(/^email$/i), "new@test.edu");
  await userEvent.type(screen.getByLabelText(/password/i), "password123");
  await userEvent.selectOptions(await screen.findByLabelText(/program/i), "p1");
  await userEvent.selectOptions(await screen.findByLabelText(/branch/i), "b1");
}

beforeEach(() => {
  localStorage.clear();
});

describe("RegisterForm", () => {
  it("registers with the selected branch and stores the session", async () => {
    taxonomy();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/api/auth/register`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            success: true,
            data: {
              user: {
                id: "u1",
                email: "new@test.edu",
                full_name: "New Student",
                role: "student",
                program_id: null,
                branch_id: "b1",
                enrollment_year: null,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
              },
              accessToken: "acc",
              refreshToken: "ref",
            },
          },
          { status: 201 }
        );
      })
    );

    renderWithProviders(<RegisterForm />);
    await fillRequiredFields();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(body).not.toBeNull());
    // branch_id is what the backend requires; program is only a narrowing step.
    expect(body).toEqual({
      email: "new@test.edu",
      password: "password123",
      full_name: "New Student",
      branch_id: "b1",
    });
    await waitFor(() => expect(localStorage.getItem("refreshToken")).toBe("ref"));
  });

  it("puts a taken email on the email field rather than in a banner", async () => {
    taxonomy();
    server.use(
      http.post(`${API}/api/auth/register`, () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: "EMAIL_TAKEN", message: "An account with this email already exists" },
          },
          { status: 409 }
        )
      )
    );

    renderWithProviders(<RegisterForm />);
    await fillRequiredFields();
    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    // Not a form-level alert: the message belongs on the field to change.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("only offers branches once a program is chosen", async () => {
    taxonomy();
    renderWithProviders(<RegisterForm />);

    const branchSelect = await screen.findByLabelText(/branch/i);
    expect(branchSelect).toBeDisabled();

    await userEvent.selectOptions(await screen.findByLabelText(/program/i), "p1");
    expect(branchSelect).toBeEnabled();
    expect(await screen.findByRole("option", { name: "Computer Science" })).toBeInTheDocument();
  });
});
