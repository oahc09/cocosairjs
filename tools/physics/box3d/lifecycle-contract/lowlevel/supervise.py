#!/usr/bin/env python3
"""Bounded Linux subreaper supervision, derived from the reviewed ST supervisor.
No build/install/retry. CLI requires explicit future authorization. Importing is CPU-only.
"""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

BUDGET = {"wallSeconds": 120, "rssBytes": 1073741824, "outputBytes": 16777216}
CLOSE_SECONDS = 4


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def descendants():
    """Complete current descendant tree, including adopted setsid/double-fork children."""
    rows = {}
    for path in Path("/proc").glob("[0-9]*/stat"):
        try:
            fields = path.read_text().rsplit(")", 1)[1].split()
            pid = int(path.parent.name)
            rows[pid] = {"pid": pid, "ppid": int(fields[1]), "pgid": int(fields[2]),
                         "startTime": fields[19], "state": fields[0],
                         "rssBytes": int(fields[21]) * os.sysconf("SC_PAGE_SIZE")}
        except (FileNotFoundError, ProcessLookupError):
            pass
    owned = {os.getpid()}
    while True:
        added = {pid for pid, row in rows.items() if row["ppid"] in owned} - owned
        if not added:
            return [rows[pid] for pid in owned if pid != os.getpid() and pid in rows]
        owned.update(added)


def signal_owned(rows, sig):
    for row in rows:
        try:
            fields = Path("/proc", str(row["pid"]), "stat").read_text().rsplit(")", 1)[1].split()
            if fields[19] == row["startTime"]:  # Never signal a reused/unrelated PID.
                os.kill(row["pid"], sig)
        except (FileNotFoundError, ProcessLookupError):
            pass


