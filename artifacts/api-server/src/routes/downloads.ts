import { Router } from "express";
import path from "path";
import fs from "fs";
import { spawnSync } from "child_process";
import os from "os";

const router = Router();
const downloadsDir = "/home/runner/workspace/downloads";

function getFiles() {
  if (!fs.existsSync(downloadsDir)) return [];
  return fs.readdirSync(downloadsDir).map((name) => {
    const stat = fs.statSync(path.join(downloadsDir, name));
    return { name, size: stat.size };
  });
}

// Browse page — lists all files with a Download All button
router.get("/downloads/browse", (req, res) => {
  const files = getFiles();
  const rows = files
    .map(
      (f) => `
      <tr>
        <td><a href="/api/downloads/${encodeURIComponent(f.name)}" download>${f.name}</a></td>
        <td>${(f.size / 1024 / 1024).toFixed(1)} MB</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Downloads</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; background: #0f0f0f; color: #e0e0e0; }
    h1 { margin-bottom: 8px; }
    p { color: #888; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th { text-align: left; padding: 10px 12px; background: #1e1e1e; color: #aaa; font-size: 13px; }
    td { padding: 10px 12px; border-bottom: 1px solid #1e1e1e; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .btn {
      display: inline-block; margin-top: 24px; padding: 12px 28px;
      background: #2563eb; color: #fff; border: none; border-radius: 8px;
      font-size: 16px; cursor: pointer; text-decoration: none;
    }
    .btn:hover { background: #1d4ed8; text-decoration: none; }
    .empty { color: #555; margin-top: 40px; text-align: center; }
  </style>
</head>
<body>
  <h1>Downloads</h1>
  <p>${files.length} file${files.length !== 1 ? "s" : ""} available</p>
  <a class="btn" href="/api/downloads/all.zip" download="mods.zip">Download All as ZIP</a>
  ${
    files.length === 0
      ? '<p class="empty">No files yet.</p>'
      : `<table>
    <thead><tr><th>File</th><th>Size</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
  }
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

// ZIP endpoint — bundles all files into one download
router.get("/downloads/all.zip", (req, res) => {
  const files = getFiles();
  if (files.length === 0) {
    res.status(404).json({ error: "No files to zip" });
    return;
  }

  const tmpZip = path.join(os.tmpdir(), `mods-${Date.now()}.zip`);

  const script = `
import zipfile, os
files = ${JSON.stringify(files.map((f) => path.join(downloadsDir, f.name)))}
with zipfile.ZipFile(${JSON.stringify(tmpZip)}, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, os.path.basename(f))
`;

  const result = spawnSync("python3", ["-c", script]);
  if (result.status !== 0) {
    res.status(500).json({ error: "Failed to create zip" });
    return;
  }

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="mods.zip"');
  const stream = fs.createReadStream(tmpZip);
  stream.pipe(res);
  stream.on("close", () => fs.unlinkSync(tmpZip));
});

// Individual file download
router.get("/downloads/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(downloadsDir, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.download(filePath, filename);
});

// List files as JSON
router.get("/downloads", (req, res) => {
  res.json({ files: getFiles() });
});

export default router;
