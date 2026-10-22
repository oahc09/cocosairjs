#!/usr/bin/env python3
"""Bounded, in-memory exact-source controls. No Git, extraction or restore.

Use frozen source snapshots; compile only selected exact AST nodes. All ZIP
members and extracted-file writes in the production ZIP preflight block use
in-memory doubles. The large actual36 source receipt is read once, not copied.
The synthetic bundle has a real-format header, but no real pack, and is never
presented as a restore proof. No subprocess tool is available to tested code.
"""
import ast
import copy
import datetime
import hashlib
import io
import json
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
REPO = HERE.parent / 'box3d-rebuild-20261022'
SOURCE = HERE.parent / 'box3d-shared-material-kernel-library-roundtrip-20261022/checkpoint-receipt.json'
PROOF_REL = 'docs/physics/box3d/rebuild/library-shared-material-kernel-checkpoint-20261022.json'
BRANCH = 'feat/box3d-rebuild-20261022'
SYNTHETIC_HEAD = '7' * 40
BASE22 = 'e5c5674bfe08be0c9fda72c484f4380bd0d0e2c6'
EXPECTED = {
    'rebuild-incremental-checkpoint.py': 'aec4b5ff179416e9294c3f56c765e5df357322fae9533451b22a9a7d682b8be1',
    'restore-library-checkpoint.py': '0f32f52b2a50c79d69a486e3b524669b19bf6d49de7f4a621a175e2e01dba273',
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def save(name, data):
    with (HERE / name).open('x') as f:
        f.write(json.dumps(data, indent=2) + '\n')

def code(nodes, filename):
    return compile(ast.Module(body=nodes, type_ignores=[]), filename, 'exec')

source_map = {name: (HERE / 'revised-sources' / name).read_bytes() for name in EXPECTED}
for name, data in source_map.items():
    assert sha(data) == EXPECTED[name]
restore_text = source_map['restore-library-checkpoint.py'].decode()
builder_text = source_map['rebuild-incremental-checkpoint.py'].decode()
restore_tree = ast.parse(restore_text)
builder_tree = ast.parse(builder_text)
functions = [n for n in restore_tree.body if isinstance(n, ast.FunctionDef) and n.name in ['validate_prerequisite', 'validate_bundle_header']]
assert len(functions) == 2
env = {'Path': Path, 'hashlib': hashlib, 'json': json}
exec(code(functions, 'frozen-revised-restore-functions'), env)
with (HERE / 'revised-extracted-guards.py').open('x') as f:
    f.write('\n\n'.join(ast.get_source_segment(restore_text, n) for n in functions) + '\n')

def call_name(n):
    if isinstance(n, ast.Call):
        if isinstance(n.func, ast.Name):
            return n.func.id
        if isinstance(n.func, ast.Attribute):
            return n.func.attr
    return None

zip_block = next(n for n in restore_tree.body if isinstance(n, ast.With) and call_name(n.items[0].context_expr) == 'ZipFile')
prior_read = next(n for n in restore_tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'prior_bytes' for t in n.targets))
with (HERE / 'revised-extracted-zip-preflight.py').open('x') as f:
    f.write(ast.get_source_segment(restore_text, prior_read) + '\n' + ast.get_source_segment(restore_text, zip_block) + '\n')
chain_if = next(n for n in builder_tree.body if isinstance(n, ast.If) and isinstance(n.test, ast.Attribute) and n.test.attr == 'prerequisite_source_receipt')
builder_nodes = [n for n in builder_tree.body if 28 <= n.lineno <= chain_if.lineno]
assert len(builder_nodes) == 4 and builder_nodes[-1] is chain_if
builder_code = code(builder_nodes, 'frozen-builder-prerequisite-block')
zip_code = code([zip_block], 'frozen-revised-zip-preflight')
prior_code = code([prior_read], 'frozen-revised-prior-read')
with (HERE / 'revised-extracted-builder-prerequisite.py').open('x') as f:
    f.write('\n'.join(ast.get_source_segment(builder_text, n) for n in builder_nodes) + '\n')

