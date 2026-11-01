#!/usr/bin/env python3
"""One explicit fresh attempt; audited full-descendant supervisor, never PGID-only closure."""
import sys
sys.dont_write_bytecode = True
import hashlib
import importlib.util
import json
import os
import stat
from datetime import datetime, timezone
from pathlib import Path

SUPERVISOR_PATH = "tools/physics/box3d/lifecycle-contract/lowlevel/supervise.py"
SUPERVISOR_SHA256 = "d721d69135c4ab4fc8c09585fe835ff31555f6529525611dfcc29955fd7a021e"
BUDGET = {"wallSeconds": 334, "rssBytes": 2 * 1024**3, "outputBytes": 56 * 1024**2}
READONLY_BUDGET = {"wallSeconds": 60, "rssBytes": 2 * 1024**3, "outputBytes": 2 * 1024**2}
PREPARATION_LIMIT = 8 * 1024**2
TOTAL_LIMIT = 64 * 1024**2
PASS = "PASS_PUBLIC_MODULE_RELEASE_SUBSET"


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def row(path):
    path = Path(path)
    return {"path": str(path), "bytes": path.stat().st_size, "sha256": digest(path)}


def read_json(path):
    return json.loads(Path(path).read_text())


def write_json(path, value):
    with Path(path).open("x") as stream:
        json.dump(value, stream, separators=(",", ":"))
        stream.write("\n")


def disk_bytes(root):
    """Fail-closed retained-output accounting; never follow links or silently skip scan errors."""
    root = Path(root)
    if not stat.S_ISDIR(root.lstat().st_mode):
        raise ValueError("Output root must be an ordinary directory, not a link")

    def scan_error(error):
        raise error

    total = 0
    for current, directories, files in os.walk(root, topdown=True, onerror=scan_error, followlinks=False):
        base = Path(current)
        if not stat.S_ISDIR(base.lstat().st_mode):
            raise ValueError("Output directory changed type or became a symlink")
        for name in directories:
            if not stat.S_ISDIR((base / name).lstat().st_mode):
                raise ValueError("Output directory symlink or non-directory is forbidden")
        for name in files:
            value = (base / name).lstat()
            if not stat.S_ISREG(value.st_mode):
                raise ValueError("Only ordinary output files are allowed; links/special entities are forbidden")
            total += value.st_size
    return total


def all_descendants_closed(closure):
    return (closure.get("subreaper") is True and closure.get("waitpidECHILD") is True
            and closure.get("waitpidScope") == "ALL_CHILDREN_-1"
            and closure.get("remainingDescendants") == [] and closure.get("remainingProcessGroup") == [])


def clean_child(closure):
    return (closure.get("status") == "PHYSICALLY_CLOSED" and all_descendants_closed(closure)
            and closure.get("rawReturnCode") == 0 and closure.get("budgetViolation") is None)


