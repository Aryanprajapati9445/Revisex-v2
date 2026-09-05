import { BookOpen, ShieldCheck, UploadCloud } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { StatusPill } from "@/components/layout/StatusPill";

const STEPS = [
  {
    number: "01",
    icon: BookOpen,
    title: "Choose your course",
    body: "Find your exact course in three taps, not three group chats.",
  },
  {
    number: "02",
    icon: ShieldCheck,
    title: "Open trusted notes",
    body: "Every note is reviewed before it reaches you — no dead links, no wrong-subject uploads.",
  },
  {
    number: "03",
    icon: UploadCloud,
    title: "Study or share",
    body: "Download instantly, or upload the notes that got you through the exam.",
  },
] as const;

function StepVisual({ step }: { step: (typeof STEPS)[number] }) {
  if (step.number === "01") {
    return (
      <div className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3">
        {["B.Tech CSE", "Semester 3", "Data Structures"].map((row) => (
          <div
            key={row}
            className="rounded-control border border-border bg-background px-2.5 py-1.5 text-caption text-text-muted"
          >
            {row}
          </div>
        ))}
      </div>
    );
  }

  if (step.number === "02") {
    return (
      <div className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-2 rounded-control bg-background px-2.5 py-1.5">
          <span className="truncate text-caption text-text-primary">Data Structures — Unit 3</span>
          <StatusPill status="approved" />
        </div>
        <div className="flex items-center justify-between gap-2 rounded-control bg-background px-2.5 py-1.5">
          <span className="truncate text-caption text-text-primary">Operating Systems</span>
          <StatusPill status="approved" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface p-4">
      <UploadCloud className="size-5 text-text-tertiary" strokeWidth={2} aria-hidden="true" />
      <span className="text-caption text-text-muted">Drop a file to upload</span>
    </div>
  );
}

// A connected 3-step flow instead of a scroll-driven timeline: each step is
// its own card carrying a number, an icon, a short line of copy, and a small
// product visual, joined by a single rule so the sequence still reads left
// to right on desktop and top to bottom once it stacks on mobile.
export function HowItWorks() {
  return (
    <div className="relative grid gap-6 sm:grid-cols-3 sm:gap-4">
      <div
        className="absolute left-0 right-0 top-9 hidden h-px bg-border sm:block"
        aria-hidden="true"
      />
      {STEPS.map((step, index) => (
        <Reveal
          key={step.number}
          transition={{ duration: 0.4, ease: "easeOut", delay: index * 0.08 }}
          className="relative flex flex-col gap-4 rounded-panel border border-border bg-surface p-5"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-control border border-border bg-background font-mono text-caption font-semibold text-text-primary">
              {step.number}
            </span>
            <step.icon className="size-4 text-primary" strokeWidth={2} aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-ui font-semibold text-text-primary">{step.title}</h3>
            <p className="text-ui text-text-muted">{step.body}</p>
          </div>
          <StepVisual step={step} />
        </Reveal>
      ))}
    </div>
  );
}
