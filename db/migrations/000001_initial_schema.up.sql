-- Migration 000001: initial schema
--
-- The schema this project launched with, as a single migration — it was
-- built and verified as one unit before migrations existed, so representing
-- it as anything other than one initial migration would misstate history.
--
-- No explicit BEGIN/COMMIT: golang-migrate's Postgres driver wraps each
-- migration file in a transaction automatically (confirmed empirically —
-- see db/README.md's Migrations section). Adding an explicit BEGIN here
-- would just emit a harmless "already in transaction" warning, so it's
-- omitted rather than kept as redundant noise.

-- -----------------------------------------------------------------------------
-- 0. Extensions
-- -----------------------------------------------------------------------------
-- pgcrypto: gen_random_uuid(). Built in from PG13, but the extension is kept
-- for portability with older installs.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- citext: case-insensitive email. Prevents Aryan@x.edu and aryan@x.edu from
-- becoming two accounts, which a plain UNIQUE(email) would allow.
CREATE EXTENSION IF NOT EXISTS "citext";


-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
-- Native enums for lists that are structural (changing them changes the
-- authorization model or the moderation flow). auth_provider is deliberately
-- VARCHAR + CHECK instead: identity providers get added far more often.
CREATE TYPE user_role          AS ENUM ('superuser', 'program_admin', 'branch_admin', 'student');
CREATE TYPE note_type          AS ENUM ('lecture_notes', 'pyq', 'lab_manual', 'assignment', 'book', 'other');
CREATE TYPE note_status        AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE file_upload_status AS ENUM ('pending', 'uploaded', 'failed');


-- -----------------------------------------------------------------------------
-- 2. Shared trigger functions
-- -----------------------------------------------------------------------------
-- Postgres does not maintain updated_at on its own.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


-- =============================================================================
-- TAXONOMY
-- =============================================================================

-- programs -------------------------------------------------------------------
-- Top academic tier (B.Tech, MBA, MCA). Rows, so they can be added or removed
-- at runtime. "Remove" means is_active = false so historical notes survive.
CREATE TABLE programs (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code               VARCHAR(20)  NOT NULL UNIQUE,
    name               VARCHAR(120) NOT NULL,
    -- Semester count is per-program: B.Tech is 8, MBA and MCA are 4.
    -- Nothing about program length is hardcoded in the schema.
    duration_semesters SMALLINT     NOT NULL,
    is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT programs_code_upper    CHECK (code = upper(code)),
    CONSTRAINT programs_code_nonempty CHECK (length(trim(code)) > 0),
    CONSTRAINT programs_duration_sane CHECK (duration_semesters BETWEEN 1 AND 20)
);

COMMENT ON TABLE  programs IS 'Top academic tier. Soft-removed via is_active.';
COMMENT ON COLUMN programs.duration_semesters IS 'Upper bound for subjects.semester in this program, enforced by trigger.';


-- branches -------------------------------------------------------------------
-- A branch within a program (CSE under B.Tech). Code is unique per program, so
-- two programs may both have a "CSE".
CREATE TABLE branches (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID         NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
    code       VARCHAR(20)  NOT NULL,
    name       VARCHAR(120) NOT NULL,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT branches_program_code_key UNIQUE (program_id, code),
    CONSTRAINT branches_code_upper       CHECK (code = upper(code)),
    CONSTRAINT branches_code_nonempty    CHECK (length(trim(code)) > 0)
);


-- subjects -------------------------------------------------------------------
-- A subject offered by a branch in a given semester. Program is derived through
-- the branch, never stored twice.
CREATE TABLE subjects (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id  UUID         NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    code       VARCHAR(20)  NOT NULL,
    name       VARCHAR(150) NOT NULL,
    semester   SMALLINT     NOT NULL,
    is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- Scoped per branch to mirror branches.code. A globally unique subject code
    -- would stop two branches from ever offering the same-coded subject.
    CONSTRAINT subjects_branch_code_key UNIQUE (branch_id, code),
    CONSTRAINT subjects_code_upper      CHECK (code = upper(code)),
    -- Only the lower bound is a column CHECK; the upper bound is per-program
    -- and enforced by subjects_check_semester() below.
    CONSTRAINT subjects_semester_min    CHECK (semester >= 1)
);

-- A CHECK cannot read another table, so the per-program semester ceiling is a
-- trigger. This is what keeps "MBA has 4 semesters" true in the database rather
-- than only in application code.
CREATE OR REPLACE FUNCTION subjects_check_semester()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    max_semester SMALLINT;
BEGIN
    SELECT p.duration_semesters
      INTO max_semester
      FROM branches b
      JOIN programs p ON p.id = b.program_id
     WHERE b.id = NEW.branch_id;

    IF NEW.semester > max_semester THEN
        RAISE EXCEPTION
            'semester % exceeds the % semesters defined for this subject''s program',
            NEW.semester, max_semester
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER subjects_check_semester_trg
    BEFORE INSERT OR UPDATE OF semester, branch_id ON subjects
    FOR EACH ROW EXECUTE FUNCTION subjects_check_semester();


-- =============================================================================
-- PEOPLE
-- =============================================================================

-- users ----------------------------------------------------------------------
-- Hybrid auth: a row is valid with a password hash, with a federated identity,
-- or with both (a student who signed up with a password and later linked
-- Google). At least one path must be present.
--
-- Roles are scoped: a role label alone is not enough, because a program admin
-- has to know which program they run.
CREATE TABLE users (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email            CITEXT       NOT NULL UNIQUE,
    full_name        VARCHAR(150) NOT NULL,

    password_hash    TEXT,
    auth_provider    VARCHAR(30),
    provider_user_id TEXT,

    role             user_role    NOT NULL DEFAULT 'student',
    program_id       UUID         REFERENCES programs(id) ON DELETE RESTRICT,
    branch_id        UUID         REFERENCES branches(id) ON DELETE RESTRICT,

    enrollment_year  SMALLINT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT users_email_format CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
    CONSTRAINT users_name_nonempty CHECK (length(trim(full_name)) > 0),

    -- Every account must be able to authenticate somehow.
    CONSTRAINT users_has_auth_method CHECK (
        password_hash IS NOT NULL
        OR (auth_provider IS NOT NULL AND provider_user_id IS NOT NULL)
    ),
    -- A federated identity is both halves or neither.
    CONSTRAINT users_provider_pair CHECK ((auth_provider IS NULL) = (provider_user_id IS NULL)),
    CONSTRAINT users_provider_known CHECK (
        auth_provider IS NULL OR auth_provider IN ('google', 'microsoft')
    ),

    -- The scope model from the access-control design, enforced at the DB level:
    --   superuser     -> global, no scope
    --   program_admin -> one program
    --   branch_admin  -> one branch (program derived through it)
    --   student       -> one branch (program derived through it)
    CONSTRAINT users_role_scope CHECK (
        (role = 'superuser'     AND program_id IS NULL     AND branch_id IS NULL)
     OR (role = 'program_admin' AND program_id IS NOT NULL AND branch_id IS NULL)
     OR (role = 'branch_admin'  AND program_id IS NULL     AND branch_id IS NOT NULL)
     OR (role = 'student'       AND program_id IS NULL     AND branch_id IS NOT NULL)
    )
);

-- One account per federated identity. Partial, so the many password-only rows
-- with NULL provider columns do not collide.
CREATE UNIQUE INDEX users_provider_identity_key
    ON users (auth_provider, provider_user_id)
    WHERE auth_provider IS NOT NULL;

COMMENT ON COLUMN users.program_id IS 'Set only for program_admin. NULL for everyone else.';
COMMENT ON COLUMN users.branch_id  IS 'Set for branch_admin and student. Program is derived through the branch.';


-- =============================================================================
-- CONTENT
-- =============================================================================

-- notes ----------------------------------------------------------------------
CREATE TABLE notes (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id       UUID         NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
    -- Nullable so community content survives an uploader's account being deleted.
    uploader_id      UUID         REFERENCES users(id) ON DELETE SET NULL,

    title            VARCHAR(200) NOT NULL,
    description      TEXT,
    note_type        note_type    NOT NULL DEFAULT 'other',
    -- Which exam sitting a PYQ is from; meaningless for other types.
    exam_year        SMALLINT,

    status           note_status  NOT NULL DEFAULT 'pending',
    -- Moderation audit: three different role scopes can approve, so record who.
    reviewed_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at      TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Denormalized counter; incrementing beats counting a log per page view.
    download_count   INTEGER      NOT NULL DEFAULT 0,

    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- Full-text search. The two-argument to_tsvector is required: the
    -- one-argument form reads default_text_search_config and is therefore not
    -- IMMUTABLE, which a GENERATED ... STORED column rejects outright.
    -- A generated column can only see its own row, so tag and subject names are
    -- NOT searchable here — those are joins, not full-text matches.
    search_vector    TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED,

    CONSTRAINT notes_title_nonempty   CHECK (length(trim(title)) > 0),
    CONSTRAINT notes_downloads_sane   CHECK (download_count >= 0),
    CONSTRAINT notes_exam_year_sane   CHECK (exam_year IS NULL OR exam_year BETWEEN 1950 AND 2200),
    -- A moderated note carries its audit trail; a pending one carries none.
    -- A rejection must say why, so the uploader can act on it.
    CONSTRAINT notes_review_consistency CHECK (
        (status = 'pending'  AND reviewed_by IS NULL AND reviewed_at IS NULL AND rejection_reason IS NULL)
     OR (status = 'approved' AND reviewed_at IS NOT NULL AND rejection_reason IS NULL)
     OR (status = 'rejected' AND reviewed_at IS NOT NULL AND length(trim(coalesce(rejection_reason, ''))) > 0)
    )
);

COMMENT ON COLUMN notes.reviewed_by IS 'Moderator who approved/rejected. NULL if that account was later deleted.';


-- files ----------------------------------------------------------------------
-- One row per S3 object. A note can bundle several files (scanned pages,
-- a question paper plus its solution), ordered by sort_order.
--
-- upload_status exists because of the presigned-URL flow: the row is created
-- before the client has finished PUTting to S3. Without it the database cannot
-- tell an abandoned upload from a real file, and orphan rows are unreapable.
CREATE TABLE files (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id           UUID         NOT NULL REFERENCES notes(id) ON DELETE CASCADE,

    s3_bucket         VARCHAR(63)  NOT NULL,
    s3_key            TEXT         NOT NULL UNIQUE,

    original_filename VARCHAR(255) NOT NULL,
    mime_type         VARCHAR(120) NOT NULL,
    size_bytes        BIGINT,
    -- Lets the app detect a re-upload of an identical file across notes.
    checksum_sha256   CHAR(64),
    page_count        INTEGER,
    sort_order        SMALLINT     NOT NULL DEFAULT 0,

    upload_status     file_upload_status NOT NULL DEFAULT 'pending',
    uploaded_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT files_size_sane      CHECK (size_bytes IS NULL OR size_bytes > 0),
    CONSTRAINT files_pages_sane     CHECK (page_count IS NULL OR page_count > 0),
    CONSTRAINT files_sort_sane      CHECK (sort_order >= 0),
    CONSTRAINT files_checksum_hex   CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'),
    -- A file only counts as uploaded once S3 has confirmed size and time.
    CONSTRAINT files_upload_complete CHECK (
        upload_status <> 'uploaded'
        OR (size_bytes IS NOT NULL AND uploaded_at IS NOT NULL)
    )
);

-- Deferrable so a reorder can shuffle sort_order inside one transaction without
-- tripping the constraint halfway through.
ALTER TABLE files
    ADD CONSTRAINT files_note_order_key UNIQUE (note_id, sort_order)
    DEFERRABLE INITIALLY IMMEDIATE;


-- =============================================================================
-- ENGAGEMENT
-- =============================================================================

-- tags -----------------------------------------------------------------------
CREATE TABLE tags (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT tags_name_lower    CHECK (name = lower(name)),
    CONSTRAINT tags_name_trimmed  CHECK (name = trim(name) AND length(name) > 0)
);


-- note_tags ------------------------------------------------------------------
CREATE TABLE note_tags (
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);


-- bookmarks ------------------------------------------------------------------
CREATE TABLE bookmarks (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id    UUID        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, note_id)
);


