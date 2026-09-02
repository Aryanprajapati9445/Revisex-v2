-- =============================================================================
-- Constraint tests — proves the schema rejects what it claims to reject.
-- Runs inside a transaction that is rolled back, so it leaves no trace.
-- Any failure aborts the script with a FAIL message.
-- =============================================================================

BEGIN;

CREATE FUNCTION expect_error(sql_text TEXT, label TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE sql_text;
    RAISE EXCEPTION 'FAIL: % -- statement was ACCEPTED but should have been rejected', label;
EXCEPTION
    WHEN raise_exception THEN RAISE;              -- our own FAIL, propagate it
    WHEN OTHERS THEN RETURN 'PASS  ' || label;    -- rejected as intended
END;
$$;

CREATE FUNCTION expect_ok(sql_text TEXT, label TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE sql_text;
    RETURN 'PASS  ' || label;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'FAIL: % -- statement was REJECTED (%)', label, SQLERRM;
END;
$$;

-- --- role / scope -------------------------------------------------------------
SELECT expect_error($$
    INSERT INTO users (email, full_name, password_hash, role, branch_id)
    VALUES ('s1@college.edu', 'X', 'h', 'superuser',
            (SELECT id FROM branches LIMIT 1))
$$, 'superuser may not carry a branch scope');

SELECT expect_error($$
    INSERT INTO users (email, full_name, password_hash, role)
    VALUES ('s2@college.edu', 'X', 'h', 'program_admin')
$$, 'program_admin must carry a program scope');

SELECT expect_error($$
    INSERT INTO users (email, full_name, password_hash, role, program_id, branch_id)
    VALUES ('s3@college.edu', 'X', 'h', 'branch_admin',
            (SELECT id FROM programs LIMIT 1), (SELECT id FROM branches LIMIT 1))
$$, 'branch_admin may not carry both scopes');

SELECT expect_error($$
    INSERT INTO users (email, full_name, password_hash, role)
    VALUES ('s4@college.edu', 'X', 'h', 'student')
$$, 'student must belong to a branch');

-- --- auth ---------------------------------------------------------------------
SELECT expect_error($$
    INSERT INTO users (email, full_name, role, branch_id)
    VALUES ('s5@college.edu', 'X', 'student', (SELECT id FROM branches LIMIT 1))
$$, 'account with no password and no provider is rejected');

SELECT expect_error($$
    INSERT INTO users (email, full_name, auth_provider, role, branch_id)
    VALUES ('s6@college.edu', 'X', 'google', 'student', (SELECT id FROM branches LIMIT 1))
$$, 'half a federated identity is rejected');

SELECT expect_error($$
    INSERT INTO users (email, full_name, auth_provider, provider_user_id, role, branch_id)
    VALUES ('s7@college.edu', 'X', 'google', 'google-oauth2|100001', 'student',
            (SELECT id FROM branches LIMIT 1))
$$, 'a provider identity cannot be claimed by two accounts');

SELECT expect_error($$
    INSERT INTO users (email, full_name, password_hash, role, branch_id)
    VALUES ('AARAV@college.edu', 'Dup', 'h', 'student', (SELECT id FROM branches LIMIT 1))
$$, 'email uniqueness is case-insensitive (citext)');

SELECT expect_error($$
    INSERT INTO users (email, full_name, password_hash, role, branch_id)
    VALUES ('not-an-email', 'X', 'h', 'student', (SELECT id FROM branches LIMIT 1))
$$, 'malformed email is rejected');

-- --- dynamic taxonomy ---------------------------------------------------------
SELECT expect_ok($$
    INSERT INTO subjects (branch_id, code, name, semester)
    SELECT b.id, 'MBA-401', 'Sem 4 Elective', 4
    FROM branches b JOIN programs p ON p.id = b.program_id
    WHERE p.code = 'MBA' AND b.code = 'FIN'
$$, 'semester 4 is valid in a 4-semester program');

SELECT expect_error($$
    INSERT INTO subjects (branch_id, code, name, semester)
    SELECT b.id, 'MBA-501', 'Sem 5 Elective', 5
    FROM branches b JOIN programs p ON p.id = b.program_id
    WHERE p.code = 'MBA' AND b.code = 'FIN'
$$, 'semester 5 exceeds a 4-semester program (per-program, not hardcoded 1-8)');

SELECT expect_ok($$
    INSERT INTO subjects (branch_id, code, name, semester)
    SELECT b.id, 'KCS-801', 'Sem 8 Project', 8
    FROM branches b JOIN programs p ON p.id = b.program_id
    WHERE p.code = 'BTECH' AND b.code = 'CSE'
$$, 'semester 8 is valid in an 8-semester program');

SELECT expect_ok($$
    INSERT INTO branches (program_id, code, name)
    SELECT id, 'ECE', 'Electronics (MBA-side duplicate code)' FROM programs WHERE code = 'MBA'
$$, 'the same branch code may exist under a different program');

SELECT expect_error($$
    INSERT INTO branches (program_id, code, name)
    SELECT id, 'CSE', 'Duplicate' FROM programs WHERE code = 'BTECH'
$$, 'branch code is unique within its program');

SELECT expect_error($$
    DELETE FROM programs WHERE code = 'BTECH'
$$, 'RESTRICT blocks deleting a program that still has branches');

-- --- moderation audit ---------------------------------------------------------
SELECT expect_error($$
    UPDATE notes SET status = 'approved'
    WHERE title = 'SQL Lab Manual'
$$, 'approving without recording reviewed_at is rejected');

SELECT expect_error($$
    UPDATE notes SET status = 'rejected', reviewed_at = now()
    WHERE title = 'SQL Lab Manual'
$$, 'rejecting without a reason is rejected');

SELECT expect_ok($$
    UPDATE notes SET status = 'rejected', reviewed_at = now(),
                     reviewed_by = (SELECT id FROM users WHERE email = 'cse.admin@college.edu'),
                     rejection_reason = 'Duplicate of an existing manual.'
    WHERE title = 'SQL Lab Manual'
$$, 'a rejection with a reason is accepted');

-- --- engagement ---------------------------------------------------------------
SELECT expect_error($$
    INSERT INTO ratings (user_id, note_id, rating)
    SELECT u.id, n.id, 6 FROM users u, notes n
    WHERE u.email = 'diya@college.edu' AND n.title = 'Compiler Design Complete Notes'
$$, 'rating outside 1-5 is rejected');

SELECT expect_error($$
    INSERT INTO ratings (user_id, note_id, rating)
    SELECT u.id, n.id, 2 FROM users u, notes n
    WHERE u.email = 'diya@college.edu' AND n.title = 'Compiler Design Complete Notes'
$$, 'a second rating by the same user on the same note is rejected');

SELECT expect_error($$
    INSERT INTO bookmarks (user_id, note_id)
    SELECT u.id, n.id FROM users u, notes n
    WHERE u.email = 'diya@college.edu' AND n.title = 'DBMS Unit 1-3 Handwritten Notes'
$$, 'double-bookmarking the same note is rejected');

SELECT expect_error($$
    INSERT INTO tags (name) VALUES ('End-Sem')
$$, 'tags must be lowercase');

-- --- files --------------------------------------------------------------------
SELECT expect_error($$
    UPDATE files SET upload_status = 'uploaded' WHERE s3_key = 'notes/2024/sql-lab-manual.pdf'
$$, 'marking a file uploaded without size/timestamp is rejected');

SELECT expect_error($$
    INSERT INTO files (note_id, s3_bucket, s3_key, original_filename, mime_type, sort_order)
    SELECT id, 'b', 'notes/2024/dbms-pyq-2023-q.pdf', 'f.pdf', 'application/pdf', 9
    FROM notes LIMIT 1
$$, 'an S3 key cannot be reused by two rows');

SELECT expect_error($$
    INSERT INTO files (note_id, s3_bucket, s3_key, original_filename, mime_type, sort_order)
    SELECT id, 'b', 'notes/2024/other.pdf', 'f.pdf', 'application/pdf', 0
    FROM notes WHERE title = 'DBMS End-Sem Question Paper 2023'
$$, 'two files of one note cannot share a sort_order');

-- --- cascade / set-null behaviour ---------------------------------------------
-- Deleting a user keeps their notes (uploader set null) and drops their
-- bookmarks and ratings.
CREATE TEMP TABLE _before AS
SELECT (SELECT count(*) FROM notes)     AS notes,
       (SELECT count(*) FROM bookmarks) AS bookmarks,
       (SELECT count(*) FROM ratings)   AS ratings;

DELETE FROM users WHERE email = 'diya@college.edu';

DO $$
DECLARE b RECORD; n INT; bm INT; r INT; orphaned INT;
BEGIN
    SELECT * INTO b FROM _before;
    SELECT count(*) INTO n  FROM notes;
    SELECT count(*) INTO bm FROM bookmarks;
    SELECT count(*) INTO r  FROM ratings;
    SELECT count(*) INTO orphaned FROM notes WHERE uploader_id IS NULL;

    IF n <> b.notes THEN
        RAISE EXCEPTION 'FAIL: deleting a user destroyed % notes', b.notes - n;
    END IF;
    IF orphaned = 0 THEN
        RAISE EXCEPTION 'FAIL: deleted user''s notes did not get uploader_id = NULL';
    END IF;
    IF bm >= b.bookmarks OR r >= b.ratings THEN
        RAISE EXCEPTION 'FAIL: deleted user''s bookmarks/ratings were not removed';
    END IF;
    RAISE NOTICE 'PASS  deleting a user keeps their notes, drops their bookmarks and ratings';
END;
$$;

-- Deleting a note cascades to everything hanging off it.
DO $$
DECLARE target UUID; leftovers INT;
BEGIN
    SELECT id INTO target FROM notes WHERE title = 'DBMS End-Sem Question Paper 2023';
    DELETE FROM notes WHERE id = target;
    SELECT (SELECT count(*) FROM files     WHERE note_id = target)
         + (SELECT count(*) FROM note_tags WHERE note_id = target)
         + (SELECT count(*) FROM bookmarks WHERE note_id = target)
         + (SELECT count(*) FROM ratings   WHERE note_id = target)
         + (SELECT count(*) FROM comments  WHERE note_id = target)
      INTO leftovers;
    IF leftovers <> 0 THEN
        RAISE EXCEPTION 'FAIL: deleting a note left % dependent rows behind', leftovers;
    END IF;
    RAISE NOTICE 'PASS  deleting a note cascades to files, tags, bookmarks, ratings, comments';
END;
$$;

-- --- updated_at trigger --------------------------------------------------------
DO $$
DECLARE before_ts TIMESTAMPTZ; after_ts TIMESTAMPTZ;
BEGIN
    SELECT updated_at INTO before_ts FROM notes WHERE title = 'DSP Formula Sheet';
    PERFORM pg_sleep(0.01);
    UPDATE notes SET download_count = download_count + 1 WHERE title = 'DSP Formula Sheet';
    SELECT updated_at INTO after_ts FROM notes WHERE title = 'DSP Formula Sheet';
    IF after_ts <= before_ts THEN
        RAISE EXCEPTION 'FAIL: updated_at was not maintained on UPDATE';
    END IF;
    RAISE NOTICE 'PASS  updated_at is maintained by trigger';
END;
$$;

ROLLBACK;
