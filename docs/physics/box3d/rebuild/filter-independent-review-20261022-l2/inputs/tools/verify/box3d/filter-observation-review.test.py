#!/usr/bin/env python3
"""Tamper controls for the retained-data reviewer, not physical test cases.
Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""
import copy
import importlib.util
import json
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location('reviewer', Path(__file__).with_name('filter-observation-review.py'))
reviewer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reviewer)
report = reviewer.read_json(Path(sys.argv[1]))
reviewer.review_observations(report)


def set_path(report, path, value):
    for key in path[:-1]:
        report = report[key]
    report[path[-1]] = value


changes = [
    ('stale-fixture', ['fixtureSha256'], '0' * 64),
    ('truncated-signed-bit', ['observations', 'bitsets', 2, 'actual', 0, 'group'], 0),
    ('reused-stale-id', ['observations', 'reuse', 0, 'next', 'low'], 1),
    ('missing-physical-step', ['observations', 'contactTransition', 'resumed', 'stepIndex'], 601),
    ('wrong-sensor-pair', ['observations', 'sensorTransition', 'reenter', 'sensorBegins', 0, 'visitor', 'high'], 999),
    ('committed-relabelled-unmutated', ['observations', 'outcomes', 5, 'error', 'mutationOutcome'], 'not-mutated'),
    ('unknown-relabelled-unmutated', ['observations', 'outcomes', 6, 'error', 'mutationOutcome'], 'not-mutated'),
    ('stale-snapshot-advertised', ['observations', 'outcomes', 6, 'after', 'diagnostics', 'snapshotAvailable'], True),
    ('committed-filter-did-not-change', ['observations', 'outcomes', 7, 'after', 'filter', 'group'], 1),
    ('mutation-replayed-step', ['observations', 'outcomes', 8, 'after', 'diagnostics', 'nativeStepIndex'], 5),
]
for name, path, value in changes:
    changed = copy.deepcopy(report)
    set_path(changed, path, value)
    try:
        reviewer.review_observations(changed)
    except AssertionError:
        continue
    raise AssertionError('Tampered retained data accepted: ' + name)
print(json.dumps({'status': 'PASS_REVIEWER_CONTROLS', 'positive': 1,
                  'rejectedMutations': [name for name, _, _ in changes],
                  'scope': 'Reviewer controls only, not native/WASM executions.'}))