source_bytes = SOURCE.read_bytes()
prior = json.loads(source_bytes)
proof_bytes = (HERE / 'actual36-library-proof.json').read_bytes()
proof = json.loads(proof_bytes)
initial_inputs = json.loads((HERE / 'initial-source-hashes.json').read_text())
assert sha(source_bytes) == initial_inputs['sourceReceipt']['sha256']
assert sha(proof_bytes) == initial_inputs['actual36LibraryReceipt']['sha256']
assert (REPO / PROOF_REL).read_bytes() == proof_bytes
input_map = {str(SOURCE): source_bytes, str(REPO / PROOF_REL): proof_bytes}

class ReadPath:
    def __init__(self, value, mapping):
        self.path = Path(value)
        self.mapping = mapping
    def resolve(self):
        return self
    def relative_to(self, root):
        return self.path.relative_to(root)
    def read_bytes(self):
        if str(self.path) not in self.mapping:
            raise FileNotFoundError(str(self.path))
        return self.mapping[str(self.path)]

class ProofRoot:
    def __init__(self, data):
        self.data = data
    def __truediv__(self, name):
        return ReadPath(name, {} if self.data is None else {PROOF_REL: self.data})

def builder_run(source_arg=str(SOURCE), proof_arg=str(REPO / PROOF_REL), mapping=None):
    mapping = input_map if mapping is None else mapping
    e = {'Path': lambda x: ReadPath(x, mapping), 'root': REPO,
         'args': SimpleNamespace(prerequisite_source_receipt=source_arg, prerequisite_library_receipt=proof_arg),
         'json': json, 'hashlib': hashlib}
    exec(builder_code, e)
    return e['prerequisite']

valid_prerequisite = builder_run()
assert valid_prerequisite['commit'] == prior['commit']
assert valid_prerequisite['ancestors'] == [prior['prerequisite']]

def header(base=None, head=SYNTHETIC_HEAD, branch=BRANCH):
    base = prior['commit'] if base is None else base
    return ('# v2 git bundle\n-' + base + ' fixture prerequisite\n' + head + ' refs/heads/' + branch + '\n\n').encode()

class MemoryDirectory:
    def __init__(self, writes):
        self.writes = writes
    def __truediv__(self, name):
        parent = self
        class Member:
            def exists(self):
                return False
            def write_bytes(self, data):
                parent.writes.append({'path': name, 'bytes': len(data), 'sha256': sha(data)})
                return len(data)
        return Member()

class MemoryZip:
    def __init__(self, candidate, bundle_header):
        candidate_bytes = (json.dumps(candidate, sort_keys=True) + '\n').encode()
        bundle_bytes = bundle_header + b'NOT_A_PACK_UNIT_CONTROL_ONLY'
        self.members = {'checkpoint-receipt.json': candidate_bytes, 'box3d-rebuild-incremental.bundle': bundle_bytes}
        rows = [{'path': name, 'bytes': len(data), 'sha256': sha(data)} for name, data in self.members.items()]
        self.members['archive-manifest.json'] = json.dumps(rows).encode()
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def read(self, name):
        return self.members[name]
    def open(self, name):
        return io.BytesIO(self.members[name])
    def namelist(self):
        return list(self.members)

results = []

def record(name, expected, observed, exception=None, writes=None, scope='exact_joint_zip_preflight'):
    passed = expected == observed
    if expected == 'REJECT':
        passed = passed and writes == []
    row = {'case': name, 'expected': expected, 'observed': observed, 'pass': passed, 'scope': scope}
    if exception is not None:
        row.update({'exceptionType': type(exception).__name__, 'message': str(exception)})
    if writes is not None:
        row['inMemoryExtractionWrites'] = writes
        row['physicalWrites'] = 0
        row['gitOrOtherSubprocessCalls'] = 0
    results.append(row)
    print(json.dumps(row, sort_keys=True))

