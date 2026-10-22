"""Independent read-only review of finite actual AIR/Node WASM fixture records.

Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
This is not an independent engine implementation, browser or complete T09 gate.
"""
import hashlib
import json
import math
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def review(directory):
    receipt_path = directory / "receipt.json"
    raw_path = directory / "native-and-app.raw.json"
    receipt = json.loads(receipt_path.read_text())
    raw = json.loads(raw_path.read_text())
    assert receipt["status"] == raw["status"] == "PASS_LIMITED_NODE_WORLD"
    assert receipt["child"] == {"exitCode": 0, "signal": None, "error": None}
    assert receipt["nativeReportSha256"] == sha(raw_path)
    assert receipt["inputsUnchanged"] is True
    for record in (receipt, raw):
        assert record["sourceHashesBefore"] == record["sourceHashesAfter"]
        for name, digest in record["sourceHashesAfter"].items():
            assert sha(ROOT / name) == digest, name
    points = {item["name"]: item["data"] for item in raw["checkpoints"]}
    assert len(points) == len(raw["checkpoints"]) == 8
    poses = points["custom-gravity-real-trajectory"]["poses"]
    assert len(poses) == 60
    # Independently derive semi-implicit Euler freefall over four solver substeps.
    # Do not use fixture-computed expected values or its loose endpoint tolerance.
    position_errors, velocity_errors = [], []
    h, g = 1 / 240, -6
    for tick, pose in enumerate(poses, 1):
        assert len(pose) == 29 and all(math.isfinite(v) for v in pose)
        steps = tick * 4
        expected_y = 20 + g * h * h * steps * (steps + 1) / 2
        expected_vy = g * h * steps
        position_errors.append(abs(pose[1] - expected_y))
        velocity_errors.append(abs(pose[8] - expected_vy))
        assert pose[0] == pose[2] == pose[7] == pose[9] == 0
    assert max(position_errors) < 2e-5
    assert max(velocity_errors) < 2e-5
    final = points["real-sleep-transition-and-final-counts"]
    assert final["fellAsleepAt"] == 30
    assert final["counts"]["bodies"] == 3 and final["counts"]["shapes"] == 4
    step_calls = [call for call in raw["calls"] if call["name"] == "step"]
    assert all(call["returned"] for call in step_calls)
    assert len(step_calls) == final["native"]["nativeStepIndex"] == 95
    assert points["actual-fixed-loop-no-second-clock"]["native"]["nativeStepIndex"] == 64
    for name in ("createWorld", "destroyWorld"):
        assert len([c for c in raw["calls"] if c["name"] == name and c["returned"]]) == 1
    for flag, kind, count in ((1, "line", 216), (4, "bounds", 3)):
        debug = points[f"native-debug-{flag}"]["debug"]
        assert len(debug["primitives"]) == count
        assert all(row["kind"] == kind for row in debug["primitives"])
    assert raw["observationErrors"] == []
    assert raw["initialCoreBytes"] == raw["beforeBindingDispose"]["coreBytes"] == "0"
    assert raw["initialBridge"] == raw["beforeBindingDispose"]["bridge"] == {
        "liveBytes": "0", "liveAllocations": 0, "shapeHandles": 0,
        "primitiveCapacity": 0, "capturedPrimitives": 0,
    }
    assert raw["loaderAfter"]["status"] == "DISPOSED"
    assert raw["loaderAfter"]["cleanupErrors"] == []
    return {
        "input": str(directory.relative_to(ROOT)),
        "receiptSHA256": sha(receipt_path), "rawSHA256": sha(raw_path),
        "steps": len(step_calls), "trajectorySamples": len(poses),
        "maximumPositionErrorMeters": max(position_errors),
        "maximumVelocityErrorMetersPerSecond": max(velocity_errors),
        "finalY": poses[-1][1], "finalVy": poses[-1][8],
        "sleepTick": final["fellAsleepAt"], "allTrackedCoreAndBridgeBytesAfterClose": 0,
    }


if __name__ == "__main__":
    results = [review(Path(argument).resolve()) for argument in sys.argv[1:]]
    assert results, "Pass one or more evidence directories"
    print(json.dumps({"status": "PASS_SCOPED_INDEPENDENT_RAW_REVIEW",
                      "reviewerSHA256": sha(Path(__file__).resolve()), "runs": results,
                      "scope": "Finite Node/JSDOM AIR source fixture only. Known HEADLESS and missing PhysicsSystem2D diagnostics remain; no browser, coexistence, components or full T09 acceptance."}, indent=2))
