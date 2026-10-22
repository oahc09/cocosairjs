#!/usr/bin/env python3
"""Retained reviewer positive/tamper controls, never native physical tests.
Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""
import copy
import importlib.util
import json
import sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('reviewer', Path(__file__).with_name('motion-observation-review.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
rows = [json.loads(line) for line in Path(sys.argv[1]).read_bytes().splitlines()]
r.review_samples(rows)
ignored = copy.deepcopy(rows[0])
ignored['predicted'] = {'intentionallyWrong': True}
ignored['errors'] = {'origin': 999}
assert r.review_sample(ignored) == r.review_sample(rows[0])
changes = [
    ('actual-origin', ['actual', 0], .25),
    ('actual-COM', ['actual', 7], .25),
    ('actual-rotation', ['actual', 3], .2),
    ('requested-pose', ['requested', 'position', 0], 1),
    ('actual-applied-velocity', ['application', 'applied', 'linearVelocity', 0], 100),
    ('state-velocity', ['application', 'state', 'angularVelocity', 2], 9),
    ('silently-changed-dt', ['application', 'plan', 'fixedDt'], 1 / 120),
    ('silently-changed-substeps', ['application', 'plan', 'solverSubSteps'], 8),
    ('unreviewed-damping', ['stateBefore', 'linearDamping'], 10),
    ('not-actual-grid-COM', ['stateBefore', 'localCenter', 0], .5),
    ('nonfinite-pose', ['actual', 0], float('nan')),
    ('zero-quaternion', ['requested', 'rotation'], [0, 0, 0, 0]),
]
for name, keys, value in changes:
    row = copy.deepcopy(rows[0])
    target = row
    for key in keys[:-1]:
        target = target[key]
    target[keys[-1]] = value
    try:
        r.review_sample(row)
    except AssertionError:
        continue
    raise AssertionError('Tampered sample accepted: ' + name)
for name, modified in [('missing-sample', rows[:-1]), ('reordered-grid', [rows[1], rows[0], *rows[2:]])]:
    try:
        r.review_samples(modified)
    except AssertionError:
        continue
    raise AssertionError('Tampered inventory accepted: ' + name)
large = copy.deepcopy(rows[-1])
large['actual'][3:7] = large['requested']['rotation']
try:
    r.review_sample(large)
except AssertionError:
    pass
else:
    raise AssertionError('Teleport-corrected large angle accepted')
print(json.dumps({'status': 'PASS_REVIEWER_CONTROLS', 'positive': 2,
                  'rejectedMutations': [x[0] for x in changes] + ['missing-sample', 'reordered-grid', 'teleport-corrected-large-angle'],
                  'scope': 'Reviewer logic only, not physical executions.'}))
