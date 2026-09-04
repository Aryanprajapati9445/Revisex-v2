import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw";

// jsdom has no IntersectionObserver; Framer Motion's `whileInView` (used by
// the Reveal/Stagger motion primitives) needs one to exist, even as a stub
// that never actually fires — components should just render eagerly under
// test rather than waiting for a real viewport intersection.
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// @ts-expect-error -- test-only global stub, not a full spec implementation
global.IntersectionObserver = MockIntersectionObserver;

// jsdom also has no ResizeObserver; cmdk (the CommandPalette) uses one to
// track list dimensions.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// @ts-expect-error -- test-only global stub, not a full spec implementation
global.ResizeObserver = MockResizeObserver;

// jsdom doesn't implement scrollIntoView either, and cmdk calls it when
// keyboard-navigating the list.
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

// onUnhandledRequest: "error" makes a forgotten handler a loud test failure
// rather than a confusing hang.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
