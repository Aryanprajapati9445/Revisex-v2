import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { Pagination } from "@/components/layout/Pagination";
import { TaxonomyCard } from "@/features/taxonomy/TaxonomyCard";
import { useBranches, useProgram, useSubjects } from "@/features/taxonomy/queries";
import { cn } from "@/lib/utils";

export function SubjectsPage() {
  const { branchId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);

  const semesterParam = searchParams.get("semester");
  const semester = semesterParam ? Number(semesterParam) : 1;

  // The branch endpoint is program-scoped, so the branch record is reached
  // through its program. programId is carried in the URL when the user
  // navigated here from a program page; when it is absent (deep link) the
  // subject list still works, only the breadcrumb is shorter.
  const programId = searchParams.get("program_id") ?? "";
  const program = useProgram(programId);
  const branches = useBranches(programId);
  const branch = branches.data?.items.find((b) => b.id === branchId);

  const subjects = useSubjects(branchId, semester, page);

  if (subjects.error) return <ErrorState error={subjects.error} />;

  const semesterCount = program.data?.duration_semesters ?? 8;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Breadcrumbs
          items={[
            { label: "Programs", to: "/" },
            ...(program.data ? [{ label: program.data.name, to: `/programs/${program.data.id}` }] : []),
            { label: branch?.name ?? "Subjects" },
          ]}
        />
        <h1 className="text-title font-bold">{branch?.name ?? "Subjects"}</h1>
      </div>

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
        <div className="text-text-muted">Loading subjects…</div>
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
    </div>
  );
}
