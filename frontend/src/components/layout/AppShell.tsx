import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";
import { DashboardShell } from "./DashboardShell";
import { PageTransition } from "@/components/motion/PageTransition";
import { ScrollProgress } from "@/components/motion/ScrollProgress";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { useAuth } from "@/features/auth/useAuth";

// Signed-in users get the left-sidebar dashboard shell (mirrors AdminShell's
// side-rail pattern for the whole app, not just /admin). Anonymous visitors
// keep the marketing top nav — Landing/Login/Register aren't a "dashboard".
export function AppShell() {
  const { status } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />
      <CommandPalette />
      {status === "authenticated" ? (
        <DashboardShell />
      ) : (
        <div className="flex min-h-screen flex-col">
          <TopNav />
          <main className="mx-auto w-full max-w-[90rem] flex-1 px-6 py-8 sm:px-8">
            <PageTransition>
              <Outlet />
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
