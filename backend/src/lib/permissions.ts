// The fixed permission catalog. This is the single place code refers to a
// permission key by name — adding a new permission means adding a row here
// AND a matching seed row in db/seed.sql (the permissions table's CHECK
// constraint doesn't know about this list; keeping them in sync is manual).
export const PERMISSION_CATALOG = [
  { id: "users.read", description: "View admin-managed user accounts" },
  { id: "users.create", description: "Create admin-managed user accounts" },
  { id: "users.update", description: "Edit admin-managed user accounts" },
  { id: "users.delete", description: "Delete admin-managed user accounts" },
  { id: "roles.manage", description: "Create, edit and assign admin roles" },
  { id: "audit.read", description: "View the audit log" },
  { id: "settings.update", description: "Change platform settings" },
] as const;

export type PermissionId = (typeof PERMISSION_CATALOG)[number]["id"];
