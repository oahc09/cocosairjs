# Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""Immutable focused evidence. Sequential subprocesses: at most one Node process.

No source edits, builds, native/WASM execution, cleanup, Git, or external access.
Own fixture/source inputs are snapshotted by content before every attempt. Loaded
transitive engine inputs are fingerprinted before/after, not copied wholesale.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path.cwd()
PREFIX = "tools/verify/box3d/system-entry-fence-control"
STORE = Path("tools/verify/box3d/system-entry-fence-source-20261022-a")
OUT = Path(sys.argv[1])
if OUT.exists():
    raise RuntimeError("A new nonexistent output directory is required.")
OUT.mkdir(parents=True)
STORE.mkdir(exist_ok=True)


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + "\n")


started = now()
controls = [PREFIX + suffix for suffix in [".py", ".test.ts", ".jest.cjs", ".tsconfig.json"]]
inputs = controls + [
    "src/cocos/physics/framework/physics-system.ts",
    "src/cocos/core/data/mutation-guard.ts",
    "docs/physics/box3d/contracts/unified-admission-fence-v1.md",
    "jest.config.js", "test/setup-dom.js", "test/setup-engine.js",
    "test/tsconfig.jest.json", "tsconfig.json",
    "tools/verify/box3d/tsconfig.world-control.json", "package.json", "package-lock.json",
    ".prettierrc.json", ".prettierignore", "babel.config.js",
]
before = {p: digest(p) for p in inputs}
snapshots = {}
for p, sha in before.items():
    target = STORE / sha
    data = Path(p).read_bytes()
    if target.exists():
        if target.read_bytes() != data:
            raise RuntimeError("Immutable snapshot identity mismatch: " + p)
    else:
        with target.open("xb") as handle:
            handle.write(data)
    snapshots[p] = {"sha256": sha, "snapshot": str(target)}
write_json(OUT / "inputs.json", {"startedAt": started, "inputs": snapshots})
engine_before = {str(p): digest(p) for base in ["src", "test"] for p in Path(base).rglob("*") if p.is_file()}
commands = []


def run(name, args, extra_env=None):
    env = dict(os.environ)
    env.update(extra_env or {})
    command = ["node"] + args
    begin = now()
    with (OUT / (name + ".stdout.txt")).open("wb") as stdout, (OUT / (name + ".stderr.txt")).open("wb") as stderr:
        result = subprocess.run(command, env=env, stdout=stdout, stderr=stderr, check=False)
    commands.append({"name": name, "command": command, "extraEnv": extra_env or {},
                     "startedAt": begin, "completedAt": now(), "exitCode": result.returncode})
    write_json(OUT / "commands.json", commands)


run("format", ["node_modules/prettier/bin/prettier.cjs", "--check"] + controls[1:])
run("tsc", ["node_modules/typescript/bin/tsc", "--noEmit", "-p", PREFIX + ".tsconfig.json"])
run("jest", ["node_modules/jest/bin/jest.js", "--config", PREFIX + ".jest.cjs", "--runInBand", "--no-cache", "--json", "--outputFile", str((OUT / "jest-result.json").resolve())],
    {"BOX3D_SYSTEM_ENTRY_RAW": str((OUT / "raw.json").resolve())})
after = {p: digest(p) for p in inputs}
raw_path = OUT / "raw.json"
raw = json.loads(raw_path.read_text()) if raw_path.exists() else None
loaded_before = {item["path"]: engine_before.get(item["path"]) for item in (raw or {}).get("loadedEngineSources", [])}
loaded_after = {item["path"]: digest(item["path"]) for item in (raw or {}).get("loadedEngineSources", [])}
loaded_end = {item["path"]: item["sha256"] for item in (raw or {}).get("loadedEngineSources", [])}
consistent = bool(raw) and all(check["passed"] == (check["actual"] == check["expected"]) for row in raw["rows"] for check in row["checks"])
unchanged = before == after and loaded_before == loaded_end == loaded_after
passed = all(command["exitCode"] == 0 for command in commands) and consistent and unchanged
receipt = {"scope": "Actual PhysicsSystem source with explicit opt-in leases; counted mock World delegates only. No actual World transactions, native/WASM or runtime builds.",
           "status": "PASS_ACTUAL_SYSTEM_SOURCE_ONLY" if passed else "FAIL_RETAINED",
           "startedAt": started, "completedAt": now(), "commands": commands,
           "inputsManifestSha256": digest(OUT / "inputs.json"), "sourcesBefore": before, "sourcesAfter": after,
           "loadedEngineHashesBefore": loaded_before, "loadedEngineHashesAfter": loaded_after,
           "sourcesUnchanged": unchanged, "recordedChecksConsistent": consistent,
           "rows": [{"name": row["name"], "status": row.get("status", "FIXTURE_FAILURE"), "fixtureFailure": row.get("fixtureFailure"),
                     "checks": len(row["checks"]), "failedChecks": sum(not check["passed"] for check in row["checks"])} for row in (raw or {}).get("rows", [])],
           "rawSha256": digest(raw_path) if raw_path.exists() else None}
write_json(OUT / "receipt.json", receipt)
print(json.dumps({"status": receipt["status"], "commands": {c["name"]: c["exitCode"] for c in commands},
                  "cases": len(receipt["rows"]), "checks": sum(row["checks"] for row in receipt["rows"]),
                  "failedChecks": sum(row["failedChecks"] for row in receipt["rows"]),
                  "fixtureFailures": [row for row in receipt["rows"] if row["fixtureFailure"]],
                  "sourcesUnchanged": unchanged, "recordedChecksConsistent": consistent}))
sys.exit(0 if passed else 1)
