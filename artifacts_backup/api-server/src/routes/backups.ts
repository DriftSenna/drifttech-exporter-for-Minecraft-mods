import { Router } from "express";
import fs from "fs";
import path from "path";
import { db } from "@workspace/db";
import { backupsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "./auth";

const router = Router();
const downloadsDir = "/home/runner/workspace/downloads";
const backupsBaseDir = "/home/runner/workspace/backups";

router.get("/backups", requireAuth, async (req: any, res) => {
  try {
    const backups = await db
      .select()
      .from(backupsTable)
      .where(eq(backupsTable.userId, req.user.id))
      .orderBy(backupsTable.createdAt);
    res.json({ backups });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Failed to list backups" });
  }
});

router.post("/backups", requireAuth, async (req: any, res) => {
  try {
    const {
      filename,
      modName,
      version,
      source,
      mcVersion,
      loader,
      type = "mod",
    } = req.body as {
      filename?: string;
      modName?: string;
      version?: string;
      source?: string;
      mcVersion?: string;
      loader?: string;
      type?: string;
    };

    if (!filename) {
      res.status(400).json({ error: "filename required" });
      return;
    }
    const srcPath = path.join(downloadsDir, path.basename(filename));
    if (!fs.existsSync(srcPath)) {
      res.status(404).json({ error: "File not found in downloads" });
      return;
    }

    const safeName = (modName || filename).replace(/[^a-zA-Z0-9_.-]/g, "_");
    const safeVersion = (version || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_");
    const backupDir = path.join(backupsBaseDir, req.user.username, safeName, safeVersion);
    fs.mkdirSync(backupDir, { recursive: true });

    const backupPath = path.join(backupDir, path.basename(filename));
    fs.copyFileSync(srcPath, backupPath);

    const [backup] = await db
      .insert(backupsTable)
      .values({
        userId: req.user.id,
        filename: path.basename(filename),
        modName: modName || filename,
        version: version || "unknown",
        source: source || "unknown",
        filePath: backupPath,
        mcVersion: mcVersion ?? null,
        loader: loader ?? null,
        type,
      })
      .returning();

    res.json({ backup });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Failed to create backup" });
  }
});

router.post("/backups/:id/restore", requireAuth, async (req: any, res) => {
  try {
    const backups = await db
      .select()
      .from(backupsTable)
      .where(
        and(
          eq(backupsTable.id, parseInt(req.params.id as string, 10)),
          eq(backupsTable.userId, req.user.id)
        )
      );
    const backup = backups[0];
    if (!backup) {
      res.status(404).json({ error: "Backup not found" });
      return;
    }
    if (!fs.existsSync(backup.filePath)) {
      res.status(404).json({ error: "Backup file is missing from disk" });
      return;
    }
    const destPath = path.join(downloadsDir, backup.filename);
    fs.copyFileSync(backup.filePath, destPath);
    res.json({ restored: backup.filename });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Restore failed" });
  }
});

router.delete("/backups/:id", requireAuth, async (req: any, res) => {
  try {
    const backups = await db
      .select()
      .from(backupsTable)
      .where(
        and(
          eq(backupsTable.id, parseInt(req.params.id as string, 10)),
          eq(backupsTable.userId, req.user.id)
        )
      );
    const backup = backups[0];
    if (!backup) {
      res.status(404).json({ error: "Backup not found" });
      return;
    }
    if (fs.existsSync(backup.filePath)) {
      fs.unlinkSync(backup.filePath);
    }
    await db.delete(backupsTable).where(eq(backupsTable.id, backup.id));
    res.json({ deleted: backup.id });
  } catch (err) {
    req.log?.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;
