import { ArrowRight, BadgeCheck, LayoutGrid, ShieldCheck, Sparkles, Upload as UploadIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/features/auth/useAuth";

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

const STEPS = [
  { n: "1", title: "Pick your subject", body: "Follow program → branch → semester → subject." },
  { n: "2", title: "Preview & download", body: "Check a note is the right one before you commit." },
  { n: "3", title: "Upload your own", body: "Share what helped you — it gets reviewed, then published." },
];

export function HomePage() {
  const { status, user } = useAuth();
  const isAuthenticated = status === "authenticated";

  return (
    <div className="flex flex-col gap-24">
      <section className="grid grid-cols-1 items-center gap-10 pt-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div className="animate-rise-in flex flex-col gap-6">
          <span className="flex items-center gap-1.5 text-caption font-medium text-text-muted">
            <Sparkles className="size-3.5 text-primary" strokeWidth={2} aria-hidden="true" />
            College notes, organized
          </span>
          <h1 className="text-display font-semibold tracking-tight text-text-primary">
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
        </div>

        <div className="animate-rise-in relative hidden lg:block" style={{ animationDelay: "0.1s" }} aria-hidden="true">
          <div className="absolute -top-4 -left-4 w-64 rounded-panel bg-background p-4 shadow-raised transition-transform duration-300 hover:-translate-y-0.5">
            <span className="flex items-center gap-1.5 text-caption font-medium text-text-muted">
              <LayoutGrid className="size-3.5" strokeWidth={2} />
              CSE
            </span>
            <p className="mt-1 text-base font-medium">Computer Science</p>
            <p className="mt-1 text-caption text-text-tertiary">8 semesters</p>
          </div>
          <div className="ml-16 mt-20 w-64 rounded-panel bg-background p-4 shadow-floating transition-transform duration-300 hover:-translate-y-0.5">
            <span className="text-caption font-medium text-text-muted">SEM 4</span>
            <p className="mt-1 text-base font-medium">Operating Systems</p>
            <p className="mt-1 text-caption text-text-tertiary">12 notes</p>
          </div>
          <div className="ml-6 mt-6 w-64 rounded-card bg-surface p-4">
            <span className="inline-flex items-center gap-1 rounded-full bg-status-approved-bg px-2.5 py-1 text-caption font-medium text-status-approved-fg">
              <BadgeCheck className="size-3.5" strokeWidth={2} />
              Approved
            </span>
            <p className="mt-2 text-base font-medium">Deadlock Handling — Unit 4</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <div className="max-w-lg">
          <h2 className="text-title font-bold text-text-primary">Everything organized the way class actually works</h2>
        </div>
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

      <section className="flex flex-col gap-8">
        <h2 className="text-title font-bold text-text-primary">How it works</h2>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="flex flex-col gap-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-accent text-ui font-medium text-accent-foreground">
                {step.n}
              </span>
              <h3 className="text-base font-medium text-text-primary">{step.title}</h3>
              <p className="text-ui text-text-muted">{step.body}</p>
            </div>
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
