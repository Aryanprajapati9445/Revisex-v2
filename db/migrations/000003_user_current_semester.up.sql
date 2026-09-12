-- Which semester a student is actually in.
--
-- The home page opens on the subjects someone is taking now, which needs a
-- semester the platform can read back. enrollment_year cannot supply it:
-- registration never asks for one, so it is NULL on every real signup, and
-- turning a year into a semester would need an academic-calendar assumption
-- the schema has nowhere to record.
--
-- Nullable, therefore, and self-declared — a student sets it, and until they
-- do the home page asks rather than guessing.
--
-- Mirrors, statement for statement, drizzle/migrations/0003_aberrant_crusher_hogan.sql.

ALTER TABLE users ADD COLUMN current_semester SMALLINT;

-- Lower bound only, mirroring subjects_semester_min. The real ceiling is the
-- student's own program duration, which a CHECK cannot read across tables; the
-- API validates that the same way subjects_check_semester() does for subjects.
ALTER TABLE users
    ADD CONSTRAINT users_current_semester_min
    CHECK (current_semester IS NULL OR current_semester >= 1);

COMMENT ON COLUMN users.current_semester IS
    'Student-declared current semester. NULL until they set it. Ceiling is their program duration, enforced by the API.';