def joint_case(name, mutate=None, expect='REJECT', bundle_header=None, proof_data=proof_bytes, source_data=source_bytes):
    candidate = {'commit': SYNTHETIC_HEAD, 'branch': BRANCH, 'prerequisite': copy.deepcopy(valid_prerequisite), 'bundle': {'file': 'box3d-rebuild-incremental.bundle'}}
    if mutate:
        mutate(candidate)
    writes = []
    z = MemoryZip(candidate, header() if bundle_header is None else bundle_header)
    namespace = dict(env, archive=object(), zipfile=SimpleNamespace(ZipFile=lambda unused: z),
                     root=ProofRoot(proof_data), prior=prior, prior_bytes=source_data,
                     directory=MemoryDirectory(writes), sha=sha)
    try:
        exec(zip_code, namespace)
    except (AssertionError, KeyError, FileNotFoundError, UnicodeError, ValueError, TypeError) as exc:
        record(name, expect, 'REJECT', exc, writes)
    else:
        record(name, expect, 'ACCEPT', writes=writes)
        if expect == 'ACCEPT':
            assert len(writes) == 2

def prerequisite_value(key, value):
    return lambda candidate: candidate['prerequisite'].__setitem__(key, value)

joint_case('valid36_exact_source_and_actual_library_proof', expect='ACCEPT')
joint_case('missing36_source_pin', lambda c: c['prerequisite'].pop('sourceCheckpointReceiptSha256'))
joint_case('missing36_source_bytes', source_data=b'')
joint_case('missing36_library_proof_file', proof_data=None)
joint_case('missing36_library_proof_path_field', lambda c: c['prerequisite'].pop('libraryRestoreReceiptPath'))
joint_case('wrong_base_commit', prerequisite_value('commit', '0' * 40))
joint_case('wrong_base_tree', prerequisite_value('tree', '0' * 40))
joint_case('wrong_source_receipt_hash', prerequisite_value('sourceCheckpointReceiptSha256', '0' * 64))
joint_case('wrong_source_receipt_bytes', source_data=source_bytes + b'\n')
joint_case('wrong_library_receipt_hash', prerequisite_value('libraryRestoreReceiptSha256', '0' * 64))
joint_case('wrong_library_receipt_bytes', proof_data=proof_bytes + b'\n')
joint_case('wrong_archive_bytes', prerequisite_value('archiveBytes', proof['archive']['bytes'] + 1))
joint_case('wrong_archive_sha256', prerequisite_value('archiveSha256', '0' * 64))
joint_case('wrong_archive_library_file_id', prerequisite_value('libraryFileId', 'libfile_WRONG'))
joint_case('wrong_archive_file_id', prerequisite_value('fileId', 'file_WRONG'))
joint_case('missing_ancestor_field', lambda c: c['prerequisite'].pop('ancestors'))
joint_case('missing_ancestor_entry', prerequisite_value('ancestors', []))
joint_case('wrong_predecessor_commit', lambda c: c['prerequisite']['ancestors'][0].__setitem__('commit', '0' * 40))
joint_case('wrong_predecessor_archive_identity', lambda c: c['prerequisite']['ancestors'][0].__setitem__('archiveSha256', '0' * 64))
joint_case('proof_path_parent_escape', prerequisite_value('libraryRestoreReceiptPath', '../outside.json'))
joint_case('proof_path_absolute', prerequisite_value('libraryRestoreReceiptPath', '/outside.json'))

for field, replacement in [('status', 'NOT_RUN'), ('commit', '0' * 40), ('tree', '0' * 40), ('bundle', {'file': 'WRONG'})]:
    modified = copy.deepcopy(proof)
    modified[field] = replacement
    data = (json.dumps(modified) + '\n').encode()
    joint_case('proof_' + field + '_mismatch_with_matching_new_digest', prerequisite_value('libraryRestoreReceiptSha256', sha(data)), proof_data=data)

joint_case('legacy22_metadata_downgrade_with_actual36_bundle_header', lambda c: c.__setitem__('prerequisite', {
    'commit': BASE22, 'libraryFileId': 'libfile_10c86f5827f481919e3938fbb0c2670b'}))
