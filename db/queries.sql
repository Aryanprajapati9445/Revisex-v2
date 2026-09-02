-- =============================================================================
-- Representative queries — the shapes the API will actually issue.
-- Every one of these is backed by an index in schema.sql.
-- =============================================================================

-- Wrapped in a transaction that rolls back: queries 6, 7, 9 and 10 mutate data,
-- and #6 depends on #5's note still being pending. Without this, running the
-- file twice would give different output the second time.
BEGIN;

-- 1. THE CORE WORKLOAD ---------------------------------------------------------
-- "Approved PYQs for B.Tech CSE semester 5, sorted by average rating."
-- Uses idx_subjects_branch_semester then idx_notes_subject_type_status,
-- with idx_ratings_note serving the aggregate.
SELECT n.title,
       s.code    AS subject,
       n.exam_year,
       st.rating_avg,
       st.rating_count,
       n.download_count
FROM notes n
JOIN subjects s   ON s.id = n.subject_id
JOIN branches b   ON b.id = s.branch_id
JOIN programs p   ON p.id = b.program_id
JOIN v_note_stats st ON st.note_id = n.id
WHERE p.code = 'BTECH'
  AND b.code = 'CSE'
  AND s.semester = 5
  AND n.note_type = 'pyq'
  AND n.status = 'approved'
ORDER BY st.rating_avg DESC, st.rating_count DESC;


-- 2. FULL-TEXT SEARCH ----------------------------------------------------------
-- Title is weighted A, description B, so a title hit outranks a body hit.
-- Uses idx_notes_search (GIN).
SELECT n.title,
       ts_rank(n.search_vector, websearch_to_tsquery('english', 'normalization')) AS rank
FROM notes n
WHERE n.status = 'approved'
  AND n.search_vector @@ websearch_to_tsquery('english', 'normalization')
ORDER BY rank DESC;


-- 3. SEARCH BY TAG -------------------------------------------------------------
-- Tags are NOT in search_vector (a generated column cannot read another table),
-- so this is a join. Uses idx_note_tags_tag.
SELECT n.title, t.name AS tag
FROM notes n
JOIN note_tags nt ON nt.note_id = n.id
JOIN tags t       ON t.id = nt.tag_id
WHERE t.name = 'end-sem'
  AND n.status = 'approved'
ORDER BY n.download_count DESC;


-- 4. NOTE DETAIL PAGE ----------------------------------------------------------
-- One note with its uploader, taxonomy, aggregates, tags and files.
SELECT n.id,
       n.title,
       n.description,
       n.note_type,
       u.full_name AS uploaded_by,
       p.name AS program, b.name AS branch, s.name AS subject, s.semester,
       st.rating_avg, st.rating_count, st.bookmark_count, st.comment_count,
       (SELECT array_agg(t.name ORDER BY t.name)
          FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
         WHERE nt.note_id = n.id) AS tags,
       (SELECT count(*) FROM files f
         WHERE f.note_id = n.id AND f.upload_status = 'uploaded') AS file_count
FROM notes n
JOIN subjects s      ON s.id = n.subject_id
JOIN branches b      ON b.id = s.branch_id
JOIN programs p      ON p.id = b.program_id
JOIN v_note_stats st ON st.note_id = n.id
LEFT JOIN users u    ON u.id = n.uploader_id
WHERE n.title = 'DBMS Unit 1-3 Handwritten Notes';


-- 5. MODERATION QUEUE, SCOPED -------------------------------------------------
-- What a given moderator is allowed to see. The CASE encodes the whole access
-- rule from the design: superuser everywhere, program_admin inside their
-- program, branch_admin inside their branch.
-- Uses idx_notes_pending_queue.
WITH actor AS (
    SELECT role, program_id, branch_id FROM users WHERE email = 'cse.admin@college.edu'
)
SELECT n.title, sc.branch_id, sc.program_id, n.created_at
FROM notes n
JOIN v_note_scope sc ON sc.note_id = n.id
CROSS JOIN actor a
WHERE n.status = 'pending'
  AND CASE a.role
          WHEN 'superuser'     THEN TRUE
          WHEN 'program_admin' THEN sc.program_id = a.program_id
          WHEN 'branch_admin'  THEN sc.branch_id  = a.branch_id
          ELSE FALSE
      END
