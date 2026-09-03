import { Folder, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export function TaxonomyCard({ to, code, name, meta }: { to: string; code: string; name: string; meta?: string }) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-3 rounded-card bg-background p-4 shadow-raised transition-all duration-200 hover:-translate-y-0.5 hover:shadow-floating"
    >
      <div className="flex items-center justify-between">
        <span className="flex size-8 items-center justify-center rounded-control bg-accent-subtle text-accent">
          <Folder className="size-4" strokeWidth={2} aria-hidden="true" />
        </span>
        <ArrowRight
          className="size-4 text-text-tertiary opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-caption font-medium text-text-muted">{code}</span>
        <span className="text-base font-medium">{name}</span>
        {meta && <span className="text-caption text-text-tertiary">{meta}</span>}
      </div>
    </Link>
  );
}
