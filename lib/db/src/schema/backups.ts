import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const backupsTable = pgTable("backups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  filename: text("filename").notNull(),
  modName: text("mod_name").notNull(),
  version: text("version").notNull().default("unknown"),
  source: text("source").notNull().default("unknown"),
  filePath: text("file_path").notNull(),
  mcVersion: text("mc_version"),
  loader: text("loader"),
  type: text("type").notNull().default("mod"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBackupSchema = createInsertSchema(backupsTable).omit({ id: true, createdAt: true });
export type InsertBackup = z.infer<typeof insertBackupSchema>;
export type Backup = typeof backupsTable.$inferSelect;
