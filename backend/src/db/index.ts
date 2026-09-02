import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "../config/db.js";
// Imported from db/'s compiled output, not its .ts source — db/ is a
// package-independent sibling directory (like the rest of db/'s tooling),
// built with `npm run build` there. Run that after any schema change,
// before this backend picks it up. See db/README.md's Drizzle section.
import * as schema from "../../../db/dist/schema/index.js";

export const db = drizzle(pool, { schema });
export { schema };
