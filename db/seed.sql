-- =============================================================================
-- Seed data — enough to exercise every table, constraint and index.
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING throughout).
-- Rows are linked by natural key lookups, so no UUIDs are hardcoded.
-- =============================================================================

BEGIN;

-- Taxonomy -------------------------------------------------------------------
INSERT INTO programs (code, name, duration_semesters) VALUES
    ('BTECH', 'Bachelor of Technology',            8),
    ('MBA',   'Master of Business Administration', 4),
    ('MCA',   'Master of Computer Applications',   4)
ON CONFLICT (code) DO NOTHING;

INSERT INTO branches (program_id, code, name)
SELECT p.id, v.code, v.name
FROM (VALUES
    ('BTECH', 'CSE', 'Computer Science & Engineering'),
    ('BTECH', 'ECE', 'Electronics & Communication Engineering'),
    ('BTECH', 'ME',  'Mechanical Engineering'),
    ('MBA',   'FIN', 'Finance'),
    ('MCA',   'CSE', 'Computer Applications')   -- same code as B.Tech CSE, allowed
) AS v(program_code, code, name)
JOIN programs p ON p.code = v.program_code
ON CONFLICT (program_id, code) DO NOTHING;

INSERT INTO subjects (branch_id, code, name, semester)
SELECT b.id, v.code, v.name, v.semester
FROM (VALUES
    ('BTECH', 'CSE', 'KCS-501', 'Database Management Systems', 5),
    ('BTECH', 'CSE', 'KCS-502', 'Compiler Design',             5),
    ('BTECH', 'CSE', 'KCS-503', 'Design & Analysis of Algorithms', 5),
    ('BTECH', 'CSE', 'KCS-601', 'Software Engineering',        6),
    ('BTECH', 'ECE', 'KEC-501', 'Digital Signal Processing',   5),
    ('MBA',   'FIN', 'MBA-301', 'Corporate Finance',           3),
    ('MCA',   'CSE', 'MCA-401', 'Cloud Computing',             4)
) AS v(program_code, branch_code, code, name, semester)
JOIN programs p ON p.code = v.program_code
JOIN branches b ON b.program_id = p.id AND b.code = v.branch_code
ON CONFLICT (branch_id, code) DO NOTHING;

-- People ---------------------------------------------------------------------
-- password_hash values are placeholder bcrypt-shaped strings, not real hashes.

-- superuser: global, no scope
INSERT INTO users (email, full_name, password_hash, role)
VALUES ('root@college.edu', 'Platform Admin', '$2b$12$seedseedseedseedseedse', 'superuser')
ON CONFLICT (email) DO NOTHING;

-- program_admin: scoped to a program
INSERT INTO users (email, full_name, password_hash, role, program_id)
SELECT 'btech.admin@college.edu', 'B.Tech Program Admin', '$2b$12$seedseedseedseedseedse', 'program_admin', p.id
FROM programs p WHERE p.code = 'BTECH'
ON CONFLICT (email) DO NOTHING;

-- branch_admin: scoped to a branch
INSERT INTO users (email, full_name, password_hash, role, branch_id)
SELECT 'cse.admin@college.edu', 'CSE Branch Admin', '$2b$12$seedseedseedseedseedse', 'branch_admin', b.id
FROM branches b JOIN programs p ON p.id = b.program_id
WHERE p.code = 'BTECH' AND b.code = 'CSE'
ON CONFLICT (email) DO NOTHING;

-- students: one federated (Google), the rest password-based
INSERT INTO users (email, full_name, auth_provider, provider_user_id, role, branch_id, enrollment_year)
SELECT 'aarav@college.edu', 'Aarav Sharma', 'google', 'google-oauth2|100001', 'student', b.id, 2022
FROM branches b JOIN programs p ON p.id = b.program_id
WHERE p.code = 'BTECH' AND b.code = 'CSE'
ON CONFLICT (email) DO NOTHING;

INSERT INTO users (email, full_name, password_hash, role, branch_id, enrollment_year)
SELECT v.email, v.full_name, '$2b$12$seedseedseedseedseedse', 'student', b.id, v.year
FROM (VALUES
    ('diya@college.edu',  'Diya Nair',    'CSE', 2022),
    ('kabir@college.edu', 'Kabir Menon',  'CSE', 2023),
    ('isha@college.edu',  'Isha Kulkarni','ECE', 2022)
) AS v(email, full_name, branch_code, year)
JOIN programs p ON p.code = 'BTECH'
JOIN branches b ON b.program_id = p.id AND b.code = v.branch_code
ON CONFLICT (email) DO NOTHING;

-- Content --------------------------------------------------------------------
-- Approved notes carry a reviewer and timestamp; the rejected one carries a
-- reason; the pending one carries none. The notes_review_consistency CHECK
-- refuses any other combination.
INSERT INTO notes (subject_id, uploader_id, title, description, note_type, exam_year,
                   status, reviewed_by, reviewed_at, rejection_reason, download_count)
