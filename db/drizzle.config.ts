import { config as loadDotenv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Reuses the same DATABASE_URL / .env this directory's golang-migrate
// tooling already uses (see Makefile, .env.example) — one connection
// string, not a second one to keep in sync.
loadDotenv({ path: new URL("./.env", import.meta.url).pathname });

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set — copy db/.env.example to db/.env and fill in your connection string first."
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema/index.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
