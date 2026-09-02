# College Notes Management Platform — Database

PostgreSQL schema for an upload-and-share study-material platform. Files live in
S3; this database stores metadata only. The org structure (programs → branches →
subjects) is data, not code — nothing about it is hardcoded.

## Layout

| File | What it is |
|---|---|
| `drizzle/schema/` | **Current source of truth for the schema** — a Drizzle ORM TypeScript definition. See "Drizzle" below. |
| `drizzle/migrations/` | SQL migrations generated from `drizzle/schema/` by `drizzle-kit generate`, plus one hand-written custom migration for what the schema DSL can't express (triggers, one DEFERRABLE constraint). |
| `migrations/` | The original golang-migrate migration this project launched with. Frozen — see "Migrations (legacy)" below. Not applied to new databases; `drizzle/migrations/` is structurally equivalent and supersedes it. |
| `seed.sql` | Sample data covering every table. Idempotent (re-running adds nothing). Not a migration — see "Seed data stays separate". |
| `tests.sql` | 28 constraint assertions. Runs in a transaction and rolls back. |
| `queries.sql` | The twelve query shapes the API will issue. Rolls back; four of them mutate. |
| `.env.example` | Template for your Neon connection string. Copy to `.env` (gitignored). |
| `Makefile` | Workflow targets — cloud (Neon) by default, `local-*` for an optional Docker sandbox. |
| `docker-compose.yml` | Local Postgres 16 plus a `migrate` service (Docker Compose `profiles`-gated — never starts with `up`, only via `run`). |

## Database: Neon

This project targets [Neon](https://neon.tech) (serverless Postgres), not a
local install. Setup:

```bash
cp .env.example .env
# edit .env, paste your Neon connection string as DATABASE_URL
```

Use the **direct** connection string (no `-pooler` in the hostname) — see
"Migrations" below for why that matters specifically for migrations.
`sslmode=require` must stay in the URL; Neon rejects plaintext connections.
`pgcrypto` and `citext` (used by the initial migration) are both on Neon's
supported-extension list, so `CREATE EXTENSION` works without superuser.

No local install is required for either tool — `psql` and `migrate` both run
from throwaway Docker containers that talk to Neon over the network, so the
only local dependency is Docker itself.

```bash
make migrate-up   # apply every pending migration to Neon
make seed         # load sample data (idempotent)
make test         # constraint suite (rolls back; leaves no data)
make queries      # representative queries (rolls back; leaves no data)
make psql         # interactive shell against Neon
```

### Optional: local sandbox

A real local Postgres in Docker, independent of Neon — useful for bulk-load or
index-plan experiments without spending your Neon project's compute/storage.
Not required for normal use.

```bash
make local-reset    # fresh local container, migrations applied, seed data loaded
make local-test
make local-queries
make local-psql
```

## Drizzle

**The schema now lives as TypeScript in `drizzle/schema/`, one file per
table** (`programs.ts`, `branches.ts`, ..., plus `enums.ts`, `custom-types.ts`
for `citext`/`tsvector`, and `views.ts` for `v_note_scope`/`v_note_stats`).
This is the thing you edit — not `drizzle/migrations/`, and not the frozen
`migrations/000001_initial_schema.up.sql` described below.

```bash
npm install                          # once, and after pulling schema changes
npm run build                        # compiles drizzle/schema -> dist/ — backend/
                                      # imports the compiled output, not the .ts
                                      # source; re-run this after every schema edit
npm run db:generate                  # diffs schema against drizzle/migrations/'s
                                      # history, writes a new SQL migration
npm run db:migrate                   # applies pending migrations to DATABASE_URL
npm run db:studio                    # drizzle-kit's local schema browser/editor
```

**Workflow:** edit a file under `drizzle/schema/` → `npm run db:generate` →
**read the generated SQL in `drizzle/migrations/` before running anything** →
`npm run db:migrate` → `npm run build` so `backend/` picks up the new
inferred types.

### What Drizzle's schema DSL can't express

Three things from the original schema have no representation in Drizzle's
table-definition API and are hand-maintained in
`drizzle/migrations/0001_procedural_logic.sql` instead, permanently:

- The `set_updated_at()` trigger function and its 7 `BEFORE UPDATE` triggers.
- The `subjects_check_semester()` trigger (a CHECK cannot read another
  table, so the per-program semester ceiling has to be procedural).
- `files_note_order_key`'s `DEFERRABLE INITIALLY IMMEDIATE` property —
  drizzle-orm's unique-constraint builder has no `.deferrable()` (checked
  against `drizzle-orm@0.45.2`).

