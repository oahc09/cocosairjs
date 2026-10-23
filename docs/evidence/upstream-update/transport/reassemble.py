#!/usr/bin/env python3
"""Verify raw evidence chunks and recreate the two pinned original archives.

Python 3.8+ standard library only. No extraction, downloads, or overwrites.
The publication directory must be trusted and must not be modified concurrently.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import sys
import tempfile


SCHEMA = "cocosairjs-evidence-transport-v1"
SOURCE_COMMIT = "e40a9cf779400c317abdc9350dbe984b37d2b5e4"
SOURCE_TREE = "5d28c75644a22ec700d931e867d79a6e3e691dc9"
CHUNK_BYTES = 1024 * 1024
PREFIX = "docs/evidence/upstream-update/"
PINNED = (
    (PREFIX + "m4-final-attempts.tar.gz", 10614256,
     "0d22c547bcf17dfdd9dc9b60d7f736b9d3a7ec80c906b7c52f9c09fb35f43d5e",
     "a6c49ec2ddf9eba0fdae0aa4aa12f9df85b7e600"),
    (PREFIX + "m4-sdk-compatibility-audit.tar.gz", 14077710,
     "4e5b0831f31a08a77c4cb4857989d043392793fbcc7541b4b233044b186b43a8",
     "71cb923b1d9a54e28830e2e1ae9c2166dc2efb0c"),
)


class TransportError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise TransportError(message)


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate JSON key: " + key)
        result[key] = value
    return result


def exact_keys(value, keys, label):
    require(type(value) is dict and set(value) == set(keys),
            "invalid fields in " + label)


def regular_file(path):
    require(stat.S_ISREG(path.lstat().st_mode),
            "not a regular non-symlink file: " + str(path))


def real_directory(path):
    require(stat.S_ISDIR(path.lstat().st_mode),
            "not a non-symlink directory: " + str(path))


def load_manifest(transport):
    real_directory(transport)
    real_directory(transport / "chunks")
    path = transport / "manifest.json"
    regular_file(path)
    data = json.loads(path.read_text(encoding="utf-8"),
                      object_pairs_hook=unique_object)
    exact_keys(data, ("schema", "source_commit", "source_tree", "source_status",
                      "encoding", "chunk_bytes", "archives"), "manifest")
    require(data["schema"] == SCHEMA, "unsupported manifest schema")
    require(data["source_commit"] == SOURCE_COMMIT, "source commit changed")
    require(data["source_tree"] == SOURCE_TREE, "source tree changed")
    require(data["source_status"] == "BLOCKED", "source status must remain BLOCKED")
    require(data["encoding"] == "raw-byte-slices", "encoding changed")
    require(type(data["chunk_bytes"]) is int and data["chunk_bytes"] == CHUNK_BYTES,
            "chunk size changed")
    archives = data["archives"]
    require(type(archives) is list and len(archives) == len(PINNED),
            "missing or duplicate archive")
    seen_paths = set()
    seen_digests = set()
    for archive, pinned in zip(archives, PINNED):
        exact_keys(archive, ("path", "bytes", "sha256", "git_blob_sha1", "chunks"),
                   "archive")
        require(type(archive["bytes"]) is int, "archive byte count must be integer")
        require(tuple(archive[k] for k in ("path", "bytes", "sha256", "git_blob_sha1"))
                == pinned, "archive identity or order changed")
        chunks = archive["chunks"]
        count = (archive["bytes"] + CHUNK_BYTES - 1) // CHUNK_BYTES
        require(type(chunks) is list and len(chunks) == count,
                "missing or duplicate chunk record")
        offset = 0
        for index, chunk in enumerate(chunks, 1):
            exact_keys(chunk, ("index", "offset", "path", "bytes", "sha256", "git_blob_sha1"),
                       "chunk")
            expected_path = "chunks/{}.part-{:04d}".format(Path(archive["path"]).name, index)
            require(chunk["path"] == expected_path, "chunk path, order, or duplicate invalid")
            require(all(type(chunk[key]) is int for key in ("index", "offset", "bytes")),
                    "chunk numeric fields must be integers")
            require(chunk["index"] == index and chunk["offset"] == offset,
                    "chunk index or offset out of order")
            expected_size = min(CHUNK_BYTES, archive["bytes"] - offset)
            require(chunk["bytes"] == expected_size, "chunk byte count invalid")
            for key, length in (("sha256", 64), ("git_blob_sha1", 40)):
                value = chunk[key]
                require(type(value) is str and re.fullmatch("[0-9a-f]{%d}" % length, value),
                        "invalid " + key)
            require(chunk["path"] not in seen_paths, "duplicate chunk path")
            require(chunk["sha256"] not in seen_digests, "duplicate chunk content record")
            seen_paths.add(chunk["path"])
            seen_digests.add(chunk["sha256"])
            part = transport / chunk["path"]
            regular_file(part)
            require(part.stat().st_size == chunk["bytes"], "chunk size mismatch: " + chunk["path"])
            offset += chunk["bytes"]
        require(offset == archive["bytes"], "archive size total mismatch")
    present = {"chunks/" + p.name for p in (transport / "chunks").iterdir()}
    require(present == seen_paths, "missing or unexpected chunk files")
    return data


def check_output_paths(root, archives):
    real_directory(root)
    for archive in archives:
        destination = root / archive["path"]
        require(not os.path.lexists(destination),
                "refusing existing output: " + str(destination))
        cursor = root
        for component in Path(archive["path"]).parts[:-1]:
            cursor = cursor / component
            if os.path.lexists(cursor):
                real_directory(cursor)


def git_hash(size):
    digest = hashlib.sha1()
    digest.update(b"blob " + str(size).encode("ascii") + b"\0")
    return digest


def assemble_one(transport, archive, staged):
    whole_sha = hashlib.sha256()
    whole_git = git_hash(archive["bytes"])
    total = 0
    with staged.open("xb") as output:
        for chunk in archive["chunks"]:
            part = transport / chunk["path"]
            regular_file(part)
            sha = hashlib.sha256()
            git = git_hash(chunk["bytes"])
            count = 0
            with part.open("rb") as source:
                require(stat.S_ISREG(os.fstat(source.fileno()).st_mode), "chunk changed file type")
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    count += len(block)
                    require(count <= chunk["bytes"], "chunk grew while reading")
                    sha.update(block)
                    git.update(block)
                    whole_sha.update(block)
                    whole_git.update(block)
                    output.write(block)
            require(count == chunk["bytes"] and sha.hexdigest() == chunk["sha256"]
                    and git.hexdigest() == chunk["git_blob_sha1"],
                    "chunk checksum mismatch: " + chunk["path"])
            total += count
        output.flush()
        os.fsync(output.fileno())
    require(total == archive["bytes"] and whole_sha.hexdigest() == archive["sha256"]
            and whole_git.hexdigest() == archive["git_blob_sha1"],
            "assembled archive identity mismatch: " + archive["path"])
    os.chmod(staged, 0o644)


def reassemble(transport, output_root):
    """Return receipt; reject invalid input and never overwrite an output.

    All bytes are verified before publication. Caught failures roll back only
    outputs this run created. No portable two-file operation is crash-atomic.
    """
    transport = Path(transport).absolute()
    output_root = Path(output_root).absolute()
    manifest = load_manifest(transport)
    archives = manifest["archives"]
    check_output_paths(output_root, archives)
    staging = None
    published = []
    created_dirs = []
    success = False
    try:
        staging = Path(tempfile.mkdtemp(prefix=".evidence-reassembly-", dir=str(output_root)))
        for archive in archives:
            assemble_one(transport, archive, staging / Path(archive["path"]).name)
        # Recheck after reading all chunks, before creating destination directories.
        check_output_paths(output_root, archives)
        for archive in archives:
            cursor = output_root
            for component in Path(archive["path"]).parts[:-1]:
                cursor = cursor / component
                try:
                    cursor.mkdir()
                    created_dirs.append(cursor)
                except FileExistsError:
                    real_directory(cursor)
        for archive in archives:
            staged = staging / Path(archive["path"]).name
            destination = output_root / archive["path"]
            # Hard-link creation is atomic and fails if the target already exists.
            # No overwrite-capable rename or copy fallback is permitted.
            inode = staged.stat()
            published.append(((inode.st_dev, inode.st_ino), destination))
            os.link(staged, destination)
        # Cleanup is part of the transaction: an error here still rolls back
        # publications. Stored inode identities remain usable if a staging
        # filename has already been removed by a partially completed cleanup.
        shutil.rmtree(staging)
        staging = None
        success = True
        return {"result": "PASS", "source_status": "BLOCKED",
                "source_commit": SOURCE_COMMIT, "source_tree": SOURCE_TREE,
                "archives": [{k: a[k] for k in ("path", "bytes", "sha256", "git_blob_sha1")}
                             for a in archives]}
    finally:
        if not success:
            for identity, destination in reversed(published):
                if os.path.lexists(destination):
                    inode = destination.lstat()
                    if stat.S_ISREG(inode.st_mode) and (inode.st_dev, inode.st_ino) == identity:
                        destination.unlink()
        if staging is not None and staging.exists():
            shutil.rmtree(staging)
        if not success:
            for directory in reversed(created_dirs):
                try:
                    directory.rmdir()
                except OSError:
                    pass  # Never remove files another process placed here.


def interrupted(signum, frame):
    raise TransportError("interrupted by signal " + str(signum))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", type=Path,
                        help="existing repository root; defaults to the root inferred from this script's publication path")
    args = parser.parse_args()
    transport = Path(__file__).absolute().parent
    output_root = args.output_root if args.output_root is not None else transport.parents[3]
    signal.signal(signal.SIGTERM, interrupted)
    try:
        receipt = reassemble(transport, output_root)
    except (TransportError, OSError, ValueError, KeyboardInterrupt) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        return 1
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
