import { ChevronRight, FileText } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { StatusPill } from "@/components/layout/StatusPill";

// Mirrors the real taxonomy (Program -> Branch -> Subject, with `semester` as
// a field on Subject — see frontend/src/lib/api-types.ts) rather than a made
// up hierarchy. Values are representative labels, not a live query — the
// real path requires an account (router.tsx: /browse, /subjects/:id).
const LEVELS = [
  { label: "Program", value: "B.Tech" },
  { label: "Branch", value: "CSE" },
  { label: "Semester", value: "3" },
  { label: "Subject", value: "Data Structures" },
];

const NOTES = [
  { title: "Data Structures — Unit 1", type: "Lecture notes" },
  { title: "Data Structures — Unit 3", type: "Lecture notes" },
  { title: "Sem 3 PYQs — 2024", type: "PYQ" },
];

const CALLOUTS = [
  {
    title: "Filter down in seconds",
    body: "Pick your program, branch, semester, and subject — the same path every time, not a fresh search each visit.",
  },
  {
    title: "Trust what you find",
    body: "Every note is reviewed before it reaches the library, so you're never stuck guessing if a PDF is even the right one.",
  },
  {
    title: "Keep the loop going",
    body: "Download it, or upload your own — the next student searching this subject finds it the same way you did.",
  },
] as const;

function ShowcaseCard() {
  return (
    <div className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 lg:flex-row lg:items-stretch lg:gap-0 lg:divide-x lg:divide-border">
      <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:flex-nowrap lg:items-start lg:justify-center lg:gap-3 lg:pr-6">
        {LEVELS.map((level, index) => (
          <div key={level.label} className="flex items-center gap-2 lg:contents">
            <div className="flex flex-col gap-0.5 rounded-card border border-border bg-background px-3 py-2">
              <span className="text-caption text-text-tertiary">{level.label}</span>
              <span className="text-ui font-medium text-text-primary">{level.value}</span>
            </div>
            {index < LEVELS.length - 1 && (
              <ChevronRight
                className="size-3.5 shrink-0 text-text-tertiary lg:hidden"
                strokeWidth={2}
                aria-hidden="true"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 lg:pl-6">
        <span className="px-1 text-caption font-medium text-text-tertiary">Notes</span>
        <ul className="flex flex-col divide-y divide-border">
          {NOTES.map((note) => (
            <li key={note.title} className="flex items-center gap-3 px-1 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <FileText className="size-3.5" strokeWidth={2} aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-ui font-medium text-text-primary">{note.title}</span>
                <span className="truncate text-caption text-text-muted">{note.type}</span>
              </span>
              <StatusPill status="approved" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ProductShowcase() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex max-w-lg flex-col gap-2">
        <h2 className="text-title font-semibold tracking-tight text-text-primary">
          Everything organized around your syllabus.
        </h2>
        <p className="text-ui text-text-muted">
          No folder-hunting. Pick your program, narrow to your subject, and the right notes are
          already there.
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-24">
          <Reveal>
            <ShowcaseCard />
          </Reveal>
        </div>

        <div className="flex flex-col gap-8">
          {CALLOUTS.map((callout, index) => (
            <Reveal
              key={callout.title}
              transition={{ duration: 0.4, ease: "easeOut", delay: index * 0.08 }}
              className="flex flex-col gap-2 border-l-2 border-border pl-5"
            >
              <h3 className="text-ui font-semibold text-text-primary">{callout.title}</h3>
              <p className="text-ui text-text-muted">{callout.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </div>
  );
}
