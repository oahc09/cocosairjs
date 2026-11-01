# Copyright (c) 2026-2027 oahc09@gmail.com
# SPDX-License-Identifier: MIT
"""Archive-only finite teleport closure verifier; Python standard library only.

Input is a local plan JSON: expected_head, shared:{path,sha256}, batches:[{path,sha256}], final_index:{path,sha256}, lock_control:{path,sha256}.
Only the plan and explicitly selected ZIPs are opened; archived absolute source paths
are provenance labels, never filesystem fallbacks. All ZIP member bytes are read and
hashed. A missing final case exits 2 (INCOMPLETE), malformed evidence exits 1 (FAIL).
This validates explicit source/tar/runtime/native/stdio links, not arbitrary JSON/text
references, authenticity, reexecution, browser support, targets, or full qualification.
"""
import argparse
from datetime import datetime
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import posixpath
import re
import sys
import tarfile
import zipfile

CASES = set('enabled-default-order native-disabled-dynamic-clear native-disabled-kinematic-preserve '
            'disabled-dynamic-clear disabled-kinematic-preserve enabled-preserve-forces enabled-wake-false '
            'invalid-quaternion invalid-options invalid-getter invalid-getter-cancel'.split())
CASE_ORDER = 'enabled-default-order native-disabled-dynamic-clear native-disabled-kinematic-preserve disabled-dynamic-clear disabled-kinematic-preserve enabled-preserve-forces enabled-wake-false invalid-quaternion invalid-options invalid-getter invalid-getter-cancel'.split()
CASE_DIRS = {f'{i:02d}-{name}': name for i, name in enumerate(CASE_ORDER, 1)}
PASS = 'PASS_LIMITED_TELEPORT'
SCOPE = [
    'Pinned ZIP SHA-256, every ZIP member CRC/read/hash, exact manifest inventory.',
    'Shared source before/after maps, frozen tar complete inventory and all source hashes.',
    'Native build input/manifest/artifact closure; source-equivalent facade declaration explicitly disclosed.',
    'Every runtime JSONL record to gzip compressed/decompressed bytes and frozen-source overlap.',
    'Per-case receipt/raw/launch/stdout/stderr/exit, final checks, two native ticks and cleanup.',
    'Exact eleven named finite cases, common source/head and serial reported intervals.',
    'Final index inventory, case digest/count links and lock-contention control are separately bound.',
]
LIMITS = [
    'No workspace absolute-path fallback; no arbitrary JSON-string or historical build-log graph traversal.',
    'Derived index wake/cancel summaries are not separately interpreted; their referenced raw/check digests are verified.',
    'No old pre-environment-loss raw is recovered or used by this verifier.',
    'Digest closure is not producer authenticity, reexecution, or independent physics proof.',
    'Finite Node actual WASM is not browser, SDK, persistent-target or complete Gate qualification.',
]


class Invalid(Exception):
    pass


def need(ok, text):
    if not ok:
        raise Invalid(text)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def hcheck(value):
    need(isinstance(value, str) and re.fullmatch('[0-9a-f]{64}', value), 'Invalid SHA-256')
    return value


def safe(name):
    need(isinstance(name, str) and name and '\\' not in name, 'Invalid member path')
    p = PurePosixPath(name)
    need(not p.is_absolute() and '..' not in p.parts and str(p) == name and name != '.', 'Unsafe path: ' + name)
    return name


def absolute(name):
    need(isinstance(name, str) and name.startswith('/') and '\\' not in name
         and posixpath.normpath(name) == name, 'Invalid absolute provenance label')
    return name


def pairs(items):
    result = {}
    for key, value in items:
        need(key not in result, 'Duplicate JSON key: ' + key)
        result[key] = value
    return result


def parse(data):
    def nonfinite(value):
        raise Invalid('Nonfinite JSON constant: ' + value)
    return json.loads(data, object_pairs_hook=pairs, parse_constant=nonfinite)


