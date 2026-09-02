import { customType } from "drizzle-orm/pg-core";

// Drizzle has no built-in citext type. Case-insensitive email prevents
// Aryan@x.edu and aryan@x.edu from becoming two accounts, which a plain
// text UNIQUE would allow.
export const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

// Postgres full-text search vector. Only ever produced by a generated
// column (see notes.ts) — never written to directly.
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});
