import { Menu, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { CommandPalette } from "@/components/command-palette/CommandPalette";
import { ConsoleSidebar } from "@/components/layout/ConsoleSidebar";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageTransition } from "@/components/motion/PageTransition";
import { Button } from "@/components/ui/button";
import { useCapabilities } from "@/features/admin/capabilities";
import { useOverview } from "@/features/taxonomy/admin-queries";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "console:sidebar-collapsed";

/**
 * The console runs on a persistent sidebar rather than the site's top nav: it
 * has three times as many destinations, they are grouped, and an admin moves
 * between them constantly. The top bar that remains carries only what is about
 * the current view — the drawer trigger on small screens, and search.
 */
export function ConsoleShell() {
  const capabilities = useCapabilities();
  const location = useLocation();
  const { setOpen: setPaletteOpen } = useCommandPalette();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(COLLAPSED_KEY) === "true";
    } catch {
      // Private mode or blocked site data — a remembered width is a
      // convenience, never a reason to fail the shell.
      return false;
    }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, String(collapsed));
    } catch {
      // Ignore — see above.
    }
  }, [collapsed]);

  // A route change must close the drawer even when the click came from
  // somewhere other than a sidebar link (a breadcrumb, the palette).
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const overview = useOverview(capabilities.isManager);
  const pendingReviews = overview.data?.totals.pending_notes ?? 0;

  if (capabilities.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-text-muted">Loading…</div>
    );
  }

  // A student who follows a stale /admin link gets an explanation rather than a
  // sidebar with nothing in it. The API refuses them regardless.
  if (!capabilities.isManager && !capabilities.canReadUsers) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <EmptyState
          title="You don't have access to the console"
          hint="This area is for program, branch and platform administrators."
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <CommandPalette />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 shrink-0 transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          collapsed && "lg:w-16",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <ConsoleSidebar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
          pendingReviews={pendingReviews}
          onNavigate={() => setDrawerOpen(false)}
        />
      </aside>

      {drawerOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 bg-background/90 px-4 py-3 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-4" strokeWidth={2} aria-hidden="true" />
          </Button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex w-full max-w-sm items-center gap-2 rounded-control bg-surface px-2.5 py-1.5 text-ui text-text-tertiary transition-colors duration-150 hover:bg-surface-elevated"
          >
            <Search className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span className="truncate">Search the console…</span>
            <kbd className="ml-auto hidden rounded-control bg-background px-1.5 py-0.5 font-mono text-caption sm:inline">
              ⌘K
            </kbd>
          </button>
        </header>

        <main className="min-w-0 flex-1 px-4 pt-2 pb-12 sm:px-6 lg:px-8">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
