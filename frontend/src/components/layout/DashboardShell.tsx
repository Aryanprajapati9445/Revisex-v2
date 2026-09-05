import {
  FileStack,
  Home,
  LayoutGrid,
  LogOut,
  Moon,
  NotebookPen,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Upload,
  Users,
} from "lucide-react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTheme } from "@/app/ThemeProvider";
import { PageTransition } from "@/components/motion/PageTransition";
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
import { useCommandPalette } from "@/hooks/use-command-palette";
import { cn } from "@/lib/utils";

const ADMIN_ROLES = ["superuser", "program_admin", "branch_admin"] as const;

const NAV_ITEMS = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/browse", label: "Browse", icon: LayoutGrid },
  { to: "/search", label: "Search", icon: Search },
  { to: "/my-uploads", label: "My uploads", icon: FileStack },
] as const;

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-3 rounded-control px-3 py-2 text-ui transition-colors duration-150",
    "justify-center sm:justify-start",
    isActive ? "bg-surface text-text-primary" : "text-text-muted hover:bg-surface hover:text-text-primary"
  );
}

// The primary chrome for the signed-in app — a persistent left rail
// (icon-only under sm, labelled from sm up) instead of TopNav's horizontal
// links, mirroring AdminShell's side-rail pattern for the whole dashboard,
// not just the admin sub-section.
export function DashboardShell() {
  const { user, logout } = useAuth();
  const { data: permissions } = useMyPermissions();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { setOpen: setPaletteOpen } = useCommandPalette();

  const initials = (user?.full_name ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="mx-auto flex min-h-screen max-w-[100rem]">
      <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col gap-1 border-r border-border px-2 py-5 sm:w-64 sm:px-4">
        <Link
          to="/home"
          className="mb-6 flex items-center justify-center gap-2 px-1 text-ui font-semibold tracking-tight sm:justify-start"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent text-accent-foreground">
            <NotebookPen className="size-4" strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="hidden sm:inline">Notes</span>
        </Link>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mb-4 flex items-center justify-center gap-2 rounded-control border border-border px-3 py-2 text-ui text-text-muted transition-colors duration-150 hover:bg-surface sm:justify-start"
          aria-label="Search"
        >
          <Search className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="hidden flex-1 text-left sm:inline">Search…</span>
          <span className="hidden font-mono text-caption text-text-tertiary sm:inline">⌘K</span>
        </button>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass} aria-label={item.label}>
              <item.icon className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span className="hidden sm:inline">{item.label}</span>
            </NavLink>
          ))}

          <RoleGate allow={[...ADMIN_ROLES]}>
            <div className="my-2 border-t border-border" />
            <NavLink to="/moderate" className={navClass} aria-label="Moderate">
              <ShieldCheck className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span className="hidden sm:inline">Moderate</span>
            </NavLink>
            <NavLink to="/admin/users" className={navClass} aria-label="Users">
              <Users className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span className="hidden sm:inline">Users</span>
            </NavLink>
          </RoleGate>
          {permissions && permissions.size > 0 && (
            <NavLink to="/admin" className={navClass} aria-label="Admin">
              <LayoutGrid className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
              <span className="hidden sm:inline">Admin</span>
            </NavLink>
          )}
        </nav>

        <Button asChild className="mb-3 justify-center gap-2 px-2 sm:px-4">
          <Link to="/upload" aria-label="Upload a note">
            <Upload className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span className="hidden sm:inline">Upload a note</span>
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-control px-2 py-2 text-left text-ui transition-colors duration-150 hover:bg-surface"
              aria-label="Account menu"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-caption font-semibold text-accent-foreground">
                {initials}
              </span>
              <span className="hidden min-w-0 flex-1 truncate sm:inline">
                {user?.full_name ?? "Account"}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right">
            <DropdownMenuItem onSelect={() => navigate("/settings")}>
              <Settings className="size-3.5" strokeWidth={2} aria-hidden="true" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={toggleTheme}>
              {theme === "dark" ? (
                <Sun className="size-3.5" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Moon className="size-3.5" strokeWidth={2} aria-hidden="true" />
              )}
              {theme === "dark" ? "Light theme" : "Dark theme"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={logout}>
              <LogOut className="size-3.5" strokeWidth={2} aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </aside>

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-5xl px-6 py-8 sm:px-10">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