SELECT s.id, up.id, v.title, v.description, v.note_type::note_type, v.exam_year,
       v.status::note_status,
       rev.id,
       CASE WHEN v.status = 'pending' THEN NULL ELSE now() - INTERVAL '1 day' END,
       v.rejection_reason,
       v.downloads
FROM (VALUES
    ('KCS-501', 'aarav@college.edu', 'DBMS Unit 1-3 Handwritten Notes',
     'Covers ER modelling, relational algebra and normalization up to BCNF.',
     'lecture_notes', NULL, 'approved', 'cse.admin@college.edu', NULL, 412),
    ('KCS-501', 'diya@college.edu',  'DBMS End-Sem Question Paper 2023',
     'Full paper with marking scheme.',
     'pyq', 2023, 'approved', 'cse.admin@college.edu', NULL, 903),
    ('KCS-501', 'kabir@college.edu', 'DBMS End-Sem Question Paper 2022',
     'Scanned, slightly blurry on page 3.',
     'pyq', 2022, 'approved', 'btech.admin@college.edu', NULL, 217),
    ('KCS-501', 'kabir@college.edu', 'SQL Lab Manual',
     'All 12 lab exercises with sample output.',
     'lab_manual', NULL, 'pending', NULL, NULL, 0),
    ('KCS-502', 'aarav@college.edu', 'Compiler Design Complete Notes',
     'Lexical analysis through code generation.',
     'lecture_notes', NULL, 'approved', 'cse.admin@college.edu', NULL, 155),
    ('KCS-503', 'diya@college.edu',  'DAA Blurry Scan',
     'Unreadable upload.',
     'other', NULL, 'rejected', 'cse.admin@college.edu', 'Pages 2-8 are unreadable. Please rescan at 300 DPI.', 0),
    ('KEC-501', 'isha@college.edu',  'DSP Formula Sheet',
     'One-page revision sheet for the end-sem.',
     'lecture_notes', NULL, 'approved', 'btech.admin@college.edu', NULL, 88)
) AS v(subject_code, uploader_email, title, description, note_type, exam_year,
       status, reviewer_email, rejection_reason, downloads)
JOIN subjects s ON s.code = v.subject_code
JOIN users up  ON up.email = v.uploader_email
LEFT JOIN users rev ON rev.email = v.reviewer_email
WHERE NOT EXISTS (SELECT 1 FROM notes n WHERE n.title = v.title);

-- Files: one uploaded pair on the 2023 PYQ, one still mid-upload.
INSERT INTO files (note_id, s3_bucket, s3_key, original_filename, mime_type,
                   size_bytes, checksum_sha256, page_count, sort_order,
                   upload_status, uploaded_at)
SELECT n.id, 'college-notes-prod', v.s3_key, v.filename, v.mime,
       v.size_bytes, v.checksum, v.pages, v.sort_order,
       v.upload_status::file_upload_status,
       CASE WHEN v.upload_status = 'uploaded' THEN now() - INTERVAL '2 days' ELSE NULL END
FROM (VALUES
    ('DBMS Unit 1-3 Handwritten Notes', 'notes/2024/dbms-u1-3.pdf', 'dbms-unit1-3.pdf',
     'application/pdf', 4194304, repeat('a', 64), 42, 0, 'uploaded'),
    ('DBMS End-Sem Question Paper 2023', 'notes/2024/dbms-pyq-2023-q.pdf', 'question-paper.pdf',
     'application/pdf', 512000, repeat('b', 64), 4, 0, 'uploaded'),
    ('DBMS End-Sem Question Paper 2023', 'notes/2024/dbms-pyq-2023-s.pdf', 'solutions.pdf',
     'application/pdf', 786432, repeat('c', 64), 9, 1, 'uploaded'),
    ('SQL Lab Manual', 'notes/2024/sql-lab-manual.pdf', 'lab-manual.pdf',
     'application/pdf', NULL, NULL, NULL, 0, 'pending')
) AS v(note_title, s3_key, filename, mime, size_bytes, checksum, pages, sort_order, upload_status)
JOIN notes n ON n.title = v.note_title
ON CONFLICT (s3_key) DO NOTHING;

-- Engagement -----------------------------------------------------------------
INSERT INTO tags (name) VALUES
    ('handwritten'), ('unit-1'), ('solved'), ('end-sem'), ('quick-revision')
ON CONFLICT (name) DO NOTHING;

INSERT INTO note_tags (note_id, tag_id)
SELECT n.id, t.id
FROM (VALUES
    ('DBMS Unit 1-3 Handwritten Notes',  'handwritten'),
    ('DBMS Unit 1-3 Handwritten Notes',  'unit-1'),
    ('DBMS End-Sem Question Paper 2023', 'solved'),
    ('DBMS End-Sem Question Paper 2023', 'end-sem'),
    ('DBMS End-Sem Question Paper 2022', 'end-sem'),
    ('DSP Formula Sheet',                'quick-revision')
) AS v(note_title, tag_name)
JOIN notes n ON n.title = v.note_title
JOIN tags  t ON t.name  = v.tag_name
ON CONFLICT DO NOTHING;

