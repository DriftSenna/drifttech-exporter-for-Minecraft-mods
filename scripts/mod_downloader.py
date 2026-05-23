import urllib.request
import json
import os
import re
import sys

GAME_VERSION = os.environ.get("GAME_VERSION", "1.20.1")
LOADER = os.environ.get("MOD_LOADER", "forge")
DOWNLOAD_TYPE = os.environ.get("DOWNLOAD_TYPE", "mod")
DOWNLOADS_DIR = "downloads"
MODRINTH_HEADERS = {"User-Agent": "ModDownloader/1.0"}
CFWIDGET_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ModDownloader/1.0)"}
INDEX_FILE = os.path.join(DOWNLOADS_DIR, ".index.json")


# --------------------------------------------------------------------------- #
# Version-detection index
# --------------------------------------------------------------------------- #

def load_index():
    if os.path.exists(INDEX_FILE):
        try:
            with open(INDEX_FILE) as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_index(index):
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    with open(INDEX_FILE, "w") as f:
        json.dump(index, f, indent=2)


def register_download(slug, filename):
    """Track slug→filename so we can remove old versions."""
    index = load_index()
    old = index.get(slug)
    if old and old != filename:
        old_path = os.path.join(DOWNLOADS_DIR, old)
        if os.path.exists(old_path):
            os.remove(old_path)
            print(f"  Removed older version: {old}", file=sys.stderr)
    index[slug] = filename
    save_index(index)


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
            print(f"\r    {self.filename}: {pct:.1f}%", end="", file=sys.stderr, flush=True)
        else:
            print(f"\r    {self.filename}: {downloaded / 1024 / 1024:.1f} MB", end="", file=sys.stderr, flush=True)


