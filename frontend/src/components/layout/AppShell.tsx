import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";
import { PageTransition } from "@/components/motion/PageTransition";
import { ScrollProgress } from "@/components/motion/ScrollProgress";
import { CommandPalette } from "@/components/command-palette/CommandPalette";

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <ScrollProgress />
      <TopNav />
      <CommandPalette />
      <main className="mx-auto max-w-[90rem] px-6 py-8 sm:px-8">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
      <footer className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-6 text-caption text-text-tertiary sm:px-8">
        <span>Notes — a shared library for coursework, built by students.</span>
        <span>&copy; {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
