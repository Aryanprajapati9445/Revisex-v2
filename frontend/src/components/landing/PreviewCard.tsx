import { FileText, Search } from "lucide-react";
import { StatusPill } from "@/components/layout/StatusPill";

const ROWS = [
  { subject: "Data Structures — Unit 3", program: "B.Tech CSE · Sem 3", status: "approved" as const },
  { subject: "Thermodynamics — Notes", program: "B.Tech ME · Sem 4", status: "approved" as const },
  { subject: "Digital Logic Design", program: "B.Tech ECE · Sem 3", status: "pending" as const },
];

// A stylized, non-functional rendering of the browse UI — built from the
// same tokens as the real app (StatusPill included), not a screenshot.
export function PreviewCard() {
  return (
    <div
      className="w-full max-w-md rounded-panel border border-border bg-surface shadow-floating"
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Search className="size-3.5 text-text-tertiary" strokeWidth={2} />
        <span className="text-caption text-text-tertiary">Search notes…</span>
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
  );
}
