#!/usr/bin/env python3
"""Negative controls for the retained-data reviewer, not physical test cases.
Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""
import copy
import importlib.util
import json
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location('reviewer', Path(__file__).with_name('component-observation-review.py'))
reviewer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reviewer)
raw = reviewer.read_json(Path(sys.argv[1]))
reviewer.review_observations(raw)


def change_point(report, name, path, value):
    row = next(p['data'] for p in report['checkpoints'] if p['name'] == name)
    for key in path[:-1]:
        row = row[key]
    row[path[-1]] = value


changes = [
    ('wrong-centroid', 'actual-orders-static-multiple-collider', ['bodyA', 'localCenter', 0], 0),
    ('missing-Steiner-term', 'actual-orders-static-multiple-collider', ['bodyA', 'inertia', 4], 3.79114),
    ('signed-mask-truncated', 'actual-orders-static-multiple-collider', ['filters', 0, 'group'], 0),
    ('wrong-gravity-trajectory', 'native-origin-not-com-trajectory', ['poses', 30, 'node', 1], 20),
    ('com-written-as-origin', 'native-origin-not-com-trajectory', ['poses', 0, 'node', 0], 0.815712),
    ('step-counter-skipped', 'native-origin-not-com-trajectory', ['native', 'nativeStepIndex'], 61),
    ('missing-scene-release', 'component-owners-released-before-world', ['counts', 'shapes'], 1),
    ('false-early-zero', 'component-owners-released-before-world', ['bridge', 'liveBytes'], '0'),
    ('app-close-pending', 'actual-owned-native-cleanup', ['close', 'pending'], ['native-scene-destruction']),
    ('claimed-global-zero', 'actual-owned-native-cleanup', ['close', 'retained'], []),
]
for name, point, path, value in changes:
    changed = copy.deepcopy(raw)
    change_point(changed, point, path, value)
    try:
        reviewer.review_observations(changed)
    except AssertionError:
        continue
    raise AssertionError('Tampered report accepted: ' + name)
print(json.dumps({'status': 'PASS_REVIEWER_CONTROLS', 'positive': 1,
                  'rejectedMutations': [name for name, *_ in changes],
                  'scope': 'Retained-data consumer controls only, not native/WASM executions.'}))
