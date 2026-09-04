import { ArrowRight, LayoutGrid, ShieldCheck, Upload as UploadIcon } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { PreviewCard } from "@/components/landing/PreviewCard";
import { StatsStrip } from "@/components/landing/StatsStrip";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { PullQuote } from "@/components/landing/PullQuote";
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

export function LandingPage() {
  const { status } = useAuth();

  if (status === "authenticated") return <Navigate to="/home" replace />;

  return (
    <div className="flex flex-col gap-28 pb-20">
      <section className="grid items-center gap-12 pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-8">
        <div className="flex flex-col items-start gap-6 text-left">
          <span className="rounded-control border border-border bg-surface px-2.5 py-1 font-mono text-caption text-text-muted">
            College notes, organized
          </span>
          <h1 className="max-w-2xl text-display font-semibold tracking-tight text-text-primary">
            Find the notes your syllabus already promised you.
          </h1>
          <p className="max-w-lg text-lead text-text-muted">
            A shared, moderated library of notes organized by program, branch, and subject —
            browse what your classmates uploaded, or add your own.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button asChild size="lg" className="group">
              <Link to="/register">
                Get started
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Log in</Link>
            </Button>
          </div>
        </div>

        <Reveal className="flex justify-center lg:justify-end">
          <PreviewCard />
        </Reveal>
      </section>

      <Reveal>
        <StatsStrip />
      </Reveal>

      <Reveal className="flex flex-col gap-10">
        <h2 className="text-title font-semibold tracking-tight text-text-primary">
          How it works
        </h2>
        <HowItWorks />
      </Reveal>

      <Stagger className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <StaggerItem key={feature.title}>
            <div className="flex h-full flex-col gap-3 rounded-panel border border-border bg-surface p-5">
              <span className="flex size-9 items-center justify-center rounded-control bg-accent text-accent-foreground">
                <feature.icon className="size-4" strokeWidth={2} aria-hidden="true" />
              </span>
              <h2 className="text-ui font-semibold text-text-primary">{feature.title}</h2>
              <p className="text-ui text-text-muted">{feature.body}</p>
            </div>
          </StaggerItem>
        ))}
      </Stagger>

      <Reveal>
        <PullQuote />
      </Reveal>

      <Reveal className="flex flex-col items-start gap-4 rounded-panel border border-border bg-surface-elevated p-8">
        <h2 className="text-title font-semibold text-text-primary">Ready to find your notes?</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link to="/register">Create an account</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      </Reveal>
    </div>
  );
}
