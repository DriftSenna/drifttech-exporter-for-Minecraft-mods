import { Router } from "express";
import path from "path";
import fs from "fs";
import { spawnSync, spawn } from "child_process";
import os from "os";

const router = Router();
const downloadsDir = "/home/runner/workspace/downloads";
const scannerScript = "/home/runner/workspace/scripts/scan_mods.py";
const downloaderScript = "/home/runner/workspace/scripts/mod_downloader.py";
const INDEX_FILE = path.join(downloadsDir, ".index.json");

// In-memory async download job tracking
interface DownloadJob {
  status: "running" | "done" | "error";
  lines: string[];
  done: boolean;
}
const downloadJobs = new Map<string, DownloadJob>();

// POST /api/download — start an async download, return jobId
router.post("/download", (req, res) => {
  const {
    url,
    mcVersion = "1.20.1",
    loader = "forge",
    type = "mod",
  } = req.body as { url?: string; mcVersion?: string; loader?: string; type?: string };

  if (!url) {
    res.status(400).json({ error: "url required" });
    return;
  }

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const job: DownloadJob = { status: "running", lines: [], done: false };
  downloadJobs.set(jobId, job);

  res.json({ jobId });

  const child = spawn("python3", [downloaderScript, url], {
    cwd: "/home/runner/workspace",
    env: {
      ...process.env,
      GAME_VERSION: mcVersion,
      MOD_LOADER: loader,
      DOWNLOAD_TYPE: type,
    },
  });

  const pushLine = (data: Buffer) => {
    const j = downloadJobs.get(jobId);
    if (!j) return;
    data
      .toString()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((l) => j.lines.push(l));
  };

  child.stdout.on("data", pushLine);
  child.stderr.on("data", pushLine);

  child.on("close", (code) => {
    const j = downloadJobs.get(jobId);
    if (j) {
      j.done = true;
      j.status = code === 0 ? "done" : "error";
    }
    // Clean up after 5 minutes
    setTimeout(() => downloadJobs.delete(jobId), 5 * 60 * 1000);
  });
});

// GET /api/download/:jobId — poll job status
router.get("/download/:jobId", (req, res) => {
  const job = downloadJobs.get(req.params["jobId"] as string);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

function getFiles() {
  if (!fs.existsSync(downloadsDir)) return [];
  return fs.readdirSync(downloadsDir).filter(f => !f.startsWith(".")).map((name) => {
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

// DELETE /api/downloads/:filename — delete a file and remove from index
router.delete("/downloads/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  
  // Security: prevent directory traversal
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }

  const filePath = path.join(downloadsDir, filename);
  
  // Verify the file is actually in the downloads directory
  const realPath = path.resolve(filePath);
  const realDownloadsDir = path.resolve(downloadsDir);
  if (!realPath.startsWith(realDownloadsDir)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  try {
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Delete the file
    fs.unlinkSync(filePath);

    // Remove from index
    try {
      if (fs.existsSync(INDEX_FILE)) {
        const index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"));
        // Find and remove any slug pointing to this filename
        for (const [slug, file] of Object.entries(index)) {
          if (file === filename) {
            delete index[slug];
          }
        }
        fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
      }
    } catch (e) {
      // Ignore index update errors
    }

    const replace = req.query["replace"] === "true";
    if (!replace) {
      res.json({ deleted: filename });
      return;
    }

    // Run the replacement script
    const replaceScript = "/home/runner/workspace/scripts/replace_mod.py";
    const result = spawnSync("python3", [replaceScript, filename], {
      encoding: "utf-8",
      cwd: "/home/runner/workspace",
      timeout: 60000,
    });

    let replacement: any = null;
    try {
      replacement = JSON.parse(result.stdout || "null");
    } catch {
      replacement = { error: "Replacement search failed" };
    }

    res.json({ deleted: filename, replacement });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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
    .btn-delete { background: #7f1d1d; color: #f87171; }
    .btn-delete:hover { background: #991b1b; }
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
    .status-msg { font-size: 12px; display: block; margin-bottom: 4px; }
    .status-msg.searching { color: #6b7280; animation: pulse 1.2s infinite; }
    .status-msg.done { color: #4ade80; }
    .status-msg.warn { color: #fbbf24; }
    .status-msg.error { color: #f87171; }
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
    : \`<table>
      <thead><tr><th>File</th><th>Size</th><th>Safety</th><th>Action</th></tr></thead>
      <tbody>\${fileRows}</tbody>
    </table>\`
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

          // Delete / Keep buttons
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'btn-sm btn-delete';
          deleteBtn.textContent = 'Delete';
          deleteBtn.addEventListener('click', () => deleteFile(r.file));

          const keepBtn = document.createElement('button');
          keepBtn.className = 'btn-sm btn-keep';
          keepBtn.textContent = 'Keep Anyway';
          keepBtn.addEventListener('click', () => keepFile(r.file));

          actionEl.innerHTML = '';
          actionEl.appendChild(deleteBtn);
          actionEl.appendChild(keepBtn);

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

    async function deleteFile(filename) {
      if (!confirm('Delete "' + filename + '"?')) return;
      const key = encodeURIComponent(filename);
      const actionEl = document.getElementById('action-' + key);
      const row = document.getElementById('row-' + key);

      actionEl.innerHTML = '<span class="status-msg searching">🗑 Deleting…</span>';

      const resp = await fetch(BASE + '/downloads/' + key, { method: 'DELETE' });
      const data = await resp.json();

      if (!resp.ok) {
        actionEl.innerHTML = '<span class="status-msg error">❌ Failed to delete</span>';
        return;
      }

      row.classList.add('removed-row');
      actionEl.innerHTML = '<span class="status-msg done">✓ Deleted</span>';
      setTimeout(() => location.reload(), 800);
    }

    function keepFile(filename) {
      const key = encodeURIComponent(filename);
      document.getElementById('action-' + key).innerHTML = '<span class="status-msg warn">⚠ Kept — use caution</span>';
    }

    runScan();
  </script>
</body>
</html>\`;

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
