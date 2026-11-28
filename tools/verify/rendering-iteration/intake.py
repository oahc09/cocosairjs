"""Read-only v1.3 package verification. Never import or execute packaged scripts."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import struct
import zipfile

SCENES = {f"E{i:02}" for i in range(1, 13)}
RENDER_TASKS = {f"R{i:02}" for i in range(18)}
AGENT_TASKS = {f"AF{i:02}" for i in range(8)}
MAX_MEMBER_BYTES = 20 * 1024 * 1024
MAX_TOTAL_BYTES = 64 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_unique(data):
    def no_duplicates(pairs):
        out = {}
        for key, value in pairs:
            require(key not in out, f"Duplicate JSON key: {key}")
            out[key] = value
        return out

    return json.loads(data, object_pairs_hook=no_duplicates)


def members_of(archive):
    members = archive.infolist()
    require(0 < len(members) <= 250, "Unexpected ZIP member count")
    require(sum(entry.file_size for entry in members) <= MAX_TOTAL_BYTES, "ZIP exceeds byte budget")
    root = None
    files = {}
    for entry in members:
        name = entry.filename
        parts = name.rstrip("/").split("/")
        require(
            all(p and p not in (".", "..") and ":" not in p for p in parts) and "\\" not in name,
            f"Non-canonical path: {name}",
        )
        root = root or parts[0]
        require(parts[0] == root, "Expected one archive root")
        kind = stat.S_IFMT(entry.external_attr >> 16)
        if entry.is_dir():
            require(kind in (0, stat.S_IFDIR), f"Invalid ZIP directory: {name}")
            continue
        require(kind in (0, stat.S_IFREG), f"Not a regular file: {name}")
        require(len(parts) > 1 and entry.file_size <= MAX_MEMBER_BYTES, f"Invalid ZIP member: {name}")
        rel = PurePosixPath(*parts[1:]).as_posix()
        require(rel not in files, f"Duplicate ZIP member: {rel}")
        files[rel] = entry
    return files


def png_size(bytes_):
    require(
        len(bytes_) >= 33 and bytes_[:16] == b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR",
        "Reference is not a PNG with a valid IHDR header",
    )
    width, height = struct.unpack_from(">II", bytes_, 16)
    require(0 < width <= 16384 and 0 < height <= 16384, "Invalid PNG dimensions")
    return [width, height]


def inspect(path):
    with path.open("rb") as bundle:
        require(path.stat().st_size <= MAX_TOTAL_BYTES, "Archive exceeds byte budget")
        archive_sha = hashlib.file_digest(bundle, "sha256").hexdigest()
        with zipfile.ZipFile(bundle) as archive:
            entries = members_of(archive)

            def read(name):
                require(name in entries, f"Missing ZIP member: {name}")
                return archive.read(entries[name])

            manifest = json_unique(read("file_manifest.json"))
            records = {item["path"]: item for item in manifest["files"]}
            require(len(records) == len(manifest["files"]), "Duplicate file manifest entry")
            require(set(records) == set(entries) - {"file_manifest.json"}, "Coverage differs from file manifest")
            for name, item in records.items():
                data = read(name)
                require(item["bytes"] == len(data) and item["sha256"] == sha(data), f"File identity differs: {name}")

            tasks = json_unique(read("execution/tasks.json"))
            require(tasks["planVersion"] == "1.3", "Expected implementation plan v1.3")
            render = tasks["renderTasks"]
            agent = tasks["aiWorkPackages"]
            require(len(render) == 18 and {task["id"] for task in render} == RENDER_TASKS, "R00–R17 incomplete")
            require(len(agent) == 8 and {task["id"] for task in agent} == AGENT_TASKS, "AF00–AF07 incomplete")
            baseline = tasks["baselineSha"]
            require(isinstance(baseline, str) and len(baseline) == 40 and
                    all(c in "0123456789abcdef" for c in baseline), "Invalid baseline SHA")
            result = []
            unique_refs = set()
            scenes = json_unique(read("scene_manifest.json"))["scenes"]
            require(len(scenes) == 12 and {scene["id"] for scene in scenes} == SCENES, "E01–E12 incomplete")
            for scene in sorted(scenes, key=lambda row: row["id"]):
                id_ = scene["id"]
                dependencies = scene["directDependencies"]
                require(bool(dependencies) and set(dependencies) <= RENDER_TASKS, f"{id_}: invalid dependencies")
                guide = scene["guide"]
                require(guide.startswith(f"guides/{id_}_") and guide in records, f"{id_}: invalid guide")
                reference = scene["visualReference"]
                reference_receipt = None
                if reference is not None:
                    require(reference.startswith(f"references/{id_}_") and reference in records, f"{id_}: invalid reference")
                    data = read(reference)
                    dimensions = png_size(data)
                    digest_ = sha(data)
                    require(scene["sha256"] == digest_ and scene["size"] == dimensions, f"{id_}: visual identity mismatch")
                    require(digest_ not in unique_refs, f"{id_}: duplicate image bytes")
                    unique_refs.add(digest_)
                    reference_receipt = {"path": reference, "sha256": digest_, "size": dimensions}
                else:
                    require(scene["visualType"] == "MISSING", f"{id_}: inconsistent missing reference")
                asset_dir = scene["assetDir"]
                require(asset_dir in (None, f"assets/{id_}"), f"{id_}: invalid asset directory")
                count = sum(name.startswith(f"{asset_dir}/") for name in records) if asset_dir else 0
                require(asset_dir is None or count > 0, f"{id_}: empty asset directory")
                result.append({
                    "id": id_,
                    "name": scene["name"],
                    "visualType": scene["visualType"],
                    "reference": reference_receipt,
                    "assetFiles": count,
                    "guide": guide,
                    "dependencies": dependencies,
                    "visualFreeze": "BLOCKED",
                    "runtimeAcceptance": "NOT_RUN",
                })

    return {
        "schemaVersion": 1,
        "scope": "archive identity and candidate inventory only",
        "archiveSha256": archive_sha,
        "verifiedFiles": len(records),
        "baselineSha": baseline,
        "engineGate": "NOT_EVALUATED",
        "visualGate": "BLOCKED",
        "scenes": result,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pack", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    try:
        receipt = inspect(args.pack)
        with args.out.open("x", encoding="utf-8") as out:
            json.dump(receipt, out, indent=2, ensure_ascii=False)
            out.write("\n")
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as exc:
        parser.exit(1, f"intake: {exc}\n")


if __name__ == "__main__":
    main()
