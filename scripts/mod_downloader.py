import urllib.request
import json
import os
import re

GAME_VERSION = "1.20.1"
LOADER = "forge"
DOWNLOADS_DIR = "downloads"
MODRINTH_HEADERS = {"User-Agent": "ModDownloader/1.0"}
CFWIDGET_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ModDownloader/1.0)"}


# --------------------------------------------------------------------------- #
# Progress & helpers
# --------------------------------------------------------------------------- #

class DownloadProgress:
    def __init__(self, filename):
        self.filename = filename

    def __call__(self, block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            pct = min(downloaded / total_size * 100, 100)
            print(f"\r    {self.filename}: {pct:.1f}%", end="", flush=True)
        else:
            print(f"\r    {self.filename}: {downloaded / 1024 / 1024:.1f} MB", end="", flush=True)


def fetch_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def save_file(download_url, filename, indent=""):
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    save_path = os.path.join(DOWNLOADS_DIR, filename)

    if os.path.exists(save_path):
        print(f"{indent}  Already downloaded: {filename}")
        return save_path

    print(f"{indent}  Downloading: {filename}")
    urllib.request.urlretrieve(download_url, save_path, reporthook=DownloadProgress(filename))
    print()
    size = os.path.getsize(save_path)
    print(f"{indent}  Saved {filename} ({size / 1024 / 1024:.1f} MB)")
    return save_path


# --------------------------------------------------------------------------- #
# Modrinth
# --------------------------------------------------------------------------- #

def get_modrinth_versions(project_id_or_slug):
    url = (
        f"https://api.modrinth.com/v2/project/{project_id_or_slug}/version"
        f"?game_versions=%5B%22{GAME_VERSION}%22%5D&loaders=%5B%22{LOADER}%22%5D"
    )
    return fetch_json(url, headers=MODRINTH_HEADERS)


def get_modrinth_primary_file(version):
    for f in version["files"]:
        if f.get("primary"):
            return f["url"], f["filename"]
    return version["files"][0]["url"], version["files"][0]["filename"]


def download_modrinth_mod(project_id_or_slug, downloaded_ids, indent=""):
    """Download a mod and all its required dependencies. Returns project_id or None."""

    # Resolve to project ID first so we can de-duplicate by ID
    project = fetch_json(
        f"https://api.modrinth.com/v2/project/{project_id_or_slug}",
        headers=MODRINTH_HEADERS,
    )
    project_id = project["id"]
    slug = project["slug"]
    name = project["title"]

    if project_id in downloaded_ids:
        print(f"{indent}Skipping '{name}' (already queued)")
        return project_id

    downloaded_ids.add(project_id)
    print(f"{indent}Mod: {name} (Modrinth: {slug})")

    versions = get_modrinth_versions(project_id)
    if not versions:
        print(f"{indent}  WARNING: No Forge {GAME_VERSION} version found — skipping")
        return project_id

    latest = versions[0]
    print(f"{indent}  Version: {latest['version_number']}")

    download_url, filename = get_modrinth_primary_file(latest)
    save_file(download_url, filename, indent=indent)

    # Resolve required dependencies
    deps = [d for d in latest.get("dependencies", []) if d["dependency_type"] == "required"]
    if deps:
        print(f"{indent}  Dependencies ({len(deps)}):")
        for dep in deps:
            dep_id = dep.get("project_id")
            if not dep_id:
                continue
            download_modrinth_mod(dep_id, downloaded_ids, indent=indent + "    ")

    return project_id


# --------------------------------------------------------------------------- #
# CurseForge (via cfwidget — no API key needed)
# --------------------------------------------------------------------------- #

def get_curseforge_download(slug):
    data = fetch_json(
        f"https://api.cfwidget.com/minecraft/mc-mods/{slug}",
        headers=CFWIDGET_HEADERS,
    )

    files = [
        f for f in data.get("files", [])
        if GAME_VERSION in f.get("versions", []) and "Forge" in f.get("versions", [])
    ]

    if not files:
        raise ValueError(f"No Forge {GAME_VERSION} files found for '{slug}'")

    files.sort(key=lambda f: f.get("uploaded_at", ""), reverse=True)
    newest = files[0]

    file_id = str(newest["id"])
    part1, part2 = file_id[:-3], file_id[-3:]
    filename = newest["name"]
    download_url = f"https://mediafilez.forgecdn.net/files/{part1}/{part2}/{filename}"

    return download_url, filename, data.get("title", slug)


def download_curseforge_mod(slug, downloaded_ids, indent=""):
    key = f"cf:{slug}"
    if key in downloaded_ids:
        print(f"{indent}Skipping '{slug}' (already queued)")
        return

    downloaded_ids.add(key)

    download_url, filename, name = get_curseforge_download(slug)
    print(f"{indent}Mod: {name} (CurseForge: {slug})")
    print(f"{indent}  File: {filename}")
    save_file(download_url, filename, indent=indent)

    print(f"{indent}  Note: CurseForge dependency resolution requires a manual check.")


# --------------------------------------------------------------------------- #
# Main entry point
# --------------------------------------------------------------------------- #

def process_mod_url(url, downloaded_ids):
    url = url.strip()
    print(f"\nProcessing: {url}")

    if "modrinth.com" in url:
        match = re.search(r'modrinth\.com/(?:mod|plugin|modpack)/([^/?#]+)', url)
        if not match:
            raise ValueError("Could not parse Modrinth URL")
        download_modrinth_mod(match.group(1), downloaded_ids)

    elif "curseforge.com" in url:
        match = re.search(r'curseforge\.com/minecraft/mc-mods/([^/?#]+)', url)
        if not match:
            raise ValueError("Could not parse CurseForge URL")
        download_curseforge_mod(match.group(1), downloaded_ids)

    else:
        raise ValueError("URL must be from modrinth.com or curseforge.com")


if __name__ == "__main__":
    # --- Add your mod links here ---
    mod_links = [
        "https://modrinth.com/mod/jei",
    ]

    downloaded_ids = set()  # tracks what's already been queued to avoid duplicates

    for link in mod_links:
        try:
            process_mod_url(link, downloaded_ids)
        except Exception as e:
            print(f"\n  Error: {e}")

    print(f"\nAll done! Files are in the '{DOWNLOADS_DIR}/' folder.")
