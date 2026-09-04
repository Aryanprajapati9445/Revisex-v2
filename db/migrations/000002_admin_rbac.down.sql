-- Reverses 000002_admin_rbac.up.sql. Dropped child-first so the FK
-- dependencies unwind cleanly; the trigger goes with its table.
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS permissions;
DROP TYPE IF EXISTS audit_outcome;
