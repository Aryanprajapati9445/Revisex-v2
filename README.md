# College Notes Management Platform

Upload-and-share study material for a college: students upload notes, PYQs,
lab manuals and books organized by program → branch → semester → subject;
others browse, search, download, bookmark, rate, and comment. Org structure
(programs, branches) is dynamic — rows you add or remove, never hardcoded.

## Components

| Path | What it is |
|---|---|
| [`db/`](db/README.md) | PostgreSQL schema, targeting [Neon](https://neon.tech). Versioned migrations (golang-migrate), seed data, a constraint test suite, and representative queries. |
| [`backend/`](backend/README.md) | REST API. Node.js + TypeScript + Express. |

Each folder is self-contained with its own README, dependencies, and `.env`.
Start with `db/README.md` — the backend expects that schema to already exist
on your Neon database.

## Status

- **Database** — designed, built, migrated, and verified, including against
  the live Neon database (28/28 constraint tests, all 12 representative
  queries) — see `db/README.md`'s Verification status section for details.
- **Backend** — skeleton scaffolded (Express app, config, middleware, one
  fully wired module as a reference pattern). The remaining modules are
  stubs; no business logic or auth implemented yet.
- **Frontend** — not started.
