import { ArrowRight } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/Reveal";
import { Parallax } from "@/components/motion/Parallax";
import { PreviewCard } from "@/components/landing/PreviewCard";
import { StatsStrip } from "@/components/landing/StatsStrip";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { Features } from "@/components/landing/Features";
import { PullQuote } from "@/components/landing/PullQuote";
import { CursorGlow } from "@/components/landing/CursorGlow";
import { Tilt } from "@/components/motion/Tilt";
import { useAuth } from "@/features/auth/useAuth";

export function LandingPage() {
  const { status } = useAuth();

  if (status === "authenticated") return <Navigate to="/home" replace />;

  return (
    <div className="flex flex-col gap-28 pb-20">
      <CursorGlow className="grid min-w-0 grid-cols-1 items-center gap-12 pt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col items-start gap-6 text-left">
          <span className="rounded-control border border-border bg-surface px-2.5 py-1 font-mono text-caption text-text-muted">
            YOUR CAMPUS NOTE LIBRARY
          </span>
          <h1 className="max-w-2xl text-display font-semibold tracking-tight text-text-primary">
            Stop searching for notes.
            <br />
            Start studying.
          </h1>
          <p className="max-w-lg text-lead text-text-muted">
            Every semester, the same notes get retyped, re-photographed, and re-lost in five
            different WhatsApp groups. Yours don&rsquo;t have to.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Tilt strength={4} className="inline-block">
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
            </Tilt>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Log in</Link>
            </Button>
          </div>
          <p className="text-caption text-text-tertiary">
            Free for students · Community-reviewed · Organized by course
          </p>
        </div>

        <Reveal className="flex min-w-0 justify-center pt-8 pr-6 pl-10 sm:pr-10 lg:justify-end lg:pt-0">
          <Parallax strength={24}>
            <PreviewCard />
          </Parallax>
        </Reveal>
      </CursorGlow>

      <StatsStrip />

      <ProblemSection />

      <div id="how-it-works" className="flex flex-col gap-10 scroll-mt-20">
        <h2 className="text-title font-semibold tracking-tight text-text-primary">
          How it works
        </h2>
        <HowItWorks />
      </div>

      <ProductShowcase />

      <div id="features" className="flex flex-col gap-10 scroll-mt-20">
        <h2 className="text-title font-semibold tracking-tight text-text-primary">Features</h2>
        <Features />
      </div>

      <PullQuote />

      <div className="flex flex-col items-start gap-4 rounded-panel border border-border bg-surface-elevated p-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-title font-semibold text-text-primary">
            Your next study session starts here.
          </h2>
          <p className="max-w-md text-ui text-text-muted">
            Stop hunting through five chats for the right PDF. Find it here — or upload the one
            you already have.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Tilt strength={4} className="inline-block">
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
          </Tilt>
          <Button asChild size="lg" variant="outline">
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
