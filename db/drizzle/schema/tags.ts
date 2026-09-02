import { sql } from "drizzle-orm";
import { check, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 50 }).notNull().unique(),
    created_at: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    check("tags_name_lower", sql`${table.name} = lower(${table.name})`),
    check("tags_name_trimmed", sql`${table.name} = trim(${table.name}) and length(${table.name}) > 0`),
  ]
);

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
