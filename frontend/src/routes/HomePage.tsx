import { ArrowRight, LayoutGrid, ShieldCheck, Sparkles, Upload as UploadIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/EmptyState";
import { LoadingState } from "@/components/layout/LoadingState";
import { useAuth } from "@/features/auth/useAuth";
import { NoteCard } from "@/features/notes/NoteCard";
import { useNotes } from "@/features/notes/queries";
import { TaxonomyCard } from "@/features/taxonomy/TaxonomyCard";
import { usePrograms } from "@/features/taxonomy/queries";

const FEATURES = [
  {
    icon: LayoutGrid,
    title: "Browse by course",
    body: "Program, branch, semester, subject — pick your way down to exactly the notes you need.",
  },
  {
    icon: ShieldCheck,
    title: "Moderated for quality",
    body: "Every upload is reviewed before it's approved, so what you find has already been checked.",
  },
  {
    icon: UploadIcon,
    title: "Give back in minutes",
    body: "Upload your own notes in two steps and they're in front of the next person in your class.",
  },
];

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
        <h1 className="max-w-2xl text-display font-semibold tracking-tight text-text-primary">
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
        ) : programs.error ? null : programs.data.items.length === 0 ? (
          <EmptyState title="No programs yet" hint="An administrator needs to add a program first." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.data.items.map((program) => (
              <TaxonomyCard
                key={program.id}
                to={`/programs/${program.id}`}
                code={program.code}
                name={program.name}
                meta={`${program.duration_semesters} semesters`}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-8">
        <h2 className="text-title font-bold text-text-primary">Recently approved notes</h2>
        {recentNotes.isPending ? (
          <LoadingState count={4} />
        ) : recentNotes.error ? null : recentNotes.data.items.length === 0 ? (
          <EmptyState
            title="No approved notes yet"
            hint="Be the first to upload notes once you're signed in."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {recentNotes.data.items.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-8">
        <h2 className="text-title font-bold text-text-primary">Everything organized the way class actually works</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="hover:-translate-y-0.5 hover:shadow-floating">
              <span className="flex size-9 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <feature.icon className="size-4" strokeWidth={2} aria-hidden="true" />
              </span>
              <h3 className="text-base font-medium text-text-primary">{feature.title}</h3>
              <p className="text-ui text-text-muted">{feature.body}</p>
            </Card>
          ))}
        </div>
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
