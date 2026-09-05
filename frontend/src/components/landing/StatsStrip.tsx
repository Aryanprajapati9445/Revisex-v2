import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useLandingPrograms, useLandingStats } from "@/features/landing/queries";
import { Reveal } from "@/components/motion/Reveal";
import { AnimatedNumber } from "@/components/landing/AnimatedNumber";

const COUNT_LABELS = [
  { key: "programs", label: "Programs" },
  { key: "branches", label: "Branches" },
  { key: "subjects", label: "Subjects" },
  { key: "approvedNotes", label: "Approved notes" },
] as const;

// Every number here is `pagination.total` off a live, unauthenticated GET —
// see features/landing/queries.ts. No number is hardcoded; while loading or
// on error, the row shows a placeholder dash instead of a guessed figure.
export function StatsStrip() {
  const { data: stats, isLoading, isError } = useLandingStats();
  const { data: programs } = useLandingPrograms(6);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h2 className="text-title font-semibold tracking-tight text-text-primary">
          What&rsquo;s in the library?
        </h2>
        <p className="max-w-lg text-ui text-text-muted">
          Live counts from the library — the same taxonomy the app is organized around.
        </p>
      </div>

      <Reveal className="grid gap-px overflow-hidden rounded-panel border border-border bg-border sm:grid-cols-4">
        {COUNT_LABELS.map((item) => (
          <div key={item.key} className="flex flex-col gap-1 bg-surface px-5 py-5">
            <span className="font-mono text-title font-semibold tracking-tight text-text-primary">
              {isLoading || isError || stats == null ? (
                "—"
              ) : (
                <AnimatedNumber value={stats[item.key]} />
              )}
            </span>
            <span className="text-caption text-text-muted">{item.label}</span>
          </div>
        ))}
      </Reveal>

      {programs && programs.items.length > 0 && (
        <div className="flex flex-col gap-4">
          <p className="text-ui font-medium text-text-primary">Built around your syllabus.</p>
          <div className="flex flex-wrap gap-2">
            {programs.items.map((program) => (
              <span
                key={program.id}
                className="rounded-control border border-border bg-surface px-3 py-1.5 text-caption font-medium text-text-muted"
              >
                {program.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <Link
        to="/login"
        className="group inline-flex w-fit items-center gap-1.5 text-ui font-medium text-primary"
      >
        Log in to explore the library
        <ArrowRight
          className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
          strokeWidth={2}
          aria-hidden="true"
        />
      </Link>
    </div>
  );
}
