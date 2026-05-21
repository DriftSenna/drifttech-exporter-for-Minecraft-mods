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

// Delete a file
router.delete("/downloads/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(downloadsDir, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  fs.unlinkSync(filePath);
  res.json({ deleted: filename });
});

// Browse page — interactive with live scan
router.get("/downloads/browse", (req, res) => {
  const files = getFiles();

  const fileRows = files.map((f) => `
    <tr id="row-${encodeURIComponent(f.name)}" data-file="${f.name}">
      <td class="name-cell">
        <a href="/api/downloads/${encodeURIComponent(f.name)}" download>${f.name}</a>
        <div class="issues-cell" id="issues-${encodeURIComponent(f.name)}"></div>
      </td>
      <td>${(f.size / 1024 / 1024).toFixed(1)} MB</td>
      <td><span class="badge scanning" id="badge-${encodeURIComponent(f.name)}">Scanning…</span></td>
      <td class="action-cell" id="action-${encodeURIComponent(f.name)}"></td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Downloads</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; background: #0f0f0f; color: #e0e0e0; }
    h1 { margin-bottom: 4px; }
    .subtitle { color: #666; margin: 0 0 20px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { text-align: left; padding: 10px 12px; background: #1a1a1a; color: #aaa; font-size: 13px; }
    td { padding: 10px 12px; border-bottom: 1px solid #1e1e1e; vertical-align: top; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .btn { display: inline-block; padding: 11px 26px; background: #2563eb; color: #fff; border-radius: 8px; font-size: 15px; cursor: pointer; text-decoration: none; border: none; }
    .btn:hover { background: #1d4ed8; }
    .btn:disabled { background: #374151; color: #6b7280; cursor: not-allowed; }
    .btn-sm { padding: 4px 12px; font-size: 12px; border-radius: 5px; border: none; cursor: pointer; margin-right: 6px; }
    .btn-remove { background: #7f1d1d; color: #f87171; }
    .btn-remove:hover { background: #991b1b; }
    .btn-keep { background: #1e3a5f; color: #93c5fd; }
    .btn-keep:hover { background: #1e40af; }
    .badge { display: inline-block; padding: 3px 9px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .badge.scanning { background: #1c1c1c; color: #6b7280; animation: pulse 1.2s infinite; }
    .badge.safe { background: #14532d; color: #4ade80; }
    .badge.warn { background: #78350f; color: #fbbf24; }
    .badge.unsafe { background: #7f1d1d; color: #f87171; }
    .issue { font-size: 12px; color: #f87171; margin-top: 5px; }
    .warn-msg { font-size: 12px; color: #fbbf24; margin-top: 5px; }
    .banner { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
    .banner.scanning { background: #1c1c1c; color: #6b7280; }
    .banner.ok { background: #14532d; color: #4ade80; }
    .banner.danger { background: #7f1d1d; color: #f87171; }
    .banner.warn { background: #78350f; color: #fbbf24; }
    .removed-row { opacity: 0.35; text-decoration: line-through; }
    .toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  </style>
</head>
<body>
  <h1>Downloads</h1>
  <p class="subtitle">${files.length} file${files.length !== 1 ? "s" : ""} · Safety scan runs automatically on page load</p>

  <div id="banner" class="banner scanning">🔍 Scanning mods for safety issues…</div>

  <div class="toolbar">
    <a id="zip-btn" class="btn" href="/api/downloads/all.zip" download="mods.zip">Download All as ZIP</a>
  </div>

  ${files.length === 0
    ? '<p style="color:#555;text-align:center;margin-top:40px">No files yet.</p>'
    : `<table>
      <thead><tr><th>File</th><th>Size</th><th>Safety</th><th>Action</th></tr></thead>
      <tbody>${fileRows}</tbody>
    </table>`
  }

  <script>
    const BASE = '/api';

    async function runScan() {
      const resp = await fetch(BASE + '/downloads/scan');
      const data = await resp.json();
      const banner = document.getElementById('banner');
      let hasUnsafe = false, hasWarn = false;

      for (const r of data.results) {
        const key = encodeURIComponent(r.file);
        const badge = document.getElementById('badge-' + key);
        const issuesEl = document.getElementById('issues-' + key);
        const actionEl = document.getElementById('action-' + key);

        if (!badge) continue;

        if (!r.safe) {
          hasUnsafe = true;
          badge.className = 'badge unsafe';
          badge.textContent = 'UNSAFE';

          // Show issues
          issuesEl.innerHTML = r.issues.map(i => '<div class="issue">⚠ ' + i + '</div>').join('');
          if (r.warnings.length) {
            issuesEl.innerHTML += r.warnings.map(w => '<div class="warn-msg">⚡ ' + w + '</div>').join('');
          }

          // Remove / Keep buttons
          actionEl.innerHTML =
            '<button class="btn-sm btn-remove" onclick="removeFile(' + JSON.stringify(r.file) + ')">Remove</button>' +
            '<button class="btn-sm btn-keep" onclick="keepFile(' + JSON.stringify(r.file) + ')">Keep Anyway</button>';

        } else if (r.warnings.length) {
          hasWarn = true;
          badge.className = 'badge warn';
          badge.textContent = r.warnings.length + ' warning' + (r.warnings.length > 1 ? 's' : '');
          issuesEl.innerHTML = r.warnings.map(w => '<div class="warn-msg">⚡ ' + w + '</div>').join('');
        } else {
          badge.className = 'badge safe';
          badge.textContent = 'SAFE';
        }
      }

      // Any remaining "Scanning…" badges mean the file wasn't in scan results — mark safe
      document.querySelectorAll('.badge.scanning').forEach(b => {
        b.className = 'badge safe';
        b.textContent = 'SAFE';
      });

      if (hasUnsafe) {
        banner.className = 'banner danger';
        banner.textContent = '⛔ Issues found — review flagged mods before downloading. Unsafe files are excluded from the ZIP.';
      } else if (hasWarn) {
        banner.className = 'banner warn';
        banner.textContent = '⚡ Scan complete — all mods passed but some have minor warnings (see below).';
      } else {
        banner.className = 'banner ok';
        banner.textContent = '✔ Scan complete — all mods are safe.';
      }
    }

    async function removeFile(filename) {
      if (!confirm('Remove "' + filename + '" from your downloads?')) return;
      const resp = await fetch(BASE + '/downloads/' + encodeURIComponent(filename), { method: 'DELETE' });
      if (resp.ok) {
        const key = encodeURIComponent(filename);
        const row = document.getElementById('row-' + key);
        if (row) row.classList.add('removed-row');
        document.getElementById('action-' + key).innerHTML = '<span style="color:#4ade80;font-size:12px">Removed</span>';
      }
    }

    function keepFile(filename) {
      const key = encodeURIComponent(filename);
      document.getElementById('action-' + key).innerHTML = '<span style="color:#fbbf24;font-size:12px">Kept — use caution</span>';
    }

    runScan();
  </script>
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
  const filename = path.basename(req.params.filename);
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
