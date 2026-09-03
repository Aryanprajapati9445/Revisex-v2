import type { ReactNode } from "react";

export function PageHeader({
  breadcrumbs,
  title,
  description,
  action,
}: {
  breadcrumbs?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {breadcrumbs}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-title font-bold text-text-primary">{title}</h1>
          {description && <div className="text-lead text-text-muted">{description}</div>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
