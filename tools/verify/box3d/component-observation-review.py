#!/usr/bin/env python3
"""Independent finite lifecycle-data review, not another physics execution.
Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""
import argparse
import datetime
import hashlib
import json
import math
from pathlib import Path

FIXTURES = {
    '599711fab2a65fa862963534e24a27ebf802742d50f98d915d2a9be04bffb81a': 'd',
    '59cfb1847508831e0994b2a3bafd2c59ee9067def61c3999809d6389d07e7c87': 'g',
}
WASM_SHA256 = '17a7c8d873f1ff03db183c3d264e641ca213cabe9120cddd36b64be6997a1c5d'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def reject_nonfinite(value):
    raise ValueError('Nonfinite JSON number: ' + value)


def read_json(path):
    return json.loads(path.read_bytes(), parse_constant=reject_nonfinite)


def near(actual, expected, tolerance=0.00002):
    assert type(actual) in (int, float) and math.isfinite(actual)
    assert abs(actual - expected) <= tolerance, (actual, expected, tolerance)


def review_observations(raw):
    assert raw['status'] == 'PASS_LIMITED_NODE_COMPONENTS' and raw['expected'] == 'lifecycle'
    assert raw['sourceHashesBefore'] == raw['sourceHashesAfter']
    fixture = raw['sourceHashesBefore']['tools/verify/box3d/body-component-real-wasm.test.ts']
    assert fixture in FIXTURES, 'Unreviewed fixture version'
    epoch = FIXTURES[fixture]
    artifacts = {item['path']: item for item in raw['artifact']['artifacts']}
    assert artifacts['box3d-st.wasm']['sha256'] == WASM_SHA256
    assert artifacts['box3d-st.wasm']['bytes'] == 556240
    assert not raw['observationErrors'] and raw['moduleCreated'] is True
    points = {point['name']: point['data'] for point in raw['checkpoints']}
    assert len(points) == len(raw['checkpoints']) == (8 if epoch == 'd' else 9)
    startup = points['real-startup-and-scene']
    assert startup['world']['state'] == 'ready'
    assert startup['world']['gravity'] == [0, -6, 0] and startup['world']['solverSubSteps'] == 4
    initial = points['actual-orders-static-multiple-collider']
    assert {key: initial['counts'][key] for key in ['bodies', 'shapes', 'contacts', 'joints']} == {
        'bodies': 3, 'shapes': 4, 'contacts': 0, 'joints': 0}
    assert initial['filters'] == [{'group': 2147483648, 'mask': 4294967295}] * 2
    assert initial['bodyA']['type'] == initial['bodyB']['type'] == 2
    assert initial['staticBody']['type'] == 0 and initial['staticBody']['mass'] == 0
    # Independently derive mass centroid and inertia for the declared fixture:
    # a box of half-extents 1 centered at x=1 and a radius-.5 sphere at x=-2,
    # equal density scaled to total mass 6. Steiner terms are not read from Box3D.
    box_volume, sphere_volume = 8, 4 * math.pi * 0.5 ** 3 / 3
    box_mass = 6 * box_volume / (box_volume + sphere_volume)
    sphere_mass = 6 - box_mass
    center = (box_mass - 2 * sphere_mass) / 6
    ix = box_mass * 2 / 3 + sphere_mass * 2 * 0.5 ** 2 / 5
    iy = ix + box_mass * (1 - center) ** 2 + sphere_mass * (-2 - center) ** 2
    body = initial['bodyA']
    assert body['mass'] == body['requestedMass'] == 6 and not body['massPending']
    for actual, expected in zip(body['localCenter'], [center, 0, 0]):
        near(actual, expected)
    assert len(body['inertia']) == 9
    for actual, expected in zip(body['inertia'], [ix, 0, 0, 0, iy, 0, 0, 0, iy]):
        near(actual, expected)
    trajectory = points['native-origin-not-com-trajectory']
    assert trajectory['native'] == {'nativeStepIndex': 60, 'nativeCompleted': True, 'snapshotAvailable': True}
    assert len(trajectory['poses']) == 60
    if epoch == 'g':
        assert trajectory['unrelatedDirtyFlags'] == 4
        assert trajectory['flagsAfter'] & trajectory['unrelatedDirtyFlags'] == 4
    errors = []
    for tick, sample in enumerate(trajectory['poses'], 1):
        # Semi-implicit Euler in four native substeps, dt=1/60, y0=20, v0=0, g=-6.
        n = 4 * tick
        expected_y = 20 - (6 / 240 ** 2) * n * (n + 1) / 2
        assert len(sample['pose']) == 10 and len(sample['node']) == 3
        assert sample['node'] == sample['pose'][:3]
        for actual, expected in zip(sample['node'], [0, expected_y, 0]):
            near(actual, expected)
        assert sample['pose'][3:7] == [0, 0, 0, 1]
        near(sample['pose'][7], center)
        assert sample['pose'][8:10] == sample['pose'][1:3]
        errors.append(abs(sample['node'][1] - expected_y))
    near(trajectory['body']['linearVelocity'][1], -6)
    near(trajectory['bounds']['center'][0], 1)
    assert trajectory['bounds']['center'][1:] == trajectory['poses'][-1]['node'][1:]
    assert trajectory['bounds']['half'] == [1, 1, 1]
    assert points['real-component-debug-1']['flags'] == 1
    assert points['real-component-debug-1']['primitives']
    assert points['real-component-debug-4']['flags'] == 4
    assert len(points['real-component-debug-4']['primitives']) == 4
    disabled = points['disable-pending-restore-destroy-rigidbody']
    assert disabled['state']['type'] == 0 and disabled['state']['mass'] == 0
    assert disabled['native']['nativeStepIndex'] == 63
    owners = points['component-owners-released-before-world']
    assert all(owners['counts'][key] == 0 for key in ['bodies', 'shapes', 'contacts', 'joints'])
    # Before final world destruction, scratch/allocator storage is still honestly present.
    assert int(owners['counts']['liveBytes']) > 0 and int(owners['bridge']['liveBytes']) > 0
    assert owners['world']['sceneBindingCount'] == owners['world']['materialShapeCount'] == 0
    close = points['actual-owned-native-cleanup']['close']
    assert close['status'] == 'released' and not close['pending'] and not close['failures']
    assert close['retained'] == ['runtime', 'scheduler', 'builtin-resources', 'shared-asset-caches']
    prep = close['physicsPreparation']
    assert prep['status'] == 'closed' and not prep['cleanupErrors']
    assert {item['resource'] for item in prep['acquired']} == {'module', 'world'}
    assert all(item['cleanup'] == 'released' and not item['retained'] for item in prep['acquired'])
    assert raw['beforeBindingDispose'] == {'coreBytes': '0', 'bridge': {
        'liveBytes': '0', 'liveAllocations': 0, 'shapeHandles': 0,
        'primitiveCapacity': 0, 'capturedPrimitives': 0}}
    assert raw['loaderAfter']['status'] == 'DISPOSED' and not raw['loaderAfter']['cleanupErrors']
    return {
        'status': 'PASS_LIMITED_RETAINED_COMPONENT_DATA',
        'reviewedSourceEpoch': epoch, 'fixtureSha256': fixture,
        'centroidX': center, 'principalInertia': [ix, iy, iy],
        'trajectorySamples': 60, 'maxYErrorMeters': max(errors),
        'finalY': trajectory['poses'][-1]['node'][1],
        'scope': 'Mathematical and lifecycle review of two finite recorded executions; no new physics execution, browser/GPU, global memory-zero, whole T10/T11/C36 or production qualification.',
    }


def review_directory(directory):
    raw_path = directory / 'native-and-app.raw.json'
    receipt_path = directory / 'receipt.json'
    raw, receipt = read_json(raw_path), read_json(receipt_path)
    assert receipt['status'] == raw['status']
    assert receipt['sourceHashesBefore'] == raw['sourceHashesBefore']
    for name, digest in raw['sourceHashesBefore'].items():
        assert sha((directory / 'inputs' / name).read_bytes()) == digest, name
    return raw, {'path': str(directory), 'rawSha256': sha(raw_path.read_bytes()),
                 'receiptSha256': sha(receipt_path.read_bytes()), **review_observations(raw)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('first', type=Path)
    parser.add_argument('second', type=Path)
    args = parser.parse_args()
    first, a = review_directory(args.first)
    second, b = review_directory(args.second)
    assert first['sourceHashesBefore'] == second['sourceHashesBefore']
    assert first['artifact'] == second['artifact']
    selected = ['actual-orders-static-multiple-collider', 'native-origin-not-com-trajectory',
                'real-component-debug-1', 'real-component-debug-4',
                'disable-pending-restore-destroy-rigidbody', 'component-owners-released-before-world']
    for name in selected:
        x = next(p['data'] for p in first['checkpoints'] if p['name'] == name)
        y = next(p['data'] for p in second['checkpoints'] if p['name'] == name)
        assert x == y, name
    print(json.dumps({'status': 'PASS_LIMITED_RETAINED_COMPONENT_DATA',
                      'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                      'reviewerSha256': sha(Path(__file__).read_bytes()),
                      'identicalPhysicalCheckpoints': selected, 'runs': [a, b]}, indent=2))


if __name__ == '__main__':
    main()
