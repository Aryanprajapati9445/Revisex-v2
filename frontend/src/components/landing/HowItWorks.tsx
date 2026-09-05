import { useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const STEPS = [
  {
    number: "01",
    title: "Find your subject",
    body: "Pick your program, branch, and semester — narrow straight down to the subject you need.",
  },
  {
    number: "02",
    title: "Open what's approved",
    body: "Every note has already passed moderation, so you can trust what you open.",
  },
  {
    number: "03",
    title: "Upload your own",
    body: "Give back in two steps — pick the subject, add your file, and it's in the queue.",
  },
];

function StepRow({ number, title, body }: (typeof STEPS)[number]) {
  const ref = useRef<HTMLDivElement>(null);
  const isActive = useInView(ref, { margin: "-40% 0px -40% 0px" });

  return (
    <div ref={ref} className="relative flex flex-col gap-1.5 py-5 pl-10">
      <span
        className={cn(
          "absolute left-0 top-5 flex size-6 items-center justify-center rounded-full border font-mono text-caption transition-colors duration-300",
          isActive
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-surface text-text-tertiary"
        )}
      >
        {number.slice(1)}
      </span>
      <h3
        className={cn(
          "text-ui font-semibold transition-colors duration-300",
          isActive ? "text-text-primary" : "text-text-muted"
        )}
      >
        {title}
      </h3>
      <p className="max-w-sm text-ui text-text-muted">{body}</p>
    </div>
  );
}

// A step-by-step scroll sequence rather than a static grid: the rail fills
// with the page's own scroll position and each step lights up as it passes
// through the viewport's center — the "how it works" section literally
// walks the reader through the flow instead of dumping it in three columns.
export function HowItWorks() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.75", "end 0.4"],
  });
  const lineHeight = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <div ref={containerRef} className="relative flex max-w-xl flex-col">
      <div className="absolute left-3 top-1 bottom-1 w-px -translate-x-1/2 bg-border" aria-hidden="true" />
      {!reducedMotion && (
        <motion.div
          className="absolute left-3 top-1 w-px -translate-x-1/2 bg-primary"
          style={{ height: lineHeight }}
          aria-hidden="true"
        />
      )}
      {STEPS.map((step) => (
        <StepRow key={step.number} {...step} />
      ))}
    </div>
  );
}