def main(argv):
    assert len(argv) == 8 and argv[0] == "--execute-authorized-once", (
        "execute-once.py --execute-authorized-once NODE SOURCE SDK NEW_ST EVIDENCE_ROOT PROVENANCE_REL FRESH_OUTPUT"
    )
    node, source, sdk, st, evidence = (Path(value).resolve() for value in argv[1:6])
    provenance_relative, output = argv[6], Path(argv[7]).resolve()
    here = Path(__file__).resolve().parent
    supervisor = source / SUPERVISOR_PATH
    assert digest(supervisor) == SUPERVISOR_SHA256
    assert not output.exists(), "Every attempt must use a fresh immutable output"
    for root in [source, sdk, st, here, evidence]:
        assert not output.is_relative_to(root), "Output cannot mutate an input tree"
    output.mkdir(parents=True)
    preparation = output / "preparation"
    preparation.mkdir()
    lock_path = preparation / "input-lock.json"
    (output / "attempt.once").write_text(now() + "\n")
    for key in list(os.environ):
        if key.startswith(("AIR_", "BOX3D_", "NODE_OPTIONS", "NODE_PATH", "C20_APP_")):
            os.environ.pop(key)
    os.environ["NODE_OPTIONS"] = ""
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    spec = importlib.util.spec_from_file_location("audited_module_all_child_closure", supervisor)
    core = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(core)
    result = {"status": "NOT_READY", "runtime": "NOT_RUN", "startedAt": now(),
              "fullT15": "NOT_QUALIFIED", "fullC20": "NOT_QUALIFIED", "I05": "NOT_QUALIFIED",
              "I06": "NOT_QUALIFIED", "moduleTerminalReceipt": "NOT_OBSERVED", "allNativeHandles": "NOT_QUALIFIED", "mallocOrHeapOrGC": "NOT_QUALIFIED", "noAutomaticRetry": True}
    protected = [row(node), row(supervisor), row(Path(__file__))]
    lock = None
    write_json(preparation / "intent.json", {"at": now(), "flagIsNotUserPermission": True,
               "closureCore": row(supervisor), "wrapper": row(Path(__file__)), "mainBudget": BUDGET,
               "readonlyFreezeAndPostverifyEach": READONLY_BUDGET, "cpuSeconds": 30,
               "consumerSeconds": 300, "closeSeconds": 4, "preparationOutputLimit": PREPARATION_LIMIT,
               "combinedOutputLimit": TOTAL_LIMIT, "noWarmupRetryOrSecondModule": True})
    try:
        closure = core.run_supervised(
            [str(node), str(here / "inputs.mjs"), "--freeze", str(source), str(sdk), str(st),
             str(evidence), provenance_relative, str(lock_path)], preparation / "freeze", READONLY_BUDGET, 4)
        result["freezeClosure"] = row(preparation / "freeze/closure.json")
        assert clean_child(closure), "NOT_READY: readonly freeze did not succeed/close"
        lock = read_json(lock_path)
        producer_root = Path(lock["readiness"]["nativeProducerLayout"]["provenanceRoot"])
        for base, records in [(source, lock["source"]), (sdk, lock["sdk"]), (st, lock["stTree"]),
                              (here, lock["runner"]), (source, lock["imported"]),
                              (producer_root, lock["producerInputs"]),
                              (evidence, list(lock["provenance"]["receipts"].values()) + [lock["provenanceFile"]])]:
            for item in records:
                actual = row(base / item["path"])
                assert actual["bytes"] == item["bytes"] and actual["sha256"] == item["sha256"]
                protected.append(actual)
        protected.append(row(lock_path))
        write_json(preparation / "protected-inputs.json", {"at": now(), "files": protected,
                   "dependencyInventoryInLock": lock["dependencies"]["sha256"]})
        assert disk_bytes(preparation) < PREPARATION_LIMIT
        result["inputLock"] = row(lock_path)
        result["producerIdentity"] = {key: lock["provenance"][key] for key in
                                      ["fixtureCommit", "runtimeProducerCommit", "nativeProducerCommit", "runtimeBuildNumber"]}
        result["status"] = "FAIL_OR_PARTIAL"
        result["runtime"] = "RUNNER_ATTEMPTED"
        write_json(preparation / "runner-start.json", {"at": now(), "inputLock": row(lock_path)})
        print(json.dumps({"event": "MODULE_RELEASE_RUNNER_START", "at": now(), "output": str(output),
                          "lockSha256": digest(lock_path)}), flush=True)
        main_root = output / "main"
        closure = core.run_supervised(
            [str(node), str(here / "run.mjs"), "--authorized-module-release-fresh-st", str(source),
             str(sdk), str(st), str(evidence), str(lock_path), str(main_root / "run")], main_root, BUDGET, 4)
        result["closure"] = row(main_root / "closure.json")
        result["allDescendantsClosed"] = all_descendants_closed(closure)
        result["rawReturnCode"] = closure["rawReturnCode"]
        result["budgetViolation"] = closure["budgetViolation"]
        for name in ["process.raw.json", "result/consumer.raw.json", "result/observations.raw.jsonl"]:
            path = main_root / "run" / name
            if path.exists():
                result[name] = row(path)
        raw = main_root / "run/result/consumer.raw.json"
        if raw.exists():
            consumer = read_json(raw)
            result["runtime"] = "CONSUMER_REPORT_RETAINED"
            result["moduleTerminalReceipt"] = consumer.get("moduleRelease", {}).get("status", "NOT_OBSERVED")
            for key in ["status", "fixtureStatus", "completedFrames", "appCreateCalls", "fixtureOwnCloseObserved", "fallbackCloseCalls", "error", "closeError", "inputError"]:
                if key in consumer:
                    result["consumer_" + key] = consumer[key]
        else:
            result["runtime"] = "NO_CONSUMER_REPORT; inspect CPU/process/closure evidence"
        process = main_root / "run/process.raw.json"
        if clean_child(closure) and process.exists() and read_json(process)["status"] == PASS:
            result["status"] = PASS
    except BaseException as error:
        result["error"] = repr(error)
    finally:
        # This is readonly postflight, not another physics attempt or a replacement main deadline.
        if lock is not None:
            try:
                post = core.run_supervised(
                    [str(node), str(here / "inputs.mjs"), "--verify", str(source), str(sdk), str(st),
                     str(evidence), str(lock_path)], preparation / "postverify", READONLY_BUDGET, 4)
                result["postverifyClosure"] = row(preparation / "postverify/closure.json")
                result["postverifyPassed"] = clean_child(post)
                if not result["postverifyPassed"]:
                    result["status"] = "FAIL_OR_PARTIAL"
            except BaseException as error:
                result["postverifyError"] = repr(error)
                result["status"] = "FAIL_OR_PARTIAL"
        changed = []
        for item in protected:
            try:
                actual = row(item["path"])
                if actual != item:
                    changed.append(item["path"])
            except BaseException as error:
                changed.append(item["path"])
                result.setdefault("protectionReadErrors", []).append({"path": item["path"], "error": repr(error)})
        result["protectedInputChanges"] = changed
        result["protectedFiles"] = len(protected)
        if changed:
            result["status"] = "FAIL_OR_PARTIAL"
        result["finishedAt"] = now()
        result["preparationOutputBytes"] = disk_bytes(preparation)
        result["retainedOutputBytesBeforeSummary"] = disk_bytes(output)
        if result["preparationOutputBytes"] > PREPARATION_LIMIT:
            result["status"] = "FAIL_OR_PARTIAL"
            result["preparationOutputViolation"] = True
        result["retainedOutputBytesIncludingSummary"] = 0
        for _ in range(12):
            total = result["retainedOutputBytesBeforeSummary"] + len((json.dumps(result, separators=(",", ":")) + "\n").encode())
            if total > TOTAL_LIMIT:
                result["status"] = "FAIL_OR_PARTIAL"
                result["combinedOutputViolation"] = True
            if result["retainedOutputBytesIncludingSummary"] == total:
                break
            result["retainedOutputBytesIncludingSummary"] = total
        write_json(output / "result.json", result)
        print(json.dumps(result), flush=True)
    return 0 if result["status"] == PASS else 2 if result["status"] == "NOT_READY" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
