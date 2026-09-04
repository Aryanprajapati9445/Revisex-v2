import {
  ArrowLeft,
  FolderTree,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  ShieldCheck,
  Sun,
  UploadCloud,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useTheme } from "@/app/ThemeProvider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useCapabilities, type Capabilities } from "@/features/admin/capabilities";
import { useAuth } from "@/features/auth/useAuth";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Answers "may this account see the item at all". */
  visible: (capabilities: Capabilities) => boolean;
  /** Rendered as a count chip on the right — used for the review backlog. */
  badge?: number;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * The console's whole information architecture, in one list. Each item declares
 * which axis governs it (see features/admin/capabilities) rather than each
 * component re-deciding, so an item can never appear in the nav and then refuse
 * to open — the same predicate guards the route.
 */
export function navGroups(capabilities: Capabilities, pendingReviews: number): NavGroup[] {
  // Annotated rather than inferred: without it the `visible` callbacks get no
  // contextual type and their parameter lands as implicit any.
  const groups: NavGroup[] = [
    {
      label: "Overview",
      items: [
        {
          to: "/admin",
          label: "Dashboard",
          icon: LayoutDashboard,
          end: true,
          visible: (c) => c.isManager,
        },
      ],
    },
    {
      label: "Content",
      items: [
        { to: "/admin/taxonomy", label: "Programs & subjects", icon: FolderTree, visible: (c) => c.isManager },
        {
          to: "/admin/moderation",
          label: "Review queue",
          icon: ShieldCheck,
          badge: pendingReviews,
          visible: (c) => c.canModerate,
        },
        { to: "/admin/upload", label: "Bulk upload", icon: UploadCloud, visible: (c) => c.isManager },
      ],
    },
    {
      label: "People",
      items: [
        { to: "/admin/accounts", label: "Accounts", icon: Users, visible: (c) => c.canReadUsers },
        { to: "/admin/roles", label: "Roles & permissions", icon: KeyRound, visible: (c) => c.canManageRoles },
      ],
    },
    {
      label: "System",
      items: [{ to: "/admin/audit-log", label: "Audit log", icon: ScrollText, visible: (c) => c.canReadAudit }],
    },
  ];

  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.visible(capabilities)) }))
    .filter((group) => group.items.length > 0);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  superuser: "Superuser",
  program_admin: "Program admin",
  branch_admin: "Branch admin",
  student: "Student",
};

export function ConsoleSidebar({
  collapsed,
  onToggleCollapsed,
  pendingReviews,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  pendingReviews: number;
  /** Closes the mobile drawer once a link is followed. */
  onNavigate?: () => void;
}) {
  const capabilities = useCapabilities();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const groups = navGroups(capabilities, pendingReviews);

  return (
    <div className="flex h-full flex-col gap-1 bg-surface">
      <div className={cn("flex items-center gap-2 px-3 py-3.5", collapsed && "justify-center px-2")}>
        <Link
          to="/admin"
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2 rounded-control text-ui font-semibold tracking-tight"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-primary text-primary-foreground">
            <NotebookPen className="size-4" strokeWidth={2} aria-hidden="true" />
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate">Console</span>
              <span className="truncate text-caption font-normal text-text-tertiary">{capabilities.scopeLabel}</span>
            </span>
          )}
        </Link>
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto hidden lg:inline-flex"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="size-4" strokeWidth={2} aria-hidden="true" />
          </Button>
        )}
      </div>

      {collapsed && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="mx-auto hidden lg:inline-flex"
          onClick={onToggleCollapsed}
          aria-label="Expand sidebar"
        >
          <PanelLeftOpen className="size-4" strokeWidth={2} aria-hidden="true" />
        </Button>
      )}

      <nav aria-label="Console" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-2">
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            {!collapsed && (
              <span className="px-2.5 pb-1 text-caption font-medium tracking-wide text-text-tertiary uppercase">
                {group.label}
              </span>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-2.5 rounded-control px-2.5 py-2 text-ui transition-colors duration-150",
                    collapsed && "justify-center px-0",
                    // The accent is reserved for actions elsewhere in this
                    // design, but a sidebar needs an unmistakable "you are
                    // here" — so the active row gets the raised surface plus a
                    // 2px accent rail rather than a filled accent background.
                    isActive
                      ? "bg-surface-elevated text-text-primary"
                      : "text-text-muted hover:bg-surface-elevated/60 hover:text-text-primary"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1.5 bottom-1.5 -left-2 w-0.5 rounded-full bg-primary"
                      />
                    )}
                    <item.icon className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && item.badge !== undefined && item.badge > 0 && (
                      <span className="ml-auto rounded-full bg-status-pending-bg px-1.5 py-0.5 text-caption font-medium text-status-pending-fg">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                    {collapsed && item.badge !== undefined && item.badge > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-status-pending-fg"
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-1 p-2">
        <NavLink
          to="/browse"
          onClick={onNavigate}
          title={collapsed ? "Back to the site" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-control px-2.5 py-2 text-ui text-text-muted transition-colors duration-150 hover:bg-surface-elevated/60 hover:text-text-primary",
            collapsed && "justify-center px-0"
          )}
        >
          <ArrowLeft className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          {!collapsed && "Back to the site"}
        </NavLink>

        <div
          className={cn(
            "flex items-center gap-2 rounded-control px-2 py-2",
            collapsed && "flex-col gap-1.5 px-0"
          )}
        >
          <Avatar className="size-7 shrink-0">
            <AvatarFallback>{initials(user?.full_name ?? "?")}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-ui font-medium">{user?.full_name ?? "Account"}</span>
              <span className="truncate text-caption text-text-tertiary">
                {ROLE_LABELS[capabilities.role ?? ""] ?? "—"}
              </span>
            </div>
          )}
          <div className={cn("ml-auto flex items-center gap-0.5", collapsed && "ml-0 flex-col")}>
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
            <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Sign out">
              <LogOut className="size-3.5" strokeWidth={2} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
