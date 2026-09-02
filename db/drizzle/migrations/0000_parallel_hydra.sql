-- Hand-added: drizzle-kit does not manage extensions. gen_random_uuid()
-- (pgcrypto) and citext (case-insensitive email) are both required by the
-- schema below and are on Neon's supported-extension list, so this runs
-- without superuser.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "citext";--> statement-breakpoint
CREATE TYPE "public"."file_upload_status" AS ENUM('pending', 'uploaded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."note_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."note_type" AS ENUM('lecture_notes', 'pyq', 'lab_manual', 'assignment', 'book', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('superuser', 'program_admin', 'branch_admin', 'student');--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(120) NOT NULL,
	"duration_semesters" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_code_unique" UNIQUE("code"),
	CONSTRAINT "programs_code_upper" CHECK ("programs"."code" = upper("programs"."code")),
	CONSTRAINT "programs_code_nonempty" CHECK (length(trim("programs"."code")) > 0),
	CONSTRAINT "programs_duration_sane" CHECK ("programs"."duration_semesters" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_program_code_key" UNIQUE("program_id","code"),
	CONSTRAINT "branches_code_upper" CHECK ("branches"."code" = upper("branches"."code")),
	CONSTRAINT "branches_code_nonempty" CHECK (length(trim("branches"."code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(150) NOT NULL,
	"semester" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_branch_code_key" UNIQUE("branch_id","code"),
	CONSTRAINT "subjects_code_upper" CHECK ("subjects"."code" = upper("subjects"."code")),
	CONSTRAINT "subjects_semester_min" CHECK ("subjects"."semester" >= 1)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"full_name" varchar(150) NOT NULL,
	"password_hash" text,
	"auth_provider" varchar(30),
	"provider_user_id" text,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"program_id" uuid,
	"branch_id" uuid,
	"enrollment_year" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_format" CHECK ("users"."email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
	CONSTRAINT "users_name_nonempty" CHECK (length(trim("users"."full_name")) > 0),
	CONSTRAINT "users_has_auth_method" CHECK ("users"."password_hash" is not null or ("users"."auth_provider" is not null and "users"."provider_user_id" is not null)),
	CONSTRAINT "users_provider_pair" CHECK (("users"."auth_provider" is null) = ("users"."provider_user_id" is null)),
	CONSTRAINT "users_provider_known" CHECK ("users"."auth_provider" is null or "users"."auth_provider" in ('google', 'microsoft')),
	CONSTRAINT "users_role_scope" CHECK (
        ("users"."role" = 'superuser'     and "users"."program_id" is null     and "users"."branch_id" is null)
        or ("users"."role" = 'program_admin' and "users"."program_id" is not null and "users"."branch_id" is null)
        or ("users"."role" = 'branch_admin'  and "users"."program_id" is null     and "users"."branch_id" is not null)
        or ("users"."role" = 'student'       and "users"."program_id" is null     and "users"."branch_id" is not null)
      )
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"uploader_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text,
	"note_type" "note_type" DEFAULT 'other' NOT NULL,
	"exam_year" smallint,
	"status" "note_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"download_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS ((setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B'))) STORED,
	CONSTRAINT "notes_title_nonempty" CHECK (length(trim("notes"."title")) > 0),
	CONSTRAINT "notes_downloads_sane" CHECK ("notes"."download_count" >= 0),
	CONSTRAINT "notes_exam_year_sane" CHECK ("notes"."exam_year" is null or "notes"."exam_year" between 1950 and 2200),
	CONSTRAINT "notes_review_consistency" CHECK (
        ("notes"."status" = 'pending'  and "notes"."reviewed_by" is null and "notes"."reviewed_at" is null and "notes"."rejection_reason" is null)
        or ("notes"."status" = 'approved' and "notes"."reviewed_at" is not null and "notes"."rejection_reason" is null)
        or ("notes"."status" = 'rejected' and "notes"."reviewed_at" is not null and length(trim(coalesce("notes"."rejection_reason", ''))) > 0)
      )
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"s3_bucket" varchar(63) NOT NULL,
	"s3_key" text NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" bigint,
	"checksum_sha256" char(64),
	"page_count" integer,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"upload_status" "file_upload_status" DEFAULT 'pending' NOT NULL,
	"uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_s3_key_unique" UNIQUE("s3_key"),
	CONSTRAINT "files_note_order_key" UNIQUE("note_id","sort_order"),
	CONSTRAINT "files_size_sane" CHECK ("files"."size_bytes" is null or "files"."size_bytes" > 0),
	CONSTRAINT "files_pages_sane" CHECK ("files"."page_count" is null or "files"."page_count" > 0),
	CONSTRAINT "files_sort_sane" CHECK ("files"."sort_order" >= 0),
	CONSTRAINT "files_checksum_hex" CHECK ("files"."checksum_sha256" is null or "files"."checksum_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "files_upload_complete" CHECK ("files"."upload_status" <> 'uploaded' or ("files"."size_bytes" is not null and "files"."uploaded_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name"),
	CONSTRAINT "tags_name_lower" CHECK ("tags"."name" = lower("tags"."name")),
	CONSTRAINT "tags_name_trimmed" CHECK ("tags"."name" = trim("tags"."name") and length("tags"."name") > 0)
);
--> statement-breakpoint
CREATE TABLE "note_tags" (
	"note_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "note_tags_note_id_tag_id_pk" PRIMARY KEY("note_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_user_id_note_id_pk" PRIMARY KEY("user_id","note_id")
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"user_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_user_id_note_id_pk" PRIMARY KEY("user_id","note_id"),
	CONSTRAINT "ratings_range" CHECK ("ratings"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_body_nonempty" CHECK (length(trim("comments"."body")) > 0)
);
--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_branches_program_active" ON "branches" USING btree ("program_id") WHERE "branches"."is_active";--> statement-breakpoint
CREATE INDEX "idx_subjects_branch_semester" ON "subjects" USING btree ("branch_id","semester") WHERE "subjects"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "users_provider_identity_key" ON "users" USING btree ("auth_provider","provider_user_id") WHERE "users"."auth_provider" is not null;--> statement-breakpoint
CREATE INDEX "idx_users_branch" ON "users" USING btree ("branch_id") WHERE "users"."branch_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_users_program" ON "users" USING btree ("program_id") WHERE "users"."program_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_notes_subject_status_created" ON "notes" USING btree ("subject_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_notes_subject_type_status" ON "notes" USING btree ("subject_id","note_type","status");--> statement-breakpoint
CREATE INDEX "idx_notes_uploader" ON "notes" USING btree ("uploader_id","created_at" DESC NULLS LAST) WHERE "notes"."uploader_id" is not null;--> statement-breakpoint
CREATE INDEX "idx_notes_pending_queue" ON "notes" USING btree ("created_at") WHERE "notes"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_notes_popular" ON "notes" USING btree ("download_count" DESC NULLS LAST) WHERE "notes"."status" = 'approved';--> statement-breakpoint
CREATE INDEX "idx_notes_search" ON "notes" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "idx_notes_reviewer" ON "notes" USING btree ("reviewed_by") WHERE "notes"."reviewed_by" is not null;--> statement-breakpoint
CREATE INDEX "idx_files_stale_uploads" ON "files" USING btree ("created_at") WHERE "files"."upload_status" = 'pending';--> statement-breakpoint
CREATE INDEX "idx_files_checksum" ON "files" USING btree ("checksum_sha256") WHERE "files"."checksum_sha256" is not null;--> statement-breakpoint
CREATE INDEX "idx_note_tags_tag" ON "note_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "idx_bookmarks_note" ON "bookmarks" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "idx_bookmarks_user_recent" ON "bookmarks" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ratings_note" ON "ratings" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "idx_comments_note" ON "comments" USING btree ("note_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_comments_user" ON "comments" USING btree ("user_id") WHERE "comments"."user_id" is not null;--> statement-breakpoint
CREATE VIEW "public"."v_note_scope" AS (
  select
    n.id         as note_id,
    n.status,
    n.uploader_id,
    s.id         as subject_id,
    s.semester,
    b.id         as branch_id,
    p.id         as program_id
  from notes n
  join subjects s on s.id = n.subject_id
  join branches b on b.id = s.branch_id
  join programs p on p.id = b.program_id
);--> statement-breakpoint
CREATE VIEW "public"."v_note_stats" AS (
  select
    n.id as note_id,
    coalesce(r.rating_avg, 0)::numeric(3,2) as rating_avg,
    coalesce(r.rating_count, 0)             as rating_count,
    coalesce(bm.bookmark_count, 0)          as bookmark_count,
    coalesce(c.comment_count, 0)            as comment_count,
    n.download_count
  from notes n
  left join (
    select note_id, avg(rating) as rating_avg, count(*) as rating_count
    from ratings group by note_id
  ) r on r.note_id = n.id
  left join (
    select note_id, count(*) as bookmark_count from bookmarks group by note_id
  ) bm on bm.note_id = n.id
  left join (
    select note_id, count(*) as comment_count from comments group by note_id
  ) c on c.note_id = n.id
);--> statement-breakpoint
-- Hand-added: drizzle-kit's schema DSL has no representation for
-- COMMENT ON, so these (present in db/migrations/000001_initial_schema.up.sql)
-- are carried over by hand. Pure documentation — psql \d+ output only, no
-- behavioral effect — so there's nothing for drizzle-kit to diff or drift on.
COMMENT ON TABLE "programs" IS 'Top academic tier. Soft-removed via is_active.';--> statement-breakpoint
COMMENT ON COLUMN "programs"."duration_semesters" IS 'Upper bound for subjects.semester in this program, enforced by trigger.';--> statement-breakpoint
COMMENT ON COLUMN "users"."program_id" IS 'Set only for program_admin. NULL for everyone else.';--> statement-breakpoint
COMMENT ON COLUMN "users"."branch_id" IS 'Set for branch_admin and student. Program is derived through the branch.';--> statement-breakpoint
COMMENT ON COLUMN "notes"."reviewed_by" IS 'Moderator who approved/rejected. NULL if that account was later deleted.';--> statement-breakpoint
COMMENT ON VIEW "v_note_scope" IS 'note -> subject -> branch -> program. Drives scope checks: a program_admin may act on a note only where program_id matches theirs.';