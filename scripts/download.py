import urllib.request
import os
import sys


class DownloadProgress:
    def __init__(self, filename):
        self.filename = filename

    def __call__(self, block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            pct = min(downloaded / total_size * 100, 100)
            print(f"\r{self.filename}: {pct:.1f}%", end="", flush=True)
        else:
            print(f"\r{self.filename}: {downloaded / 1024:.1f} KB downloaded", end="", flush=True)


def download_file(url, save_path=None):
    if save_path is None:
        save_path = url.split("/")[-1] or "downloaded_file"

    filename = os.path.basename(save_path)
    print(f"Downloading: {url}")
    urllib.request.urlretrieve(url, save_path, reporthook=DownloadProgress(filename))
    print()
    size = os.path.getsize(save_path)
    print(f"Saved: {save_path} ({size / 1024:.1f} KB)")


def download_many(links, folder="downloads"):
    os.makedirs(folder, exist_ok=True)
    for url in links:
        filename = url.split("/")[-1] or "file"
        download_file(url, os.path.join(folder, filename))


if __name__ == "__main__":
    # --- Edit your URLs here ---
    urls = [
        "https://www.example.com/file.pdf",   # replace with your actual link(s)
    ]

    # Download all files into the "downloads" folder
    download_many(urls, folder="downloads")
