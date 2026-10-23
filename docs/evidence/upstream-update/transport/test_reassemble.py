#!/usr/bin/env python3
"""Portable failure-mode regression tests using the actual evidence chunks.

All temporary files are created beneath this script's directory and removed.
Run: python3 docs/evidence/upstream-update/transport/test_reassemble.py
"""

import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


TRANSPORT = Path(__file__).absolute().parent


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix=".transport-test-", dir=str(TRANSPORT))
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.transport = self.root / "input"
        self.transport.mkdir()
        for name in ("manifest.json", "reassemble.py"):
            shutil.copyfile(TRANSPORT / name, self.transport / name)
        shutil.copytree(TRANSPORT / "chunks", self.transport / "chunks")
        self.output = self.root / "output"
        self.output.mkdir()
        self.manifest = json.loads((self.transport / "manifest.json").read_text())

    def save_manifest(self):
        (self.transport / "manifest.json").write_text(json.dumps(self.manifest), encoding="utf-8")

    def part(self, archive=0, chunk=0):
        return self.transport / self.manifest["archives"][archive]["chunks"][chunk]["path"]

    def run_cli(self):
        return subprocess.run([sys.executable, str(self.transport / "reassemble.py"),
                               "--output-root", str(self.output)],
                              text=True, capture_output=True)

    def snapshot(self):
        return {str(p.relative_to(self.output)): (p.read_bytes() if p.is_file() else None)
                for p in self.output.rglob("*")}

    def rejected(self):
        before = self.snapshot()
        result = self.run_cli()
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("ERROR:", result.stderr)
        self.assertEqual(self.snapshot(), before, "failure left output or staging changes")

    def module(self):
        spec = importlib.util.spec_from_file_location("transport_under_test", self.transport / "reassemble.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_success_matches_pinned_identities(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        receipt = json.loads(result.stdout)
        self.assertEqual(receipt["source_status"], "BLOCKED")
        for archive in self.manifest["archives"]:
            data = (self.output / archive["path"]).read_bytes()
            self.assertEqual(len(data), archive["bytes"])
            self.assertEqual(hashlib.sha256(data).hexdigest(), archive["sha256"])
            self.assertEqual(hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest(),
                             archive["git_blob_sha1"])
        self.assertFalse(list(self.output.glob(".evidence-reassembly-*")))

    def test_default_output_root_preserves_original_relative_paths(self):
        repository = self.root / "default-repository"
        destination = repository / "docs/evidence/upstream-update/transport"
        destination.parent.mkdir(parents=True)
        shutil.move(str(self.transport), str(destination))
        result = subprocess.run([sys.executable, str(destination / "reassemble.py")],
                                cwd=str(self.root), text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        for archive in self.manifest["archives"]:
            data = (repository / archive["path"]).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), archive["sha256"])
        self.assertFalse(list(repository.glob(".evidence-reassembly-*")))

    def test_missing_chunk(self):
        self.part().unlink()
        self.rejected()

    def test_corrupt_same_size(self):
        with self.part().open("r+b") as stream:
            stream.write(b"X" if stream.read(1) != b"X" else b"Y")
        self.rejected()

    def test_truncated_chunk(self):
        with self.part().open("r+b") as stream:
            stream.truncate(100)
        self.rejected()

    def test_reordered_manifest_records(self):
        self.manifest["archives"][0]["chunks"].reverse()
        self.save_manifest()
        self.rejected()

    def test_swapped_equal_size_chunk_bytes(self):
        first, second = self.part(1, 0), self.part(1, 1)
        data = first.read_bytes()
        first.write_bytes(second.read_bytes())
        second.write_bytes(data)
        self.rejected()

    def test_duplicate_manifest_chunk(self):
        chunks = self.manifest["archives"][0]["chunks"]
        chunks[1] = copy.deepcopy(chunks[0])
        self.save_manifest()
        self.rejected()

    def test_duplicate_equal_size_chunk_bytes(self):
        shutil.copyfile(self.part(1, 0), self.part(1, 1))
        self.rejected()

    def test_duplicate_chunk_digest_record(self):
        chunks = self.manifest["archives"][1]["chunks"]
        chunks[1]["sha256"] = chunks[0]["sha256"]
        self.save_manifest()
        self.rejected()

    def test_unexpected_duplicate_file(self):
        shutil.copyfile(self.part(), self.transport / "chunks" / "duplicate.part")
        self.rejected()

    def test_duplicate_json_key(self):
        path = self.transport / "manifest.json"
        path.write_text('{"schema":"ignored",' + path.read_text().lstrip()[1:])
        self.rejected()

    def test_changed_source_commit(self):
        self.manifest["source_commit"] = "0" * 40
        self.save_manifest()
        self.rejected()

    def test_changed_source_status(self):
        self.manifest["source_status"] = "PASS"
        self.save_manifest()
        self.rejected()

    def test_changed_archive_identity(self):
        self.manifest["archives"][0]["sha256"] = "0" * 64
        self.save_manifest()
        self.rejected()

    def test_missing_archive(self):
        self.manifest["archives"].pop()
        self.save_manifest()
        self.rejected()

    def test_reordered_archives(self):
        self.manifest["archives"].reverse()
        self.save_manifest()
        self.rejected()

    def test_chunk_path_traversal(self):
        self.manifest["archives"][0]["chunks"][0]["path"] = "../../outside"
        self.save_manifest()
        self.rejected()

    def test_output_path_traversal(self):
        self.manifest["archives"][0]["path"] = "../../outside"
        self.save_manifest()
        self.rejected()

    def test_wrong_offset(self):
        self.manifest["archives"][0]["chunks"][1]["offset"] += 1
        self.save_manifest()
        self.rejected()

    def test_wrong_git_blob_checksum(self):
        self.manifest["archives"][0]["chunks"][0]["git_blob_sha1"] = "0" * 40
        self.save_manifest()
        self.rejected()

    def test_changed_chunk_with_updated_chunk_checksums(self):
        part = self.part()
        data = bytearray(part.read_bytes())
        data[0] ^= 1
        part.write_bytes(data)
        chunk = self.manifest["archives"][0]["chunks"][0]
        chunk["sha256"] = hashlib.sha256(data).hexdigest()
        chunk["git_blob_sha1"] = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        self.save_manifest()
        self.rejected()  # The pinned complete-archive identity must still fail.

    def test_corrupt_last_chunk_cleans_completed_first_staging_file(self):
        part = self.part(1, 2)
        data = bytearray(part.read_bytes())
        data[-1] ^= 1
        part.write_bytes(data)
        self.rejected()

    def existing_output(self, index):
        path = self.output / self.manifest["archives"][index]["path"]
        path.parent.mkdir(parents=True)
        path.write_bytes(b"do not overwrite existing evidence")
        self.rejected()

    def test_existing_first_output(self):
        self.existing_output(0)

    def test_existing_second_output(self):
        self.existing_output(1)

    def test_existing_output_directory(self):
        path = self.output / self.manifest["archives"][0]["path"]
        path.mkdir(parents=True)
        self.rejected()

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks unavailable")
    def test_chunk_symlink(self):
        part = self.part()
        original = self.root / "original-chunk"
        part.rename(original)
        part.symlink_to(original)
        self.rejected()

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks unavailable")
    def test_output_parent_symlink(self):
        external = self.root / "external"
        external.mkdir()
        (self.output / "docs").symlink_to(external, target_is_directory=True)
        result = self.run_cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(list(external.iterdir()), [])
        self.assertTrue((self.output / "docs").is_symlink())
        self.assertEqual(len(list(self.output.iterdir())), 1)

    @unittest.skipUnless(hasattr(os, "symlink"), "symlinks unavailable")
    def test_existing_dangling_output_symlink(self):
        path = self.output / self.manifest["archives"][0]["path"]
        path.parent.mkdir(parents=True)
        path.symlink_to(self.root / "nonexistent")
        self.rejected()
        self.assertTrue(path.is_symlink())

    def test_missing_output_root_is_not_created(self):
        self.output.rmdir()
        result = self.run_cli()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.output.exists())

    def test_publication_failure_rolls_back_first_output(self):
        module = self.module()
        real_link = os.link
        count = 0
        def failing_second(source, destination):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("injected second publication failure")
            return real_link(source, destination)
        with patch.object(module.os, "link", side_effect=failing_second):
            with self.assertRaises(OSError):
                module.reassemble(self.transport, self.output)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_interrupt_immediately_after_link_rolls_back(self):
        module = self.module()
        real_link = os.link
        def interrupted_link(source, destination):
            real_link(source, destination)
            raise KeyboardInterrupt()
        with patch.object(module.os, "link", side_effect=interrupted_link):
            with self.assertRaises(KeyboardInterrupt):
                module.reassemble(self.transport, self.output)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_cleanup_failure_rolls_back_outputs(self):
        module = self.module()
        real_remove = shutil.rmtree
        count = 0
        def failing_cleanup(path):
            nonlocal count
            count += 1
            if count == 1:
                # Simulate partial staging cleanup before its error.
                next(Path(path).iterdir()).unlink()
                raise OSError("injected staging cleanup failure")
            return real_remove(path)
        with patch.object(module.shutil, "rmtree", side_effect=failing_cleanup):
            with self.assertRaises(OSError):
                module.reassemble(self.transport, self.output)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_interrupt_after_staging_removal_rolls_back_outputs(self):
        module = self.module()
        real_remove = shutil.rmtree
        def interrupted_cleanup(path):
            real_remove(path)
            raise KeyboardInterrupt()
        with patch.object(module.shutil, "rmtree", side_effect=interrupted_cleanup):
            with self.assertRaises(KeyboardInterrupt):
                module.reassemble(self.transport, self.output)
        self.assertEqual(list(self.output.iterdir()), [])

    def test_concurrent_existing_output_preserved(self):
        module = self.module()
        real_link = os.link
        count = 0
        external = None
        def racing_link(source, destination):
            nonlocal count, external
            count += 1
            if count == 2:
                external = Path(destination)
                external.write_bytes(b"external concurrent output")
            return real_link(source, destination)
        with patch.object(module.os, "link", side_effect=racing_link):
            with self.assertRaises(FileExistsError):
                module.reassemble(self.transport, self.output)
        self.assertEqual(external.read_bytes(), b"external concurrent output")
        first = self.output / self.manifest["archives"][0]["path"]
        self.assertFalse(first.exists())
        self.assertFalse(list(self.output.glob(".evidence-reassembly-*")))


if __name__ == "__main__":
    unittest.main(verbosity=2)