def run_supervised(command, root, budget=BUDGET, close_seconds=CLOSE_SECONDS):
    """The test API accepts CPU commands; the CLI below admits only this version's native runner."""
    root = Path(root)
    root.mkdir()  # Existing attempt, even empty, is forbidden.
    events = (root / "supervisor-events.jsonl").open("x")

    def emit(value):
        events.write(json.dumps(value) + "\n")
        events.flush()
        os.fsync(events.fileno())

    def save(name, value):
        with (root / name).open("x") as stream:
            json.dump(value, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())

    def output_size():
        return sum(path.stat().st_size for path in root.rglob("*") if path.is_file())

    started = time.monotonic()
    child = None
    returncode = None
    violation = None
    peak_rss = 0
    max_output = 0
    wait_rows = []
    external_signal = None
    old_handlers = {}
    subreaper = False
    echild = False
    remaining = []
    errors = []
    stdout = stderr = None

    def on_signal(sig, _frame):
        nonlocal external_signal
        external_signal = external_signal or sig

    def reap():
        nonlocal returncode
        while True:
            try:
                pid, status = os.waitpid(-1, os.WNOHANG)
            except ChildProcessError:
                return True
            if pid == 0:
                return False
            row = {"pid": pid, "rawWaitStatus": status, "exitCode": os.waitstatus_to_exitcode(status)}
            wait_rows.append(row)
            emit({"kind": "raw-wait", **row})
            if child is not None and pid == child.pid:
                returncode = row["exitCode"]
                child.returncode = returncode

    try:
        assert ctypes.CDLL(None).prctl(36, 1, 0, 0, 0) == 0, "Linux child subreaper is mandatory"
        subreaper = True
        for sig in (signal.SIGTERM, signal.SIGINT):
            old_handlers[sig] = signal.signal(sig, on_signal)
        save("supervision-start.json", {"command": command, "budget": budget,
             "terminationGraceSeconds": close_seconds, "subreaper": True,
             "inputLockSha256": digest(Path(command[-2])) if len(command) >= 7 else None,
             "runnerSha256": digest(Path(command[1])) if len(command) >= 2 else None,
             "nodeSha256": digest(Path(command[0])),
             "supervisorSha256": digest(Path(__file__).resolve())})
        stdout = (root / "stdout.raw").open("xb")
        stderr = (root / "stderr.raw").open("xb")
        child = subprocess.Popen(command, stdout=stdout, stderr=stderr, start_new_session=True)
        save("child-start.json", {"pid": child.pid, "processGroup": child.pid})
        while returncode is None:
            reap()
            if returncode is not None:
                break
            members = descendants()
            peak_rss = max(peak_rss, sum(row["rssBytes"] for row in members))
            max_output = max(max_output, output_size())
            elapsed = time.monotonic() - started
            if external_signal:
                violation = f"EXTERNAL_SIGNAL_{external_signal}"
            elif elapsed > budget["wallSeconds"]:
                violation = "WALL_BUDGET"
            elif peak_rss > budget["rssBytes"]:
                violation = "DESCENDANT_TREE_RSS_BUDGET"
            elif max_output > budget["outputBytes"]:
                violation = "RETAINED_OUTPUT_BUDGET"
            if violation:
                break
            time.sleep(0.025)
        reap()
        remaining = descendants()
        if remaining and returncode is not None:
            violation = violation or "DESCENDANTS_REMAIN_AFTER_RUNNER_EXIT"
    except BaseException as error:
        violation = violation or "SUPERVISOR_EXCEPTION"
        errors.append(repr(error))
        emit({"kind": "supervisor-error", "error": repr(error)})
    finally:
        # One original four-second close window; no blocking wait(), no deadline extension.
        closing_start = time.monotonic()
        closing_deadline = closing_start + close_seconds
        term_cutoff = closing_start + min(1.0, close_seconds / 2)
        try:
            while True:
                echild = reap()
                remaining = descendants()
                if echild and not remaining:
                    break
                now = time.monotonic()
                if now >= closing_deadline:
                    break
                sig = signal.SIGTERM if now < term_cutoff else signal.SIGKILL
                signal_owned(remaining, sig)
                emit({"kind": "close-signal", "signal": sig, "owned": remaining})
                time.sleep(min(0.025, max(0.0, closing_deadline - time.monotonic())))
            echild = reap()
            remaining = descendants()
        except BaseException as error:
            violation = violation or "CLOSE_EXCEPTION"
            errors.append(repr(error))
            emit({"kind": "close-error", "error": repr(error)})
        for stream in (stdout, stderr):
            if stream is not None:
                stream.flush()
                os.fsync(stream.fileno())
                stream.close()
        for sig, handler in old_handlers.items():
            signal.signal(sig, handler)
        if external_signal:
            violation = violation or f"EXTERNAL_SIGNAL_{external_signal}"
        elapsed = time.monotonic() - started
        max_output = max(max_output, output_size())
        if max_output > budget["outputBytes"]:
            violation = violation or "RETAINED_OUTPUT_BUDGET"
        if elapsed > budget["wallSeconds"] and violation is None:
            violation = "WALL_BUDGET"
        closed = returncode == 0 and subreaper and echild and not remaining and violation is None
        closure = {"status": "PHYSICALLY_CLOSED" if closed else "FAIL",
                   "exitCode": returncode if returncode is not None and returncode >= 0 else None,
                   "signal": -returncode if returncode is not None and returncode < 0 else None,
                   "rawReturnCode": returncode, "subreaper": subreaper,
                   "waitpidECHILD": echild, "waitpidScope": "ALL_CHILDREN_-1",
                   "remainingDescendants": remaining,
                   "remainingProcessGroup": [row for row in remaining if child and row["pgid"] == child.pid],
                   "budgetViolation": violation, "errors": errors, "rawWaitRows": wait_rows,
                   "budget": budget, "elapsedSeconds": elapsed,
                   "closeSeconds": time.monotonic() - closing_start, "closeBudgetSeconds": close_seconds,
                   "peakSampledDescendantRSSBytes": peak_rss, "retainedOutputBytes": max_output,
                   "samplingIntervalSeconds": 0.025,
                   "rssQualification": "sampled full descendant-tree RSS, not a kernel hard limit",
                   "reportSha256": digest(root / "run" / "report.json"),
                   "rawJournalSha256": digest(root / "run" / "events.jsonl"), "command": command, "nodeSha256": digest(Path(command[0]))}
        # Include the immutable final receipt itself in the retained-output total (fixed point).
        before_marker = output_size()
        for _ in range(10):
            total = before_marker + len(json.dumps(closure, indent=2).encode()) + 1
            if total > budget["outputBytes"]:
                closure["status"] = "FAIL"
                closure["budgetViolation"] = violation or "FINAL_MARKER_OUTPUT_BUDGET"
            if closure["retainedOutputBytes"] == total:
                break
            closure["retainedOutputBytes"] = total
        save("closure.json", closure)
        events.close()
    return closure


def main():
    assert len(sys.argv) == 7 and sys.argv[1] == "--authorized-fresh-native-c20", (
        "usage: supervise.py --authorized-fresh-native-c20 NODE RUNTIME SOURCE LOCK FRESH_ATTEMPT"
    )
    node, runtime, source, lock, target = map(lambda value: str(Path(value).resolve()), sys.argv[2:])
    command = [node, str(Path(__file__).resolve().with_name("run-native.mjs")), sys.argv[1],
               runtime, source, lock, str(Path(target) / "run")]
    result = run_supervised(command, target)
    print(json.dumps({"status": result["status"], "attempt": target, "rawReturnCode": result["rawReturnCode"]}))
    return 0 if result["status"] == "PHYSICALLY_CLOSED" else 1


if __name__ == "__main__":
    sys.exit(main())
