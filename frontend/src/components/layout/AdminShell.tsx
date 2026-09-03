import { NavLink, Outlet } from "react-router-dom";
import { useMyPermissions } from "@/features/admin/queries";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { to: "/admin/accounts", label: "Users", permission: "users.read" },
  { to: "/admin/roles", label: "Roles & Permissions", permission: "roles.manage" },
  { to: "/admin/audit-log", label: "Audit Log", permission: "audit.read" },
] as const;

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "rounded-control px-2.5 py-1.5 text-ui transition-colors duration-150",
    isActive ? "bg-surface text-text-primary" : "text-text-muted hover:bg-surface"
  );
}

export function AdminShell() {
  const { data: permissions } = useMyPermissions();
  const visibleSections = SECTIONS.filter((s) => permissions?.has(s.permission));

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
      <nav className="flex shrink-0 flex-row gap-1 sm:w-48 sm:flex-col">
        {visibleSections.map((section) => (
          <NavLink key={section.to} to={section.to} className={navClass}>
            {section.label}
          </NavLink>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
