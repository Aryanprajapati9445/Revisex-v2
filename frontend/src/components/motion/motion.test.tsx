import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PageTransition } from "@/components/motion/PageTransition";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";

describe("motion primitives", () => {
  it("PageTransition renders children", () => {
    render(
      <MemoryRouter>
        <PageTransition>
          <p>content</p>
        </PageTransition>
      </MemoryRouter>
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("Reveal renders children", () => {
    render(
      <Reveal>
        <p>revealed</p>
      </Reveal>
    );
    expect(screen.getByText("revealed")).toBeInTheDocument();
  });

  it("Stagger and StaggerItem render children", () => {
    render(
      <Stagger>
        <StaggerItem>
          <p>item one</p>
        </StaggerItem>
        <StaggerItem>
          <p>item two</p>
        </StaggerItem>
      </Stagger>
    );
    expect(screen.getByText("item one")).toBeInTheDocument();
    expect(screen.getByText("item two")).toBeInTheDocument();
  });
});
