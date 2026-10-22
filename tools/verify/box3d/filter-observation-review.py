#!/usr/bin/env python3
"""Independent retained l2 filter/state review. Does not run or simulate Box3D.
Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""
import argparse
import copy
import datetime
import hashlib
import json
from pathlib import Path

FIXTURE_SHA256 = 'ab79a3a0a6a8677b250b072a6611267896419c1b06839608e58ab9747065937a'
SCHEMA_SHA256 = '78fccc27f58503178fcc824473a0e30d42fa54f19e87bd9424b83a975d45b738'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def reject_nonfinite(value):
    raise ValueError('Nonfinite JSON number: ' + value)


def read_json(path):
    return json.loads(path.read_bytes(), parse_constant=reject_nonfinite)


def error_outcome(error, expected):
    if expected is None:
        assert 'mutationOutcome' not in error and 'descriptor' not in error
    else:
        assert error['mutationOutcome'] == expected
        assert error['descriptor'] == {
            'value': expected, 'writable': False, 'enumerable': True, 'configurable': False}


def review_observations(report):
    assert report['status'] == 'PASS'
    assert report['fixtureSha256'] == FIXTURE_SHA256, 'Unreviewed fixture version'
    assert report['identity']['schemaSha256'] == SCHEMA_SHA256, 'Unreviewed native schema'
    o = report['observations']
    assert o['defaults'] == [{'group': 1, 'mask': 0xffffffff}] * 6
    bits = [0, -1, -2147483648, 2147483648, 4294967295]
    assert [r['input'] for r in o['bitsets']] == bits
    for row in o['bitsets']:
        # Python integer masking independently recomputes JS signed32 -> native uint64 conversion.
        expected = row['input'] & 0xffffffff
        assert row['actual'] == [{'group': expected, 'mask': expected}] * 6
    growth = o['heapGrowth']
    assert growth['afterBytes'] > growth['beforeBytes'] > 0
    assert all(type(v) is int and v % 65536 == 0 for v in growth.values())
    assert len(o['reuse']) == 128
    pairs = set()
    for row in o['reuse']:
        old, new = row['old'], row['next']
        assert old['high'] == new['high'] and old['low'] != new['low']
        pair = (old['low'], old['high'], new['low'], new['high'])
        assert pair not in pairs
        pairs.add(pair)
        error_outcome(row['error'], 'not-mutated')
    trace = o['contactTrace']
    assert [r['tick'] for r in trace] == list(range(1, 601))
    assert sum(r['begins'] for r in trace) > 0
    assert trace[0]['y'] > 1.9 and abs(trace[-1]['y'] - 0.5) < 0.001
    assert trace[-1]['sleeping'] is True and trace[-1]['contacts'] > 0
    contact = o['contactTransition']
    before, off, on = (contact[k] for k in ['sleeping', 'suppressed', 'resumed'])
    assert [s['stepIndex'] for s in [before, off, on]] == [600, 601, 602]
    assert before['contactsOfOwnedBodies'] and not off['contactsOfOwnedBodies']
    assert off['contactEnds'] and on['contactBegins'] and on['contactsOfOwnedBodies']
    old_contact = before['contactsOfOwnedBodies'][0]
    new_contact = on['contactsOfOwnedBodies'][0]
    assert old_contact['contactId'] != new_contact['contactId']
    assert old_contact['shapeA'] == new_contact['shapeA']
    assert old_contact['shapeB'] == new_contact['shapeB']
    assert not old_contact['awakeB'] and new_contact['awakeB']
    assert contact['finalDiagnostics'] == {
        'nativeStepIndex': 602, 'nativeCompleted': True, 'snapshotAvailable': True}
    sensor = o['sensorTransition']
    enter, leave, reenter = (sensor[k] for k in ['enter', 'exit', 'reenter'])
    assert [s['stepIndex'] for s in [enter, leave, reenter]] == [1, 2, 3]
    assert len(enter['sensorBegins']) == len(leave['sensorEnds']) == len(reenter['sensorBegins']) == 1
    assert not leave['sensorBegins'] and not reenter['sensorEnds']
    for key in ['sensor', 'visitor']:
        assert enter['sensorBegins'][0][key] == leave['sensorEnds'][0][key] == reenter['sensorBegins'][0][key]
    outcomes = {r['name']: r for r in o['outcomes']}
    assert len(outcomes) == len(o['outcomes']) == 9
    for name in ['boolean', 'native-static-velocity-status8', 'native-mass-tensor-overflow-status2',
                 'negative-mass', 'force-NaN']:
        error_outcome(outcomes[name]['error'], 'not-mutated')
        assert outcomes[name]['before']['diagnostics']['nativeStepIndex'] == 1
    cases = [
        ('body-post-native-readback-injected-status', 'committed', 'realStateCalls', 1, 'gravityScale', 3),
        ('body-native-call-throw-unknown', None, 'realControlCalls', 2, 'gravityScale', 4),
        ('filter-post-commit-js-copy-failure', 'committed', 'realFilterCalls', 3, 'filter', {'group': 32, 'mask': 64}),
        ('filter-native-call-throw-unknown', None, 'realFilterCalls', 4, 'filter', {'group': 64, 'mask': 32}),
    ]
    for name, outcome, call_key, step, field, value in cases:
        row = outcomes[name]
        error_outcome(row['error'], outcome)
        assert row[call_key] == 1
        after = row['after']
        assert after['diagnostics'] == {
            'nativeStepIndex': step, 'nativeCompleted': True, 'snapshotAvailable': False}
        assert (after['filter'] if field == 'filter' else after['body'][field]) == value
    assert len(report['negatives']) == len({r['label'] for r in report['negatives']}) == 23
    assert len(report['injectedMechanisms']) == 3
    return {'bitsetCases': 5, 'managedCreationObservations': 6, 'reusePairs': 128,
            'contactTicks': 600, 'sensorTransitions': 3, 'recordedOutcomeCases': 9,
            'injectedPostNativeCases': 4, 'negativeLabels': 23}


def review(directory):
    path = directory / 'wasm-filter-contract.raw.json'
    report = read_json(path)
    manifest = read_json(directory / 'manifest.json')
    assert report['identity'] == manifest
    for row in manifest['artifacts']:
        data = (directory / row['path']).read_bytes()
        assert len(data) == row['bytes'] and sha(data) == row['sha256']
    receipt = read_json(directory / 'build-receipt.json')
    inputs = {r['path']: r['sha256'] for r in receipt['inputHashes']}
    assert inputs['tools/physics/box3d/wasm-filter-contract.mjs'] == FIXTURE_SHA256
    return {'directory': str(directory), 'rawSha256': sha(path.read_bytes()),
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
    # Heap capacity is build-dependent. Its exact retained values are reported, not equated.
    ca, cb = copy.deepcopy(ra['observations']), copy.deepcopy(rb['observations'])
    growth = [ca.pop('heapGrowth'), cb.pop('heapGrowth')]
    assert ca == cb, 'Debug/Release physical/event/error observation difference'
    assert ra['negatives'] == rb['negatives']
    result = {'status': 'PASS_INDEPENDENT_RETAINED_OBSERVATION_REVIEW',
              'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'reviewerSha256': sha(Path(__file__).read_bytes()), 'fixtureSha256': FIXTURE_SHA256,
              'builds': [a, b], 'heapGrowthByMode': growth,
              'scope': 'Independent retained Node WASM data review, not a new native execution. '
                       'Post-native failure mechanisms are injected; no spontaneous native failure claim. '
                       'Negative records retain before-state only; this review counts labels, not independent after-state proof. '
                       'Not AIR component, browser, complete C36 or Gate acceptance.'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
