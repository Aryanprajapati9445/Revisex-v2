import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CursorGlow } from "@/components/landing/CursorGlow";

function stubRect(element: HTMLElement) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
    right: 200,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => {},
  } as DOMRect);
}

describe("CursorGlow", () => {
  it("renders its children", () => {
    const { getByText } = render(
      <CursorGlow>
        <p>hero content</p>
      </CursorGlow>
    );
    expect(getByText("hero content")).toBeInTheDocument();
  });

  it("defaults the glow to the wrapper's center", () => {
    const { container } = render(
      <CursorGlow>
        <p>hero content</p>
      </CursorGlow>
    );
    const glow = container.querySelector("[data-glow]") as HTMLElement;
    expect(glow.style.getPropertyValue("--glow-x")).toBe("50%");
    expect(glow.style.getPropertyValue("--glow-y")).toBe("50%");
  });

  it("moves the glow to follow the pointer", () => {
    const { container } = render(
      <CursorGlow>
        <p>hero content</p>
      </CursorGlow>
    );
    const wrapper = container.firstChild as HTMLElement;
    stubRect(wrapper);

    fireEvent.pointerMove(wrapper, { clientX: 150, clientY: 25 });

    const glow = container.querySelector("[data-glow]") as HTMLElement;
    expect(glow.style.getPropertyValue("--glow-x")).toBe("75%");
    expect(glow.style.getPropertyValue("--glow-y")).toBe("25%");
  });
});
