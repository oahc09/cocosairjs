#!/usr/bin/env python3
"""One fresh diagnostic attempt using the byte-pinned, audited ALL_CHILDREN/ECHILD supervisor."""
import sys
sys.dont_write_bytecode = True
import hashlib
import importlib.util
import json
import os
from datetime import datetime, timezone
from pathlib import Path

SUPERVISOR_PATH = "tools/physics/box3d/lifecycle-contract/lowlevel/supervise.py"
SUPERVISOR_SHA256 = "d721d69135c4ab4fc8c09585fe835ff31555f6529525611dfcc29955fd7a021e"
BUDGET = {"wallSeconds": 334, "rssBytes": 2 * 1024**3, "outputBytes": 56 * 1024**2}
FREEZE_BUDGET = {"wallSeconds": 60, "rssBytes": 2 * 1024**3, "outputBytes": 2 * 1024**2}
PREPARATION_LIMIT = 8 * 1024**2
TOTAL_LIMIT = 64 * 1024**2
PASS = "PASS_LIMITED_C20APP_OBSERVABLE_SUBSET"


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
        json.dump(value, stream, indent=2)
        stream.write("\n")


def disk_bytes(root):
    return sum(path.stat().st_size for path in root.rglob("*") if path.is_file())


def all_descendants_closed(closure):
    return (closure.get("subreaper") is True and closure.get("waitpidECHILD") is True
            and closure.get("waitpidScope") == "ALL_CHILDREN_-1"
            and closure.get("remainingDescendants") == [] and closure.get("remainingProcessGroup") == [])


