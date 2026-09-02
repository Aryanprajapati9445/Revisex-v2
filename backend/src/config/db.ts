import pg from "pg";
import { env } from "./env.js";

const { Pool, types } = pg;

// pg's defaults disagree with types/index.ts and it fails silently through
// JSON (JSON.stringify(Date) already looks like an ISO string, so the bug
// only shows up in code that touches the value before serializing).
//   - timestamptz/timestamp (OID 1114/1184) parse to a JS Date by default;
//     types/index.ts declares these columns as `string`. Re-stringify to
//     real ISO 8601 rather than passing Postgres's own text format
//     ("2026-09-01 15:08:54.746159+00") straight through — Node parses
//     that leniently, but not every client-side Date parser does.
//   - int8/bigint (OID 20 — only files.size_bytes here) comes back as a
//     string by default, to protect values beyond Number.MAX_SAFE_INTEGER.
//     A file size in bytes will never get near that, so parse it as a
//     number to match NoteFile's declared type.
//
// These parsers apply to every query on this pool, Drizzle's included —
// this is the one pool db/index.ts's `drizzle(pool, ...)` wraps too.
// Drizzle's own decoding for `timestamp({ mode: "string" })` and
// `bigint({ mode: "number" })` (see db/drizzle/schema/) is a passthrough
// when the driver already hands it a string/number respectively (checked
// against drizzle-orm@0.45.2's PgTimestampString/PgBigInt53
// mapFromDriverValue), so these two layers don't fight — Drizzle just sees
// values already in its expected shape.
const toIso = (val: string) => new Date(val).toISOString();
types.setTypeParser(types.builtins.TIMESTAMPTZ, toIso);
types.setTypeParser(types.builtins.TIMESTAMP, toIso);
types.setTypeParser(types.builtins.INT8, (val) => Number(val));

// Neon's own docs recommend exactly this: pass the connection string straight
// through and let pg-connection-string parse sslmode=require from it, rather
// than hand-building an ssl object.
export const pool = new Pool({ connectionString: env.DATABASE_URL });

pool.on("error", (err) => {
  console.error("Unexpected error on idle pg client", err);
});

export async function checkDbConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
