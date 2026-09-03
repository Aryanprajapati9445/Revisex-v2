import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { MyUploadsPage } from "./MyUploadsPage";
import { SettingsPage } from "./SettingsPage";

const student = {
  id: "u1",
  email: "s@test.edu",
  full_name: "Student",
  role: "student" as const,
  program_id: null,
  branch_id: "b1",
  enrollment_year: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function authenticate() {
  localStorage.setItem("refreshToken", "ref");
  server.use(
    http.post(`${API}/api/auth/refresh`, () =>
      HttpResponse.json({ success: true, data: { accessToken: "a", refreshToken: "r" } })
    ),
    http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: student }))
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("MyUploadsPage", () => {
  it("shows each upload with its status", async () => {
    authenticate();
    server.use(
      http.get(`${API}/api/notes`, ({ request }) => {
        // Own pending uploads come back only when status is passed explicitly;
        // the backend scopes a non-admin's non-approved query to uploader_id.
        expect(new URL(request.url).searchParams.get("status")).toBe("pending");
        return HttpResponse.json({
          success: true,
          data: {
            items: [
              {
                id: "n1",
                subject_id: "s1",
                uploader_id: "u1",
                title: "Draft note",
                description: null,
                note_type: "lecture_notes",
                exam_year: null,
                status: "pending",
                reviewed_by: null,
                reviewed_at: null,
                rejection_reason: null,
                download_count: 0,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
              },
            ],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
          },
        });
      })
    );

    renderWithProviders(<MyUploadsPage />);

    expect(await screen.findByText("Draft note")).toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
  });
});

describe("SettingsPage", () => {
  it("saves a new display name", async () => {
    authenticate();
    let patched: unknown = null;
    server.use(
      http.patch(`${API}/api/users/me`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ success: true, data: { ...student, full_name: "New Name" } });
      })
    );

    renderWithProviders(<SettingsPage />);

    const input = await screen.findByLabelText(/full name/i);
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
    expect(patched).toEqual({ full_name: "New Name" });
  });
});
