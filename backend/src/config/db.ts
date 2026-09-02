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
