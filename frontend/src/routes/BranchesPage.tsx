import { useState } from "react";
import { useParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
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
  if (program.isPending || branches.isPending) return <LoadingState count={6} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: "Programs", to: "/browse" }, { label: program.data.name }]} />}
        title={program.data.name}
      />

      {branches.data.items.length === 0 ? (
        <EmptyState title="No branches yet" hint="This program has no branches set up." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.data.items.map((branch) => (
              <TaxonomyCard
                key={branch.id}
                to={`/branches/${branch.id}`}
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
