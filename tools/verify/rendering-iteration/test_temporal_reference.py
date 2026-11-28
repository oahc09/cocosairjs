from pathlib import Path
import shutil
import tempfile
import unittest

from temporal_reference import CAMERA_CUT, ERROR_BUDGET, audit, encode, frame_path, generate, read_frame, render


class TemporalReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.temp.cleanup)
        cls.original = Path(cls.temp.name) / "reference"
        generate(cls.original)

    def test_truth_passes(self):
        receipt = audit(self.original)
        self.assertTrue(receipt["passed"])
        self.assertEqual(receipt["frames"][CAMERA_CUT]["cutP95ChannelError"], 0)
        self.assertGreater(receipt["frames"][4]["disocclusionPixels"], 20)

    def test_stale_cut_and_localized_ghost_fail(self):
        altered = Path(self.temp.name) / "altered"
        shutil.copytree(self.original, altered)
        cut = frame_path(altered, CAMERA_CUT)
        cut.write_bytes(frame_path(altered, CAMERA_CUT - 1).read_bytes())
        path = frame_path(altered, 4)
        now, prior = read_frame(path), read_frame(frame_path(altered, 3))
        _, old_mask = render(3)
        _, new_mask = render(4)
        for pixel in old_mask - new_mask:
            for channel in range(3):
                i = 3 * pixel + channel
                now[i] = 0.65 * prior[i] + 0.35 * now[i]
        path.write_bytes(encode(now))
        result = audit(altered)
        observed = {(row["index"], row["metric"]) for row in result["failures"]}
        self.assertFalse(result["passed"])
        self.assertLess(result["frames"][4]["meanError"], ERROR_BUDGET)
        self.assertIn((4, "disocclusionError"), observed)
        self.assertIn((CAMERA_CUT, "cutP95ChannelError"), observed)

    def test_missing_frame_rejected(self):
        incomplete = Path(self.temp.name) / "incomplete"
        incomplete.mkdir()
        self.assertRaisesRegex(ValueError, "Wrong frame set", audit, incomplete)


if __name__ == "__main__":
    unittest.main()
