import { Link } from "react-router-dom";

export function TaxonomyCard({ to, code, name, meta }: { to: string; code: string; name: string; meta?: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-1 rounded-card bg-background p-4 shadow-raised transition-shadow duration-200 hover:shadow-floating"
    >
      <span className="text-caption font-medium text-text-muted">{code}</span>
      <span className="text-base font-medium">{name}</span>
      {meta && <span className="text-caption text-text-tertiary">{meta}</span>}
    </Link>
  );
}
