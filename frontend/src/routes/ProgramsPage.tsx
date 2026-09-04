import { useState } from "react";
import { ErrorState } from "@/components/layout/ErrorState";
import { EmptyState } from "@/components/layout/EmptyState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { Reveal } from "@/components/motion/Reveal";
import { TaxonomyCard } from "@/features/taxonomy/TaxonomyCard";
import { usePrograms } from "@/features/taxonomy/queries";

export function ProgramsPage() {
  const [page, setPage] = useState(1);
  const { data, isPending, error } = usePrograms(page);

  return (
    <Reveal className="flex flex-col gap-6">
      <PageHeader title="Browse notes" description="Pick a program to start." />

      {isPending ? (
        <LoadingState count={6} />
      ) : error ? (
        <ErrorState error={error} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No programs yet" hint="An administrator needs to add a program first." />
      ) : (
        <>
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
        </>
      )}
    </Reveal>
  );
}
