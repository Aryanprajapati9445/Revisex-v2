import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { ModerationPage } from "@/routes/ModerationPage";

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

const pendingNote = {
  id: "n1",
  subject_id: "s1",
  uploader_id: "u1",
  title: "Needs review",
  description: null,
  note_type: "lecture_notes" as const,
  exam_year: null,
  status: "pending" as const,
  reviewed_by: null,
  reviewed_at: null,
  rejection_reason: null,
  download_count: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function authenticateAdmin() {
  localStorage.setItem("refreshToken", "ref");
  server.use(
    http.post(`${API}/api/auth/refresh`, () =>
      HttpResponse.json({ success: true, data: { accessToken: "a", refreshToken: "r" } })
    ),
    http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: admin })),
    http.get(`${API}/api/notes`, () =>
      HttpResponse.json({
        success: true,
        data: {
          items: [pendingNote],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      })
    )
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("ModerationPage", () => {
  it("approves a note", async () => {
    authenticateAdmin();
    let body: unknown = null;
    server.use(
      http.post(`${API}/api/notes/n1/review`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: { ...pendingNote, status: "approved" } });
      })
    );

    renderWithProviders(<ModerationPage />);

    await userEvent.click(await screen.findByRole("button", { name: /approve/i }));

    await waitFor(() => expect(body).toEqual({ decision: "approved" }));
  });

  it("requires a reason before it will send a rejection", async () => {
    authenticateAdmin();
    let called = false;
    server.use(
      http.post(`${API}/api/notes/n1/review`, () => {
        called = true;
        return HttpResponse.json({ success: true, data: pendingNote });
      })
    );

    renderWithProviders(<ModerationPage />);

    await userEvent.click(await screen.findByRole("button", { name: /reject/i }));
    // The dialog's own submit, with the reason box left empty.
    await userEvent.click(screen.getByRole("button", { name: /confirm rejection/i }));

    expect(await screen.findByText(/a reason is required/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("sends the reason when one is given", async () => {
    authenticateAdmin();
    let body: unknown = null;
    server.use(
      http.post(`${API}/api/notes/n1/review`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, data: { ...pendingNote, status: "rejected" } });
      })
    );

    renderWithProviders(<ModerationPage />);

    await userEvent.click(await screen.findByRole("button", { name: /reject/i }));
    await userEvent.type(screen.getByLabelText(/reason/i), "Blurry scan");
    await userEvent.click(screen.getByRole("button", { name: /confirm rejection/i }));

    await waitFor(() =>
      expect(body).toEqual({ decision: "rejected", rejection_reason: "Blurry scan" })
    );
  });
});
