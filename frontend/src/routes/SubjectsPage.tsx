import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { Reveal } from "@/components/motion/Reveal";
import { TaxonomyCard } from "@/features/taxonomy/TaxonomyCard";
import { useBranch, useProgram, useSubjects } from "@/features/taxonomy/queries";
import { cn } from "@/lib/utils";

export function SubjectsPage() {
  const { branchId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);

  const semesterParam = searchParams.get("semester");
  const semester = semesterParam ? Number(semesterParam) : 1;

  // Resolved from the branch id alone: a deep link or shared URL names the
  // branch and sizes the semester tabs correctly, with no query param to carry.
  const branchQuery = useBranch(branchId);
  const branch = branchQuery.data;
  const program = useProgram(branch?.program_id ?? "");

  const subjects = useSubjects(branchId, semester, page);

  if (branchQuery.error) return <ErrorState error={branchQuery.error} />;
  if (subjects.error) return <ErrorState error={subjects.error} />;

  // Falls back to 8 only until the program loads; the real count comes from the
  // program's duration_semesters, which the DB trigger also enforces.
  const semesterCount = program.data?.duration_semesters ?? 8;

  return (
    <Reveal className="flex flex-col gap-6">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "Programs", to: "/browse" },
              ...(program.data ? [{ label: program.data.name, to: `/programs/${program.data.id}` }] : []),
              { label: branch?.name ?? "Subjects" },
            ]}
          />
        }
        title={branch?.name ?? "Subjects"}
      />

      <div role="tablist" aria-label="Semester" className="flex flex-wrap gap-1">
        {Array.from({ length: semesterCount }, (_, index) => index + 1).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={value === semester}
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("semester", String(value));
              setSearchParams(next, { replace: true });
              setPage(1);
            }}
            className={cn(
              "rounded-control px-2.5 py-1.5 text-ui transition-colors duration-150",
              value === semester ? "bg-surface text-text-primary" : "text-text-muted hover:bg-surface"
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {subjects.isPending ? (
        <LoadingState count={6} />
      ) : subjects.data.items.length === 0 ? (
        <EmptyState title={`No subjects in semester ${semester}`} hint="Try another semester." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.data.items.map((subject) => (
              <TaxonomyCard
                key={subject.id}
                to={`/subjects/${subject.id}`}
                code={subject.code}
                name={subject.name}
                meta={`Semester ${subject.semester}`}
              />
            ))}
          </div>
          <Pagination meta={subjects.data.pagination} onPageChange={setPage} />
        </>
      )}
    </Reveal>
  );
}
