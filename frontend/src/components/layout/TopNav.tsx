import { Link, NavLink } from "react-router-dom";
import { RoleGate } from "@/features/auth/RoleGate";
import { useAuth } from "@/features/auth/useAuth";
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

  return (
    <header className="sticky top-0 z-10 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <Link to="/" className="text-ui font-semibold tracking-tight">
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
            </>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {status === "authenticated" ? (
            <>
              <Link
                to="/upload"
                className="rounded-full bg-accent px-4 py-2 text-ui font-medium text-white transition-colors duration-150"
              >
                Upload
              </Link>
              <NavLink to="/settings" className={navClass}>
                {user?.full_name ?? "Account"}
              </NavLink>
              <button type="button" onClick={logout} className="rounded-control px-2.5 py-1.5 text-ui text-text-muted hover:bg-surface">
                Sign out
              </button>
            </>
          ) : (
            status === "anonymous" && (
              <>
                <NavLink to="/login" className={navClass}>
                  Log in
                </NavLink>
                <Link
                  to="/register"
                  className="rounded-full bg-accent px-4 py-2 text-ui font-medium text-white transition-colors duration-150"
                >
                  Sign up
                </Link>
              </>
            )
          )}
        </div>
      </div>
    </header>
  );
}
