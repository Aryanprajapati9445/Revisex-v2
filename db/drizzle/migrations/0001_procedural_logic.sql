-- Custom migration: procedural logic and constraint properties that
-- drizzle-kit's schema DSL cannot express and therefore cannot generate.
-- The Drizzle TypeScript schema (db/drizzle/schema/) stays the source of
-- truth for every table/column/index/check/FK; this file is the
-- permanently-hand-maintained complement for triggers, trigger functions,
-- and one DEFERRABLE constraint property. See the comments in
-- db/drizzle/schema/subjects.ts and files.ts pointing here.

-- -----------------------------------------------------------------------------
-- Shared trigger function: Postgres does not maintain updated_at on its own.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

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

-- -----------------------------------------------------------------------------
-- Per-program semester ceiling ("MBA has 4 semesters"). A CHECK cannot read
-- another table, so this cross-table business rule is a trigger — this is
-- what keeps it true in the database rather than only in application code.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- files_note_order_key needs to be DEFERRABLE so a reorder can shuffle
-- sort_order inside one transaction without tripping the constraint halfway
-- through. drizzle-orm's unique-constraint builder has no DEFERRABLE option
-- (checked against drizzle-orm@0.45.2's UniqueConstraintBuilder), so the base
-- migration creates it as a plain UNIQUE constraint and this statement
-- upgrades it. Drizzle's schema diffing has no representation of
-- "deferrable" either, so it will never try to revert this on a future
-- `drizzle-kit generate` — this property lives only here, permanently.
-- -----------------------------------------------------------------------------
ALTER TABLE files
    DROP CONSTRAINT files_note_order_key;
ALTER TABLE files
    ADD CONSTRAINT files_note_order_key UNIQUE (note_id, sort_order)
    DEFERRABLE INITIALLY IMMEDIATE;
