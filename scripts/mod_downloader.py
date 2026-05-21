import urllib.request
import json
import os
import re

GAME_VERSION = "1.20.1"
LOADER = "forge"
DOWNLOADS_DIR = "downloads"


class DownloadProgress:
    def __init__(self, filename):
        self.filename = filename

    def __call__(self, block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            pct = min(downloaded / total_size * 100, 100)
            print(f"\r  {self.filename}: {pct:.1f}%", end="", flush=True)
        else:
            print(f"\r  {self.filename}: {downloaded / 1024 / 1024:.1f} MB", end="", flush=True)


def fetch_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def get_modrinth_download(url):
    match = re.search(r'modrinth\.com/(?:mod|plugin|modpack)/([^/?#]+)', url)
    if not match:
        raise ValueError("Could not parse Modrinth URL. Expected: https://modrinth.com/mod/<name>")
    slug = match.group(1)

    print(f"Looking up '{slug}' on Modrinth...")
    versions_url = (
        f"https://api.modrinth.com/v2/project/{slug}/version"
        f"?game_versions=%5B%22{GAME_VERSION}%22%5D&loaders=%5B%22{LOADER}%22%5D"
    )
    versions = fetch_json(versions_url, headers={"User-Agent": "ModDownloader/1.0"})

    if not versions:
        raise ValueError(f"No versions found for Minecraft {GAME_VERSION} + {LOADER.capitalize()}")

    latest = versions[0]
    print(f"Found: {latest['name']} (version {latest['version_number']})")

    for f in latest["files"]:
        if f.get("primary"):
            return f["url"], f["filename"]
    return latest["files"][0]["url"], latest["files"][0]["filename"]


def get_curseforge_download(url):
    match = re.search(r'curseforge\.com/minecraft/mc-mods/([^/?#]+)', url)
    if not match:
        raise ValueError("Could not parse CurseForge URL. Expected: https://www.curseforge.com/minecraft/mc-mods/<name>")
    slug = match.group(1)

    print(f"Looking up '{slug}' on CurseForge...")
    data = fetch_json(
        f"https://api.cfwidget.com/minecraft/mc-mods/{slug}",
        headers={"User-Agent": "Mozilla/5.0 (compatible; ModDownloader/1.0)"},
    )

    # Filter files for the right game version and Forge loader
    files = [
        f for f in data.get("files", [])
        if GAME_VERSION in f.get("versions", []) and "Forge" in f.get("versions", [])
    ]

    if not files:
        raise ValueError(f"No Forge {GAME_VERSION} files found for '{slug}'")

    # Sort by upload date, newest first
    files.sort(key=lambda f: f.get("uploaded_at", ""), reverse=True)
    newest = files[0]

    print(f"Found: {data['title']} — {newest['display']}")

    # Build direct CDN download URL from file ID
    file_id = str(newest["id"])
    part1 = file_id[:-3]
    part2 = file_id[-3:]
    filename = newest["name"]
    download_url = f"https://mediafilez.forgecdn.net/files/{part1}/{part2}/{filename}"

    return download_url, filename


def download_file(download_url, filename):
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    save_path = os.path.join(DOWNLOADS_DIR, filename)
    print(f"Downloading to: {save_path}")
    urllib.request.urlretrieve(download_url, save_path, reporthook=DownloadProgress(filename))
    print()
    size = os.path.getsize(save_path)
    print(f"Done! Saved {filename} ({size / 1024 / 1024:.1f} MB)")
    return save_path


def process_mod_url(url):
    url = url.strip()
    print(f"\nProcessing: {url}")

    if "modrinth.com" in url:
        download_url, filename = get_modrinth_download(url)
    elif "curseforge.com" in url:
        download_url, filename = get_curseforge_download(url)
    else:
        raise ValueError("URL must be from modrinth.com or curseforge.com")

    print(f"Download URL: {download_url}")
    download_file(download_url, filename)


if __name__ == "__main__":
    # --- Add your mod links here ---
    mod_links = [
        "https://modrinth.com/mod/jei",
    ]

    for link in mod_links:
        try:
            process_mod_url(link)
        except Exception as e:
            print(f"\nError: {e}")
