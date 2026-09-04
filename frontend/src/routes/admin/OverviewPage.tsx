import {
  ChevronRight,
  Database,
  Download,
  FileText,
  FolderTree,
  GraduationCap,
  HardDrive,
  Layers,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { StatTile, StatTileSkeleton } from "@/components/admin/StatTile";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusPill } from "@/components/layout/StatusPill";
import { Button } from "@/components/ui/button";
import { useCapabilities } from "@/features/admin/capabilities";
import { TYPE_LABELS } from "@/features/notes/note-labels";
import { useOverview } from "@/features/taxonomy/admin-queries";
import type { OverviewProgram } from "@/lib/api-types";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

const NUMBER = new Intl.NumberFormat();

/**
 * One program with its branches folded underneath. Expanding is local state
 * rather than a route: the whole tree already arrived with the overview, so
 * opening a row costs nothing and a URL for it would be noise.
 */
function ProgramRow({ program }: { program: OverviewProgram }) {
  const [expanded, setExpanded] = useState(false);
  const hasBranches = program.branches.length > 0;

  return (
    <li className="rounded-card bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 sm:flex-nowrap">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          disabled={!hasBranches}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control text-left disabled:cursor-default"
        >
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-text-tertiary transition-transform duration-150",
              expanded && "rotate-90",
              !hasBranches && "opacity-0"
            )}
            strokeWidth={2}
            aria-hidden="true"
          />
          <span className="rounded-control bg-background px-1.5 py-0.5 font-mono text-caption text-text-muted">
            {program.code}
          </span>
          <span className="min-w-0 truncate text-ui font-medium text-text-primary">{program.name}</span>
          {!program.is_active && (
            <span className="shrink-0 rounded-control bg-status-rejected-bg px-1.5 py-0.5 text-caption font-medium text-status-rejected-fg">
              Deactivated
            </span>
          )}
        </button>

        <dl className="flex shrink-0 items-center gap-4 pl-6 font-mono text-caption tabular-nums sm:pl-0">
          <Metric label="branches" value={program.branch_count} />
          <Metric label="subjects" value={program.subject_count} />
          <Metric label="notes" value={program.note_count} />
          <Metric label="pending" value={program.pending_note_count} warn={program.pending_note_count > 0} />
          <Metric label="people" value={program.user_count} />
          <span className="hidden text-text-tertiary sm:inline">{program.duration_semesters} sem</span>
        </dl>
      </div>

      {expanded && hasBranches && (
        <ul className="flex flex-col gap-px border-t border-border px-3 py-2">
          {program.branches.map((branch) => (
            <li
              key={branch.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-control px-3 py-1.5 hover:bg-surface-elevated"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="rounded-control bg-background px-1.5 py-0.5 font-mono text-caption text-text-tertiary">
                  {branch.code}
                </span>
                <span className="min-w-0 truncate text-ui text-text-muted">{branch.name}</span>
                {!branch.is_active && (
                  <span className="shrink-0 text-caption text-status-rejected-fg">deactivated</span>
                )}
              </span>
              <dl className="flex shrink-0 items-center gap-4 font-mono text-caption tabular-nums">
                <Metric label="subjects" value={branch.subject_count} />
                <Metric label="notes" value={branch.note_count} />
                <Metric label="pending" value={branch.pending_note_count} warn={branch.pending_note_count > 0} />
                <Metric label="students" value={branch.student_count} />
              </dl>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Metric({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <span className="flex items-baseline gap-1">
      <dt className="sr-only">{label}</dt>
      <dd className={cn("font-medium", warn ? "text-status-pending-fg" : "text-text-primary")}>{value}</dd>
      <span aria-hidden="true" className="text-text-tertiary">
        {label}
      </span>
    </span>
  );
}

export function OverviewPage() {
  const capabilities = useCapabilities();
  const overview = useOverview(capabilities.isManager);

  const scopeDescription =
    capabilities.role === "superuser"
      ? "Every program, branch and upload on the platform."
      : capabilities.role === "program_admin"
        ? "Everything inside the program you administer."
        : "Everything inside the branch you administer.";

  if (overview.error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Dashboard" />
        <ErrorState error={overview.error} />
      </div>
    );
  }

  const data = overview.data;
  const totals = data?.totals;
  const maxByType = Math.max(1, ...(data?.notes_by_type.map((entry) => entry.count) ?? [1]));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description={scopeDescription}
        action={
          capabilities.isManager ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/taxonomy">
                <FolderTree className="size-3.5" strokeWidth={2} aria-hidden="true" />
                Manage structure
              </Link>
            </Button>
          ) : undefined
        }
      />

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {!totals ? (
          Array.from({ length: 8 }, (_, index) => <StatTileSkeleton key={index} />)
        ) : (
          <>
            <StatTile
              label="Programs"
              value={NUMBER.format(totals.programs)}
              icon={GraduationCap}
              to="/admin/taxonomy"
            />
            <StatTile
              label="Branches"
              value={NUMBER.format(totals.branches)}
              icon={FolderTree}
              to="/admin/taxonomy?tier=branches"
            />
            <StatTile
              label="Subjects"
              value={NUMBER.format(totals.subjects)}
              icon={Layers}
              to="/admin/taxonomy?tier=subjects"
            />
            <StatTile label="Accounts" value={NUMBER.format(totals.users)} icon={Users} to="/admin/accounts" />
            <StatTile
              label="Notes"
              value={NUMBER.format(totals.notes)}
              hint={`${NUMBER.format(totals.approved_notes)} approved · ${NUMBER.format(totals.rejected_notes)} rejected`}
              icon={FileText}
            />
            <StatTile
              label="Awaiting review"
              value={NUMBER.format(totals.pending_notes)}
              hint={totals.pending_notes > 0 ? "Needs a decision" : "Queue is clear"}
              icon={ShieldAlert}
              tone={totals.pending_notes > 0 ? "warn" : "default"}
              to="/admin/moderation"
            />
            <StatTile
              label="Files"
              value={NUMBER.format(totals.files)}
              hint={`${formatBytes(totals.storage_bytes)} stored`}
              icon={HardDrive}
            />
            <StatTile
              label="Downloads"
              value={NUMBER.format(totals.downloads)}
              hint={`${NUMBER.format(totals.uploads_last_7_days)} uploads in 7 days`}
              icon={Download}
            />
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-medium text-text-primary">Programs and branches</h2>
          <span className="text-caption text-text-tertiary">
            Every figure below is scoped to what you administer.
          </span>
        </div>

        {!data ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} data-skeleton-block className="h-14 animate-pulse rounded-card bg-surface" />
            ))}
          </div>
        ) : data.programs.length === 0 ? (
          <EmptyState
            title="No programs yet"
            hint="Add a program to start building the browse hierarchy."
            action={
              capabilities.canManagePrograms ? (
                <Button asChild size="sm">
                  <Link to="/admin/taxonomy">Add a program</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {data.programs.map((program) => (
              <ProgramRow key={program.id} program={program} />
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-medium text-text-primary">What gets uploaded</h2>
          {!data ? (
            <div data-skeleton-block className="h-40 animate-pulse rounded-card bg-surface" />
          ) : data.notes_by_type.length === 0 ? (
            <EmptyState title="Nothing uploaded yet" />
          ) : (
            <ul className="flex flex-col gap-2.5 rounded-card bg-surface p-4">
              {data.notes_by_type.map((entry) => (
                <li key={entry.note_type} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-caption text-text-muted">
                    {TYPE_LABELS[entry.note_type] ?? entry.note_type}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-background">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${(entry.count / maxByType) * 100}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-caption tabular-nums text-text-primary">
                    {entry.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-base font-medium text-text-primary">Latest uploads</h2>
            <TrendingUp className="size-4 text-text-tertiary" strokeWidth={2} aria-hidden="true" />
          </div>
          {!data ? (
            <div data-skeleton-block className="h-40 animate-pulse rounded-card bg-surface" />
          ) : data.recent_activity.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-card bg-surface">
              {data.recent_activity.map((entry) => (
                <li key={entry.id}>
                  <Link
                    to={`/notes/${entry.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-surface-elevated"
                  >
                    <Database className="size-3.5 shrink-0 text-text-tertiary" strokeWidth={2} aria-hidden="true" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-ui text-text-primary">{entry.title}</span>
                      <span className="truncate font-mono text-caption text-text-tertiary">
                        {entry.program_code} / {entry.branch_code} / {entry.subject_code}
                        {entry.uploader_name ? ` · ${entry.uploader_name}` : ""}
                      </span>
                    </span>
                    <span className="ml-auto shrink-0">
                      <StatusPill status={entry.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