-- ratings --------------------------------------------------------------------
-- One rating per user per note, enforced by the composite primary key.
CREATE TABLE ratings (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id    UUID        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    rating     SMALLINT    NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, note_id),

    CONSTRAINT ratings_range CHECK (rating BETWEEN 1 AND 5)
);


-- comments -------------------------------------------------------------------
CREATE TABLE comments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id    UUID        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    -- Nullable so a thread stays readable after its author leaves.
    user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
    body       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT comments_body_nonempty CHECK (length(trim(body)) > 0)
);

-- =============================================================================
-- updated_at TRIGGERS
-- =============================================================================
CREATE TRIGGER programs_set_updated_at BEFORE UPDATE ON programs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER branches_set_updated_at BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER subjects_set_updated_at BEFORE UPDATE ON subjects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER notes_set_updated_at BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER ratings_set_updated_at BEFORE UPDATE ON ratings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER comments_set_updated_at BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- INDEXES
--
-- Postgres indexes primary keys and UNIQUE constraints automatically; it does
-- NOT index foreign keys. Everything below covers a query the application
-- actually runs.
-- =============================================================================

-- Taxonomy browsing ----------------------------------------------------------
-- "list the live branches of this program"
CREATE INDEX idx_branches_program_active ON branches (program_id) WHERE is_active;
-- "subjects for CSE, semester 5" — the entry point of the core browse flow
CREATE INDEX idx_subjects_branch_semester ON subjects (branch_id, semester) WHERE is_active;