def restrictions(doc):
    need(doc['formal_cells'] == {'total': 2128, 'status': 'NOT_RUN'}
         and doc['gates'] == {'total': 9, 'status': 'NOT_RUN'}, 'Qualification boundaries changed')
    need(doc['new_evidence_only'] is True, 'Not explicitly new evidence')


class Zip:
    def __init__(self, spec, base):
        self.path = Path(spec['path'])
        if not self.path.is_absolute():
            self.path = base / self.path
        data = self.path.read_bytes()
        self.sha, self.size = sha(data), len(data)
        need(self.sha == hcheck(spec['sha256']), 'ZIP hash mismatch: ' + self.path.name)
        self.z = zipfile.ZipFile(io.BytesIO(data))
        names = self.z.namelist()
        need(len(names) == len(set(names)), 'Duplicate ZIP member')
        self.hashes, self.sizes = {}, {}
        for name in names:
            safe(name)
            info = self.z.getinfo(name)
            need(not info.is_dir() and (info.external_attr >> 16) & 0o170000 != 0o120000,
                 'Nonregular ZIP member: ' + name)
            raw = self.z.read(name)  # CRC is checked on every member, not only referenced files.
            self.hashes[name], self.sizes[name] = sha(raw), len(raw)

    def read(self, name, expected=None):
        safe(name)
        need(name in self.hashes, 'Missing referenced ZIP member: ' + name)
        if expected is not None:
            need(self.hashes[name] == hcheck(expected), 'Member reference hash mismatch: ' + name)
        return self.z.read(name)

    def json(self, name, expected=None):
        return parse(self.read(name, expected))

    def inventory(self, rows, manifest):
        seen = set()
        for row in rows:
            name = safe(row['path'])
            need(name not in seen and name != manifest, 'Duplicate/self-listed inventory member')
            seen.add(name)
            self.read(name, row['sha256'])
            need(type(row['bytes']) is int and self.sizes[name] == row['bytes'], 'Member size mismatch: ' + name)
        need(set(self.hashes) == seen | {manifest}, 'ZIP member inventory is not exact')


def shared_inputs(pack, head):
    manifest = pack.json('shared-inputs-manifest.json')
    need(manifest['schema'] == 'box3d-fresh40b-shared-inputs-v1' and manifest['head'] == head, 'Wrong shared schema/head')
    restrictions(manifest)
    frozen = manifest['frozen_inputs']
    absolute(frozen['path'])
    archive_name = PurePosixPath(frozen['path']).name
    digest = hcheck(frozen['sha256'])
    need(frozen['unchanged'] is True and all(frozen[k] == digest for k in
         ['expectedSha256', 'beforeSha256', 'afterSha256']), 'Frozen archive changed')
    source = manifest['source_hashes']
    need(source and len(source) == manifest['source_count'], 'Shared source count mismatch')
    for name, value in source.items():
        safe(name)
        hcheck(value)
    source_digest = sha(json.dumps(source, separators=(',', ':'), ensure_ascii=False).encode())
    need(source_digest == frozen['sourceManifestSha256']
         and archive_name == 'frozen-inputs-' + source_digest + '.tar.gz', 'Source-manifest digest/name mismatch')
    members = {}
    with tarfile.open(fileobj=io.BytesIO(pack.read(archive_name, digest)), mode='r:gz') as tar:
        for member in tar:
            name = safe(member.name)
            need(member.isfile() and name not in members, 'Nonregular/duplicate tar member: ' + name)
            raw = tar.extractfile(member).read()
            need(len(raw) == member.size, 'Tar member size mismatch')
            members[name] = (sha(raw), len(raw), raw if name not in source else None)
    for name, expected in source.items():
        need(name in members and members[name][0] == expected, 'Frozen source mismatch: ' + name)
    objects = {}
    for row in manifest['runtime_object_inventory']:
        name = safe(row['path'])
        need(name not in objects, 'Duplicate gzip object inventory')
        raw = pack.read(name, row['gzip_sha256'])
        need(len(raw) == row['bytes'], 'Gzip member size mismatch')
        data = gzip.decompress(raw)
        h = hcheck(row['uncompressed_sha256'])
        need(sha(data) == h and name == 'runtime-input-objects/' + h + '.gz', 'Runtime gzip digest/name mismatch')
        objects[name] = (h, len(data))
    need(len(objects) == manifest['runtime_object_count'], 'Gzip object count mismatch')
    need(set(pack.hashes) == set(objects) | {archive_name, 'shared-inputs-manifest.json'}, 'Shared ZIP inventory not exact')
    return manifest, members, objects


