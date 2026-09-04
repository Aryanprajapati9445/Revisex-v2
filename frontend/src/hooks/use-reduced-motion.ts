import { useReducedMotion as useFramerReducedMotion } from "framer-motion";

/**
 * Thin wrapper so every motion primitive imports from one place, and so a
 * future non-Framer motion need doesn't force a rename at every call site.
 */
export function useReducedMotion(): boolean {
  return useFramerReducedMotion() ?? false;
}