`drizzle/schema/subjects.ts` and `files.ts` both comment at the exact point
this applies, pointing here. Drizzle's schema diffing has no model of any of
these three, so `db:generate` will never try to "fix" or revert them — they
just live outside its view permanently.

Also hand-added at the top of `drizzle/migrations/0000_*.sql`: the two
`CREATE EXTENSION` statements (`pgcrypto`, `citext`) that `drizzle-kit`
doesn't manage, and — at the bottom — the `COMMENT ON` statements from the
original schema, which the DSL also has no representation for. Both are pure
documentation/setup, not something `db:generate` will ever diff against.

### Verifying the baseline migration

Before this replaced golang-migrate as the tool of record, the generated
`drizzle/migrations/0000_*.sql` + `0001_procedural_logic.sql` pair was
verified against `migrations/000001_initial_schema.up.sql` by applying each
to a fresh throwaway Postgres container and diffing `pg_dump --schema-only`
output. They're structurally and behaviorally identical — the only
differences are constraint/index names (Drizzle's naming convention vs.
Postgres's own default naming for unnamed constraints), which nothing in the
application depends on (errors are handled by SQLSTATE code, never by
constraint name). A live smoke test (insert through every table, confirm the
generated `search_vector` column, both views, the `updated_at` trigger, and
the semester-ceiling trigger all behave correctly) passed against the
generated migrations directly.

**Neon and the local sandbox already have `migrations/000001` applied** via
golang-migrate — `drizzle/migrations/0000_*.sql` must NOT be run against
either as a live `CREATE TABLE` migration, since the tables already exist.
Baselining (recording it as already-applied in Drizzle's own migration
tracking, without executing it) has not been done yet against either
database — do that once, deliberately, rather than running `db:migrate`
against an existing database without checking first.

## Migrations (legacy)

Schema changes were originally versioned migrations under `migrations/`,
applied with [golang-migrate](https://github.com/golang-migrate/migrate).
**This is now superseded by Drizzle** (see above) — `migrations/` is kept as
a historical record and is frozen at `000001`; new schema changes go through
`drizzle/schema/` + `drizzle-kit generate` instead. The rest of this section
describes the golang-migrate workflow for reference — not a hand-maintained
schema file you re-run against whatever you're pointed at.

### Why this changed

The previous version of this project had one file, `schema.sql`, run directly
against each database. That breaks down for a production-oriented app in a
few concrete ways:

- **No record of what's applied where.** Re-running a schema file tells you
  nothing about whether staging already matches production, or whether
  someone hand-patched a column in `psql` last week.
- **No safe path for a second change.** A schema file describes one snapshot.
  The moment you need to add a column, you're editing a file that's already
  been applied elsewhere — there's no way to express "here's what changed"
  separately from "here's the current state."
- **No rollback.** A raw `psql -f schema.sql` has no reverse operation.

Migrations fix all three: each change is its own numbered, immutable file
pair (`up`/`down`); a `schema_migrations` table (created and tracked by the
tool automatically) records exactly which migrations have been applied to
*this* database; and running the identical `migrate ... up` command against
local, staging, or production converges each one to the same state regardless
of where it started. This is also why `schema.sql` is gone rather than kept
as a second reference copy — a schema description that isn't what actually
gets applied is worse than no description, because it drifts silently the
first time someone adds a migration and forgets to update it.

### Why golang-migrate specifically

`db/` is deliberately language-agnostic — it only needs Docker, not a Node or
Python install, so it stays usable on its own even though `backend/` happens
to be Node.js. golang-migrate fits that design: it's a single static binary
with an official Docker image (no local install, same throwaway-container
pattern already used for `psql`), migration files are plain `.sql` — matching
how this schema was hand-written, not generated by an ORM — and
`migrate create -seq` assigns sequence numbers automatically, so two people
adding migrations in parallel can't collide on the same number.

### Why the direct connection, not the pooled one

Migrations are schema-changing DDL, and Neon's pooled endpoint routes through
PgBouncer in transaction-pooling mode — which doesn't guarantee a migration's
`CREATE TABLE`/`CREATE INDEX`/etc. run on the same underlying Postgres session
consistently, and can be outright finicky with DDL. The direct connection
(no `-pooler` in the hostname) talks straight to Postgres, which is what a
one-shot, order-sensitive operation like a migration needs. This is why
`db/.env` uses the direct string while `backend/.env` uses the pooled one —
the backend's normal request traffic is exactly the many-short-lived-
connections pattern PgBouncer pooling is for; migrations are the opposite.

### Layout and naming

```
migrations/
├── 000001_initial_schema.up.sql
└── 000001_initial_schema.down.sql
```

`NNNNNN_description.up.sql` / `.down.sql` — zero-padded sequence plus a slug,
generated by `migrate create`, never hand-numbered. `up` applies a change;
`down` reverses exactly that change, nothing more.

**Migration 000001 is the schema this project launched with**, as a single
migration — it was designed and verified as one unit before migrations
existed, so splitting it into an artificial multi-step history would misstate
how it was actually built. Every schema change from here forward is a new
migration.

### Immutability: never edit an applied migration

Once a migration has been applied anywhere — even just your own local
sandbox, if anyone else might share it — treat the file as frozen. To fix a
mistake or extend a table, write a **new** migration:

```bash
make migrate-create NAME=add_something
# scaffolds migrations/000002_add_something.up.sql and .down.sql
```

This isn't a style preference: `schema_migrations` tracks which sequence
numbers have run, not file content. Edit `000001` after it's been applied
somewhere, and that database's history now disagrees with the file on disk —
the tool has no way to detect or reconcile that, and environments silently
diverge from each other.

### What happens when a migration fails partway

Confirmed empirically, not assumed (see "Verified" below): golang-migrate
wraps each migration file in a transaction on Postgres, so a failure partway
through leaves **no partial schema behind** — the whole file is one atomic
unit. What it does leave behind is a `dirty` flag on that version in
`schema_migrations`, which blocks `up` from running again until you fix the
underlying SQL and clear the flag with `migrate force <version>`. This is why
`000001_initial_schema.up.sql` has no explicit `BEGIN`/`COMMIT` — the tool
already provides that; adding one would just emit a harmless "already in
transaction" warning.

### Day to day

```bash
make migrate-up             # apply every pending migration — Neon
make migrate-down-1         # roll back the most recent migration — Neon
make migrate-version        # show which migration is currently applied — Neon
make migrate-create NAME=x  # scaffold a new migration pair (writes local files only)

make local-migrate-up       # same three, against the local Docker sandbox
make local-migrate-down-1
make local-migrate-version
```

Same tool, same files, same commands — the only thing that changes between
local, staging, and production is `DATABASE_URL`. That's the actual mechanism
behind "works consistently across environments": there is exactly one code
path, and the sole environment-specific input is a connection string.

### Seed data stays separate

`seed.sql` is not a migration and never will be — migrations are schema
(DDL); seed data is rows. Mixing them means every fresh environment (a CI
run, a new teammate's laptop) either gets sample data it didn't ask for, or
schema changes end up coupled to whatever sample rows existed when someone
wrote that migration. `make seed` / `make local-seed` stay separate steps,
run after migrations — unchanged from before this refactor.

### Verified

- **The image tag is real, not recalled.** `docker pull migrate/migrate:v4.18.1`
  succeeds; running it with `-version` reports `4.18.1`.
- **Postgres migrations are transactional — confirmed, not assumed.** Tested
  with a throwaway migration (two valid `CREATE TABLE`s followed by a
  deliberate syntax error) against an empty sandbox: after the failure,
  neither table existed. `schema_migrations` showed `version=1, dirty=true`.
  This is the basis for omitting explicit `BEGIN`/`COMMIT` in the real
  migration.
- **The full up → down → up cycle runs clean**, not just "the down file reads
  correctly": `local-migrate-up` (12 tables including `schema_migrations`, 2
  views, 26 CHECK constraints) → `local-migrate-down-1` (drops to exactly 1
  table, `schema_migrations`, empty) → `local-migrate-up` again (back to the
  same 12 tables, 2 views, 26 checks) → re-seeded → **28/28 constraint tests
  pass**, all 12 representative queries return results identical to before
  this refactor.
- **The full documented workflow was run from an absolute-scratch state**,
  not just individual targets in isolation: volume and network destroyed,
  then `make local-reset` → `make local-test` → `make local-queries`, nothing
  else — the exact sequence a new developer would type, with no manual
  intervention.
- **The cloud-path macros (`CLOUD_MIGRATE`, `CLOUD_PSQL`) were exercised, not
  just designed** — this matters because they're structurally different from
  the local-sandbox path (`--env-file` injection, `--entrypoint sh`, Make's
  `$$` → shell `$$` → in-container expansion, and a `-v` host mount path that
  contains a space, `New Volume`), and every migration/test run earlier in
  this section went through the local-sandbox macros instead. Tested by
  pointing a temporary `.env` at the local sandbox's published port and
  running `make migrate-version` and `make test` unmodified:
  - **As actually shipped** (no `--network host` — correct for a real,
    internet-reachable Neon endpoint): both failed with `connection refused`
    dialing `localhost:5432` from inside the container — a container's own
    "localhost" is itself, not the host, so this is the expected outcome
    against a locally-published port. The error text showed the *resolved*
    connection string, proving env-file injection, the `$$` escaping, and the
    quoted space-containing mount path all worked correctly — only the
    network hop was the (expected, correct) failure.
  - **With `--network host` added** (test-only — not in the Makefile, since
    that flag is Linux-specific and wrong for reaching Neon over the
    internet): `migrate version` reported `1`; the full constraint suite
    through `CLOUD_PSQL` passed **28/28** — a fully successful run through
    the exact macro construction Neon will use, differing only in the
    network path.
  - `make migrate-create NAME=probe` (the actual target, not the hand-typed
    `docker run` that created migration 000001) correctly produced
    `000002_probe.up.sql` / `.down.sql` — confirming sequencing continues
    from `000001` rather than colliding with it, which is what makes the
    immutability rule enforceable in practice. The guard (`make
    migrate-create` with no `NAME`) was also confirmed to fail with a usage
    message rather than silently doing nothing. Both probe files were then
    deleted — they were a test, not a real migration.
- **Object counts and constraint behavior are unchanged from direct
  execution** — the migration is a byte-for-byte extraction of the schema
  that was already load-tested (see "Verification status" below); nothing in
  the DDL itself changed, only how it's delivered.

## Environments

| Environment | `DATABASE_URL` points at | Command |
|---|---|---|
| Local dev | the `db` Docker Compose service | `make local-migrate-up` |
| Testing / CI | a Postgres instance the test runner provisions | the same `migrate/migrate` image, pointed at that instance's connection string — no pipeline exists in this repo yet, but none is needed for the tooling to work there |
| Staging | your staging Neon (or other Postgres) project | `make migrate-up` with staging's `.env` |
| Production | your production Neon (or other Postgres) project | `make migrate-up` with production's `.env` |

The mechanism is identical everywhere; only the connection string differs.
This repo doesn't define staging/production infrastructure or a CI
pipeline — neither exists yet — but the tooling doesn't need to change when
they do: point a new `.env` (or CI secret) at the new database and run the
same command.

## Verification status

- **Migrations** — see the "Migrations" section's "Verified" subsection
  above: image tag, transaction-wrapping, and a full down→up cycle were all
  run, not just designed.
- **`tests.sql`: 28/28 pass**, 0 failures — re-confirmed after converting to
  migrations, including after a full down→up cycle.
- **`seed.sql`** loads clean and is idempotent (re-running adds nothing); the
  guard on `notes`/`comments` is a `WHERE NOT EXISTS` on title/body, not a
  UNIQUE constraint — it holds for repeat runs of this file, not against
  arbitrary hand-inserted duplicates.
- **`queries.sql`**: all 12 return correct results, matching the results from
  before this refactor exactly. The file wraps itself in a transaction that
  rolls back, so `make queries` is repeatable.
- **Index usage under load** — checked under a 120,000-note / 480,000-rating
  local sandbox load, before this refactor: the browse, moderation-queue,
  per-note-ratings, and subject+type filters all took their intended index;
  the GIN full-text index correctly serves ranked search. That conclusion
  still holds — it depends on the schema's *definition* (which indexes exist,
  which constraints apply), not on how the DDL was delivered, and object
  counts plus the constraint suite above confirm the migration produces an
  identical schema. It was not re-run at 120k rows after this refactor, since
  doing so would re-test the same index-selection behavior, not the
  migration mechanism.
- **Run against the real Neon database.** `make migrate-up` → `make seed` →
  `make test` → `make queries`, in that order, against the project's actual
  Neon connection (direct, not pooled):
  - Object counts matched the local sandbox exactly: 12 tables (11 app +
    `schema_migrations`), 2 views, 8 triggers, 4 enums, 26 CHECK constraints.
  - `schema_migrations` existed but was empty (0 rows) before `migrate-up` —
    golang-migrate creates its tracking table on first connect, before
    applying anything; confirmed this wasn't a partial prior run before
    proceeding. `migrate-version` reports `1` afterward.
  - The migration itself took ~4.4s (real network latency), versus ~100ms
    locally — expected, not a concern.
  - **28/28 constraint tests pass**; all 12 representative queries return
    results identical to the local sandbox, and correctly rolled back
    despite the mutating queries mid-file — no side effects left on the
    seeded data.
  - One real snag along the way, not a database issue: the Neon connection
    string was initially saved into `backend/.env` (pooled, for app runtime)
    instead of `db/.env` (direct, for migrations) — the two `.env` files
    exist for exactly this reason (see "Why the direct connection, not the
    pooled one" above), and a wrong-file mistake was the actual failure
    mode, not a tooling defect. Resolved by deriving the direct string from
    the pooled one (Neon's convention: the same endpoint ID, minus
    `-pooler`) and verifying it connected before applying anything.

## Schema at a glance

```
programs ──1:∞── branches ──1:∞── subjects ──1:∞── notes ──1:∞── files
                     │                                 │
                users │(branch_admin, student)          ├──∞:∞── tags (note_tags)
                     │                                 ├──∞:∞── users (bookmarks)
             (program_admin → programs)                 ├──∞:∞── users (ratings)
                                                        └──1:∞── comments
```

Eleven tables in four groups — taxonomy (`programs`, `branches`, `subjects`),
people (`users`), content (`notes`, `files`), engagement (`tags`, `note_tags`,
`bookmarks`, `ratings`, `comments`). A twelfth table, `schema_migrations`, is
created and managed by golang-migrate — it isn't part of the application
schema.

## Access model

A role label alone is not enough — a program admin has to know which program
they run. So each user carries a role plus a scope reference, and a CHECK
constraint keeps the pairing honest:

| Role | Scope | May act on |
|---|---|---|
| `superuser` | none | everything, including creating and removing programs and branches |
| `program_admin` | `program_id` | branches, students and notes inside their program |
| `branch_admin` | `branch_id` | students and notes inside their branch |
| `student` | `branch_id` | upload, browse, bookmark, rate, comment |

The database stores and constrains the scope. Authorization itself is enforced
in the application — `v_note_scope` resolves any note up to its branch and
program in one hop, so every check reads the same way. Query 5 and 6 in
`queries.sql` show the pattern: the scope test goes in the `WHERE` clause, so
an out-of-scope action updates zero rows rather than silently succeeding.

## Design decisions worth knowing

**Soft-delete for taxonomy.** Removing a program or branch sets
`is_active = false`, which hides it from browsing while every attached note and
user survives. Hard `DELETE` is reserved for genuinely empty rows, and the
`RESTRICT` foreign keys will block a destructive one — that is the safety net
working, not a bug.

**Per-program semester length.** `subjects.semester` has no hardcoded 1–8 cap.
`programs.duration_semesters` holds the real bound (B.Tech 8, MBA and MCA 4) and
a trigger enforces it, because a `CHECK` cannot read another table. Adding a
6-semester program later needs a new migration, not a redesign.

**Moderation is audited.** `notes.status` drives visibility; `reviewed_by`,
`reviewed_at` and `rejection_reason` record who acted and why. A CHECK makes the
three states mutually consistent — you cannot approve without a timestamp, and
you cannot reject without a reason, so a student always learns what to fix.

**Uploads are two-phase.** `files.upload_status` (`pending` → `uploaded` /
`failed`) exists because the presigned-URL flow creates the row before the S3
object exists. Without it the database cannot tell an abandoned upload from a
real file, and orphan rows are unreapable. `idx_files_stale_uploads` serves the
sweeper.

**Ratings are computed on read.** `v_note_stats` is the single definition of how
a note is scored. If volume ever demands it, denormalize `rating_avg` and
`rating_count` onto `notes` in a new migration and keep the view's shape as
the contract, so no caller changes.

**Downloads are a counter, not a log.** `notes.download_count` is incremented in
place. This is cheap but one-way: it cannot answer "trending this week", and it
cannot be rebuilt if it drifts. Adding a thin `note_downloads` log later is the
fix if either matters.

## Deviations from the original spec

Five, all deliberate, all still true after the migrations refactor (the
schema itself didn't change — see "Migrations" above for what did):

1. **`subjects.code` is `UNIQUE(branch_id, code)`**, not globally unique —
   mirroring `branches`. Global uniqueness would stop two branches from ever
   offering a same-coded subject.
2. **The generated `tsvector` uses two-argument `to_tsvector('english', ...)`.**
   The one-argument form reads `default_text_search_config`, is therefore not
   `IMMUTABLE`, and Postgres rejects it in a `GENERATED ... STORED` column
   outright — the table would not have been created.
3. **Real indexes were added.** The spec claimed the composite primary keys
   "index the common lookups", but `PRIMARY KEY (user_id, note_id)` on `ratings`
   cannot serve `WHERE note_id = ?` — which is exactly what the read-time
   AVG/COUNT does on every note page. Same for `bookmarks` and `note_tags`.
4. **`files` gained `upload_status`, `size_bytes`, `mime_type`,
   `checksum_sha256` and `sort_order`** — see two-phase uploads above.
5. **`updated_at` triggers.** Postgres does not maintain those columns itself;
   without the triggers the values would be frozen at insert time.

Also added: `citext` for case-insensitive email (so `Aarav@` and `aarav@` cannot
become two accounts), `notes.exam_year` for PYQs, and the two views.

## Known limitations

- **Tags are not full-text searchable.** A generated column can only read its own
  row, so `search_vector` covers title and description only. Searching by tag is
  a join (query 3). Putting tag names in the vector would require a
  trigger-maintained column instead of a generated one.
- **No `users.is_active`.** There is no deactivation path — removing a graduated
  student requires a hard `DELETE`, which drops their bookmarks and ratings via
  `ON DELETE CASCADE` (their uploaded notes survive with `uploader_id = NULL`).
  Adding the column is a one-line migration if that matters.
- **No comment threading.** `comments` is flat; replies would need a
  `parent_comment_id` self-reference.
- **No download log**, as described above.
- **Not covered:** real-time collaborative editing. That needs CRDT or
  operational-transform machinery and would change this design substantially.

## S3 upload flow

The database never holds file bytes.

1. Client asks the API to create a note. Row inserted with `status = 'pending'`.
2. API inserts one `files` row per attachment with `upload_status = 'pending'`
   and a generated `s3_key`, then returns presigned PUT URLs.
3. Client PUTs directly to the private bucket.
4. Client confirms; API sets `upload_status = 'uploaded'` with `size_bytes` and
   `uploaded_at`. The `files_upload_complete` CHECK refuses the transition
   without them.
5. Downloads are served as short-lived presigned GET URLs — the bucket stays
   private throughout.
6. A periodic job deletes `pending` file rows older than 24 hours.

## Notes for the API layer

- `password_hash` is nullable and coexists with `auth_provider` /
  `provider_user_id`. A user may have either or both; a CHECK guarantees at
  least one. Provider values are `VARCHAR + CHECK` rather than an enum, since
  identity providers change more often than roles do.
- Always filter `status = 'approved'` on public reads. Only the uploader and
  in-scope moderators should see `pending` or `rejected` rows.
- Tags must be inserted lowercase and trimmed; the CHECK will reject otherwise.
  Use `ON CONFLICT (name) DO NOTHING` then select, or a single upsert.
- `files_note_order_key` is `DEFERRABLE`, so a drag-to-reorder can shuffle
  `sort_order` inside one transaction without tripping halfway through.
