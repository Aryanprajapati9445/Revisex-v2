import { screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { CommandPalette } from "@/components/command-palette/CommandPalette";

describe("CommandPalette", () => {
  it("opens on Cmd+K and closes on Escape", async () => {
    renderWithProviders(<CommandPalette />);

    expect(screen.queryByPlaceholderText("Jump to…")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByPlaceholderText("Jump to…")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Jump to…")).not.toBeInTheDocument();
    });
  });

  it("shows anonymous-accessible nav items when signed out", () => {
    renderWithProviders(<CommandPalette />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });

    expect(screen.getByText("Browse programs")).toBeInTheDocument();
    expect(screen.getByText("Search notes")).toBeInTheDocument();
    expect(screen.queryByText("My uploads")).not.toBeInTheDocument();
  });
});
