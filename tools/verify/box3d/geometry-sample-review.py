#!/usr/bin/env python3
"""Independent retained-sample review, not a new simulation or browser test.
Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""
import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def add(a, b):
    return [x + y for x, y in zip(a, b)]


def sub(a, b):
    return [x - y for x, y in zip(a, b)]


def scale(a, k):
    return [x * k for x in a]


def cross(a, b):
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]


def rotate(q, v):
    # Cross-product quaternion identity, independent of the matrix audit and JS helpers.
    t = scale(cross(q[:3], v), 2)
    return add(add(v, scale(t, q[3])), cross(q[:3], t))


def unrotate(q, v):
    return rotate([-q[0], -q[1], -q[2], q[3]], v)


def world(p, v):
    return add(p[:3], rotate(p[3:7], v))


def local(p, v):
    return unrotate(p[3:7], sub(v, p[:3]))


def error(a, b):
    assert len(a) == len(b)
    assert all(math.isfinite(x) for x in a + b)
    return max(abs(x - y) for x, y in zip(a, b))


def review(directory):
    contract_path = directory / 'wasm-geometry-contract.raw.json'
    contract_bytes = contract_path.read_bytes()
    contract = json.loads(contract_bytes)
    assert contract['status'] == 'PASS'
    raw = (directory / 'geometry-samples.raw.jsonl').read_bytes()
    assert sha(raw) == contract['samplesArtifact']['sha256']
    rows = [json.loads(line) for line in raw.splitlines()]
    assert len(rows) == contract['samplesArtifact']['records'] == 617
    metrics = {'records': len(rows), 'points': 0, 'maxPointError': 0, 'maxNormalError': 0,
               'maxSeparationError': 0, 'generated': 0, 'recycled': 0, 'sleeping': 0}
    scenes = {}
    generations = {}
    for row in rows:
        a, b = row['shapeA'], row['shapeB']
        pa, pb = row['independentPoseA'], row['independentPoseB']
        c = row['contact']
        g = c['geometry']
        assert g['source'] == 'CACHED_MANIFOLD_GENERATION'
        assert g['status'] == 'AVAILABLE'
        assert g['generationPoseA'] == pa and g['generationPoseB'] == pb
        assert g['generatedAfterStep']['high'] == 0
        assert g['readStepIndex'] == row['tick']
        assert g['generatedAfterStep']['low'] < row['tick']
        key = (row['scene'], tuple(g['contactId']), g['geometryRevision']['high'], g['geometryRevision']['low'])
        basis = (g['generatedAfterStep'], pa, pb)
        if key in generations:
            assert generations[key] == basis
        generations[key] = basis
        if a['kind'] == b['kind'] == 'sphere':
            ca, cb = world(pa, a['center']), world(pb, b['center'])
            delta = sub(cb, ca)
            distance = math.hypot(*delta)
            assert distance > 0
            n = scale(delta, 1 / distance)
            point = scale(add(add(ca, scale(n, a['radius'])), sub(cb, scale(n, b['radius']))), .5)
            separation = distance - a['radius'] - b['radius']
        else:
            sphere_first = a['kind'] == 'sphere'
            sphere, box = (a, b) if sphere_first else (b, a)
            sp, bp = (pa, pb) if sphere_first else (pb, pa)
            assert sphere['kind'] == 'sphere' and box['kind'] == 'box'
            center = world(sp, sphere['center'])
            q = local(bp, center)
            assert abs(q[0]) < box['half'][0] - .1 and abs(q[2]) < box['half'][2] - .1
            assert q[1] > box['half'][1]
            face = world(bp, [q[0], box['half'][1], q[2]])
            delta = sub(center, face)
            distance = math.hypot(*delta)
            assert distance > 0
            outward = scale(delta, 1 / distance)
            point = scale(add(face, sub(center, scale(outward, sphere['radius']))), .5)
            n = scale(outward, -1 if sphere_first else 1)
            separation = distance - sphere['radius']
        # Intentionally never read row.expected, which was emitted by the original fixture.
        for mi, manifold in enumerate(g['manifolds']):
            ne = max(error(n, manifold['normalAtoB']), error(scale(n, -1), manifold['normalBtoA']),
                     error(unrotate(pa[3:7], n), manifold['localNormalAtoB_A']),
                     error(unrotate(pb[3:7], n), manifold['localNormalAtoB_B']))
            assert ne <= contract['tolerance']['normal']
            metrics['maxNormalError'] = max(metrics['maxNormalError'], ne)
            for pi, p in enumerate(manifold['points']):
                pe = max(error(point, p['worldPointA']), error(point, p['worldPointB']),
                         error(local(pa, point), p['localPointA']), error(local(pb, point), p['localPointB']))
                se = abs(c['manifolds'][mi]['points'][pi]['baseSeparation'] - separation)
                assert pe <= contract['tolerance']['point']
                assert se <= contract['tolerance']['separation']
                metrics['maxPointError'] = max(metrics['maxPointError'], pe)
                metrics['maxSeparationError'] = max(metrics['maxSeparationError'], se)
                metrics['points'] += 1
        metrics['generated'] += g['generatedAfterStep']['low'] == row['tick'] - 1
        metrics['recycled'] += row['counters']['recycledContactCount'] > 0
        metrics['sleeping'] += not c['awakeA'] and not c['awakeB']
        scenes[row['scene']] = scenes.get(row['scene'], 0) + 1
    assert metrics['generated'] and metrics['recycled'] and metrics['sleeping']
    assert len(scenes) == 2
    return {'status': 'PASS_RETAINED_SAMPLES_ONLY', 'directory': str(directory), 'metrics': metrics,
            'scenes': scenes, 'generationKeys': len(generations), 'samplesSHA256': sha(raw),
            'contractSHA256': sha(contract_bytes), 'identity': contract['identity'], 'tolerance': contract['tolerance']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('debug', type=Path)
    parser.add_argument('release', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    assert not args.output.exists(), 'Preserve prior reports instead of overwriting.'
    debug, release = review(args.debug), review(args.release)
    assert debug['samplesSHA256'] == release['samplesSHA256']
    report = {'status': 'PASS_RETAINED_SAMPLES_ONLY', 'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'scriptSHA256': sha(Path(__file__).read_bytes()), 'debug': debug, 'release': release,
              'scope': 'Independent Python analytic recomputation of all retained Debug/Release records. Does not rerun simulation, qualify other shape families, or establish browser/engine acceptance.'}
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'status': report['status'], 'debug': debug['metrics'], 'release': release['metrics']}))
