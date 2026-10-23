# Lossless evidence transport

**Overall upstream-update status remains BLOCKED.** This is a storage-layout adaptation, not an engine fix, a new test conclusion, or approval to merge or deploy. Reassemble both archives at their exact original relative paths before running evidence consumers.

## Immutable source

- Source candidate commit: `e40a9cf779400c317abdc9350dbe984b37d2b5e4`
- Exact original Git tree: `5d28c75644a22ec700d931e867d79a6e3e691dc9`
- Original archives and source history are immutable. This adaptation does not rewrite, amend, or replace that history.
- A transport-layout publication tree is intentionally different from the original tree: it replaces only the two large archive entries with their raw chunks and the transport support files in this directory. Every unrelated source, third-party file, license, and existing test conclusion must remain unchanged.

Original evidence identities:

1. `docs/evidence/upstream-update/m4-final-attempts.tar.gz`
   - Bytes: `10614256`
   - SHA-256: `0d22c547bcf17dfdd9dc9b60d7f736b9d3a7ec80c906b7c52f9c09fb35f43d5e`
   - Git blob SHA-1: `a6c49ec2ddf9eba0fdae0aa4aa12f9df85b7e600`
2. `docs/evidence/upstream-update/m4-sdk-compatibility-audit.tar.gz`
   - Bytes: `14077710`
   - SHA-256: `4e5b0831f31a08a77c4cb4857989d043392793fbcc7541b4b233044b186b43a8`
   - Git blob SHA-1: `71cb923b1d9a54e28830e2e1ae9c2166dc2efb0c`

## Why there are chunks

The Git Data connector has a 16 MiB technical request-payload limit; base64 representation can exceed that limit for the original evidence blobs. This is not a policy denial. The first 6 MiB chunk request also disconnected without a response; a subsequent read of its exact Git blob returned 404. That attempt and the earlier transport-only validation are retained in `history/`. This revision uses twenty-five raw chunks of at most 1 MiB (`1048576`) each, below previously successful payload sizes. Each chunk is an unchanged contiguous slice of the original compressed archive; a full-size chunk has approximately 1.34 MiB of base64 content, leaving conservative request-envelope headroom.

The originals are not extracted, recompressed, reencoded, or otherwise altered. The chunk files are ordinary non-executable binary data, not self-extracting archives. The manifest records chunk order, offsets, byte counts, SHA-256, and Git blob SHA-1, plus the same complete-archive identities. Git blob identities include Git's `blob <byte-count>\0` header, unlike a plain file SHA-1.

## Reassemble before consuming evidence

Requirements: Python 3.8 or later, standard library only, and a filesystem supporting ordinary hard links. No network, Git installation, package installation, or archive extraction is required by the reassembler.

From the root of the transport-layout checkout:

```sh
python3 docs/evidence/upstream-update/transport/reassemble.py --output-root .
```

The existing output root receives exactly these two files:

```text
docs/evidence/upstream-update/m4-final-attempts.tar.gz
docs/evidence/upstream-update/m4-sdk-compatibility-audit.tar.gz
```

The script prints a JSON receipt only on success and exits nonzero on an error. It intentionally refuses any existing output, even if the existing file is identical. Do not delete or overwrite existing evidence to rerun it. Instead, create a separate empty verification directory and supply that directory as `--output-root`; the same relative paths will be recreated beneath it.

Both complete archives are verified against identities pinned in the script before either is published. Chunk filenames, indexes, offsets, sizes, checksums, archive order, and manifest keys are validated. Missing, corrupt, reordered, duplicated, unexpected, symlinked, or path-traversing chunk inputs fail closed. Existing output files, directories, or symlinks are not overwritten. If hard-link publication is unsupported, the script fails rather than falling back to an overwrite-prone method.

Use trusted input and output directories without concurrent changes. Publication uses atomic no-clobber hard links per file, with rollback of files created by this run on caught validation, publication, or cleanup errors and ordinary interruption. This is not a crash-atomic transaction across two files: forced termination, power loss, or a filesystem that refuses cleanup can leave staging or completed files. The `.evidence-reassembly-*` name identifies staging directories. Inspect any interrupted run before retrying; existing outputs still cause a refusal and are never silently replaced.

Allow approximately 25 MB of free disk space for reconstructed archive bytes, plus filesystem overhead. The temporary files and published archives share inodes while publication completes, so publication does not make a second full copy.

## Validation

Run the transport-only regression suite:

```sh
python3 docs/evidence/upstream-update/transport/test_reassemble.py
```

The suite uses temporary directories beneath this transport directory and cleans them up. It tests the actual evidence chunks, not fabricated replacement evidence. `VALIDATION.json` records the passing regression count and independent reassembly verification using explicit ordered concatenation, byte comparison, SHA-256, Git blob hashing, and gzip integrity checks against the immutable originals.

These checks establish transport integrity only. They do not rerun or change the original project's M4 gates, browser tests, SDK audit findings, licensing decisions, or overall BLOCKED status.

New Markdown and JSON follow the original repository's `.prettierrc.json` conventions. The original `.prettierignore` excludes `docs/evidence/`; no original evidence or source file was reformatted.