def cp(raw, name):
    rows = [row['data'] for row in raw['checkpoints'] if row['name'] == name]
    need(len(rows) == 1, 'Missing/duplicate raw checkpoint: ' + name)
    return rows[0]


def verify_case(pack, summary, shared, members, objects, runtime, head):
    directory = safe(summary['directory'])
    match = re.fullmatch(r'(\d{2})-(.+)', directory)
    need(match and directory in CASE_DIRS, 'Unrecognized final case directory')
    prefix, case = match[1], match[2]
    receipt = pack.json(directory + '/receipt.json')
    need(receipt['schema'] == 'box3d-air-owner-teleport-real-wasm-v1' and receipt['expected'] == case, 'Wrong receipt identity')
    need(receipt['status'] == summary['status'] == PASS, 'Case did not pass')
    need(receipt['child'] == summary['child'] == {'exitCode': 0, 'signal': None, 'error': None}, 'Child failed')
    need(receipt['frozenInputs'] == summary['frozen_inputs'] == shared['frozen_inputs'], 'Cross-package frozen-input link mismatch')
    need(receipt['sourceHashesBefore'] == receipt['sourceHashesAfter'] == shared['source_hashes']
         and receipt['inputsUnchanged'] is True and summary['source_before_after_equal'] is True, 'Source before/after mismatch')
    source_root = absolute(pack.json(prefix + '-launch.json')['cwd'])
    evidence_root = str(PurePosixPath(receipt['frozenInputs']['path']).parent)
    lock = receipt['exclusiveCollectorLock']
    need(lock['acquired'] is True and lock['released'] is True
         and lock['path'] == evidence_root + '/.owner-teleport-collector.lock', 'Collector lock lifecycle mismatch')
    artifact_dir = safe(receipt['artifactDirectory'])
    extra = {artifact_dir + '/' + n for n in ['manifest.json', 'build-receipt.json', 'box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs']}
    need(set(members) == set(shared['source_hashes']) | extra, 'Frozen tar inventory not exact')
    artifact = receipt['artifact']
    build_name, native_manifest_name = artifact_dir + '/build-receipt.json', artifact_dir + '/manifest.json'
    need(members[build_name][0] == receipt['inspectedBuildReceiptSha256'] == artifact['buildReceiptSha256'], 'Build receipt digest mismatch')
    need(members[native_manifest_name][0] == receipt['inspectedManifestSha256'] == artifact['descriptor']['manifestSha256'], 'Native manifest digest mismatch')
    build, native_manifest = parse(members[build_name][2]), parse(members[native_manifest_name][2])
    need(build['status'] == 'PASS' and build['inputHashes'] == artifact['buildInputHashes'], 'Build input receipt mismatch')
    need(artifact['buildInputHashes'] and len({r['path'] for r in artifact['buildInputHashes']}) == len(artifact['buildInputHashes']), 'Empty/duplicate build input inventory')
    for row in artifact['buildInputHashes']:
        need(shared['source_hashes'].get(row['path']) == row['sha256'], 'Unbound native build input: ' + row['path'])
    need(native_manifest['artifacts'] == artifact['artifacts']
         and {r['path'] for r in artifact['artifacts']} == {'box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts'}
         and len(artifact['artifacts']) == 4, 'Native artifact inventory mismatch')
    declaration_fallback = []
    for row in artifact['artifacts']:
        name = artifact_dir + '/' + safe(row['path'])
        if name not in members and row['path'] == 'facade.d.mts':
            name = 'src/air/physics/box3d/binding/facade.d.mts'
            declaration_fallback.append(name)
        need(name in members and members[name][:2] == (row['sha256'], row['bytes']), 'Unclosed native artifact: ' + name)
    for key, value in artifact['descriptor']['identity'].items():
        need(native_manifest[key] == value, 'Native identity mismatch: ' + key)
    need(artifact['descriptor']['facadeSha256'] == members[artifact_dir + '/facade.mjs'][0]
         == shared['source_hashes']['src/air/physics/box3d/binding/facade.mjs'], 'Facade source/native mismatch')
    for name in ['manifest.json', 'build-receipt.json']:
        pack.read(directory + '/native-artifact-inputs/' + name, members[artifact_dir + '/' + name][0])
    need(summary['raw_sha256'] == receipt['nativeReportSha256'], 'Raw reference mismatch')
    raw = pack.json(directory + '/native-and-app.raw.json', receipt['nativeReportSha256'])
    need(raw['status'] == PASS and raw['expected'] == case and raw['artifact'] == artifact, 'Raw identity/artifact mismatch')
    need(raw['sourceHashesBefore'] == raw['sourceHashesAfter'] == shared['source_hashes'], 'Raw source maps mismatch')
    final = cp(raw, 'final-checks')
    checks = final['checks']
    need(final['case'] == case and checks and len(checks) == summary['checks'] and summary['failed_checks'] == []
         and all(c['pass'] is True for c in checks) and len({c['id'] for c in checks}) == len(checks), 'Invalid final checks')
    need(final['formalCells'] == receipt['formalCells'] == {'total': 2128, 'status': 'NOT_RUN'}
         and final['gates'] == {'total': 9, 'status': 'NOT_RUN'}, 'Raw qualification upgrade')
    need(raw['moduleCreated'] is True and raw['observationErrors'] == [], 'Raw observation failure')
    calls = [c for c in raw['calls'] if c['name'] in ['validateCommandBatch', 'applyCommandBatch', 'step']]
    need([c['name'] for c in calls] == ['validateCommandBatch', 'applyCommandBatch', 'step'] * 2
         and all(c['returned'] is True for c in calls), 'Native call order/completion mismatch')
    need(calls[4]['args'][1] == [] and calls[4]['result']['executedOperationCount'] == 0,
         'Native empty-tick replay discrepancy')
    first = calls[1]['args'][1]
    if case == 'invalid-getter-cancel':
        need(len(first) == 1 and first[0]['kind'] == 'linearImpulse' and first[0]['sequence'] == 1
             and first[0]['value'] == [2, 0, 0] and calls[1]['result']['executedOperationCount'] == 1,
             'Caught-cancel failed to retain only original impulse')
        rejected = cp(raw, 'caught-cancel-getter-effects')
        need(rejected['outer']['threw'] is True and rejected['nested']['threw'] is True
             and rejected['world']['native']['nativeStepIndex'] == 0
             and rejected['world']['commandOwner']['pendingCommands'] == 1,
             'Caught-cancel pre-native rejection discrepancy')
        replay = [c['actual'] for c in checks if c['id'] == 'retained impulse never replays on following tick']
        need(len(replay) == 1 and replay[0]['native'] == 2 and replay[0]['state']['linearVelocity'] == [2, 0, 0],
             'Caught-cancel second tick discrepancy')
    else:
        need(sum(c['kind'] == 'reset' for c in first) == 1 and cp(raw, 'before-close')['native'] == 2,
             'Reset native completion discrepancy')
    disposal = raw['beforeBindingDispose']
    need(disposal['coreBytes'] == '0' and disposal['bridge']['liveBytes'] == '0' and disposal['bridge']['liveAllocations'] == 0
         and raw['loaderAfter']['status'] == 'DISPOSED' and raw['loaderAfter']['cleanupErrors'] == [], 'Tracked cleanup incomplete')
    launch, result = pack.json(prefix + '-launch.json'), pack.json(prefix + '-launch-result.json')
    need(all(result.get(k) == v for k, v in launch.items()) and launch['case'] == case
         and launch['head_before'] == result['head_after'] == head and result['exit_code'] == 0, 'Launch/exit/head mismatch')
    command = launch['command']
    need(command[-1] == case and command[-2] == evidence_root + '/' + directory and command[-3] == artifact_dir, 'Launch target mismatch')
    stdout = pack.json(prefix + '-collector.stdout.log')
    need(stdout['status'] == PASS and stdout['error'] is None and
         posixpath.normpath(posixpath.join(source_root, stdout['output'])) == evidence_root + '/' + directory, 'Outer stdout link mismatch')
    for name in [prefix + '-collector.stderr.log', directory + '/jest.stdout.log', directory + '/jest.stderr.log']:
        pack.read(name)
    transitive = receipt['transitiveInputs']
    need(transitive == summary['transitive_inputs'] and transitive['problems'] == [], 'Runtime receipt link mismatch')
    records = {}
    for line in pack.read(directory + '/transitive-inputs.raw.jsonl', transitive['manifestSha256']).splitlines():
        item = parse(line)
        original = absolute(item['path'])
        name = 'runtime-input-objects/' + hcheck(item['sha256']) + '.gz'
        need(item['object'] == evidence_root + '/' + name and name in objects, 'Missing/foreign runtime object reference')
        identity = (item['sha256'], item['bytes'])
        need(type(item['bytes']) is int and objects[name] == identity, 'Runtime object size/hash mismatch')
        need(original not in records or records[original] == identity, 'Runtime input changed between loads')
        need(original not in runtime or runtime[original] == identity, 'Runtime input changed across cases')
        records[original] = runtime[original] = identity
        if original.startswith(source_root + '/'):
            relative = original[len(source_root) + 1:]
            if relative in members:
                need(members[relative][:2] == identity, 'Runtime/frozen input mismatch: ' + relative)
    need(len(records) == transitive['count'] == shared['runtime_transitive_unique_paths'], 'Runtime path count mismatch')
    start, end = datetime.fromisoformat(receipt['startedAt']), datetime.fromisoformat(receipt['completedAt'])
    need(start.tzinfo is not None and end.tzinfo is not None and start < end, 'Invalid collection interval')
    return {'case': case, 'checks': len(checks), 'runtimePaths': len(records), 'declarationEquivalentSource': declaration_fallback}, (start, end)



