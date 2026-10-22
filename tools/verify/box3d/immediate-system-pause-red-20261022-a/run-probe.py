#!/usr/bin/env python3
"""Single source-only Jest probe; all writes remain in this independent directory."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

root = Path(__file__).resolve().parent
repo = root.parent / 'box3d-rebuild-20261022'
attempt = root / (sys.argv[1] if len(sys.argv) > 1 else 'attempt-a')
attempt.mkdir(exist_ok=False)

def digest(path):
    data = path.read_bytes()
    return {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}

def write(name, value):
    (attempt / name).write_text(json.dumps(value, indent=2) + '\n')

inputs = {}
for directory in ('src', 'test'):
    for path in sorted((repo / directory).rglob('*')):
        if path.is_file() and path.suffix in ('.ts', '.js', '.mjs', '.cjs', '.json'):
            inputs[str(path.relative_to(repo))] = digest(path)
for item in ('jest.config.js', 'babel.config.js', 'tsconfig.json', 'package.json', 'package-lock.json',
             'tools/verify/box3d/owner-checkpoint-a-control.test.ts',
             'docs/physics/box3d/contracts/unified-owner-lifecycle-decisions-v1.md',
             'tools/verify/box3d/immediate-system-pause-plan-20261022-a/README.md'):
    inputs[item] = digest(repo / item)
write('source-before.json', {'identifiedCommitAtPreparation': '4e1cb31336dee13c549d8ec94ab71e64072e93e2', 'files': inputs})
write('fixture-before.json', {p.name: digest(p) for p in root.iterdir() if p.is_file()})
command = [str(repo / 'node_modules/.bin/jest'), '--config', str(root / 'pause-control.jest.cjs'),
           '--runInBand', '--no-coverage', '--json', '--outputFile', str(attempt / 'jest-results.json')]
env = dict(os.environ, BOX3D_PAUSE_RAW=str(attempt / 'raw.json'), NODE_ENV='test')
write('command.json', {'cwd': str(repo), 'argv': command, 'environmentOverrides': {'BOX3D_PAUSE_RAW': env['BOX3D_PAUSE_RAW'], 'NODE_ENV': 'test'}})
started = datetime.now(timezone.utc).isoformat()
with (attempt / 'stdout.log').open('w') as stdout, (attempt / 'stderr.log').open('w') as stderr:
    result = subprocess.run(command, cwd=repo, env=env, stdout=stdout, stderr=stderr, timeout=180)
finished = datetime.now(timezone.utc).isoformat()
(attempt / 'exit-code.txt').write_text(str(result.returncode) + '\n')
raw_path = attempt / 'raw.json'
raw = json.loads(raw_path.read_text()) if raw_path.exists() else None
loaded = raw.get('loadedSources', []) if raw else []
drift = []
for entry in loaded:
    p = entry['path']
    before = inputs.get(p)
    after = digest(repo / p)
    if before is None or before != after or after['sha256'] != entry['sha256']:
        drift.append({'path': p, 'before': before, 'during': entry, 'after': after})
rows = raw.get('rows', []) if raw else []
statuses = {}
for row in rows:
    statuses[row['status']] = statuses.get(row['status'], 0) + 1
setup_or_execution = not raw or any(row['status'] in ('SETUP_PENDING', 'SETUP_ERROR', 'EXECUTION_ERROR_UNCLASSIFIED') for row in rows)
cleanup_errors = any(row.get('cleanupStatus') != 'CLOSED' for row in rows)
status = ('SOURCE_DRIFT_INVALID' if drift else 'SETUP_OR_EXECUTION_ERROR' if setup_or_execution else
          'CLEANUP_ERROR' if cleanup_errors else 'PRODUCT_CONTRACT_RED' if statuses.get('RED_PRODUCT_CONTRACT_SOURCE_WITH_MOCK_BINDING') else 'SOURCE_CONTROLS_PASS')
write('receipt.json', {'status': status, 'startedAt': started, 'finishedAt': finished, 'jestExitCode': result.returncode,
    'caseCounts': statuses, 'loadedSourceCount': len(loaded), 'loadedSourceDrift': drift,
    'scope': 'Actual source with explicitly mock native binding, not WASM or physics qualification',
    'formalRequiredCells': {'count': 2128, 'status': 'NOT_RUN'}, 'stagedCommandsSupported': False,
    'unifiedTransactionsSupported': False, 'producerOwnerConnection': 'NOT_INTEGRATED', 't12': 'NOT_RUN',
    'artifacts': {p.name: digest(p) for p in attempt.iterdir() if p.is_file()}})
print(json.dumps({'attempt': str(attempt), 'status': status, 'jestExitCode': result.returncode, 'cases': statuses, 'loadedSourceDrift': len(drift)}))
sys.exit(result.returncode)
