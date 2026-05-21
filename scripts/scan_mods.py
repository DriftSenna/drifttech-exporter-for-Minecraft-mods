"""
Minecraft mod safety scanner.
Checks .jar files for known malware signatures before they are used.
"""

import zipfile
import os
import re
import json
import sys

DOWNLOADS_DIR = "downloads"

# Known malicious class paths and string patterns
# Sources: fractureiser incident report, Nekodetector, CF-Mods-Scan
MALICIOUS_CLASS_PATTERNS = [
    r"dev/covert/fractureiser",
    r"dev/covert/modmanager",
    r"Skyrage",
    r"turnstile",
    r"leyden",
    r"bladeren",
    r"damnation",
    r"Hook\$",
    r"Executor\$",
]

MALICIOUS_STRING_PATTERNS = [
    # Known fractureiser C2 / drop URLs
    r"85\.217\.144\.130",
    r"107\.189\.3\.101",
    r"files\.skyrage\.de",
    r"auth\.allosaurus\.dk",
    r"xor\.jellyfish\.sh",
    # Generic suspicious patterns in class files
    r"Runtime\.getRuntime\(\)\.exec",
    r"ProcessBuilder",
    r"discord\.com/api/webhooks",
]

SUSPICIOUS_INDICATORS = [
    # Suspicious but not conclusive — flag as warnings
    r"http://",          # plain HTTP (mods should use HTTPS)
    r"\.onion",          # tor hidden service
    r"base64",
]


def scan_jar(jar_path):
    issues = []
    warnings = []
    scanned_files = 0

    try:
        with zipfile.ZipFile(jar_path, "r") as zf:
            entries = zf.namelist()
            scanned_files = len(entries)

            for entry in entries:
                entry_lower = entry.lower()

                # Flag nested jars — common in stage-based malware
                if entry_lower.endswith(".jar") and not entry.startswith("META-INF"):
                    issues.append(f"Contains nested jar: {entry}")

                # Check class name against malicious patterns
                for pattern in MALICIOUS_CLASS_PATTERNS:
                    if re.search(pattern, entry, re.IGNORECASE):
                        issues.append(f"Malicious class detected: {entry}")
                        break

                # Read and scan file contents for string patterns
                if entry_lower.endswith((".class", ".json", ".toml", ".txt", ".js")):
                    try:
                        data = zf.read(entry)
                        text = data.decode("utf-8", errors="replace")

                        for pattern in MALICIOUS_STRING_PATTERNS:
                            if re.search(pattern, text):
                                issues.append(f"Malicious string pattern '{pattern}' in: {entry}")

                        for pattern in SUSPICIOUS_INDICATORS:
                            if re.search(pattern, text, re.IGNORECASE):
                                warnings.append(f"Suspicious indicator '{pattern}' in: {entry}")
                                break  # one warning per file is enough

                    except Exception:
                        pass

    except zipfile.BadZipFile:
        issues.append("File is not a valid zip/jar archive")
    except Exception as e:
        issues.append(f"Error reading file: {e}")

    return {
        "file": os.path.basename(jar_path),
        "scanned_files": scanned_files,
        "issues": issues,
        "warnings": warnings,
        "safe": len(issues) == 0,
    }


def scan_all(downloads_dir=DOWNLOADS_DIR):
    results = []
    if not os.path.exists(downloads_dir):
        return results

    for filename in sorted(os.listdir(downloads_dir)):
        if filename.endswith(".jar"):
            path = os.path.join(downloads_dir, filename)
            result = scan_jar(path)
            results.append(result)

    return results


if __name__ == "__main__":
    json_mode = "--json" in sys.argv
    results = scan_all()
    all_safe = all(r["safe"] for r in results)

    if json_mode:
        print(json.dumps(results))
        sys.exit(0 if all_safe else 1)

    print(f"\nScanned {len(results)} mod(s)\n")
    for r in results:
        status = "SAFE" if r["safe"] else "UNSAFE"
        warn = f"  ({len(r['warnings'])} warning(s))" if r["warnings"] else ""
        print(f"  [{status}] {r['file']}{warn}")
        for issue in r["issues"]:
            print(f"         Issue:   {issue}")
        for w in r["warnings"]:
            print(f"         Warning: {w}")

    print()
    if all_safe:
        print("All mods passed the safety scan.")
    else:
        print("WARNING: One or more mods failed the safety scan!")
        sys.exit(1)
