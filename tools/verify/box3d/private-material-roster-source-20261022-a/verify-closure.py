#!/usr/bin/env python3
"""Read-only payload/reference closure verification; writes only explicit verification receipts."""
from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parent
excluded = {'closure-manifest.json', 'closure-verification.json', 'closure-verification.log'}
errors = []
manifest = json.loads((root / 'closure-manifest.json').read_text())
listed = set()

def validate_path(relative):
    p = root / relative
    if not isinstance(relative, str) or Path(relative).is_absolute() or '..' in Path(relative).parts:
        raise ValueError('Nonlocal payload reference: ' + str(relative))
    if p.is_symlink():
        raise ValueError('Symlink payload: ' + relative)
    return p

for row in manifest['files']:
    relative = row['path']
    if relative in listed:
        errors.append('Duplicate payload: ' + relative)
    listed.add(relative)
    p = validate_path(relative)
    if not p.is_file():
        errors.append('Missing payload: ' + relative)
        continue
    raw = p.read_bytes()
    if len(raw) != row['bytes'] or hashlib.sha256(raw).hexdigest() != row['sha256']:
        errors.append('Payload hash/length mismatch: ' + relative)
actual = {str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and str(p.relative_to(root)) not in excluded}
if actual != listed:
    errors.append('Payload inventory mismatch: ' + repr(sorted(actual ^ listed)))
if any(p.is_symlink() for p in root.rglob('*')):
    errors.append('Unexpected symlink in artifact')

references = []
source_status = []
initial = json.loads((root / 'input-manifest.json').read_text())
for row in initial['files']:
    p = validate_path(row['snapshot'])
    raw = p.read_bytes()
    if len(raw) != row['bytes'] or hashlib.sha256(raw).hexdigest() != row['sha256']:
        errors.append('Reference snapshot changed: ' + row['snapshot'])
    references.append(row['snapshot'])
    original = Path(row['source'])
    source_status.append({'source': row['source'], 'matchesSnapshotNow': original.is_file() and original.read_bytes() == raw})
final_manifest = json.loads((root / 'evidence/final-input-manifest.json').read_text())
for row in final_manifest['files']:
    p = validate_path(row['path'])
    raw = p.read_bytes()
    if len(raw) != row['bytes'] or hashlib.sha256(raw).hexdigest() != row['sha256']:
        errors.append('Final frozen input changed: ' + row['path'])
    references.append(row['path'])
run = json.loads((root / 'evidence/final-run.json').read_text())
references += [run['inputManifest'], run['controlsReport']] + [row['rawLog'] for row in run['runs']]
for reference in references:
    if reference not in listed or not validate_path(reference).is_file():
        errors.append('Reference outside verified payload: ' + reference)
if any(row['exitCode'] != 0 for row in run['runs']) or not run['compiledMatchesCandidate']:
    errors.append('Final run was not completely successful')
result = json.loads((root / run['controlsReport']).read_text())
if (result['passed'], result['failed'], result['total']) != (44, 0, 44):
    errors.append('Unexpected final control totals')
if result['engineIntegration'] or result['unifiedActivation'] or result['formalRequiredCellsUnchanged']['NOT_RUN'] != 2128:
    errors.append('Qualification boundary drift')
if (root / 'src/physics-material-values-transaction.ts').read_bytes() != (root / 'evidence/final-inputs/src/physics-material-values-transaction.ts').read_bytes():
    errors.append('Final source differs from candidate')
receipt = {'schema': 'candidate-closure-verification/1', 'status': 'PASS' if not errors else 'FAIL',
           'payloadFiles': len(listed), 'payloadBytes': sum(row['bytes'] for row in manifest['files']),
           'verifiedManifestReferences': len(references), 'sourceSnapshotCurrentStatus': source_status,
           'scope': 'Authored code, frozen input/reference bytes, compiled output and evidence; not bundled external toolchain',
           'errors': errors}
(root / 'closure-verification.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({k: v for k, v in receipt.items() if k != 'sourceSnapshotCurrentStatus'}, indent=2))
sys.exit(bool(errors))
