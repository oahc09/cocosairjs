"""Independently check retained component controls and finite real-WASM records.

This is a raw-record/hash review, not another simulation or a formal Gate run.
Run from the repository root; it writes only the new output directory argument.
"""
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path.cwd()
OUT = Path(sys.argv[1])
assert not OUT.exists()
OUT.mkdir(parents=True)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def hashes_current(rows):
    for path, expected in rows.items():
        assert digest(ROOT / path) == expected, path


def owner_valid(owner):
    assert owner['activeTemporaryScopes'] == 0
    assert owner['stagedCommandsSupported'] is False
    assert owner['unifiedTransactionsSupported'] is False


base = Path('docs/physics/box3d/rebuild')
runs = []
for name, steps, current in [
    ('owner-component-real-release-20261022-lifecycle-stage-a', 63, True),
    ('owner-writeback-real-release-20261022-alias-stage-a', 1, True),
    ('owner-writeback-real-release-20261022-caught-a', 1, False),
    ('owner-writeback-real-release-20261022-alias-a', 1, False),
]:
    directory = base / name
    receipt = json.loads((directory / 'receipt.json').read_bytes())
    raw = json.loads((directory / 'native-and-app.raw.json').read_bytes())
    assert receipt['child'] == {'exitCode': 0, 'signal': None, 'error': None}
    assert receipt['inputsUnchanged'] is True
    assert receipt['sourceHashesBefore'] == receipt['sourceHashesAfter']
    assert raw['sourceHashesBefore'] == receipt['sourceHashesBefore'] == raw['sourceHashesAfter']
    assert digest(directory / 'native-and-app.raw.json') == receipt['nativeReportSha256']
    for path, expected in receipt['sourceHashesBefore'].items():
        assert digest(directory / 'inputs' / path) == expected, (name, path)
    if current:
        hashes_current(receipt['sourceHashesBefore'])
    inputs = receipt['artifact']['buildInputHashes']
    assert len(inputs) == 50
    hashes_current({row['path']: row['sha256'] for row in inputs})
    for artifact in receipt['artifact']['artifacts']:
        file = Path(receipt['artifactDirectory']) / artifact['path']
        assert digest(file) == artifact['sha256'] and file.stat().st_size == artifact['bytes']
    assert raw['artifact'] == receipt['artifact']
    actual_steps = [call for call in raw['calls'] if call['name'] == 'step']
    assert len(actual_steps) == steps and all(call['returned'] for call in actual_steps)
    assert not raw['observationErrors']
    assert raw['beforeBindingDispose']['coreBytes'] == '0'
    assert all(str(value) == '0' for value in raw['beforeBindingDispose']['bridge'].values())
    assert raw['loaderAfter']['status'] == 'DISPOSED' and not raw['loaderAfter']['cleanupErrors']
    checkpoints = {row['name']: row['data'] for row in raw['checkpoints']}
    if 'writeback' in name:
        first = checkpoints['first-actual-step']
        after = first['after']
        owner_valid(after['world']['commandOwner'])
        assert after['native']['nativeStepIndex'] == 1 and after['native']['nativeCompleted'] is True
        checks = checkpoints['final-assertions']['checks']
        assert checks and all(check['pass'] is True for check in checks)
        assert checkpoints['final-assertions']['failure'] is None
        if 'alias' in name:
            assert after['world']['state'] == 'faulted'
            assert first['error']['code'] == 'AIR_E_BOX3D_CONFIG'
            assert any(event['stage'] == 'raw-local-alias' for event in first['events'])
        else:
            assert after['world']['state'] == 'ready' and first['error'] is None
            caught = [event for event in first['events'] if event['stage'] == 'business-setter-caught']
            assert len(caught) == 1 and caught[0]['error']['code'] == 'AIR_E_BOX3D_REENTRANT'
        detail = {'state': after['world']['state'], 'assertions': len(checks), 'nativeCompleted': True}
    else:
        before_close = checkpoints['disable-pending-restore-destroy-rigidbody']
        assert before_close['native']['nativeStepIndex'] == 63
        assert before_close['world']['state'] == 'ready'
        owner_valid(before_close['world']['commandOwner'])
        detail = {'state': 'ready', 'nativeStepIndex': 63}
    runs.append({'directory': str(directory), 'receiptSha256': digest(directory / 'receipt.json'),
                 'rawSha256': receipt['nativeReportSha256'], 'nativeSteps': steps,
                 'currentNamedSourcesVerified': current, 'namedSourceCount': len(receipt['sourceHashesBefore']),
                 'scope': receipt['scope'], 'detail': detail})

directory = Path('tools/verify/box3d/component-entry-fence-stage-a-evidence-20261022-lead-a')
receipt = json.loads((directory / 'receipt.json').read_bytes())
raw = json.loads(gzip.decompress((directory / 'raw.json.gz').read_bytes()))
assert digest(directory / 'raw.json.gz') == receipt['rawSha256']
assert receipt['sourcesUnchanged'] and receipt['recordedChecksConsistent']
assert receipt['sourcesBefore'] == receipt['sourcesAfter']
assert receipt['loadedEngineHashesBefore'] == receipt['loadedEngineHashesAfter']
hashes_current(receipt['sourcesBefore'])
hashes_current(receipt['loadedEngineHashesBefore'])
assert len(receipt['loadedEngineHashesBefore']) == 409
assert all(command['exitCode'] == 0 for command in receipt['commands'])
assert len(raw['rows']) == len(receipt['rows']) == 123
count = 0
for row, summary in zip(raw['rows'], receipt['rows']):
    assert row['name'] == summary['name']
    assert summary['fixtureFailure'] is None and summary['failedChecks'] == 0
    assert all(check['passed'] is True for check in row['checks'])
    assert len(row['checks']) == summary['checks']
    count += len(row['checks'])
assert count == 1283
result = {'status': 'PASS_LIMITED_RAW_RECORD_AND_CURRENT_HASH_REVIEW',
          'reviewedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'reviewerSha256': digest(__file__), 'realRuns': runs,
          'independentSourceRerun': {'cases': 123, 'checks': count, 'loadedEngineModules': 409,
                                    'receiptSha256': digest(directory / 'receipt.json'),
                                    'rawGzipSha256': receipt['rawSha256'], 'scope': receipt['scope']},
          'limits': ['Named-source real WASM inputs, not full transitive runtime qualification',
                     'Earlier caught/alias runs retain their original pre-Stage-A four component hashes',
                     'Node/Jest/JSDOM HEADLESS only; no browser/GPU/target/public unified consumer',
                     'All 2128 formal required cells remain NOT_RUN']}
(OUT / 'receipt.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
