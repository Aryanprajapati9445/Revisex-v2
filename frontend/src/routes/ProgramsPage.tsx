import { useState } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { Pagination } from "@/components/layout/Pagination";
import { TaxonomyCard } from "@/features/taxonomy/TaxonomyCard";
import { usePrograms } from "@/features/taxonomy/queries";

export function ProgramsPage() {
  const [page, setPage] = useState(1);
  const { data, isPending, error } = usePrograms(page);

  if (isPending) return <div className="text-text-muted">Loading programs…</div>;
  if (error) return <ErrorState error={error} />;
  if (data.items.length === 0) {
    return <EmptyState title="No programs yet" hint="An administrator needs to add a program first." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title font-bold">Browse notes</h1>
        <p className="mt-1 text-lead text-text-muted">Pick a program to start.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.items.map((program) => (
          <TaxonomyCard
            key={program.id}
            to={`/programs/${program.id}`}
            code={program.code}
            name={program.name}
            meta={`${program.duration_semesters} semesters`}
          />
        ))}
      </div>

      <Pagination meta={data.pagination} onPageChange={setPage} />
    </div>
  );
}
