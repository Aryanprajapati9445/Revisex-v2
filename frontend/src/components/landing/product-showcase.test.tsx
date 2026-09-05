import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductShowcase } from "@/components/landing/ProductShowcase";

describe("ProductShowcase", () => {
  it("renders the heading and all three callouts", () => {
    render(<ProductShowcase />);

    expect(
      screen.getByRole("heading", { name: /everything organized around your syllabus/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/the same path every time/i)).toBeInTheDocument();
    expect(screen.getByText(/every note is reviewed/i)).toBeInTheDocument();
    expect(screen.getByText(/download it, or upload your own/i)).toBeInTheDocument();
  });

  it("pins the visual column on large viewports", () => {
    const { container } = render(<ProductShowcase />);
    expect(container.querySelector(".lg\\:sticky")).not.toBeNull();
  });
});