-- Note browsing --------------------------------------------------------------
-- The core workload: approved notes for a subject, newest first.
CREATE INDEX idx_notes_subject_status_created ON notes (subject_id, status, created_at DESC);
-- Same, narrowed to a type ("approved PYQs for this subject").
CREATE INDEX idx_notes_subject_type_status ON notes (subject_id, note_type, status);
-- "my uploads"
CREATE INDEX idx_notes_uploader ON notes (uploader_id, created_at DESC) WHERE uploader_id IS NOT NULL;
-- The moderation queue. Partial, because pending is a small slice of the table
-- and the index stays tiny no matter how much approved content accumulates.
CREATE INDEX idx_notes_pending_queue ON notes (created_at) WHERE status = 'pending';
-- "most downloaded approved notes"
CREATE INDEX idx_notes_popular ON notes (download_count DESC) WHERE status = 'approved';
-- Full-text search.
CREATE INDEX idx_notes_search ON notes USING GIN (search_vector);

-- Files ----------------------------------------------------------------------
-- Sweeping abandoned presigned uploads.
CREATE INDEX idx_files_stale_uploads ON files (created_at) WHERE upload_status = 'pending';
-- Cross-note duplicate detection.
CREATE INDEX idx_files_checksum ON files (checksum_sha256) WHERE checksum_sha256 IS NOT NULL;

