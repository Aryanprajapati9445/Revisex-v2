import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { ThemeProvider, useTheme } from "@/app/ThemeProvider";

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme}</button>;
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to dark and toggles to light, persisting the choice", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(screen.getByRole("button")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    act(() => {
      fireEvent.click(screen.getByRole("button"));
    });

    expect(screen.getByRole("button")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem("revisex-theme")).toBe("light");
  });
});
