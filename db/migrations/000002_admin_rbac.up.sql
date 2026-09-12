-- Admin RBAC + audit log.
--
-- These tables already existed in drizzle/schema/ and are already referenced by
-- seed.sql and by backend/src/modules/admin/, but the versioned migration that
-- creates them was never written — so `make local-reset` failed at seed time
-- ("relation \"permissions\" does not exist") and a freshly migrated database
-- could not run the admin surface at all. This mirrors, statement for
-- statement, drizzle/migrations/0002_motionless_mongoose.sql.
--
-- The permission axis here is deliberately separate from users.role: role is
-- content scope (which program/branch you own), these are dashboard
-- capabilities. See backend/src/middleware/permissions.ts.

CREATE TYPE audit_outcome AS ENUM ('success', 'failure');

CREATE TABLE permissions (
    id          TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    -- Ids are "resource.verb" and the catalog in backend/src/lib/permissions.ts
    -- is the list of legal values; this only enforces the shape.
    CONSTRAINT permissions_id_format        CHECK (id ~ '^[a-z]+\.[a-z]+$'),
    CONSTRAINT permissions_description_nonempty CHECK (length(trim(description)) > 0)
);

CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        CITEXT NOT NULL UNIQUE,
    description TEXT,
    -- A system role is seeded, not user-created, and cannot be deleted.
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT roles_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    -- RESTRICT, not CASCADE: dropping a permission that roles still grant
    -- should fail loudly rather than silently widen or narrow access.
    permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE RESTRICT,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE audit_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- SET NULL, not CASCADE: deleting an account must not erase the record of
    -- what that account did.
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,
    resource      TEXT NOT NULL,
    resource_id   TEXT,
    outcome       audit_outcome NOT NULL,
    metadata      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT audit_log_action_nonempty   CHECK (length(trim(action)) > 0),
    CONSTRAINT audit_log_resource_nonempty CHECK (length(trim(resource)) > 0)
);

CREATE INDEX idx_audit_log_created ON audit_log (created_at);
CREATE INDEX idx_audit_log_actor   ON audit_log (actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_audit_log_action  ON audit_log (action);

-- Every other table carrying updated_at gets this trigger in 000001; roles is
-- the only one added later, so it needs its own.
CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