joint_case('legacy22_compatibility_with_matching22_header', lambda c: c.__setitem__('prerequisite', copy.deepcopy(prior['prerequisite'])), expect='ACCEPT', bundle_header=header(BASE22))
joint_case('wrong_bundle_prerequisite', bundle_header=header('0' * 40))
joint_case('missing_bundle_prerequisite', bundle_header=('# v2 git bundle\n' + SYNTHETIC_HEAD + ' refs/heads/' + BRANCH + '\n\n').encode())
joint_case('multiple_bundle_prerequisites', bundle_header=header().replace(b'\n\n', ('\n-' + BASE22 + ' second prerequisite\n\n').encode()))
joint_case('wrong_bundle_head', bundle_header=header(head='0' * 40))
joint_case('wrong_bundle_branch', bundle_header=header(branch='wrong-branch'))
joint_case('multiple_bundle_refs', bundle_header=header().replace(b'\n\n', ('\n' + SYNTHETIC_HEAD + ' refs/heads/extra\n\n').encode()))
joint_case('missing_bundle_ref', bundle_header=('# v2 git bundle\n-' + prior['commit'] + ' base\n\n').encode())
joint_case('wrong_bundle_format', bundle_header=header().replace(b'# v2 ', b'# v3 ', 1))
joint_case('truncated_bundle_header', bundle_header=header().rstrip(b'\n'))
joint_case('excessive_bundle_header', bundle_header=b'# v2 git bundle\n' + b'x' * 65537 + b'\n\n')
joint_case('nonhex_bundle_prerequisite', bundle_header=header('z' * 40))
joint_case('wrong_bundle_filename', lambda c: c['bundle'].__setitem__('file', '../outside.bundle'))

def builder_case(name, source_arg=str(SOURCE), proof_arg=str(REPO / PROOF_REL), mapping=None, expect='REJECT'):
    try:
        builder_run(source_arg, proof_arg, mapping)
    except (AssertionError, KeyError, FileNotFoundError, ValueError) as exc:
        record(name, expect, 'REJECT', exc, [], 'exact_builder_prerequisite_block')
    else:
        record(name, expect, 'ACCEPT', writes=[], scope='exact_builder_prerequisite_block')

builder_case('builder_valid36_pair', expect='ACCEPT')
builder_case('builder_missing_source_argument', source_arg=None)
builder_case('builder_missing_library_argument', proof_arg=None)
builder_case('builder_missing_source_file', source_arg=str(HERE / 'ABSENT-SOURCE-RECEIPT.json'))
builder_case('builder_missing_library_file', proof_arg=str(REPO / 'ABSENT-LIBRARY-RECEIPT.json'))
bad_prior = dict(prior, prerequisite=dict(prior['prerequisite'], commit='0' * 40))
builder_case('builder_wrong_source_predecessor', mapping=dict(input_map, **{str(SOURCE): json.dumps(bad_prior).encode()}))
bad_proof = dict(proof, tree='0' * 40)
builder_case('builder_source_proof_tree_mismatch', mapping=dict(input_map, **{str(REPO / PROOF_REL): json.dumps(bad_proof).encode()}))

try:
    exec(prior_code, {'prior_path': ReadPath('missing36-source-receipt', {})})
except FileNotFoundError as exc:
    record('restore_missing36_source_path_before_zip', 'REJECT', 'REJECT', exc, [], 'exact_top_level_prior_read')
else:
    record('restore_missing36_source_path_before_zip', 'REJECT', 'ACCEPT', writes=[], scope='exact_top_level_prior_read')

