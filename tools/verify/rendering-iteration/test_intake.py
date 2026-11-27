import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zipfile

from intake import inspect, json_unique, png_size


def make_pack(path, change=None):
    # Metadata-only PNG payload for contract tests, not a decoded image.
    png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR" + struct.pack(">II", 960, 540) + bytes(9)
    files = {
        "execution/tasks.json": json.dumps({
            "planVersion": "1.3",
            "baselineSha": "a" * 40,
            "renderTasks": [{"id": f"R{i:02}"} for i in range(18)],
            "aiWorkPackages": [{"id": f"AF{i:02}"} for i in range(8)],
        }).encode(),
    }
    scenes = []
    for i in range(1, 13):
        id_ = f"E{i:02}"
        guide = f"guides/{id_}_sample.md"
        files[guide] = b"# Sample"
        row = {
            "id": id_, "name": id_, "guide": guide, "visualReference": None,
            "visualType": "MISSING", "assetDir": None, "directDependencies": ["R01"],
        }
        if i == 1:
            name = "references/E01_candidate.png"
            files[name] = png
            row.update({"visualReference": name, "visualType": "BLOCKOUT_NOT_FINAL",
                        "sha256": hashlib.sha256(png).hexdigest(), "size": [960, 540]})
        scenes.append(row)
    files["scene_manifest.json"] = json.dumps({"scenes": scenes}).encode()
    files["file_manifest.json"] = json.dumps({"files": [
        {"path": key, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        for key, data in files.items()
    ]}).encode()
    if change:
        change(files)
    with zipfile.ZipFile(path, "w") as archive:
        for key, data in files.items():
            archive.writestr("pack/" + key, data)


class IntakeTests(unittest.TestCase):
    def test_candidate_inventory_does_not_pass_visual_gate(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "pack.zip"
            make_pack(path)
            result = inspect(path)
        self.assertEqual(result["verifiedFiles"], 15)
        self.assertEqual(len(result["scenes"]), 12)
        self.assertEqual(result["scenes"][0]["reference"]["size"], [960, 540])
        self.assertEqual(result["visualGate"], "BLOCKED")
        self.assertTrue(all(row["visualFreeze"] == "BLOCKED" for row in result["scenes"]))

    def test_rejects_tampered_reference(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "pack.zip"
            make_pack(path, lambda files: files.update({"references/E01_candidate.png": b"changed"}))
            with self.assertRaisesRegex(ValueError, "File identity differs"):
                inspect(path)

    def test_rejects_traversal(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "pack.zip"
            make_pack(path, lambda files: files.update({"../../unexpected": b"changed"}))
            with self.assertRaisesRegex(ValueError, "Non-canonical path"):
                inspect(path)

    def test_rejects_duplicate_json_and_non_png(self):
        with self.assertRaisesRegex(ValueError, "Duplicate JSON"):
            json_unique(b'{"part":0,"part":1}')
        with self.assertRaisesRegex(ValueError, "not a PNG"):
            png_size(bytes(36))


if __name__ == "__main__":
    unittest.main()
