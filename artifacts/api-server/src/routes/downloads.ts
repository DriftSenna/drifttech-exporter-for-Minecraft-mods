import { Router } from "express";
import path from "path";
import fs from "fs";

const router = Router();
const downloadsDir = "/home/runner/workspace/downloads";

router.get("/downloads/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(downloadsDir, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.download(filePath, filename);
});

router.get("/downloads", (req, res) => {
  if (!fs.existsSync(downloadsDir)) {
    res.json({ files: [] });
    return;
  }

  const files = fs.readdirSync(downloadsDir).map((name) => {
    const stat = fs.statSync(path.join(downloadsDir, name));
    return { name, size: stat.size };
  });

  res.json({ files });
});

export default router;
