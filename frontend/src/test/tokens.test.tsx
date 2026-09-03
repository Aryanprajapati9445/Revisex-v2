import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("design tokens", () => {
  it("applies token-backed utility classes", () => {
    render(
      <button className="bg-accent text-background rounded-card shadow-raised px-4 py-2">Upload</button>
    );
    const button = screen.getByRole("button", { name: "Upload" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("bg-accent", "rounded-card", "shadow-raised");
  });
});
