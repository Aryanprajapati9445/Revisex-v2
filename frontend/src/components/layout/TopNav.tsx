import { Moon, NotebookPen, Sun } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useTheme } from "@/app/ThemeProvider";
import { cn } from "@/lib/utils";

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "rounded-control px-2.5 py-1.5 text-ui transition-colors duration-150",
    isActive ? "bg-surface text-text-primary" : "text-text-muted hover:bg-surface"
  );
}

// Anonymous-only chrome now — the signed-in experience lives in
// DashboardShell's left rail. Browse/Search require an account (see
// router.tsx), so there's nothing to link to here — just brand + auth
// actions, not the templated multi-link AI-nav shape this used to carry.
export function TopNav() {
  const { status } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-10 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-[90rem] items-center gap-6 px-6 py-3 sm:px-8">
        <Link to="/" className="flex items-center gap-2 text-ui font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-control bg-accent text-accent-foreground">
            <NotebookPen className="size-4" strokeWidth={2} aria-hidden="true" />
          </span>
          Notes
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? (
              <Sun className="size-3.5" strokeWidth={2} aria-hidden="true" />
            ) : (
              <Moon className="size-3.5" strokeWidth={2} aria-hidden="true" />
            )}
          </Button>
          {status === "anonymous" && (
            <>
              <NavLink to="/login" className={navClass}>
                Log in
              </NavLink>
              <Button asChild size="sm">
                <Link to="/register">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
