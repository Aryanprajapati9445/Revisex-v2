import { useEffect, useState } from "react";
import { motion, useScroll, useSpring } from "framer-motion";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

// A thin, page-wide progress cue — the one piece of "whole app" scroll
// interactivity that doesn't cost anything on dense/functional pages.
export function ScrollProgress() {
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 280, damping: 32, mass: 0.3 });
  // Framer reports progress as 1 (not 0) when there's no scrollable
  // distance at all — without this, a short page shows a fully-filled bar
  // before the user has scrolled anywhere.
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const check = () => setCanScroll(document.documentElement.scrollHeight > window.innerHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(document.documentElement);
    window.addEventListener("resize", check);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);

  if (reducedMotion || !canScroll) return null;

  return (
    <motion.div
      className="pointer-events-none fixed inset-x-0 top-0 z-40 h-0.5 origin-left bg-primary"
      style={{ scaleX }}
      aria-hidden="true"
    />
  );
}
