#!/usr/bin/env python3
"""Independent scalar review of retained m2 observations, not a physics execution.
Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT

Uses fixed-core solver.c damping and math_internal.h normalized Euler/pseudo
angular velocity equations. Never reads producer predicted/prediction/errors.
"""
import argparse
import datetime
import hashlib
import json
import math
import struct
from pathlib import Path

SCHEMA = '43df81eba981c9ab5751dbe5f807e660d46cac1a5e1b4936462d5afb57a24040'
FIXTURE = 'e058daf79278bbaa7d31545db743851cade1dca4fc9833953d17b3216366c814'
DT = struct.unpack('<f', struct.pack('<f', 1 / 60))[0]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read_json(path):
    return json.loads(path.read_bytes(), parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))

def vec(value, n):
    assert isinstance(value, list) and len(value) == n
    assert all(type(v) in (float, int) and math.isfinite(v) for v in value)
    return value

def add(a, b):
    return [x + y for x, y in zip(a, b)]

def sub(a, b):
    return [x - y for x, y in zip(a, b)]

def mul(a, s):
    return [x * s for x in a]

def norm(a):
    return math.hypot(*a)

def unit(q):
    n = norm(vec(q, 4))
    assert n > 0
    return mul(q, 1 / n)

def conj(q):
    return [-q[0], -q[1], -q[2], q[3]]

def product(a, b):
    x, y, z, w = a
    X, Y, Z, W = b
    return [w * X + x * W + y * Z - z * Y,
            w * Y - x * Z + y * W + z * X,
            w * Z + x * Y - y * X + z * W,
            w * W - x * X - y * Y - z * Z]

def rotate(q, p):
    q = unit(q)
    return product(product(q, [*p, 0]), conj(q))[:3]

def angle(a, b):
    r = product(unit(a), conj(unit(b)))
    return 2 * math.atan2(norm(r[:3]), abs(r[3]))

def f32(x):
    return struct.unpack('<f', struct.pack('<f', x))[0]

def review_sample(row):
    app = row['application']
    large = row['kind'] == 'large-admitted-angle'
    assert large or row['kind'] == 'free-kinematic'
    n = 1 if large else row['n']
    damping = 0 if large else row['damping']
    assert n in (1, 2, 4, 8) and damping in (0, .25, 1)
    state = app['state'] if large else row['stateBefore']
    assert state['type'] == 1 and state['mass'] == 0 and state['enabled']
    assert state['linearDamping'] == state['angularDamping'] == damping
    assert state['linearFactor'] == state['angularFactor'] == [1, 1, 1]
    assert state['force'] == state['torque'] == [0, 0, 0]
    local = vec(state['localCenter'], 3)
    # Current kinematic grid has actual local COM zero, not the sphere's geometric center.
    assert local == [0, 0, 0], 'Do not silently generalize the finite kinematic fixture'
    before = app['before']['pose'] if large else row['before']
    p0, q0 = vec(before['position'], 3), vec(before['rotation'], 4)
    c0 = vec(app['before']['worldCenter'] if large else before['worldCenter'], 3)
    assert norm(sub(c0, add(p0, rotate(q0, local)))) <= 1e-5
    assert app['pose'] == {'position': p0, 'rotation': q0}
    assert app['before']['pose'] == {'position': p0, 'rotation': q0}
    assert app['before']['worldCenter'] == c0
    desired = row['requested']
    target = {'position': list(map(f32, vec(desired['position'], 3))),
              'rotation': list(map(f32, unit(desired['rotation'])))}
    assert app['requested'] == {'reset': None, 'intent': {'kind': 'target', 'pose': target}}
    plan = app['plan']
    assert plan['fixedDt'] == DT and plan['solverSubSteps'] == n
    assert plan['linearDamping'] == plan['angularDamping'] == damping
    assert plan['linearLockResidue'] == plan['angularLockResidue'] == [0, 0, 0]
    assert plan['maximumLinearSpeed'] == 400 and abs(plan['maximumAngularSpeed'] - 15 * math.pi) < 1e-5
    assert plan['allowFastRotation'] is False
    center_target = add(target['position'], rotate(target['rotation'], local))
    expected_v = mul(sub(center_target, c0), 1 / DT)
    q = unit(q0)
    qt = unit(target['rotation'])
    if sum(a * b for a, b in zip(q, qt)) < 0:
        q = mul(q, -1)
    expected_w = mul(product(sub(qt, q), conj(q))[:3], 2 / DT)
    v, w = vec(app['applied']['linearVelocity'], 3), vec(app['applied']['angularVelocity'], 3)
    assert plan['linearVelocity'] == app['state']['linearVelocity'] == v
    assert plan['angularVelocity'] == app['state']['angularVelocity'] == w
    ev, ew = norm(sub(v, expected_v)), norm(sub(w, expected_w))
    assert ev <= 5e-5 * max(1, norm(expected_v)), 'Planned COM linear velocity mismatch'
    assert ew <= 5e-5 * max(1, norm(expected_w)), 'Planned short-arc angular velocity mismatch'
    h = DT / n
    factor = 1 / (1 + h * damping)
    center = list(c0)
    delta = [0, 0, 0, 1]
    for _ in range(n):
        v, w = mul(v, factor), mul(w, factor)
        center = add(center, mul(v, h))
        dq = product([*mul(w, h / 2), 0], delta)
        delta = unit(add(delta, dq))
    rotation = unit(product(delta, q0))
    origin = sub(center, rotate(rotation, local))
    actual = vec(row['actual'], 10)
    errors = {'origin': norm(sub(actual[:3], origin)), 'center': norm(sub(actual[7:10], center)),
              'angle': angle(actual[3:7], rotation), 'plannedLinear': ev, 'plannedAngular': ew,
              'requestedOrigin': norm(sub(actual[:3], desired['position'])),
              'requestedAngle': angle(actual[3:7], desired['rotation'])}
    for key in ('origin', 'center', 'angle'):
        assert errors[key] <= 1e-4, 'Independent integration budget: ' + key
    if large:
        assert errors['requestedAngle'] > .02, 'Large-angle shortfall must not be corrected by teleport'
    return errors