ORDER BY n.created_at;


-- 6. APPROVE A NOTE ------------------------------------------------------------
-- The scope check lives in the WHERE clause, so an out-of-scope approval
-- updates zero rows rather than silently succeeding. notes_review_consistency
-- then guarantees the audit columns were filled in.
UPDATE notes n
SET status      = 'approved',
    reviewed_by = a.id,
    reviewed_at = now()
FROM users a, v_note_scope sc
WHERE n.id = sc.note_id
  AND a.email = 'cse.admin@college.edu'
  AND n.title = 'SQL Lab Manual'
  AND n.status = 'pending'
  AND CASE a.role
          WHEN 'superuser'     THEN TRUE
          WHEN 'program_admin' THEN sc.program_id = a.program_id
          WHEN 'branch_admin'  THEN sc.branch_id  = a.branch_id
          ELSE FALSE
      END;


-- 7. RATE A NOTE (upsert) ------------------------------------------------------
-- The composite primary key turns "one rating per user per note" into an
-- ON CONFLICT, so re-rating updates instead of duplicating.
INSERT INTO ratings (user_id, note_id, rating)
SELECT u.id, n.id, 3
FROM users u, notes n
WHERE u.email = 'isha@college.edu'
  AND n.title = 'DBMS End-Sem Question Paper 2023'
ON CONFLICT (user_id, note_id)
DO UPDATE SET rating = EXCLUDED.rating, updated_at = now();


-- 8. MY BOOKMARKS --------------------------------------------------------------
-- Uses idx_bookmarks_user_recent.
SELECT n.title, s.code AS subject, bm.created_at AS saved_at
FROM bookmarks bm
JOIN notes n    ON n.id = bm.note_id
JOIN subjects s ON s.id = n.subject_id
JOIN users u    ON u.id = bm.user_id
WHERE u.email = 'kabir@college.edu'
ORDER BY bm.created_at DESC;


-- 9. RECORD A DOWNLOAD ---------------------------------------------------------
-- Denormalized counter; no per-view log row.
UPDATE notes SET download_count = download_count + 1
WHERE title = 'DSP Formula Sheet' AND status = 'approved';


-- 10. SOFT-REMOVE A BRANCH -----------------------------------------------------
-- Deactivating hides the branch from browse while every note and user attached
-- to it survives untouched. A hard DELETE would be blocked by RESTRICT — that
-- is the safety net, not a bug.
UPDATE branches b SET is_active = FALSE
FROM programs p
WHERE p.id = b.program_id AND p.code = 'BTECH' AND b.code = 'ME';


-- 11. REAP ABANDONED UPLOADS ---------------------------------------------------
-- Rows whose presigned PUT never completed. Uses idx_files_stale_uploads.
SELECT id, s3_key, created_at
FROM files
WHERE upload_status = 'pending'
  AND created_at < now() - INTERVAL '24 hours';


-- 12. PLATFORM STATS -----------------------------------------------------------
SELECT p.code AS program,
       b.code AS branch,
       count(*) FILTER (WHERE n.status = 'approved') AS approved,
       count(*) FILTER (WHERE n.status = 'pending')  AS pending,
       count(*) FILTER (WHERE n.status = 'rejected') AS rejected,
       COALESCE(sum(n.download_count), 0) AS downloads
FROM programs p
JOIN branches b ON b.program_id = p.id
LEFT JOIN subjects s ON s.branch_id = b.id
LEFT JOIN notes n    ON n.subject_id = s.id
GROUP BY p.code, b.code
ORDER BY p.code, b.code;

ROLLBACK;
