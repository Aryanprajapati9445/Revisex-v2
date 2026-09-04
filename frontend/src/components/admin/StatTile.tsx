import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * The dashboard's unit of measurement. Deliberately not a Card: a tile is a
 * number first, so the value carries the type weight and everything else is
 * caption-sized around it.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  to,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  /** "warn" for a backlog that wants attention — the one place tone is earned. */
  tone?: "default" | "warn";
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        {Icon && (
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-control",
              tone === "warn" ? "bg-status-pending-bg text-status-pending-fg" : "bg-accent text-accent-foreground"
            )}
          >
            <Icon className="size-3.5" strokeWidth={2} aria-hidden="true" />
          </span>
        )}
        <span className="text-caption text-text-muted">{label}</span>
      </div>
      <span
        className={cn(
          "font-mono text-2xl leading-none font-medium tracking-tight tabular-nums",
          tone === "warn" ? "text-status-pending-fg" : "text-text-primary"
        )}
      >
        {value}
      </span>
      {hint && <span className="text-caption text-text-tertiary">{hint}</span>}
    </>
  );

  const className = cn(
    "flex min-w-0 flex-col gap-2.5 rounded-card bg-surface p-4 transition-colors duration-150",
    to && "hover:bg-surface-elevated"
  );

  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Skeleton with the tile's exact footprint, so the grid doesn't jump on load. */
export function StatTileSkeleton() {
  return <div data-skeleton-block className="h-[92px] animate-pulse rounded-card bg-surface" />;
}
