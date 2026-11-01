#!/usr/bin/env python3
"""Independent analytic review of retained k3 body observations, not a new simulation.
Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""
import argparse
import datetime
import hashlib
import json
import math
import struct
from pathlib import Path

FIXTURE_SHA256 = '5be306a66497feeedadd02ead703247b56822b3964828f1a23165d06f0b0d9af'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def reject_nonfinite(value):
    raise ValueError('Nonfinite JSON number: ' + value)


def read_json(path):
    return json.loads(path.read_bytes(), parse_constant=reject_nonfinite)


def near(actual, expected, tolerance=1e-4):
    assert math.isfinite(actual) and math.isfinite(expected)
    error = abs(actual - expected)
    assert error <= tolerance, (actual, expected, tolerance)
    return error


def vector(actual, expected, tolerance=1e-4):
    assert len(actual) == len(expected)
    return max(near(a, b, tolerance) for a, b in zip(actual, expected))


def diagonal(values):
    return [values[i // 3] if i // 3 == i % 3 else 0 for i in range(9)]


def review_observations(report):
    assert report['status'] == 'PASS'
    assert report['fixtureSha256'] == FIXTURE_SHA256, 'Unreviewed fixture version'
    o = report['observations']
    # Uniform cuboid central inertia: mass / 3 times squared other half-widths.
    principal = [12 / 3 * (2**2 + 3**2), 12 / 3 * (1**2 + 3**2), 12 / 3 * (1**2 + 2**2)]
    near(o['boxMass']['mass'], 12)
    vector(o['boxMass']['inertia'], diagonal(principal))
    vector(o['boxMass']['localCenter'], [0, 0, 0])
    # Two equal spheres at x=+/-1: central sphere inertia plus the parallel-axis term.
    sphere_inertia = 2 * (2 / 5) * 0.5**2
    vector(o['offsetMass']['inertia'], diagonal([sphere_inertia, sphere_inertia + 2, sphere_inertia + 2]))
    vector(o['offsetMass']['localCenter'], [0, 0, 0])
    near(o['offsetMass']['mass'], 2)
    # Sensor-only fallback is a single sphere centered at x=2; inertia is about COM.
    assert o['sensorFallback']['sensorMassFallback'] is True
    vector(o['sensorFallback']['inertia'], diagonal([sphere_inertia] * 3))
    vector(o['sensorFallback']['localCenter'], [2, 0, 0])
    vector(o['sensorFallback']['worldCenter'], [2, 0, 0])
    # A 90-degree z rotation maps local J=(1,0,0) to world (0,1,0).
    # Local offset=(0,1,0): offset cross J=(0,0,-1), angular increment=-1/I.
    vector(o['localImpulse']['linearVelocity'], [0, 1 / 2, 0])
    vector(o['localImpulse']['angularVelocity'], [0, 0, -1 / sphere_inertia])
    # Rotating cuboid principal axes by 90 degrees swaps xx and yy, not COM inertia.
    vector(o['rotatedOffsetBox']['localCenter'], [2, 0, 0])
    vector(o['rotatedOffsetBox']['inertia'], diagonal([principal[1], principal[0], principal[2]]), 1e-3)
    vector(o['minimumBox']['inertia'], diagonal([(2 / 3) * 0.001**2] * 3), 1e-10)
    # Recompute v0/(1+c/n)^n without reading the fixture's recorded expected values.
    expected_grid = {(c, n) for c in (0, 0.1, 0.9, 1) for n in (1, 4, 8)}
    assert len(o['damping']) == len(expected_grid)
    assert {(r['c'], r['substeps']) for r in o['damping']} == expected_grid
    damping_error = 0
    for row in o['damping']:
        c = struct.unpack('<f', struct.pack('<f', row['c']))[0]
        n = 60 * row['substeps']
        predicted = math.exp(-n * math.log1p(c / n))
        state = row['state']
        near(state['linearDamping'], c, 0)
        near(state['angularDamping'], c, 0)
        damping_error = max(damping_error,
                            vector(state['linearVelocity'], [predicted, 0, 0], 1e-3),
                            vector(state['angularVelocity'], [0, 0, predicted], 1e-3))
        if c == 1:
            assert 0 < state['linearVelocity'][0] < 1
    vector(o['locks']['linearVelocity'], [0, 2, 0])
    vector(o['locks']['angularVelocity'], [0, 0, 3])
    for name in ['offsetImmediate', 'offsetAfter', 'angularImmediate']:
        assert o['immediateImpulseLocks'][name]['angularVelocity'][0] == 0
    assert o['immediateImpulseLocks']['offsetImmediate']['linearVelocity'][0] == 0
    assert o['immediateImpulseLocks']['offsetAfter']['linearVelocity'][0] == 0
    for states in [o['sleepZeroThreshold'], list(o['kinematicSleep'].values())]:
        assert len(states) == 2
        assert states[0]['sleepy'] and states[0]['awake'] and not states[0]['sleeping']
        assert states[0]['sleepTime'] > 0
        assert states[1]['sleeping'] and not states[1]['awake'] and not states[1]['sleepy']
        assert states[1]['sleepTime'] >= 0.5
    assert len(o['idCycles']) == 128
    for row in o['idCycles']:
        assert row['old'] != row['fresh']
        for token in row.values():
            assert all(type(token[k]) is int and 0 <= token[k] <= 0xffffffff for k in ['low', 'high'])
    assert len(report['negatives']) == 56
    assert len({r['label'] for r in report['negatives']}) == 56
    return {'analyticMassCases': 5, 'dampingCases': 12, 'maxDampingError': damping_error,
            'observedLifecyclePairs': 128, 'negativeLabels': 56}


def review(directory):
    raw = directory / 'wasm-body-contract.raw.json'
    report = read_json(raw)
    manifest = read_json(directory / 'manifest.json')
    assert report['identity'] == manifest
    for row in manifest['artifacts']:
        data = (directory / row['path']).read_bytes()
        assert len(data) == row['bytes'] and sha(data) == row['sha256']
    receipt = read_json(directory / 'build-receipt.json')
    inputs = {r['path']: r['sha256'] for r in receipt['inputHashes']}
    assert inputs['tools/physics/box3d/wasm-body-contract.mjs'] == FIXTURE_SHA256
    return {'directory': str(directory), 'rawSha256': sha(raw.read_bytes()),
            'manifestSha256': sha((directory / 'manifest.json').read_bytes()),
            'mode': receipt['mode'], 'metrics': review_observations(report)}, report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('debug', type=Path)
    parser.add_argument('release', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    assert not args.output.exists(), 'Never overwrite an earlier review receipt'
    a, ra = review(args.debug)
    b, rb = review(args.release)
    assert a['mode'] == 'Debug' and b['mode'] == 'Release'
    for key in ['observations', 'checks', 'negatives']:
        assert ra[key] == rb[key], 'Debug/Release raw body difference: ' + key
    result = {'status': 'PASS_INDEPENDENT_RETAINED_OBSERVATION_REVIEW',
              'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'reviewerSha256': sha(Path(__file__).read_bytes()), 'fixtureSha256': FIXTURE_SHA256,
              'builds': [a, b], 'modeComparison': 'EXACT_OBSERVATIONS_CHECKS_NEGATIVES',
              'scope': 'Independent analytic review of retained Node WASM data. Not a new simulation, browser/component acceptance, full C04/C06/C08/C12 or Gate PASS.'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