def review_samples(rows):
    assert len(rows) == 7201
    expected_keys = [(n, d, t) for n in (1, 2, 4, 8) for d in (0, .25, 1) for t in range(600)]
    actual_keys = [(r['n'], r['damping'], r['tick']) for r in rows[:-1]]
    assert actual_keys == expected_keys, 'Exact finite grid/order required'
    assert rows[-1]['kind'] == 'large-admitted-angle'
    maxima = {}
    for index, row in enumerate(rows):
        if index < 7200 and row['tick']:
            previous = rows[index - 1]['actual']
            assert row['before'] == {'position': previous[:3], 'rotation': previous[3:7], 'worldCenter': previous[7:10]}, 'Missing or replaced physical continuity'
        for key, value in review_sample(row).items():
            maxima[key] = max(maxima.get(key, 0), value)
    return {'samples': len(rows), 'gridTicks': 7200, 'largeAngleSamples': 1, 'maxErrors': maxima,
            'model': 'independent double scalar, actual applied velocities and fixed-core equations',
            'kinematicLocalCOM': 'zero in all grid rows; offset COM native fixture is separate'}

def review(directory):
    report = read_json(directory / 'wasm-motion-contract.raw.json')
    manifest = read_json(directory / 'manifest.json')
    assert report['identity'] == manifest and manifest['schemaSha256'] == SCHEMA
    assert report['fixtureSha256'] == FIXTURE
    for row in manifest['artifacts']:
        data = (directory / row['path']).read_bytes()
        assert len(data) == row['bytes'] and sha(data) == row['sha256']
    receipt = read_json(directory / 'build-receipt.json')
    inputs = {r['path']: r['sha256'] for r in receipt['inputHashes']}
    assert len(inputs) == 43 and inputs['tools/physics/box3d/wasm-motion-contract.mjs'] == FIXTURE
    sample = report['samplesArtifact']
    assert sample['path'] == 'motion-samples.raw.jsonl'
    data = (directory / sample['path']).read_bytes()
    assert len(data) == sample['bytes'] and sha(data) == sample['sha256']
    rows = [json.loads(line) for line in data.splitlines()]
    assert report['sampleCount'] == sample['records'] == len(rows)
    metrics = review_samples(rows)
    negatives = report['negatives']
    assert len(negatives) == len({r['name'] for r in negatives}) == 37
    assert all(r['error']['mutationOutcome'] == 'not-mutated' for r in negatives)
    assert len(report['observations']['idCycles']) == 128
    injected = report['injectedMechanisms']
    assert len(injected) == 3
    assert injected[0]['diagnostics'] == {'nativeStepIndex': 1, 'nativeCompleted': True, 'snapshotAvailable': True}
    assert 'mutationOutcome' not in injected[0]['error']
    assert injected[1]['calls'] == injected[2]['calls'] == 1
    assert injected[1]['error']['mutationOutcome'] == 'committed'
    assert 'mutationOutcome' not in injected[2]['error']
    for i, x in enumerate(injected[1:], 1):
        assert x['pose'][0] == i + 1
        assert x['diagnostics'] == {'nativeStepIndex': i, 'nativeCompleted': True, 'snapshotAvailable': False}
    return {'mode': receipt['mode'], 'sampleSha256': sha(data), 'rawSha256': sha((directory / 'wasm-motion-contract.raw.json').read_bytes()),
            'manifestSha256': sha((directory / 'manifest.json').read_bytes()), 'metrics': metrics}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('debug', type=Path)
    parser.add_argument('release', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    assert not args.output.exists()
    a, b = review(args.debug), review(args.release)
    assert a['mode'] == 'Debug' and b['mode'] == 'Release'
    assert a['sampleSha256'] == b['sampleSha256'] and a['metrics'] == b['metrics']
    result = {'status': 'PASS_INDEPENDENT_RETAINED_MOTION_REVIEW', 'timeUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'reviewerSha256': sha(Path(__file__).read_bytes()), 'debug': a, 'release': b,
              'scope': 'Retained scalar data review only. Not additional native execution, full COM/API domain, AIR integration, browser or Gate PASS.'}
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))

if __name__ == '__main__':
    main()
