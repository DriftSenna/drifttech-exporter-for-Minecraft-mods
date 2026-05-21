"""
Given an unsafe mod filename, searches Modrinth for the closest safe Forge 1.20.1
alternative, downloads it, scans it, and returns the result as JSON.

All progress output goes to stderr so stdout stays clean for JSON.
"""

import sys
import re
import json
import urllib.request
import urllib.parse
import os

sys.path.insert(0, os.path.dirname(__file__))
from mod_downloader import (
    GAME_VERSION, LOADER, DOWNLOADS_DIR,
    MODRINTH_HEADERS, fetch_json, save_file, get_modrinth_primary_file,
    get_modrinth_versions,
)
from scan_mods import scan_jar


def log(*args):
    """Print progress to stderr so stdout stays clean for JSON output."""
    print(*args, file=sys.stderr, flush=True)


def name_from_filename(filename):
    """Extract a human-readable search term from a jar filename."""
    name = filename
    name = re.sub(r'\.jar$', '', name, flags=re.IGNORECASE)
    name = re.sub(r'[-_](forge|fabric|neoforge|quilt)([-_]|$).*', '', name, flags=re.IGNORECASE)
    name = re.sub(r'[-_]v?\d+\.\d+.*', '', name)
    name = re.sub(r'[-_]mc\d.*', '', name, flags=re.IGNORECASE)
    name = re.sub(r'\[.*?\]', '', name)
    name = re.sub(r'[-_]+', ' ', name).strip()
    return name


def search_modrinth(query, exclude_slugs=None, limit=8):
    exclude_slugs = exclude_slugs or set()
    q = urllib.parse.quote(query)
    facets = urllib.parse.quote(
        f'[["categories:{LOADER}"],["versions:{GAME_VERSION}"],["project_type:mod"]]'
    )
    url = f"https://api.modrinth.com/v2/search?query={q}&facets={facets}&limit={limit}"
    hits = fetch_json(url, headers=MODRINTH_HEADERS).get("hits", [])
    return [h for h in hits if h.get("slug") not in exclude_slugs]


def download_and_scan(project_id):
    versions = get_modrinth_versions(project_id)
    if not versions:
        return None
    latest = versions[0]
    dl_url, filename = get_modrinth_primary_file(latest)

    save_path = os.path.join(DOWNLOADS_DIR, filename)

    # Redirect stdout to stderr during download so progress doesn't pollute JSON
    real_stdout = sys.stdout
    sys.stdout = sys.stderr
    try:
        save_file(dl_url, filename)
    finally:
        sys.stdout = real_stdout

    scan = scan_jar(save_path)
    return {"filename": filename, "version": latest["version_number"], "scan": scan}


def replace_mod(unsafe_filename, original_slug=None):
    search_term = name_from_filename(unsafe_filename)
    log(f"Searching for Forge {GAME_VERSION} alternative for '{search_term}'...")

    exclude = {original_slug} if original_slug else set()
    hits = search_modrinth(search_term, exclude_slugs=exclude)

    if not hits:
        return {"error": f"No Forge {GAME_VERSION} alternatives found for '{search_term}'"}

    for hit in hits:
        log(f"Trying: {hit['title']} ({hit['slug']})...")
        result = download_and_scan(hit["project_id"])
        if result is None:
            log(f"  No Forge {GAME_VERSION} version available — skipping")
            continue
        if not result["scan"]["safe"]:
            log(f"  Failed safety scan — removing and trying next...")
            bad_path = os.path.join(DOWNLOADS_DIR, result["filename"])
            if os.path.exists(bad_path):
                os.remove(bad_path)
            continue
        log(f"  Safe! Using {result['filename']}")
        return {
            "replaced_with": result["filename"],
            "version": result["version"],
            "slug": hit["slug"],
            "title": hit["title"],
            "warnings": result["scan"]["warnings"],
        }

    return {"error": "All found alternatives also failed the safety scan"}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: replace_mod.py <filename> [original_slug]"}))
        sys.exit(1)

    filename = sys.argv[1]
    original_slug = sys.argv[2] if len(sys.argv) > 2 else None
    result = replace_mod(filename, original_slug)
    print(json.dumps(result))