def package_reference(row, pack):
    need(row['sha256'] == pack.sha and row['bytes'] == pack.size, 'Package reference mismatch')
    need(re.fullmatch(r'libfile_[0-9a-f]+', row['library_file_id']) is not None, 'Invalid Library identifier')
    # Local ZIP names may change on another machine; archived name remains a provenance label.
    safe(row['file_name'])


def verify_lock(pack, shared_pack, shared, members, head):
    name = 'batch-12-lock-control-manifest.json'
    manifest = pack.json(name)
    need(manifest['schema'] == 'box3d-fresh40b-teleport-case-batch-v1' and manifest['head'] == head,
         'Lock batch identity mismatch')
    restrictions(manifest)
    pack.inventory(manifest['files'], name)
    package_reference(manifest['shared_input_archive'], shared_pack)
    need(manifest['cases'] == [{'directory': '12-enabled-default-order', 'status': 'COLLECTOR_BUSY',
         'child': None, 'checks': 0, 'failed_checks': [], 'source_before_after_equal': None,
         'frozen_inputs': None, 'transitive_inputs': None, 'raw_sha256': None}], 'Lock control misclassified')
    outcome = pack.json('12-lock-negative-result.json')
    need(outcome['status'] == 'PASS_EXPECTED_COLLECTOR_BUSY' and outcome['collector_exit_code'] == 1
         and outcome['collector_receipt_status'] == 'COLLECTOR_BUSY', 'Lock control not rejected')
    for key in ['owner_lock_retained', 'owner_bytes_unchanged', 'native_startup_absent', 'child_absent',
                'command_absent', 'frozen_input_publication_absent']:
        need(outcome[key] is True, 'Lock control lifecycle failure: ' + key)
    receipt = pack.json('12-enabled-default-order/receipt.json', outcome['receipt_sha256'])
    need(receipt['status'] == 'COLLECTOR_BUSY' and receipt['expected'] == 'enabled-default-order'
         and receipt['schema'] == 'box3d-air-owner-teleport-real-wasm-v1'
         and receipt['sourceHashesAfter'] and all(shared['source_hashes'].get(k) == v
             for k, v in receipt['sourceHashesAfter'].items()), 'Lock receipt/source mismatch')
    build = parse(members[safe(receipt['artifactDirectory']) + '/build-receipt.json'][2])
    build_only = {r['path'] for r in build['inputHashes'] if not r['path'].startswith(('src/', 'docs/'))}
    need(set(receipt['sourceHashesAfter']) == set(shared['source_hashes']) - build_only
         and 'sourceHashesBefore' not in receipt and receipt['inputsUnchanged'] is None,
         'Early lock snapshot improperly represented as full before/after inputs')
    need(all(key not in receipt for key in ['child', 'command', 'frozenInputs', 'nativeReportSha256']),
         'Lock control unexpectedly reached runtime')
    need(pack.read('12-lock-owner-before.json') == pack.read('12-lock-owner-after.json'), 'Owner sentinel changed')
    launch, result = pack.json('12-launch.json'), pack.json('12-launch-result.json')
    need(result == outcome['head_before_after'] and all(result.get(k) == v for k, v in launch.items())
         and result['head_before'] == result['head_after'] == head and result['exit_code'] == 1,
         'Lock launch/exit link mismatch')
    stdout = pack.json('12-collector.stdout.log')
    need(stdout['status'] == 'COLLECTOR_BUSY' and stdout['error'] == receipt['error'], 'Lock stdout mismatch')
    root = str(PurePosixPath(shared['frozen_inputs']['path']).parent)
    need(posixpath.normpath(posixpath.join(absolute(launch['cwd']), stdout['output'])) == root + '/12-enabled-default-order'
         and launch['command'][-2] == root + '/12-enabled-default-order', 'Lock output path mismatch')
    need(not any(n.endswith(('native-and-app.raw.json', 'transitive-inputs.raw.jsonl')) for n in pack.hashes),
         'Lock control unexpectedly has runtime output')
    return manifest