-- Engagement -----------------------------------------------------------------
-- These are the indexes the composite primary keys canNOT provide. A
-- PRIMARY KEY (user_id, note_id) serves "this user's bookmarks" but is useless
-- for "this note's ratings" — which is what the read-time AVG/COUNT does on
-- every single note page.
CREATE INDEX idx_ratings_note ON ratings (note_id);
CREATE INDEX idx_bookmarks_note ON bookmarks (note_id);
CREATE INDEX idx_note_tags_tag ON note_tags (tag_id);
-- "my bookmarks, most recently saved first"
CREATE INDEX idx_bookmarks_user_recent ON bookmarks (user_id, created_at DESC);
-- Comment thread for a note, oldest first.
CREATE INDEX idx_comments_note ON comments (note_id, created_at);
CREATE INDEX idx_comments_user ON comments (user_id) WHERE user_id IS NOT NULL;

-- Users ----------------------------------------------------------------------
-- Admin rosters: "students in this branch", "admins of this program".
CREATE INDEX idx_users_branch ON users (branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX idx_users_program ON users (program_id) WHERE program_id IS NOT NULL;
CREATE INDEX idx_users_role ON users (role);
-- Keeps ON DELETE SET NULL on notes.reviewed_by from scanning notes.
CREATE INDEX idx_notes_reviewer ON notes (reviewed_by) WHERE reviewed_by IS NOT NULL;


-- =============================================================================
-- VIEWS
-- =============================================================================

-- v_note_scope ---------------------------------------------------------------
-- Resolves a note up to its branch and program in one hop. Every authorization
-- check in the API is "does this note's program/branch match the actor's
-- scope?", so it is worth having in exactly one place.
CREATE VIEW v_note_scope AS
SELECT
    n.id         AS note_id,
    n.status,
    n.uploader_id,
    s.id         AS subject_id,
    s.semester,
    b.id         AS branch_id,
    p.id         AS program_id
FROM notes n
JOIN subjects s ON s.id = n.subject_id
JOIN branches b ON b.id = s.branch_id
JOIN programs p ON p.id = b.program_id;

COMMENT ON VIEW v_note_scope IS
    'note -> subject -> branch -> program. Drives scope checks: a program_admin may act on a note only where program_id matches theirs.';

-- v_note_stats ---------------------------------------------------------------
-- Ratings are computed on read, per the design. This is the single definition
-- of "how a note is scored", so the API never hand-rolls the aggregate.
-- If rating volume ever makes this too slow, denormalize rating_avg and
-- rating_count onto notes and keep this view's shape as the contract.
CREATE VIEW v_note_stats AS
SELECT
    n.id AS note_id,
    COALESCE(r.rating_avg, 0)::NUMERIC(3,2) AS rating_avg,
    COALESCE(r.rating_count, 0)             AS rating_count,
    COALESCE(bm.bookmark_count, 0)          AS bookmark_count,
    COALESCE(c.comment_count, 0)            AS comment_count,
    n.download_count
FROM notes n
LEFT JOIN (
    SELECT note_id, AVG(rating) AS rating_avg, COUNT(*) AS rating_count
    FROM ratings GROUP BY note_id
) r ON r.note_id = n.id
LEFT JOIN (
    SELECT note_id, COUNT(*) AS bookmark_count FROM bookmarks GROUP BY note_id
) bm ON bm.note_id = n.id
LEFT JOIN (
    SELECT note_id, COUNT(*) AS comment_count FROM comments GROUP BY note_id
) c ON c.note_id = n.id;

