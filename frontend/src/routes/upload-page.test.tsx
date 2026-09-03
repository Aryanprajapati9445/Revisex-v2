import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { API, server } from "@/test/msw";
import { renderWithProviders } from "@/test/render";
import { UploadPage } from "./UploadPage";

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

const subject = {
  id: "s1",
  branch_id: "b1",
  code: "CS101",
  name: "Intro",
  semester: 1,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function authenticate() {
  localStorage.setItem("refreshToken", "ref");
  server.use(
    http.post(`${API}/api/auth/refresh`, () =>
      HttpResponse.json({ success: true, data: { accessToken: "a", refreshToken: "r" } })
    ),
    http.get(`${API}/api/auth/me`, () => HttpResponse.json({ success: true, data: student })),
    http.get(`${API}/api/subjects`, () =>
      HttpResponse.json({
        success: true,
        data: { items: [subject], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } },
      })
    )
  );
}

beforeEach(() => {
  localStorage.clear();
});

// These guards mirror backend limits (requestFiles caps at 10 files;
// completeFile requires size_bytes > 0). Without them a doomed upload still
// creates a note row, and a 0-byte file fails only after its S3 PUT succeeded.
describe("UploadPage file validation", () => {
  it("refuses an empty file before anything is created", async () => {
    authenticate();
    renderWithProviders(<UploadPage />);

    const input = await screen.findByLabelText(/files/i);
    await userEvent.upload(input, new File([], "empty.pdf", { type: "application/pdf" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/empty.*cannot be uploaded/i);
    expect(screen.getByRole("button", { name: /upload/i })).toBeDisabled();
  });

  it("refuses more than ten files", async () => {
    authenticate();
    renderWithProviders(<UploadPage />);

    const input = await screen.findByLabelText(/files/i);
    const many = Array.from(
      { length: 11 },
      (_, index) => new File(["x"], `f${index}.pdf`, { type: "application/pdf" })
    );
    await userEvent.upload(input, many);

    expect(await screen.findByRole("alert")).toHaveTextContent(/at most 10 files/i);
    expect(screen.getByRole("button", { name: /upload/i })).toBeDisabled();
  });

  it("accepts a valid file", async () => {
    authenticate();
    renderWithProviders(<UploadPage />);

    const input = await screen.findByLabelText(/files/i);
    await userEvent.upload(input, new File(["hello"], "ok.pdf", { type: "application/pdf" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await screen.findByText("ok.pdf")).toBeInTheDocument();
  });
});
