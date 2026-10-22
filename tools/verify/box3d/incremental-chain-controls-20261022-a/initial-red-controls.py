#!/usr/bin/env python3
"""Pure, exact-AST reproduction of the initial metadata downgrade boundary.

This does not restore a bundle, run Git, read an actual restore store, or write
outside this evidence directory. The original large source receipt is read
only for hashing and parsing, never copied.
"""
import ast
import datetime
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent / 'box3d-rebuild-20261022'
SOURCE = HERE.parent / 'box3d-shared-material-kernel-library-roundtrip-20261022/checkpoint-receipt.json'
PROOF_REL = 'docs/physics/box3d/rebuild/library-shared-material-kernel-checkpoint-20261022.json'
EXPECTED = {
    'rebuild-incremental-checkpoint.py': 'aec4b5ff179416e9294c3f56c765e5df357322fae9533451b22a9a7d682b8be1',
    'restore-library-checkpoint.py': '4eec06ded94298aca767e6e9a9fcf886dfc6f94beef413a4238d6e1d32e602fb',
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def save(name, data):
    with (HERE / name).open('x') as f:
        f.write(json.dumps(data, indent=2) + '\n')

sources = {name: (HERE / 'sources' / name).read_bytes() for name in EXPECTED}
for name, data in sources.items():
    assert sha(data) == EXPECTED[name]
restore_text = sources['restore-library-checkpoint.py'].decode()
restore_ast = ast.parse(restore_text)
function = next(n for n in restore_ast.body if isinstance(n, ast.FunctionDef) and n.name == 'validate_prerequisite')
namespace = {'Path': Path, 'hashlib': hashlib, 'json': json}
exec(compile(ast.Module(body=[function], type_ignores=[]), 'initial-exact-restore-source', 'exec'), namespace)
with (HERE / 'initial-extracted-validate-prerequisite.py').open('x') as f:
    f.write(ast.get_source_segment(restore_text, function) + '\n')

source_bytes = SOURCE.read_bytes()
prior = json.loads(source_bytes)
proof_bytes = (REPO / PROOF_REL).read_bytes()
proof = json.loads(proof_bytes)
builder_ast = ast.parse(sources['rebuild-incremental-checkpoint.py'].decode())
chain_if = next(n for n in builder_ast.body if isinstance(n, ast.If) and isinstance(n.test, ast.Attribute) and n.test.attr == 'prerequisite_source_receipt')
chain_assignment = chain_if.body[-1]
assert isinstance(chain_assignment, ast.Assign) and chain_assignment.targets[0].id == 'prerequisite'
ns = {'base': prior['commit'], 'source': prior, 'library': proof,
      'source_bytes': source_bytes, 'library_bytes': proof_bytes,
      'library_path': REPO / PROOF_REL, 'root': REPO, 'hashlib': hashlib}
exec(compile(ast.Module(body=[chain_assignment], type_ignores=[]), 'initial-exact-builder-source', 'exec'), ns)
valid_candidate = {'commit': 'SYNTHETIC_CHECKPOINT37_METADATA_ONLY', 'prerequisite': ns['prerequisite']}
assert namespace['validate_prerequisite'](valid_candidate, prior, source_bytes, REPO) == ns['prerequisite']

bad_candidate = {'commit': 'SYNTHETIC_CHECKPOINT37_METADATA_ONLY', 'prerequisite': {
    'commit': 'e5c5674bfe08be0c9fda72c484f4380bd0d0e2c6',
    'libraryFileId': 'libfile_10c86f5827f481919e3938fbb0c2670b',
}}
accepted = namespace['validate_prerequisite'](bad_candidate, prior, source_bytes, REPO)
assert accepted == bad_candidate['prerequisite']

save('initial-source-hashes.json', {
    'frozenToolSha256': EXPECTED,
    'sourceReceipt': {'path': str(SOURCE), 'bytes': len(source_bytes), 'sha256': sha(source_bytes)},
    'actual36LibraryReceipt': {'path': str(REPO / PROOF_REL), 'bytes': len(proof_bytes), 'sha256': sha(proof_bytes)},
})
save('base36-summary.json', {k: prior[k] for k in ['commit', 'tree', 'branch', 'committedOnly', 'prerequisite', 'bundle']})
with (HERE / 'actual36-library-proof.json').open('xb') as f:
    f.write(proof_bytes)
save('initial-red-receipt.json', {
    'status': 'RED_LEGACY_METADATA_DOWNGRADE_ACCEPTED_BY_INITIAL_GUARD',
    'timeUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sourceHashes': EXPECTED,
    'exactFunctionLines': [function.lineno, function.end_lineno],
    'validExact36PrerequisiteAccepted': True,
    'downgradedCandidateAccepted': bad_candidate,
    'priorCommit': prior['commit'],
    'missing36SourcePinAndLibraryProofAccepted': True,
    'findings': [
        'The branch selector is presence of sourceCheckpointReceiptSha256. A declared legacy22 prerequisite bypasses exact36 identity checks.',
        'Initial restore code does not compare the actual Git bundle prerequisite header to the receipt prerequisite.',
        'This is a metadata consistency boundary, not proof of incorrect normally generated paired-receipt output.',
    ],
    'noBundleReadOrCopied': True,
    'noGitCommandsOrActualRestore': True,
    'scope': 'Exact-AST guard unit control only. Not actual checkpoint37 Library download, full-file restoration, standalone/full-repository restoration, build closure or physical acceptance.',
})
print(json.dumps({'status': 'RED_LEGACY_METADATA_DOWNGRADE_ACCEPTED_BY_INITIAL_GUARD', 'valid36': 'PASS', 'priorCommit': prior['commit'], 'sourceHashes': EXPECTED}, indent=2))
