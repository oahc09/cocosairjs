"""Review source-bound coexistence raw records without importing either facade.
Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
This review does not turn Node/JSDOM into browser or component acceptance.
"""
import collections
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CASES = {"both", "2d-failure", "3d-failure", "init-failure", "3d-only",
         "2d-builtin", "2d-cannon", "default-builtin", "default-cannon"}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def review(directory):
    r = json.loads((directory / "receipt.json").read_text())
    assert r["status"] == "PASS_LIMITED_NODE_COEXIST" and r["inputsUnchanged"]
    assert r["sourceHashesBefore"] == r["sourceHashesAfter"]
    for path, digest in r["sourceHashesAfter"].items():
        assert sha(ROOT / path) == digest, path
    names = [c["scenario"] for c in r["cases"]]
    assert len(names) == len(set(names)) and set(names) <= CASES
    out = []
    for case in r["cases"]:
        name = case["scenario"]
        p = directory / name / "native-and-app.raw.json"
        assert sha(p) == case["rawSha256"]
        d = json.loads(p.read_text())
        expected = "EXPECTED_REJECTION" if name.endswith("failure") else "PASS_LIMITED_NODE_COEXIST"
        assert d["status"] == case["status"] == expected
        assert case["child"] == {"exitCode": 0, "signal": None, "error": None}
        assert d["sourceHashesBefore"] == d["sourceHashesAfter"] == r["sourceHashesBefore"]
        assert d["observationErrors"] == []
        points = {x["name"]: x["data"] for x in d["checkpoints"]}
        calls = collections.Counter((c["backend"], c["name"]) for c in d["calls"] if c["returned"])
        detail = {"scenario": name, "status": expected, "rawSHA256": sha(p)}
        if name == "both":
            data = points["independent-real-system-stepping"]
            assert len(data["poses2D"]) == len(data["poses3D"]) == 60
            assert calls[("2d", "step")] == calls[("3d", "step")] == 60
            errors = []
            for tick, (p2, p3) in enumerate(zip(data["poses2D"], data["poses3D"]), 1):
                k, h = tick * 4, 1 / 240
                errors.append(abs(p2["y"] - (20 - 4 * h * h * k * (k + 1) / 2)))
                errors.append(abs(p3[1] - (20 - 6 * h * h * k * (k + 1) / 2)))
                assert abs(p2["vy"] + 4 * tick / 60) < 2e-5
                assert abs(p3[8] + 6 * tick / 60) < 2e-5
            assert max(errors) < 2e-5
            detail["maximumDiscreteFreefallPositionErrorMeters"] = max(errors)
        if name.endswith("failure"):
            failure = points["expected-failure-and-owned-cleanup"]
            assert failure["preparation"]["status"] == "failed"
            assert failure["preparation"]["cleanupErrors"] == failure["errors"] == []
            assert failure["twoD"]["leases"] == failure["twoD"]["pendingAcquisitions"] == 0
            assert failure["twoD"]["moduleReferenced"] is False
            if name == "2d-failure":
                assert not d["requests3D"] and not d["module2D"] and not d["module3D"]
                assert not d["calls"] and not failure["preparation"]["acquired"]
            if name == "3d-failure":
                assert d["module2D"] and not d["module3D"] and not d["calls"]
                assert [(x["resource"], x["cleanup"]) for x in failure["preparation"]["acquired"]] == [("application-lease", "released")]
            if name == "init-failure":
                assert d["module2D"] and d["module3D"]
                assert points["actual-post-subsystem-worlds"]
        if d["module3D"]:
            assert d["before3DDispose"]["coreBytes"] == d["initial3DBytes"] == "0"
            assert d["before3DDispose"]["bridge"]["liveBytes"] == "0"
            assert all(d["before3DDispose"]["bridge"][k] == 0 for k in
                       ("liveAllocations", "shapeHandles", "primitiveCapacity", "capturedPrimitives"))
            assert d["loaderBeforeFallback"]["status"] == "DISPOSED"
            assert calls[("3d", "createWorld")] == calls[("3d", "destroyWorld")] == 1
        if name in ("both", "init-failure", "2d-builtin", "2d-cannon"):
            assert calls[("2d", "createWorld")] == calls[("2d", "destroyWorld")] == 1
        if name in ("default-builtin", "default-cannon"):
            assert not d["requests2D"] and not d["requests3D"]
        out.append(detail)
    return {"input": str(directory.relative_to(ROOT)), "allNineCasesPresent": set(names) == CASES,
            "caseCount": len(names), "cases": out}


if __name__ == "__main__":
    result = [review(Path(arg).resolve()) for arg in sys.argv[1:]]
    assert result
    print(json.dumps({"status": "PASS_SCOPED_INDEPENDENT_RAW_REVIEW",
                      "reviewerSHA256": sha(Path(__file__).resolve()), "runs": result,
                      "scope": "Actual Node/JSDOM source fixtures and real native artifacts only; no browser, public components, package or complete T09 Gate."}, indent=2))
