import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedNumber } from "@/components/landing/AnimatedNumber";

describe("AnimatedNumber", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at 0", () => {
    render(<AnimatedNumber value={128} duration={200} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("counts up to the target value once the duration elapses", () => {
    render(<AnimatedNumber value={128} duration={200} />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.getByText("128")).toBeInTheDocument();
  });

  it("formats large values with locale separators", () => {
    render(<AnimatedNumber value={12450} duration={100} />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText("12,450")).toBeInTheDocument();
  });
});
