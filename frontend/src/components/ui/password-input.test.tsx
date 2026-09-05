import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("starts masked and toggles to visible text on click", async () => {
    renderWithProviders(<PasswordInput aria-label="Password" />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(input).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("does not submit an enclosing form when the toggle is clicked", async () => {
    let submitted = false;
    renderWithProviders(
      <form onSubmit={() => (submitted = true)}>
        <PasswordInput aria-label="Password" />
      </form>
    );

    await userEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(submitted).toBe(false);
  });
});