def verify_index(pack, shared_pack, shared, packages, cases, case_inputs, lock, head):
    pack.inventory(pack.json('index-package-manifest.json')['files'], 'index-package-manifest.json')
    index = pack.json('fresh-teleport-40b-index.json')
    need(index['schema'] == 'box3d-fresh40b-teleport-index-v1' and index['head'] == head
         and index['status'] == PASS, 'Final index identity mismatch')
    need(index['formal_cells'] == shared['formal_cells'] and index['gates'] == shared['gates'], 'Index qualification upgrade')
    need(index['source_manifest_sha256'] == shared['frozen_inputs']['sourceManifestSha256']
         and index['frozen_archive_sha256'] == shared['frozen_inputs']['sha256'], 'Index frozen link mismatch')
    package_reference(index['shared_input_archive'], shared_pack)
    need(pack.json('shared-inputs-library-roundtrip.json') == index['shared_input_archive'], 'Index shared Library link mismatch')
    archived = {}
    for row in index['raw_archives']:
        batch = row['batch']
        need(batch not in archived, 'Duplicate indexed batch')
        archived[batch] = row
        metadata = pack.json('raw-' + batch + '-library-roundtrip.json')
        need(all(row.get(k) == v for k, v in metadata.items()), 'Index Library metadata link mismatch')
        pack.read('batch-' + batch + '-manifest.json', row['manifest_sha256'])
    need(set(archived) == {'01', '02-03', '04-05', '06-07', '08-09', '10-11', '12-lock-control'},
         'Index final batch roster mismatch')
    for batch, (raw_pack, manifest_name) in packages.items():
        package_reference(archived[batch], raw_pack)
        need(pack.read(manifest_name) == raw_pack.read(manifest_name), 'Index batch manifest bytes differ')
        need(raw_pack.json(manifest_name)['shared_input_archive'] == index['shared_input_archive'],
             'Batch/index shared Library identity mismatch')
        raw_pack.read(manifest_name, archived[batch]['manifest_sha256'])
    indexed_cases = {}
    for row in index['cases']:
        name = row['case']
        need(name in CASES and name not in indexed_cases, 'Index case roster mismatch')
        indexed_cases[name] = row
        if name not in case_inputs:
            continue
        raw_pack, summary, batch = case_inputs[name]
        directory = summary['directory']
        receipt = raw_pack.json(directory + '/receipt.json', row['receipt_sha256'])
        raw = raw_pack.json(directory + '/native-and-app.raw.json', row['raw_sha256'])
        launch_result = raw_pack.json(directory[:2] + '-launch-result.json')
        need(row['directory'] == directory and row['batch'] == batch and row['status'] == PASS
             and row['check_count'] == cases[name]['checks']
             and row['checks'] == [c['id'] for c in cp(raw, 'final-checks')['checks']], 'Index check linkage mismatch')
        need(row['collector_exit'] == launch_result['exit_code'] == 0 and row['jest_exit'] == receipt['child']['exitCode']
             and row['started_at'] == launch_result['started_at'] and row['completed_at'] == launch_result['completed_at'],
             'Index time/exit mismatch')
        need(row['source_manifest_sha256'] == shared['frozen_inputs']['sourceManifestSha256']
             and row['archive_actual_sha256'] == shared['frozen_inputs']['sha256']
             and row['source_before_after_equal'] is True and row['runtime_unique_paths'] == cases[name]['runtimePaths']
             and row['runtime_manifest_sha256'] == receipt['transitiveInputs']['manifestSha256']
             and row['teardown'] == raw['beforeBindingDispose'], 'Index receipt/native linkage mismatch')
    need(set(indexed_cases) == CASES, 'Index does not name final eleven')
    counts = index['counts']
    need(counts['actual_cases'] == len(CASES) and counts['actual_checks'] == sum(r['check_count'] for r in indexed_cases.values())
         and counts['source_files'] == len(shared['source_hashes'])
         and counts['runtime_unique_paths_per_case'] == [shared['runtime_transitive_unique_paths']]
         and counts['runtime_content_objects'] == shared['runtime_object_count'] and counts['negative_controls'] == 1,
         'Index counts inconsistent')
    need(index['controls'] == [{'name': 'exclusive parent lock', 'status': 'PASS_EXPECTED_COLLECTOR_BUSY',
         'receipt_status': 'COLLECTOR_BUSY', 'exit_code': 1, 'no_native_startup': True,
         'sentinel_unchanged': True, 'batch': '12-lock-control'}], 'Index lock qualification mismatch')
    return {'sha256': pack.sha, 'members': len(pack.hashes), 'allIndexReferencesPresent': set(archived) == set(packages),
            'derivedWakeAndCancelSummaries': 'Not separately interpreted; referenced raw/check IDs and digests verified.'}


