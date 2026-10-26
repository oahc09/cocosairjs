#!/usr/bin/env python3
"""CPU process-only supervision tests. No WASM, native fixture, build, or network execution."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("c20_supervisor", Path(__file__).with_name("supervise.py"))
supervisor = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(supervisor)


class SupervisionCPU(unittest.TestCase):
    def run_cpu(self, code, seconds=2):
        # Temporary CPU process fixtures are not qualification evidence. TAP/unittest stdout is retained by caller.
        with tempfile.TemporaryDirectory(prefix="c20-cpu-supervision-") as directory:
            root = (Path(os.environ["C20_CPU_EVIDENCE_DIR"]) / self._testMethodName) if "C20_CPU_EVIDENCE_DIR" in os.environ else Path(directory) / "attempt"
            budget = {"wallSeconds": seconds, "rssBytes": 1073741824, "outputBytes": 16777216}
            result = supervisor.run_supervised([sys.executable, "-c", code], root, budget)
            self.assertTrue(result["subreaper"])
            self.assertTrue(result["waitpidECHILD"])
            self.assertEqual(result["waitpidScope"], "ALL_CHILDREN_-1")
            self.assertEqual(result["remainingDescendants"], [])
            self.assertLessEqual(result["closeSeconds"], 4)
            total = sum(path.stat().st_size for path in root.rglob("*") if path.is_file())
            self.assertEqual(result["retainedOutputBytes"], total)
            self.assertEqual(json.loads((root / "closure.json").read_text()), result)
            return result

    def test_normal_cpu_exit(self):
        result = self.run_cpu("print('CPU only')")
        self.assertEqual(result["status"], "PHYSICALLY_CLOSED")
        self.assertEqual(result["rawReturnCode"], 0)
        self.assertEqual(len(result["rawWaitRows"]), 1)

    def test_escaped_setsid_descendant_is_not_hidden(self):
        result = self.run_cpu("import os,time,signal\nif os.fork()==0:\n os.setsid()\n signal.signal(signal.SIGTERM,signal.SIG_IGN)\n time.sleep(30)\nelse:\n time.sleep(.1)")
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["budgetViolation"], "DESCENDANTS_REMAIN_AFTER_RUNNER_EXIT")
        self.assertEqual(result["rawReturnCode"], 0)
        self.assertGreaterEqual(len(result["rawWaitRows"]), 2)
        self.assertTrue(any(row["exitCode"] == -9 for row in result["rawWaitRows"]))

    def test_cpu_wall_timeout_preserves_sigkill_failure(self):
        result = self.run_cpu("import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(30)", .1)
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["budgetViolation"], "WALL_BUDGET")
        self.assertEqual(result["rawReturnCode"], -9)
        self.assertEqual(result["signal"], 9)

    def test_existing_directory_rejected(self):
        with tempfile.TemporaryDirectory(prefix="c20-cpu-no-overwrite-") as directory:
            with self.assertRaises(FileExistsError):
                supervisor.run_supervised([sys.executable, "-c", "pass"], directory)


if __name__ == "__main__":
    unittest.main()