def fetch_json(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def save_file(download_url, filename, slug=None, indent=""):
    os.makedirs(DOWNLOADS_DIR, exist_ok=True)
    save_path = os.path.join(DOWNLOADS_DIR, filename)

    if os.path.exists(save_path):
        print(f"{indent}  Already downloaded: {filename}")
        if slug:
            register_download(slug, filename)
        return save_path

    print(f"{indent}  Downloading: {filename}")
    urllib.request.urlretrieve(download_url, save_path, reporthook=DownloadProgress(filename))
    print(file=sys.stderr)
    size = os.path.getsize(save_path)
    print(f"{indent}  Saved {filename} ({size / 1024 / 1024:.1f} MB)")

    if slug:
        register_download(slug, filename)
    return save_path


# --------------------------------------------------------------------------- #
# Modrinth
# --------------------------------------------------------------------------- #

def get_modrinth_versions(project_id_or_slug, project_type=None):
    """Get versions for a project. Shaders & resource packs are loader-agnostic."""
    loaders_param = ""
    if project_type == "resourcepack":
        loaders_param = ""  # No loader filter for resource packs
    elif project_type == "shader":
        loaders_param = ""  # No loader filter for shaders
    else:
        loaders_param = f"&loaders=%5B%22{LOADER}%22%5D"

    url = (
        f"https://api.modrinth.com/v2/project/{project_id_or_slug}/version"
        f"?game_versions=%5B%22{GAME_VERSION}%22%5D{loaders_param}"
    )
    return fetch_json(url, headers=MODRINTH_HEADERS)


def get_modrinth_primary_file(version):
    for f in version["files"]:
        if f.get("primary"):
            return f["url"], f["filename"]
    return version["files"][0]["url"], version["files"][0]["filename"]


def search_modrinth(name, project_type="mod"):
    """Search Modrinth for a project by name and type, for current version/loader."""
    import urllib.parse
    query = urllib.parse.quote(name)
    if project_type == "resourcepack":
        facets = urllib.parse.quote(f'[["project_type:resourcepack"],["versions:{GAME_VERSION}"]]')
    elif project_type == "shader":
        facets = urllib.parse.quote(f'[["project_type:shader"],["versions:{GAME_VERSION}"]]')
    else:
        facets = urllib.parse.quote(f'[["categories:{LOADER}"],["versions:{GAME_VERSION}"],["project_type:mod"]]')
    url = f"https://api.modrinth.com/v2/search?query={query}&facets={facets}&limit=5"
    return fetch_json(url, headers=MODRINTH_HEADERS).get("hits", [])


def find_alternative(original_name, original_id, indent="", project_type="mod"):
    """Search Modrinth for the closest equivalent by name (respects project type)."""
    results = search_modrinth(original_name, project_type)
    results = [r for r in results if r.get("project_id") != original_id]
    if not results:
        return None
    best = results[0]
    return best["project_id"], best["slug"], best["title"]


def download_modrinth_mod(project_id_or_slug, downloaded_ids, indent="", project_type=None):
    pt = project_type or DOWNLOAD_TYPE
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
    type_label = {"resourcepack": "Resource Pack", "shader": "Shader"}.get(pt, "Mod")
    print(f"{indent}{type_label}: {name} (Modrinth: {slug})")

    versions = get_modrinth_versions(project_id, project_type=pt)
    if not versions:
        if pt == "mod":
            # Only search for alternatives for mods
            print(f"{indent}  No {LOADER}/{GAME_VERSION} version found — searching for an alternative...")
            alt = find_alternative(name, project_id, indent, project_type=pt)
            if alt:
                alt_id, alt_slug, alt_name = alt
                print(f"{indent}  Found alternative: {alt_name} (Modrinth: {alt_slug})")
                downloaded_ids.discard(project_id)
                return download_modrinth_mod(alt_id, downloaded_ids, indent, project_type=pt)
        # For shaders/resource packs, just skip if no version found
        print(f"{indent}  No compatible version found — skipping")
        return project_id

    latest = versions[0]
    print(f"{indent}  Version: {latest['version_number']}")
    download_url, filename = get_modrinth_primary_file(latest)
    save_file(download_url, filename, slug=slug, indent=indent)

    if pt == "mod":
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
# CurseForge (via cfwidget, with Modrinth fallback)
# --------------------------------------------------------------------------- #

def get_curseforge_metadata(slug):
    data = fetch_json(
        f"https://api.cfwidget.com/minecraft/mc-mods/{slug}",
        headers=CFWIDGET_HEADERS,
    )
    return data


def find_modrinth_equivalent(name):
    """Try to find the same mod on Modrinth."""
    results = search_modrinth(name, project_type="mod")
    if not results:
        return None
    for r in results:
        title_lower = r["title"].lower()
        name_lower = name.lower()
        if name_lower in title_lower or title_lower in name_lower:
            return r["project_id"], r["slug"], r["title"]
    return results[0]["project_id"], results[0]["slug"], results[0]["title"]


def download_curseforge_mod(slug, downloaded_ids, indent=""):
    key = f"cf:{slug}"
    if key in downloaded_ids:
        print(f"{indent}Skipping '{slug}' (already queued)")
        return
    downloaded_ids.add(key)

    try:
        data = get_curseforge_metadata(slug)
        name = data.get("title", slug)
    except Exception:
        name = slug
        data = {}

    print(f"{indent}CurseForge: {name} ({slug}) — checking Modrinth first...")

    modrinth_alt = find_modrinth_equivalent(name)
    if modrinth_alt:
        alt_id, alt_slug, alt_name = modrinth_alt
        print(f"{indent}  Found on Modrinth: {alt_name} ({alt_slug}) — using that instead")
        downloaded_ids.discard(key)
        download_modrinth_mod(alt_id, downloaded_ids, indent)
        return

    print(f"{indent}  Not found on Modrinth — skipping (CurseForge-only mods not supported)")
    return


# --------------------------------------------------------------------------- #
# Resource pack & shader helpers
# --------------------------------------------------------------------------- #

def process_resourcepack_url(slug_or_id, downloaded_ids):
    download_modrinth_mod(slug_or_id, downloaded_ids, project_type="resourcepack")


def process_shader_url(slug_or_id, downloaded_ids):
    download_modrinth_mod(slug_or_id, downloaded_ids, project_type="shader")


# --------------------------------------------------------------------------- #
# Main entry point
# --------------------------------------------------------------------------- #

def process_mod_url(url, downloaded_ids):
    url = url.strip()
    print(f"\nProcessing: {url}")

    if "modrinth.com" in url:
        # Modrinth supports mods, resource packs, shaders
        match = re.search(r'modrinth\.com/(?:mod|plugin|modpack|resourcepack|shader|datapack)/([^/?#&]+)', url)
        if not match:
            raise ValueError("Could not parse Modrinth URL")
        slug = match.group(1)
        if DOWNLOAD_TYPE == "resourcepack":
            process_resourcepack_url(slug, downloaded_ids)
        elif DOWNLOAD_TYPE == "shader":
            process_shader_url(slug, downloaded_ids)
        else:
            download_modrinth_mod(slug, downloaded_ids)

    elif "curseforge.com" in url:
        match = re.search(r'curseforge\.com/minecraft/mc-mods/([^/?#&]+)', url)
        if not match:
            raise ValueError("Could not parse CurseForge URL")
        download_curseforge_mod(match.group(1), downloaded_ids)

    else:
        raise ValueError("URL must be from modrinth.com or curseforge.com")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Filter out --flags, treat everything else as URLs
        urls = [a for a in sys.argv[1:] if not a.startswith("--")]
        if not urls:
            print("Usage: python scripts/mod_downloader.py <url> [url2] ...")
            sys.exit(0)
        mod_links = urls
    else:
        print("Usage: python scripts/mod_downloader.py <url> [url2] ...")
        print("Example: python scripts/mod_downloader.py https://modrinth.com/mod/jei")
        sys.exit(0)

    downloaded_ids: set = set()

    for link in mod_links:
        try:
            process_mod_url(link, downloaded_ids)
        except Exception as e:
            print(f"\n  Error: {e}")

    print(f"\nAll done! Files are in the '{DOWNLOADS_DIR}/' folder.")
