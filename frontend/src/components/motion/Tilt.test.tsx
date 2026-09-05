import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tilt } from "@/components/motion/Tilt";

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

describe("Tilt", () => {
  it("renders its children", () => {
    render(
      <Tilt>
        <p>card content</p>
      </Tilt>
    );
    expect(screen.getByText("card content")).toBeInTheDocument();
  });

  it("does not throw on pointer move and pointer leave", () => {
    const { container } = render(
      <Tilt>
        <p>card content</p>
      </Tilt>
    );
    const wrapper = container.firstChild as HTMLElement;
    stubRect(wrapper);

    expect(() => {
      fireEvent.pointerMove(wrapper, { clientX: 150, clientY: 25 });
      fireEvent.pointerLeave(wrapper);
    }).not.toThrow();
  });

  it("forwards className and other div props", () => {
    const { container } = render(
      <Tilt className="my-tilt" aria-hidden="true">
        <p>card content</p>
      </Tilt>
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass("my-tilt");
    expect(wrapper).toHaveAttribute("aria-hidden", "true");
  });
});
