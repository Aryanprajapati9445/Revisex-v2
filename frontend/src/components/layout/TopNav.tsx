import { LogOut, Moon, NotebookPen, Settings, Sun, Upload } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMyPermissions } from "@/features/admin/queries";
import { RoleGate } from "@/features/auth/RoleGate";
import { useAuth } from "@/features/auth/useAuth";
import { useTheme } from "@/app/ThemeProvider";
import { cn } from "@/lib/utils";

const ADMIN_ROLES = ["superuser", "program_admin", "branch_admin"] as const;

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "rounded-control px-2.5 py-1.5 text-ui transition-colors duration-150",
    // Active state is a tint, not the accent: blue means "action", not "here".
    isActive ? "bg-surface text-text-primary" : "text-text-muted hover:bg-surface"
  );
}

export function TopNav() {
  const { user, status, logout } = useAuth();
  const { data: permissions } = useMyPermissions();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-10 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-[90rem] items-center gap-6 px-6 py-3 sm:px-8">
        <Link
          to={status === "authenticated" ? "/home" : "/"}
          className="flex items-center gap-2 text-ui font-semibold tracking-tight"
        >
          <span className="flex size-7 items-center justify-center rounded-control bg-accent text-accent-foreground">
            <NotebookPen className="size-4" strokeWidth={2} aria-hidden="true" />
          </span>
          Notes
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink to="/browse" className={navClass}>
            Browse
          </NavLink>
          <NavLink to="/search" className={navClass}>
            Search
          </NavLink>
          {status === "authenticated" && (
            <>
              <NavLink to="/my-uploads" className={navClass}>
                My uploads
              </NavLink>
              <RoleGate allow={[...ADMIN_ROLES]}>
                <NavLink to="/moderate" className={navClass}>
                  Moderate
                </NavLink>
                <NavLink to="/admin/users" className={navClass}>
                  Users
                </NavLink>
              </RoleGate>
              {permissions && permissions.size > 0 && (
                <NavLink to="/admin" className={navClass}>
                  Admin
                </NavLink>
              )}
            </>
          )}
        </nav>

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
          {status === "authenticated" ? (
            <>
              <Button asChild size="sm">
                <Link to="/upload">
                  <Upload className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  Upload
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {user?.full_name ?? "Account"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => navigate("/settings")}>
                    <Settings className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={logout}>
                    <LogOut className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            status === "anonymous" && (
              <>
                <NavLink to="/login" className={navClass}>
                  Log in
                </NavLink>
                <Button asChild size="sm">
                  <Link to="/register">Sign up</Link>
                </Button>
              </>
            )
          )}
        </div>
      </div>
    </header>
  );
}