def verify(plan, base):
    head = plan['expected_head']
    need(re.fullmatch('[0-9a-f]{40}', head), 'Invalid expected source HEAD')
    shared_zip = Zip(plan['shared'], base)
    shared, members, objects = shared_inputs(shared_zip, head)
    cases, intervals, runtime, packages, case_inputs = {}, [], {}, {}, {}
    for spec in plan['batches']:
        pack = Zip(spec, base)
        manifest_names = [n for n in pack.hashes if re.fullmatch(r'batch-[0-9-]+-manifest\.json', n)]
        need(len(manifest_names) == 1, 'Missing/duplicate batch manifest')
        manifest_name = manifest_names[0]
        batch_name = manifest_name[len('batch-'):-len('-manifest.json')]
        need(batch_name not in packages, 'Duplicate batch package')
        batch = pack.json(manifest_name)
        need(batch['schema'] == 'box3d-fresh40b-teleport-case-batch-v1' and batch['head'] == head, 'Batch schema/head mismatch')
        restrictions(batch)
        pack.inventory(batch['files'], manifest_name)
        package_reference(batch['shared_input_archive'], shared_zip)
        need(batch['cases'], 'Empty case batch')
        for summary in batch['cases']:
            row, interval = verify_case(pack, summary, shared, members, objects, runtime, head)
            need(row['case'] not in cases, 'Duplicate final case')
            cases[row['case']] = row
            case_inputs[row['case']] = (pack, summary, batch_name)
            intervals.append(interval)
        packages[batch_name] = (pack, manifest_name)
    intervals.sort()
    need(all(a[1] <= b[0] for a, b in zip(intervals, intervals[1:])), 'Reported collection intervals overlap')
    missing_artifacts = []
    lock = None
    if plan.get('lock_control'):
        lock = Zip(plan['lock_control'], base)
        verify_lock(lock, shared_zip, shared, members, head)
        packages['12-lock-control'] = (lock, 'batch-12-lock-control-manifest.json')
    else:
        missing_artifacts.append('lock_control')
    index = None
    if plan.get('final_index'):
        index = verify_index(Zip(plan['final_index'], base), shared_zip, shared, packages, cases, case_inputs, lock, head)
        if not index['allIndexReferencesPresent']:
            missing_artifacts.append('indexed_batch_archives')
    else:
        missing_artifacts.append('final_index')
    missing = sorted(CASES - cases.keys())
    complete = not missing and not missing_artifacts
    return {'schema': 'box3d-teleport-multizip-semantic-closure-v2',
            'status': 'PASS_LIMITED_ARCHIVE_ONLY_CLOSURE' if complete else 'INCOMPLETE',
            'expectedHead': head, 'sharedZipSha256': shared_zip.sha, 'sharedZipMembers': len(shared_zip.hashes),
            'sourceInputs': len(shared['source_hashes']), 'frozenTarMembers': len(members),
            'gzipObjects': len(objects), 'runtimePaths': len(runtime), 'verifiedCases': len(cases),
            'checks': sum(c['checks'] for c in cases.values()), 'missingCases': missing,
            'missingArtifacts': missing_artifacts, 'finalIndex': index, 'lockControlVerified': lock is not None,
            'lockControlScope': 'Expected early abort only; after-source subset excludes build-only inputs; no before/full-input qualification.',
            'cases': list(cases.values()),
            'batchPackages': [{'batch': b, 'sha256': p.sha, 'bytes': p.size, 'members': len(p.hashes)} for b, (p, _) in packages.items()],
            'scope': SCOPE, 'limitations': LIMITS,
            'formalCells': {'total': 2128, 'status': 'NOT_RUN'}, 'gates': {'total': 9, 'status': 'NOT_RUN'}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True, type=Path)
    args = parser.parse_args()
    try:
        result = verify(parse(args.plan.read_bytes()), args.plan.parent)
    except (Invalid, KeyError, IndexError, TypeError, ValueError, OSError, EOFError, zipfile.BadZipFile, tarfile.TarError) as error:
        print(json.dumps({'status': 'FAIL', 'error': str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
    return 2 if result['status'] == 'INCOMPLETE' else 0


if __name__ == '__main__':
    sys.exit(main())
