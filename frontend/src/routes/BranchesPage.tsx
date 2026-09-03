import { useState } from "react";
import { useParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { Pagination } from "@/components/layout/Pagination";
import { TaxonomyCard } from "@/features/taxonomy/TaxonomyCard";
import { useBranches, useProgram } from "@/features/taxonomy/queries";

export function BranchesPage() {
  const { programId = "" } = useParams();
  const [page, setPage] = useState(1);
  const program = useProgram(programId);
  const branches = useBranches(programId, page);

  if (program.error) return <ErrorState error={program.error} />;
  if (branches.error) return <ErrorState error={branches.error} />;
  if (program.isPending || branches.isPending) return <div className="text-text-muted">Loading…</div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Breadcrumbs items={[{ label: "Programs", to: "/" }, { label: program.data.name }]} />
        <h1 className="text-title font-bold">{program.data.name}</h1>
      </div>

      {branches.data.items.length === 0 ? (
        <EmptyState title="No branches yet" hint="This program has no branches set up." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.data.items.map((branch) => (
              <TaxonomyCard
                key={branch.id}
                // Carries the program id so the subjects page can resolve its
                // breadcrumb — /api/branches is program-scoped, so there is no
                // way back to the program from a branch id alone.
                to={`/branches/${branch.id}?program_id=${programId}`}
                code={branch.code}
                name={branch.name}
              />
            ))}
          </div>
          <Pagination meta={branches.data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
