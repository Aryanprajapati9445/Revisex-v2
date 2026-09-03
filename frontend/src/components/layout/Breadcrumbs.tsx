import { Fragment } from "react";
import { Link } from "react-router-dom";

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-caption text-text-muted">
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {index > 0 && <span aria-hidden="true">/</span>}
          {item.to ? (
            <Link to={item.to} className="rounded-control px-1 py-0.5 hover:bg-surface">
              {item.label}
            </Link>
          ) : (
            <span className="text-text-primary">{item.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
