import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { LoadingState } from "@/components/layout/LoadingState";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { useAuth } from "@/features/auth/useAuth";
import { NoteCard } from "@/features/notes/NoteCard";
import { useNotes } from "@/features/notes/queries";
import { TaxonomyCard } from "@/features/taxonomy/TaxonomyCard";
import { usePrograms } from "@/features/taxonomy/queries";

export function HomePage() {
  const { status, user } = useAuth();
  const isAuthenticated = status === "authenticated";

  const programs = usePrograms(1, 3);
  const recentNotes = useNotes({ status: "approved", limit: 4 });

  return (
    <div className="flex flex-col gap-24">
      <section className="flex flex-col gap-6 pt-8">
        <span className="flex items-center gap-1.5 text-caption font-medium text-text-muted">
          <Sparkles className="size-3.5 text-primary" strokeWidth={2} aria-hidden="true" />
          College notes, organized
        </span>
        <h1 className="max-w-2xl font-mono text-display font-semibold tracking-tight text-text-primary">
          Find the notes your syllabus already promised you.
        </h1>
        <p className="max-w-lg text-lead text-text-muted">
          Browse by program, branch, and subject, download what you need, and upload what you
          have. Every note is reviewed before it's published.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button asChild size="lg" className="group">
            <Link to="/browse">
              Browse notes
              <ArrowRight
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={2}
                aria-hidden="true"
              />
            </Link>
          </Button>
          {isAuthenticated ? (
            <Button asChild variant="secondary" size="lg">
              <Link to="/upload">Upload a note</Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="lg">
              <Link to="/register">Create an account</Link>
            </Button>
          )}
        </div>
        {isAuthenticated && (
          <p className="text-caption text-text-tertiary">
            Welcome back{user?.full_name ? `, ${user.full_name}` : ""}.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-title font-bold text-text-primary">Start with a program</h2>
          <Link to="/browse" className="text-ui font-medium text-primary hover:underline">
            View all programs
          </Link>
        </div>
        {programs.isPending ? (
          <LoadingState count={3} />
        ) : programs.error ? (
          <ErrorState error={programs.error} />
        ) : programs.data.items.length === 0 ? (
          <EmptyState title="No programs yet" hint="An administrator needs to add a program first." />
        ) : (
          <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.data.items.map((program) => (
              <StaggerItem key={program.id}>
                <TaxonomyCard
                  to={`/programs/${program.id}`}
                  code={program.code}
                  name={program.name}
                  meta={`${program.duration_semesters} semesters`}
                />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      <section className="flex flex-col gap-8">
        <h2 className="text-title font-bold text-text-primary">Recently approved notes</h2>
        {recentNotes.isPending ? (
          <LoadingState count={4} />
        ) : recentNotes.error ? (
          <ErrorState error={recentNotes.error} />
        ) : recentNotes.data.items.length === 0 ? (
          <EmptyState
            title="No approved notes yet"
            hint="Be the first to upload notes once you're signed in."
          />
        ) : (
          <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {recentNotes.data.items.map((note) => (
              <StaggerItem key={note.id}>
                <NoteCard note={note} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>

      {!isAuthenticated && (
        <section className="flex flex-col items-start gap-4 rounded-panel bg-surface p-10 sm:items-center sm:text-center">
          <h2 className="text-title font-bold text-text-primary">Ready to find your notes?</h2>
          <p className="max-w-md text-ui text-text-muted">
            It takes a minute to sign up, and you can start browsing without one.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/register">Join now</Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="hover:bg-background">
              <Link to="/browse">Just browsing</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