def main(argv):
    assert len(argv) == 8 and argv[0] == "--execute-authorized-once", (
        "execute-once.py --execute-authorized-once NODE SOURCE SDK NEW_ST EVIDENCE_ROOT PROVENANCE_REL FRESH_OUTPUT"
    )
    node, source, sdk, st, evidence = (Path(value).resolve() for value in argv[1:6])
    provenance_relative, output = argv[6], Path(argv[7]).resolve()
    here = Path(__file__).resolve().parent
    supervisor = source / SUPERVISOR_PATH
    assert digest(supervisor) == SUPERVISOR_SHA256
    assert not output.exists(), "Every attempt must have a fresh immutable output"
    for root in [source, sdk, st, here]:
        assert not output.is_relative_to(root), "Attempt output must not mutate input trees"
    output.mkdir(parents=True)
    preparation = output / "preparation"
    preparation.mkdir()
    lock_path = preparation / "input-lock.json"
    # This marker is not user permission. The caller must already have one-attempt authorization.
    (output / "attempt.once").write_text(now() + "\n")
    for key in list(os.environ):
        if key.startswith(("AIR_", "BOX3D_", "NODE_OPTIONS", "NODE_PATH", "C20_APP_")):
            os.environ.pop(key)
    os.environ["NODE_OPTIONS"] = ""
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    spec = importlib.util.spec_from_file_location("audited_c20_all_child_closure", supervisor)
    core = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(core)
    result = {"status": "NOT_READY", "runtime": "NOT_RUN", "startedAt": now(),
              "fullC20": "NOT_QUALIFIED", "I05": "NOT_QUALIFIED", "I06": "NOT_QUALIFIED",
              "afterAppCloseMemory": "UNAVAILABLE", "noAutomaticRetry": True,
              "historicalReplay": {"status": "UNAVAILABLE_ORIGINAL_RAW_NOT_RECOVERED",
                  "originalJournalSha256": "64ca22991a9945df10dcb6d879ce9797cc27c375d267d40ed24fa075830827bf",
                  "scope": "Separate historical gap; not a historical replay PASS or full DoD closure"}}
    protected = [row(node), row(supervisor), row(Path(__file__))]
    write_json(preparation / "intent.json", {"at": now(), "flagIsNotUserPermission": True,
               "closureCore": row(supervisor), "wrapper": row(Path(__file__)),
               "mainBudget": BUDGET, "freezeBudget": FREEZE_BUDGET, "cpuSeconds": 30,
               "consumerSeconds": 300, "closeSeconds": 4, "preparationOutputLimit": PREPARATION_LIMIT,
               "combinedOutputLimit": TOTAL_LIMIT, "noWarmupRebaseRetryOrSecondModule": True})
    try:
        freeze = core.run_supervised(
            [str(node), str(here / "freeze.mjs"), str(source), str(sdk), str(st), str(evidence),
             provenance_relative, str(lock_path)], preparation / "freeze", FREEZE_BUDGET, 4)
        result["freezeClosure"] = row(preparation / "freeze/closure.json")
        assert freeze["status"] == "PHYSICALLY_CLOSED" and all_descendants_closed(freeze), "NOT_READY: input freeze rejected"
        lock = read_json(lock_path)
        for base, records in [(source, lock["source"]), (sdk, lock["sdk"]), (st, lock["st"]),
                              (here, lock["runner"]), (source, lock["imported"]),
                              (here.parents[4], lock["imported"]),
                              (evidence, list(lock["provenance"]["receipts"].values()) + [lock["provenanceFile"]])]:
            for item in records:
                path = base / item["path"]
                actual = row(path)
                assert actual["bytes"] == item["bytes"] and actual["sha256"] == item["sha256"]
                protected.append(actual)
        protected.append(row(lock_path))
        write_json(preparation / "protected-inputs.json", {"at": now(), "files": protected})
        assert disk_bytes(preparation) < PREPARATION_LIMIT
        result["inputLock"] = row(lock_path)
        result["producerIdentity"] = {key: lock["provenance"][key] for key in
                                      ["fixtureCommit", "runtimeProducerCommit", "nativeProducerCommit", "runtimeBuildNumber"]}
        result["status"] = "FAIL_OR_PARTIAL"
        result["runtime"] = "RUNNER_ATTEMPTED; consumer runtime determined from retained consumer.raw.json"
        write_json(preparation / "runner-start.json", {"at": now(), "inputLock": row(lock_path)})
        print(json.dumps({"event": "C20APP_MEMORY_RUNNER_START", "at": now(), "output": str(output),
                          "lockSha256": digest(lock_path)}), flush=True)
        main_root = output / "main"
        closure = core.run_supervised(
            [str(node), str(here / "run.mjs"), "--authorized-c20app-memory-fresh-st", str(source),
             str(sdk), str(st), str(evidence), str(lock_path), str(main_root / "run")], main_root, BUDGET, 4)
        result["closure"] = row(main_root / "closure.json")
        result["allDescendantsClosed"] = all_descendants_closed(closure)
        result["rawReturnCode"] = closure["rawReturnCode"]
        result["budgetViolation"] = closure["budgetViolation"]
        raw = main_root / "run/result/consumer.raw.json"
        if raw.exists():
            consumer = read_json(raw)
            result["runtime"] = "CONSUMER_REPORT_RETAINED"
            for key in ["status", "strictStatus", "memoryDiagnosticStatus", "completedCycles", "totalSteps", "appCreateCalls", "appCloseCalls", "error", "closeError", "inputError"]:
                if key in consumer:
                    result["consumer_" + key] = consumer[key]
        else:
            result["runtime"] = "NO_CONSUMER_REPORT; inspect CPU/process/closure evidence"
        for name in ["process.raw.json", "result/consumer.raw.json", "result/observations.raw.jsonl", "result/memory-diagnostics.raw.jsonl"]:
            path = main_root / "run" / name
            if path.exists():
                result[name] = row(path)
        process = main_root / "run/process.raw.json"
        if (closure["status"] == "PHYSICALLY_CLOSED" and all_descendants_closed(closure)
                and process.exists() and read_json(process)["status"] == PASS):
            result["status"] = PASS
    except BaseException as error:
        result["error"] = repr(error)
    finally:
        changed = [item["path"] for item in protected if not Path(item["path"]).is_file()
                   or Path(item["path"]).stat().st_size != item["bytes"] or digest(item["path"]) != item["sha256"]]
        result["protectedInputChanges"] = changed
        result["protectedFiles"] = len(protected)
        if changed:
            result["status"] = "FAIL_OR_PARTIAL"
        result["finishedAt"] = now()
        result["retainedOutputBytesBeforeSummary"] = disk_bytes(output)
        if disk_bytes(preparation) > PREPARATION_LIMIT:
            result["status"] = "FAIL_OR_PARTIAL"
            result["preparationOutputViolation"] = True
        # Account for the final immutable summary itself, not merely the bytes before it.
        result["retainedOutputBytesIncludingSummary"] = 0
        for _ in range(12):
            total = result["retainedOutputBytesBeforeSummary"] + len((json.dumps(result, indent=2) + "\n").encode())
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
