import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { SearchInput } from "./search-input";

describe("SearchInput", () => {
  it("calls onChange as the user types", async () => {
    const onChange = vi.fn();
    renderWithProviders(<SearchInput value="" onChange={onChange} />);

    await userEvent.type(screen.getByRole("searchbox"), "graphs");
    expect(onChange).toHaveBeenLastCalledWith("s");
  });

  it("shows a clear button only when there is a value, and clears on click", async () => {
    const onChange = vi.fn();
    const { rerender } = renderWithProviders(<SearchInput value="" onChange={onChange} />);
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();

    rerender(<SearchInput value="graphs" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});
