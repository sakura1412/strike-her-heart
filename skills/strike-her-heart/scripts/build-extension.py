#!/usr/bin/env python3
"""Package the single maintained overlay runtime as an unpacked MV3 extension."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile


def main():
    skill_dir = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path.cwd() / "build" / "strike-her-heart-extension")
    parser.add_argument("--zip", action="store_true", help="Also create a zip next to the output folder")
    args = parser.parse_args()
    target = args.output.expanduser().resolve()
    assets = skill_dir / "assets"
    sources = {
        "manifest.json": assets / "extension" / "manifest.json",
        "service-worker.js": assets / "extension" / "service-worker.js",
        "overlay.js": assets / "overlay.js",
        "site-adapters/sge.js": assets / "site-adapters" / "sge.js",
    }
    for name, path in sources.items():
        if not path.is_file():
            parser.error(f"Missing required source: {path}")
        if target == path.parent or target in path.parents:
            parser.error("Output must be a separate build folder, outside the skill source")
    manifest = json.loads(sources["manifest.json"].read_text())
    if manifest.get("permissions") != ["activeTab", "scripting"] or "host_permissions" in manifest:
        parser.error("Extension must retain its minimal activeTab + scripting permissions")
    marker = target / ".strike-her-heart-build"
    if target.exists() and any(target.iterdir()) and not marker.is_file():
        parser.error(f"Refusing to overwrite a nonempty folder not created by this script: {target}")
    target.mkdir(parents=True, exist_ok=True)
    for name, source in sources.items():
        (target / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target / name)
    marker.write_text("Generated Strike Her Heart extension. Rebuild from the skill sources.\n")
    report = {
        "extension_dir": str(target),
        "overlay_sha256": hashlib.sha256((target / "overlay.js").read_bytes()).hexdigest(),
        "source_sha256": {name: hashlib.sha256((target / name).read_bytes()).hexdigest() for name in sorted(sources)},
        "files": sorted(sources),
    }
    if args.zip:
        archive = target.with_suffix(".zip")
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
            for name in sorted(sources):
                output.write(target / name, name)
        report["zip"] = str(archive)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
