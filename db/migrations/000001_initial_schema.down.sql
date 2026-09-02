-- Migration 000001 (down): drop everything the up migration created.
--
-- Order matters and is not arbitrary: views before the tables they select
-- from; tables in reverse foreign-key dependency order (children before
-- parents — DROP TABLE errors if a dependent still references it); trigger
-- functions after every table whose triggers used them (DROP TABLE already
-- removes the triggers themselves — only the standalone function survives);
-- enum types last, since a column using the type must be gone first.
-- Verified by running down-then-up in the same session, not just derived.

DROP VIEW IF EXISTS v_note_stats;
DROP VIEW IF EXISTS v_note_scope;

DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS bookmarks;
DROP TABLE IF EXISTS note_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS programs;

DROP FUNCTION IF EXISTS subjects_check_semester();
DROP FUNCTION IF EXISTS set_updated_at();

DROP TYPE IF EXISTS file_upload_status;
DROP TYPE IF EXISTS note_status;
DROP TYPE IF EXISTS note_type;
DROP TYPE IF EXISTS user_role;

-- pgcrypto/citext intentionally NOT dropped. Extensions are shared,
-- database-wide objects — another schema in the same database could depend
-- on them, and re-creating is a no-op (CREATE EXTENSION IF NOT EXISTS) on
-- the next up, so leaving them is the safe default.
