import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { LandingPage } from "@/routes/LandingPage";

describe("LandingPage", () => {
  it("renders the hero headline and both CTAs for an anonymous visitor", async () => {
    renderWithProviders(<LandingPage />, { route: "/" });

    expect(
      await screen.findByRole("heading", { name: /stop searching for notes/i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /get started/i })[0]).toHaveAttribute(
      "href",
      "/register"
    );
    expect(screen.getAllByRole("link", { name: /log in/i })[0]).toHaveAttribute("href", "/login");
  });

  it("renders all feature highlights", async () => {
    renderWithProviders(<LandingPage />, { route: "/" });

    expect(await screen.findByText("Browse by course")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Community reviewed" })).toBeInTheDocument();
    expect(screen.getByText("Search instantly")).toBeInTheDocument();
    expect(screen.getByText("Give back")).toBeInTheDocument();
  });
});