prerequisite_call = next(n for n in ast.walk(zip_block) if call_name(n) == 'validate_prerequisite')
header_call = next(n for n in ast.walk(zip_block) if call_name(n) == 'validate_bundle_header')
extract_calls = [n for n in ast.walk(zip_block) if call_name(n) == 'write_bytes']
git_loop = next(n for n in restore_tree.body if isinstance(n, ast.For) and isinstance(n.iter, ast.List) and any(isinstance(v, ast.Constant) and v.value == 'fetch' for v in ast.walk(n.iter)))
builder_mkdir = next(n for n in ast.walk(builder_tree) if call_name(n) == 'mkdir')
builder_bundle = next(n for n in ast.walk(builder_tree) if call_name(n) == 'git' and any(isinstance(a, ast.Constant) and a.value == 'create' for a in n.args))
assert len(extract_calls) == 1
assert prior_read.lineno < prerequisite_call.lineno < header_call.lineno < extract_calls[0].lineno < git_loop.lineno
assert chain_if.end_lineno < builder_mkdir.lineno < builder_bundle.lineno
assert any(isinstance(n, ast.Expr) and n.value is prerequisite_call for n in zip_block.body)
assert next(i for i,n in enumerate(zip_block.body) if isinstance(n, ast.With)) < next(i for i,n in enumerate(zip_block.body) if isinstance(n, ast.For))
static = {'status': 'PASS_AST_ORDER_AND_SAME_BLOCK_DOMINANCE',
    'priorSourceReadLine': prior_read.lineno,
    'prerequisiteGuardLine': prerequisite_call.lineno,
    'bundleHeaderGuardLine': header_call.lineno,
    'firstExtractionWriteLine': extract_calls[0].lineno,
    'gitFetchCheckoutLoopLine': git_loop.lineno,
    'builderPairAndPrerequisiteBlockEndLine': chain_if.end_lineno,
    'builderOutputMkdirLine': builder_mkdir.lineno,
    'builderBundleCreateLine': builder_bundle.lineno,
    'dynamicNegativeControlsReachNoInMemoryExtractionWrites': all(r.get('inMemoryExtractionWrites') == [] for r in results if r['expected'] == 'REJECT'),
    'noSubprocessInExtractedNodes': not any(call_name(n) in ['run', 'check_output', 'Popen', 'git'] for root in [*functions, zip_block, *builder_nodes] for n in ast.walk(root))}
assert static['noSubprocessInExtractedNodes']
assert all(r['pass'] for r in results), [r['case'] for r in results if not r['pass']]
frozen_still_current = {name: sha((REPO / 'tools/verify/box3d' / name).read_bytes()) == expected for name, expected in EXPECTED.items()}
assert all(frozen_still_current.values())
save('joint-guard-cases.json', results)
save('static-ordering.json', static)
save('joint-guard-receipt.json', {'status': 'PASS_EXACT_SOURCE_JOINT_INCREMENTAL_CHAIN_GUARD_CONTROLS',
    'timeUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'frozenToolSha256': EXPECTED,
    'frozenSourcesStillCurrent': frozen_still_current,
    'sourceReceiptSha256': sha(source_bytes), 'actual36LibraryReceiptSha256': sha(proof_bytes),
    'base36Commit': prior['commit'], 'base36Tree': prior['tree'], 'base22Commit': BASE22,
    'synthetic37Head': SYNTHETIC_HEAD, 'synthetic37IsActualCommit': False,
    'cases': len(results), 'acceptedPositiveCases': sum(r['expected'] == 'ACCEPT' for r in results),
    'rejectedNegativeCases': sum(r['expected'] == 'REJECT' for r in results),
    'allCasesPassed': True, 'staticOrdering': static,
    'initialRedEvidenceRetained': 'initial-red-receipt.json',
    'actualStoreReadOrModified': False, 'gitCommandsRun': 0, 'networkCalls': 0,
    'actualBundleReadOrCopied': False, 'physicalExtractionWrites': 0,
    'scope': 'Pure exact-AST guards and static ordering only. Source inventory remains partial-main. Actual checkpoint37 Library download and independent-store full-file verification are separate lead-owned work. No standalone/full-repository, build-closure or physical-acceptance claim.'})
print(json.dumps({'status': 'PASS_EXACT_SOURCE_JOINT_INCREMENTAL_CHAIN_GUARD_CONTROLS', 'cases': len(results), 'staticOrdering': static}, sort_keys=True))
