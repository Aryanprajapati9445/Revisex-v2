import { FileText, Search } from "lucide-react";
import { StatusPill } from "@/components/layout/StatusPill";
import { useLandingStats } from "@/features/landing/queries";
import { Tilt } from "@/components/motion/Tilt";

const ROWS = [
  { subject: "Data Structures", program: "B.Tech CSE · Semester 3", status: "approved" as const },
  { subject: "Operating Systems", program: "B.Tech CSE · Semester 4", status: "approved" as const },
  { subject: "Digital Logic Design", program: "B.Tech ECE · Semester 3", status: "approved" as const },
];

// A stylized, non-functional rendering of the authenticated dashboard — built
// from the same tokens and StatusPill as the real app, not a screenshot and
// not a live query the anonymous visitor could interact with. The floating
// cards attach real numbers where the app already has them (approved-note
// count via useLandingStats); the rest are labels, not invented metrics.
export function PreviewCard() {
  const { data: stats } = useLandingStats();

  return (
    <Tilt strength={6} className="relative my-8 w-full max-w-sm sm:my-10" aria-hidden="true">
      <div className="rounded-panel border border-border bg-surface shadow-hero">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="text-ui font-semibold text-text-primary">Notes</span>
        </div>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="size-3.5 text-text-tertiary" strokeWidth={2} />
          <span className="text-caption text-text-tertiary">Search your notes…</span>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {ROWS.map((row) => (
            <li key={row.subject} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <FileText className="size-3.5" strokeWidth={2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-ui font-medium text-text-primary">{row.subject}</span>
                <span className="truncate text-caption text-text-muted">{row.program}</span>
              </span>
              <StatusPill status={row.status} />
            </li>
          ))}
        </ul>
      </div>

      <div
        className="absolute -left-10 -top-8 hidden rounded-card border border-border bg-surface-elevated px-3.5 py-2.5 shadow-floating sm:block"
        style={{ transform: "rotate(-4deg)" }}
      >
        <p className="text-caption font-medium text-text-primary">
          {stats ? `${stats.approvedNotes} approved notes` : "Approved notes"}
        </p>
      </div>

      <div
        className="absolute -right-8 top-1/2 hidden -translate-y-1/2 rounded-card border border-border bg-surface-elevated px-3.5 py-2.5 shadow-floating sm:block"
        style={{ transform: "translateY(-50%) rotate(3deg)" }}
      >
        <p className="text-caption font-medium text-text-primary">Community reviewed</p>
      </div>

      <div
        className="absolute -bottom-7 left-8 hidden rounded-card border border-border bg-surface-elevated px-3.5 py-2.5 shadow-floating sm:block"
        style={{ transform: "rotate(-3deg)" }}
      >
        <p className="text-caption font-medium text-text-primary">Semester 3</p>
      </div>
    </Tilt>
  );
}
