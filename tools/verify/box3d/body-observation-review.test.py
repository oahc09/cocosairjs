#!/usr/bin/env python3
"""Negative controls for the independent retained body-data reviewer, not physics tests."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import unittest

MODULE = Path(__file__).with_name('body-observation-review.py')
spec = importlib.util.spec_from_file_location('body_review', MODULE)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class ReviewerControls(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = review.read_json(Path(os.environ['BOX3D_ST_TEST_BUILD']) / 'wasm-body-contract.raw.json')

    def test_positive(self):
        self.assertEqual(review.review_observations(self.raw)['dampingCases'], 12)

    def test_reject_changed_inertia(self):
        value = copy.deepcopy(self.raw)
        value['observations']['boxMass']['inertia'][0] += 1
        with self.assertRaises(AssertionError):
            review.review_observations(value)

    def test_reject_incomplete_grid(self):
        value = copy.deepcopy(self.raw)
        value['observations']['damping'].pop()
        with self.assertRaises(AssertionError):
            review.review_observations(value)

    def test_reject_false_formula_even_when_expected_is_rewritten(self):
        value = copy.deepcopy(self.raw)
        row = value['observations']['damping'][-1]
        row['expected'] = 0
        row['state']['linearVelocity'][0] = 0
        with self.assertRaises(AssertionError):
            review.review_observations(value)

    def test_reject_unreviewed_fixture(self):
        value = copy.deepcopy(self.raw)
        value['fixtureSha256'] = '0' * 64
        with self.assertRaises(AssertionError):
            review.review_observations(value)

    def test_reject_nonfinite_json(self):
        with self.assertRaises(ValueError):
            json.loads('{"value": NaN}', parse_constant=review.reject_nonfinite)


if __name__ == '__main__':
    unittest.main()
