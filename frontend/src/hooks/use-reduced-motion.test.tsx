import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

describe("useReducedMotion", () => {
  it("returns a boolean", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(typeof result.current).toBe("boolean");
  });
});
