import { lazy, Suspense, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";
import { DashboardShell } from "./DashboardShell";
import { LoadingState } from "./LoadingState";
import { PageTransition } from "@/components/motion/PageTransition";
import { ScrollProgress } from "@/components/motion/ScrollProgress";
import { useAuth } from "@/features/auth/useAuth";
import { useCommandPalette } from "@/hooks/use-command-palette";

// The palette's own dialog UI (cmdk + framer-motion) is rarely used on a
// cold load — the Cmd/Ctrl+K listener lives in CommandPaletteProvider, so
// deferring this import until the palette is actually opened doesn't cost
// the shortcut anything, only the dialog's first-open latency.
const CommandPalette = lazy(() =>
  import("@/components/command-palette/CommandPalette").then((m) => ({ default: m.CommandPalette }))
);

// Signed-in users get the left-sidebar dashboard shell (mirrors AdminShell's
// side-rail pattern for the whole app, not just /admin). Anonymous visitors
// keep the marketing top nav — Landing/Login/Register aren't a "dashboard".
export function AppShell() {
  const { status } = useAuth();
  const { open } = useCommandPalette();
  // Mount once the palette is first opened, then keep it mounted — this
  // defers the chunk fetch off the cold-load path without losing the
  // dialog's own close-transition on later opens (unmounting it on every
  // close would skip that exit animation). The open/close event itself is
  // owned by CommandPaletteProvider's keydown listener, not this component,
  // so reacting to the prop change here is the correct use of an effect.
  const [paletteLoaded, setPaletteLoaded] = useState(false);
  useEffect(() => {
    if (open) setPaletteLoaded(true);
  }, [open]);

  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />
      {paletteLoaded && (
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      )}
      {status === "authenticated" ? (
        <DashboardShell />
      ) : (
        <div className="flex min-h-screen flex-col">
          <TopNav />
          <main className="mx-auto w-full max-w-[90rem] flex-1 px-6 py-8 sm:px-8">
            <PageTransition>
              <Suspense fallback={<LoadingState />}>
                <Outlet />
              </Suspense>
            </PageTransition>
          </main>
          <footer className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-6 text-caption text-text-tertiary sm:px-8">
            <span>Notes — a shared library for coursework, built by students.</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </footer>
        </div>
      )}
    </div>
  );
}