INSERT INTO bookmarks (user_id, note_id)
SELECT u.id, n.id
FROM (VALUES
    ('diya@college.edu',  'DBMS Unit 1-3 Handwritten Notes'),
    ('kabir@college.edu', 'DBMS Unit 1-3 Handwritten Notes'),
    ('kabir@college.edu', 'DBMS End-Sem Question Paper 2023'),
    ('aarav@college.edu', 'DBMS End-Sem Question Paper 2023')
) AS v(email, note_title)
JOIN users u ON u.email = v.email
JOIN notes n ON n.title = v.note_title
ON CONFLICT DO NOTHING;

INSERT INTO ratings (user_id, note_id, rating)
SELECT u.id, n.id, v.rating
FROM (VALUES
    ('diya@college.edu',  'DBMS Unit 1-3 Handwritten Notes',  5),
    ('kabir@college.edu', 'DBMS Unit 1-3 Handwritten Notes',  4),
    ('isha@college.edu',  'DBMS Unit 1-3 Handwritten Notes',  4),
    ('aarav@college.edu', 'DBMS End-Sem Question Paper 2023', 5),
    ('kabir@college.edu', 'DBMS End-Sem Question Paper 2023', 5),
    ('aarav@college.edu', 'DBMS End-Sem Question Paper 2022', 3),
    ('diya@college.edu',  'Compiler Design Complete Notes',   4)
) AS v(email, note_title, rating)
JOIN users u ON u.email = v.email
JOIN notes n ON n.title = v.note_title
ON CONFLICT DO NOTHING;

INSERT INTO comments (note_id, user_id, body)
SELECT n.id, u.id, v.body
FROM (VALUES
    ('DBMS Unit 1-3 Handwritten Notes',  'diya@college.edu',  'Normalization section is much clearer than the textbook. Thanks!'),
    ('DBMS Unit 1-3 Handwritten Notes',  'kabir@college.edu', 'Page 18 seems to be missing the BCNF example.'),
    ('DBMS End-Sem Question Paper 2023', 'isha@college.edu',  'Q4 repeated almost verbatim from 2021.')
) AS v(note_title, email, body)
JOIN notes n ON n.title = v.note_title
JOIN users u ON u.email = v.email
WHERE NOT EXISTS (SELECT 1 FROM comments c WHERE c.body = v.body);

-- Admin RBAC ------------------------------------------------------------
-- A separate axis from users.role above: which admin-dashboard role(s) a
-- user holds. The catalog here must stay in sync with
-- backend/src/lib/permissions.ts's PERMISSION_CATALOG by hand — there is no
-- single source of truth linking the two, since one is a DB table (edited
-- at runtime by a Super Admin) and the other is the fixed set the app knows
-- how to enforce.
INSERT INTO permissions (id, description) VALUES
    ('users.read',      'View admin-managed user accounts'),
    ('users.create',    'Create admin-managed user accounts'),
    ('users.update',    'Edit admin-managed user accounts'),
    ('users.delete',    'Delete admin-managed user accounts'),
    ('roles.manage',    'Create, edit and assign admin roles'),
    ('audit.read',      'View the audit log'),
    ('settings.update', 'Change platform settings')
ON CONFLICT (id) DO NOTHING;

INSERT INTO roles (name, description, is_system) VALUES
    ('Super Admin', 'Full access, including managing roles and permissions.', TRUE),
    ('Admin',       'Manages user accounts and views the audit log.',         TRUE),
    ('Manager',     'Views and edits user accounts.',                        TRUE),
    ('Viewer',      'Read-only access to user accounts.',                    TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, v.permission_id
FROM (VALUES
    ('Super Admin', 'users.read'),
    ('Super Admin', 'users.create'),
    ('Super Admin', 'users.update'),
    ('Super Admin', 'users.delete'),
    ('Super Admin', 'roles.manage'),
    ('Super Admin', 'audit.read'),
    ('Super Admin', 'settings.update'),
    ('Admin',       'users.read'),
    ('Admin',       'users.create'),
    ('Admin',       'users.update'),
    ('Admin',       'users.delete'),
    ('Admin',       'audit.read'),
    ('Manager',     'users.read'),
    ('Manager',     'users.update'),
    ('Viewer',      'users.read')
) AS v(role_name, permission_id)
JOIN roles r ON r.name = v.role_name
ON CONFLICT DO NOTHING;

-- The platform admin seeded above (people section) is also the first
-- Super Admin of the new admin dashboard.
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.email = 'root@college.edu' AND r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

COMMIT;
