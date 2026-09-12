import { ArrowRight, Bookmark, BookOpen, Clock, Upload as UploadIcon } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useCapabilities } from "@/features/admin/capabilities";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { useAuth } from "@/features/auth/useAuth";
import { useBookmarks } from "@/features/engagement/queries";
import { NoteCard } from "@/features/notes/NoteCard";
import { useNotes } from "@/features/notes/queries";
import { SemesterPicker } from "@/features/students/SemesterPicker";
import { TaxonomyCard } from "@/features/taxonomy/TaxonomyCard";
import { useBranch, useProgram, useSubjects } from "@/features/taxonomy/queries";
import type { User } from "@/lib/api-types";

/**
 * An administrator's home is the console, not this page.
 *
 * Split in two rather than returning early inside StudentHome: the redirect
 * has to be decided before StudentHome's queries are declared, and a
 * conditional return above them would change hook order between renders.
 */
export function HomePage() {
  const capabilities = useCapabilities();
  const { user } = useAuth();

  if (capabilities.isLoading || !user) return <LoadingState count={3} />;
  if (capabilities.isManager) return <Navigate to="/admin" replace />;
  return <StudentHome user={user} />;
}

/**
 * The signed-in student's own course, not a second copy of the landing page.
 *
 * This page used to be the marketing hero again — "Find the notes your syllabus
 * already promised you", a sign-up call to action, three arbitrary programs.
 * It sits behind ProtectedRoute, so isAuthenticated was always true and the
 * whole anonymous half of it was unreachable code. A student arriving here
 * already has an account, a branch, and a semester; this shows those.
 */
function StudentHome({ user }: { user: User }) {
  const branch = useBranch(user.branch_id ?? "");
  const program = useProgram(branch.data?.program_id ?? "");
  const semester = user.current_semester;

  // Subjects for the semester they said they are in. Without a semester set
  // this asks rather than guessing — see SemesterPicker.
  const subjects = useSubjects(user.branch_id ?? "", semester ?? undefined, 1, 100);

  const saved = useBookmarks(1);
  const recent = useNotes({
    branch_id: user.branch_id ?? undefined,
    semester: semester ?? undefined,
    limit: 4,
  });
  const myPending = useNotes({ status: "pending", limit: 1 });

  const firstName = user.full_name.split(" ")[0] ?? user.full_name;

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4 pt-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-title font-bold text-text-primary">Welcome back, {firstName}</h1>
            <p className="text-ui text-text-muted">
              {branch.data && program.data
                ? `${branch.data.name} · ${program.data.name}`
                : "Loading your course…"}
            </p>
          </div>
          {program.data && (
            <SemesterPicker value={semester} durationSemesters={program.data.duration_semesters} />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/upload">
              <UploadIcon className="size-3.5" strokeWidth={2} aria-hidden="true" />
              Upload notes
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link to="/saved">
              <Bookmark className="size-3.5" strokeWidth={2} aria-hidden="true" />
              Saved
              {saved.data && saved.data.pagination.total > 0 && ` (${saved.data.pagination.total})`}
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/search">Search all notes</Link>
          </Button>
        </div>

        {myPending.data && myPending.data.pagination.total > 0 && (
          <p className="flex items-center gap-2 rounded-card border border-border bg-surface px-3 py-2 text-ui text-text-muted">
            <Clock className="size-4 shrink-0 text-text-tertiary" strokeWidth={2} aria-hidden="true" />
            You have {myPending.data.pagination.total} upload
            {myPending.data.pagination.total === 1 ? "" : "s"} waiting for review.
            <Link to="/my-uploads" className="text-primary hover:underline">
              Check status
            </Link>
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-medium text-text-primary">
            {semester ? `Your semester ${semester} subjects` : "Your subjects"}
          </h2>
          {branch.data && (
            <Link
              to={`/branches/${branch.data.id}`}
              className="text-ui font-medium text-primary hover:underline"
            >
              All semesters
            </Link>
          )}
        </div>

        {semester === null ? (
          <EmptyState
            title="Which semester are you in?"
            hint="Set it above and this page will open on the subjects you're taking now."
          />
        ) : subjects.error ? (
          <ErrorState error={subjects.error} />
        ) : subjects.isPending ? (
          <LoadingState count={3} />
        ) : subjects.data.items.length === 0 ? (
          <EmptyState
            title={`No subjects listed for semester ${semester}`}
            hint="An administrator adds subjects for each semester. Try another semester, or browse the whole branch."
          />
        ) : (
          <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.data.items.map((subject) => (
              <StaggerItem key={subject.id}>
                <TaxonomyCard
                  to={`/subjects/${subject.id}`}
                  code={subject.code}
                  name={subject.name}
                  meta={`Semester ${subject.semester}`}
                />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      {saved.data && saved.data.items.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base font-medium text-text-primary">Picking up where you left off</h2>
            <Link to="/saved" className="text-ui font-medium text-primary hover:underline">
              All saved
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {saved.data.items.slice(0, 2).map((note) => (
              <NoteCard key={note.id} note={note} showSubject />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-medium text-text-primary">
            {semester ? `New in semester ${semester}` : "New in your branch"}
          </h2>
          <Link
            to={`/search${semester ? `?semester=${semester}` : ""}`}
            className="flex items-center gap-1 text-ui font-medium text-primary hover:underline"
          >
            See more
            <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>

        {recent.error ? (
          <ErrorState error={recent.error} />
        ) : recent.isPending ? (
          <LoadingState count={4} />
        ) : recent.data.items.length === 0 ? (
          <EmptyState
            title="Nothing shared here yet"
            hint="Be the first — upload a set of notes and everyone in your branch gets them."
            action={
              <Button asChild size="sm">
                <Link to="/upload">
                  <BookOpen className="size-4" strokeWidth={2} aria-hidden="true" />
                  Upload the first
                </Link>
              </Button>
            }
          />
        ) : (
          <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {recent.data.items.map((note) => (
              <StaggerItem key={note.id}>
                <NoteCard note={note} showSubject />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>
    </div>
  );
}
