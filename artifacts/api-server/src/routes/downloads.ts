import { Router } from "express";
import path from "path";
import fs from "fs";
import { spawnSync } from "child_process";
import os from "os";

const router = Router();
const downloadsDir = "/home/runner/workspace/downloads";
const scannerScript = "/home/runner/workspace/scripts/scan_mods.py";

function getFiles() {
  if (!fs.existsSync(downloadsDir)) return [];
  return fs.readdirSync(downloadsDir).map((name) => {
    const stat = fs.statSync(path.join(downloadsDir, name));
    return { name, size: stat.size };
  });
}

function runScan(): { results: any[]; allSafe: boolean } {
  const result = spawnSync("python3", [scannerScript, "--json"], {
    encoding: "utf-8",
    cwd: "/home/runner/workspace",
  });
  try {
    const results = JSON.parse(result.stdout || "[]");
    const allSafe = results.every((r: any) => r.safe);
    return { results, allSafe };
  } catch {
    return { results: [], allSafe: true };
  }
}

// Scan endpoint — returns JSON safety report
router.get("/downloads/scan", (req, res) => {
  const { results, allSafe } = runScan();
  res.json({ allSafe, results });
});

// Browse page
router.get("/downloads/browse", (req, res) => {
  const files = getFiles();
  const { results, allSafe } = runScan();
  const scanMap = Object.fromEntries(results.map((r: any) => [r.file, r]));

  const rows = files.map((f) => {
    const scan = scanMap[f.name];
    let badge = "";
    if (scan) {
      if (!scan.safe) {
        badge = `<span class="badge unsafe">UNSAFE</span>`;
      } else if (scan.warnings.length > 0) {
        badge = `<span class="badge warn">${scan.warnings.length} warning${scan.warnings.length > 1 ? "s" : ""}</span>`;
      } else {
        badge = `<span class="badge safe">SAFE</span>`;
      }
    }

    const issues = scan?.issues?.map((i: string) =>
      `<div class="issue">⚠ ${i}</div>`).join("") ?? "";
    const warns = scan?.warnings?.map((w: string) =>
      `<div class="warn-msg">⚡ ${w}</div>`).join("") ?? "";

    return `
      <tr>
        <td>
          <a href="/api/downloads/${encodeURIComponent(f.name)}" download>${f.name}</a>
          ${issues}${warns}
        </td>
        <td>${(f.size / 1024 / 1024).toFixed(1)} MB</td>
        <td>${badge}</td>
      </tr>`;
  }).join("");

  const bannerHtml = !allSafe
    ? `<div class="banner danger">⛔ One or more mods failed the safety scan. Unsafe files are excluded from the ZIP.</div>`
    : `<div class="banner ok">✔ All mods passed the safety scan.</div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Downloads</title>
  <style>
    body { font-family: sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px; background: #0f0f0f; color: #e0e0e0; }
    h1 { margin-bottom: 8px; }
    p { color: #888; margin-top: 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th { text-align: left; padding: 10px 12px; background: #1e1e1e; color: #aaa; font-size: 13px; }
    td { padding: 10px 12px; border-bottom: 1px solid #1e1e1e; vertical-align: top; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .btn { display: inline-block; margin-top: 16px; padding: 12px 28px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 16px; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #1d4ed8; text-decoration: none; }
    .empty { color: #555; margin-top: 40px; text-align: center; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .badge.safe { background: #14532d; color: #4ade80; }
    .badge.warn { background: #78350f; color: #fbbf24; }
    .badge.unsafe { background: #7f1d1d; color: #f87171; }
    .issue { font-size: 12px; color: #f87171; margin-top: 4px; }
    .warn-msg { font-size: 12px; color: #fbbf24; margin-top: 4px; }
    .banner { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
    .banner.ok { background: #14532d; color: #4ade80; }
    .banner.danger { background: #7f1d1d; color: #f87171; }
  </style>
</head>
<body>
  <h1>Downloads</h1>
  <p>${files.length} file${files.length !== 1 ? "s" : ""} available</p>
  ${files.length > 0 ? bannerHtml : ""}
  <a class="btn" href="/api/downloads/all.zip" download="mods.zip">Download All as ZIP</a>
  ${
    files.length === 0
      ? '<p class="empty">No files yet.</p>'
      : `<table>
    <thead><tr><th>File</th><th>Size</th><th>Safety</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
  }
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

// ZIP endpoint — scans first, excludes unsafe files
router.get("/downloads/all.zip", (req, res) => {
  const files = getFiles();
  if (files.length === 0) {
    res.status(404).json({ error: "No files to zip" });
    return;
  }

  const { results } = runScan();
  const scanMap = Object.fromEntries(results.map((r: any) => [r.file, r]));

  // Only include files that passed the scan (warnings are still included)
  const safeFiles = files.filter((f) => {
    const scan = scanMap[f.name];
    return !scan || scan.safe;
  });

  if (safeFiles.length === 0) {
    res.status(403).json({ error: "All files failed the safety scan — ZIP blocked" });
    return;
  }

  const tmpZip = path.join(os.tmpdir(), `mods-${Date.now()}.zip`);
  const script = `
import zipfile, os
files = ${JSON.stringify(safeFiles.map((f) => path.join(downloadsDir, f.name)))}
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
