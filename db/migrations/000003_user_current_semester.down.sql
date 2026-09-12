ALTER TABLE users DROP CONSTRAINT IF EXISTS users_current_semester_min;
ALTER TABLE users DROP COLUMN IF EXISTS current_semester;
