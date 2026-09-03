import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-client";
import { renderWithProviders } from "@/test/render";
import { ErrorState } from "./ErrorState";
import { StatusPill } from "./StatusPill";
import { PageHeader } from "./PageHeader";
import { LoadingState } from "./LoadingState";

describe("StatusPill", () => {
  it("labels each note status", () => {
    renderWithProviders(
      <>
        <StatusPill status="pending" />
        <StatusPill status="approved" />
        <StatusPill status="rejected" />
      </>
    );
    expect(screen.getByText("Pending review")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("renders a neutral message for 404 and never mentions permissions", () => {
    renderWithProviders(<ErrorState error={new ApiError(404, "NOT_FOUND", "Note not found")} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/not found/i);
    // The backend masks out-of-scope resources as 404 on purpose. Copy that
    // says "no permission" would leak exactly what the masking hides.
    expect(alert.textContent ?? "").not.toMatch(/permission|forbidden|access|allowed/i);
  });

  it("renders 501 as a coming-soon state, not an error", () => {
    renderWithProviders(<ErrorState error={new ApiError(501, "NOT_IMPLEMENTED", "tags endpoints not implemented yet")} />);

    expect(screen.getByRole("status")).toHaveTextContent(/not available yet/i);
  });

  it("renders 403 with an explicit permission message", () => {
    renderWithProviders(<ErrorState error={new ApiError(403, "FORBIDDEN", "You may not edit this note")} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/you may not edit this note/i);
  });
});

describe("PageHeader", () => {
  it("renders title, description, breadcrumbs, and an action", () => {
    renderWithProviders(
      <PageHeader
        breadcrumbs={<nav aria-label="Breadcrumb">Programs</nav>}
        title="Computer Science"
        description="CSE · 8 semesters"
        action={<button type="button">Do thing</button>}
      />
    );

    expect(screen.getByRole("heading", { name: "Computer Science" })).toBeInTheDocument();
    expect(screen.getByText("CSE · 8 semesters")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Do thing" })).toBeInTheDocument();
  });

  it("renders without breadcrumbs or an action", () => {
    renderWithProviders(<PageHeader title="Search" />);

    expect(screen.getByRole("heading", { name: "Search" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("LoadingState", () => {
  it("renders a status region with card skeletons by default", () => {
    renderWithProviders(<LoadingState />);
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });

  it("renders a detail skeleton for the detail variant", () => {
    renderWithProviders(<LoadingState variant="detail" />);
    const status = screen.getByRole("status", { name: /loading/i });
    expect(status.querySelectorAll("[data-skeleton-block]").length).toBeGreaterThan(0);
  });
});
