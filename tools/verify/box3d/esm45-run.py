"""Frozen-source-only launcher. Importing this file never runs builds or consumers."""
from pathlib import Path
from collections import Counter
import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import signal
import subprocess
import time
import zipfile

HERE = Path(__file__).resolve().parent
PREFIX = 'tools/verify/box3d/'


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def save(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + '\n')


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root).decode().strip()


def verify_inputs(root, baseline):
    rows = []
    for expected in baseline['inputFiles']:
        file = root / expected['path']
        assert file.is_file(), 'Missing frozen input: ' + expected['path']
        assert file.stat().st_size == expected['bytes'], 'Size drift: ' + expected['path']
        actual = digest(file)
        assert actual == expected['sha256'], 'SHA drift: ' + expected['path']
        if 'symlinkTarget' in expected:
            assert file.is_symlink() and os.readlink(file) == expected['symlinkTarget']
        rows.append({'path': expected['path'], 'sha256': actual, 'bytes': expected['bytes']})
    # Additional source/dependency files must not silently change resolver decisions.
    expected_paths = {row['path'] for row in baseline['inputFiles']}
    for directory in ['src', 'node_modules']:
        actual_paths = {p.relative_to(root).as_posix() for p in (root / directory).rglob('*') if p.is_file()}
        assert actual_paths == {p for p in expected_paths if p.startswith(directory + '/')}, 'Inventory drift: ' + directory
    return rows



def verify_input_archive_proof(proof_path, baseline, baseline_sha):
    proof = json.loads(Path(proof_path).read_text())
    assert proof['schema'] == 'box3d-esm45-input-roundtrip-v1'
    assert proof['status'] == 'VERIFIED_LIBRARY_INPUT_ROUNDTRIP'
    assert proof['baselineManifestSHA256'] == baseline_sha
    assert proof['archives'], 'Complete externally preserved inputs are required'
    expected_symlinks = [{'path': r['path'], 'symlinkTarget': r['symlinkTarget']}
                         for r in baseline['inputFiles'] if 'symlinkTarget' in r]
    assert sorted(proof['symlinks'], key=lambda r: r['path']) == sorted(expected_symlinks, key=lambda r: r['path'])
    opened = []
    try:
        for archive in proof['archives']:
            file = Path(archive['localPath']).resolve()
            assert archive['libraryFileId'] and archive['libraryRoundTripVerified'] is True
            assert digest(file) == archive['sha256'] == archive['libraryRoundTripSHA256']
            zipped = zipfile.ZipFile(file)
            opened.append((archive, zipped, Counter(zipped.namelist())))
        rows = []
        for expected in baseline['inputFiles']:
            matches = [(archive, zipped, archive.get('memberPrefix', '') + expected['path'])
                       for archive, zipped, names in opened
                       if archive.get('memberPrefix', '') + expected['path'] in names]
            assert len(matches) == 1, 'Each frozen input must exist exactly once in downloaded Library parts: ' + expected['path']
            archive, zipped, member = matches[0]
            counts = next(counts for item, _zip, counts in opened if item is archive)
            assert counts[member] == 1
            value, size = hashlib.sha256(), 0
            with zipped.open(member) as file:
                for block in iter(lambda: file.read(1024 * 1024), b''):
                    size += len(block)
                    value.update(block)
            assert size == expected['bytes'] and value.hexdigest() == expected['sha256'], 'Preserved input mismatch: ' + member
            rows.append({'path': expected['path'], 'archiveSHA256': archive['sha256'], 'member': member,
                         'bytes': size, 'sha256': value.hexdigest()})
        return proof, rows
    finally:
        for _archive, zipped, _names in opened:
            zipped.close()


def run_stage(out, root, name, command, timeout):
    raw = out / 'raw'
    stdout, stderr = raw / (name + '.stdout.log'), raw / (name + '.stderr.log')
    record = {'name': name, 'command': [str(c) for c in command], 'cwd': str(root), 'startedAt': now(),
              'timeoutSeconds': timeout, 'timedOut': False}
    save(raw / (name + '.launch.json'), record)
    with stdout.open('xb') as so, stderr.open('xb') as se:
        child = subprocess.Popen(record['command'], cwd=root, stdout=so, stderr=se, start_new_session=True,
                                 env={**os.environ, 'SOURCE_DATE_EPOCH': '1792713600',
                                      'AIR_BOX3D_ESM45_DTS_RAW': str(raw / 'actual-dts-diagnostics.json')})
        record['pid'] = child.pid
        try:
            child.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            record['timedOut'] = True
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
        record.update(exitCode=child.returncode, completedAt=now())
    record['stdout'] = {'path': stdout.relative_to(out).as_posix(), 'bytes': stdout.stat().st_size, 'sha256': digest(stdout)}
    record['stderr'] = {'path': stderr.relative_to(out).as_posix(), 'bytes': stderr.stat().st_size, 'sha256': digest(stderr)}
    text = stdout.read_text(errors='replace') + '\n' + stderr.read_text(errors='replace')
    # build-dts.cjs may exit zero after caught bundler failures. Never treat output existence as success.
    record['reportedCompilationError'] = bool(re.search(r'(?:error\s+TS\d+|\bTS\d{4}:|dtsBundler reported an error|\[dts\] FAILED)', text, re.I))
    if name == 'actual-dts-build':
        diagnostics_path = raw / 'actual-dts-diagnostics.json'
        diagnostics = json.loads(diagnostics_path.read_text()) if diagnostics_path.exists() else None
        record['dtsDiagnostics'] = diagnostics
        record['reportedCompilationError'] = record['reportedCompilationError'] or not diagnostics or diagnostics['errorCount'] != 0
    record['accepted'] = child.returncode == 0 and not record['timedOut'] and not record['reportedCompilationError']
    save(raw / (name + '.exit.json'), record)
    return record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--freeze-receipt', required=True)
    parser.add_argument('--input-roundtrip', required=True)
    args = parser.parse_args()
    root, out = Path(args.root).resolve(), Path(args.out).resolve()
    assert not out.exists(), 'Use a new attempt directory; never replace earlier evidence'
    assert root not in out.parents and out not in root.parents, 'Attempt must be outside the source checkout'
    contract = json.loads((HERE / 'esm45-contract.json').read_text())
    baseline = json.loads((HERE / 'esm45-baseline.json').read_text())
    freeze = json.loads(Path(args.freeze_receipt).read_text())
    assert freeze['status'] == 'SOURCE_GIT_AND_LIBRARY_FROZEN'
    head = git(root, 'rev-parse', 'HEAD')
    assert head == freeze['gitCommit'] and re.fullmatch('[0-9a-f]{40}', head)
    assert not git(root, 'status', '--porcelain'), 'Source Git tree must be clean before execution'
    assert freeze['libraryFileId'] and freeze['libraryRoundTripVerified'] is True
    archive = Path(freeze['sourceArchivePath']).resolve()
    assert digest(archive) == freeze['sourceArchiveSHA256'] == freeze['libraryRoundTripSHA256']
    fixture_files = sorted(p for p in HERE.glob('esm45-*') if p.is_file())
    assert all(p.suffix in ['.cjs', '.mjs', '.ts', '.py', '.json', '.md'] for p in fixture_files)
    fixture_rows = []
    with zipfile.ZipFile(archive) as zipped:
        for file in fixture_files:
            relative = PREFIX + file.name
            committed = subprocess.check_output(['git', 'show', head + ':' + relative], cwd=root)
            assert committed == file.read_bytes() == (root / relative).read_bytes(), 'Unfrozen fixture: ' + relative
            member = freeze.get('sourceArchivePrefix', '') + relative
            assert zipped.namelist().count(member) == 1, 'Missing/duplicate source ZIP member: ' + member
            assert zipped.read(member) == committed, 'Archive source drift: ' + member
            fixture_rows.append({'path': relative, 'bytes': len(committed), 'sha256': hashlib.sha256(committed).hexdigest()})
    input_proof, preserved_inputs = verify_input_archive_proof(args.input_roundtrip, baseline, digest(HERE / 'esm45-baseline.json'))
    before = verify_inputs(root, baseline)
    assert digest(root / contract['n4RelativeDirectory'] / 'box3d-st.wasm') == contract['n4WasmSHA256']
    assert json.loads((root / 'node_modules/typescript/package.json').read_text())['version'] == '4.9.5'
    out.mkdir(parents=True)
    (out / 'raw').mkdir()
    summary = {'schema': 'box3d-esm45-attempt-v1', 'status': 'RUNNING', 'startedAt': now(),
               'sourceCommit': head, 'baselineCommit': baseline['baseCommit'], 'freezeReceipt': freeze,
               'inputPreservationProof': input_proof, 'externallyPreservedInputCount': len(preserved_inputs),
               'fixtureInputs': fixture_rows, 'baselineManifestSHA256': digest(HERE / 'esm45-baseline.json'),
               'productionIntegration': contract['productionIntegration'], 'globalAcceptance': contract['globalAcceptance'],
               'stages': [], 'checks': [], 'sourceBeforeCount': len(before)}
    save(out / 'attempt.raw.json', summary)
    save(out / 'inputs.before.json', before)
    save(out / 'inputs.library-roundtrip.json', preserved_inputs)
    shutil.copy2(args.input_roundtrip, out / 'input-roundtrip-proof.json')
    shutil.copy2(args.freeze_receipt, out / 'freeze-receipt.json')
    scratch = out / 'disposable-source'
    scratch.mkdir()
    try:
        # Actual bytes, not an editable worktree. DTS may only dirty this disposable copy.
        for row in before:
            if row['path'].startswith('node_modules/'):
                continue
            destination = scratch / row['path']
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / row['path'], destination)
        (scratch / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
        for row in fixture_rows:
            destination = scratch / row['path']
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(root / row['path'], destination)
        builder = scratch / PREFIX / 'esm45-build.cjs'
        artifacts = out / 'esm-artifacts'
        node_version = subprocess.check_output(['node', '--version'], text=True).strip()
        summary['node'] = node_version
        assert node_version == baseline['nodeExpected'], 'Node version changed; review/refreeze instead of silently widening'
        commands = [
            ('actual-esm-build', ['node', builder, scratch, artifacts], 1800),
            ('actual-dts-build', ['node', '--require', scratch / PREFIX / 'esm45-dts-diagnostics.cjs',
                                  scratch / 'tools/build/build-dts.cjs'], 1800),
        ]
        for name, command, timeout in commands:
            result = run_stage(out, scratch, name, command, timeout)
            summary['stages'].append(result)
            save(out / 'attempt.raw.json', summary)
            assert result['accepted'], name + ' failed; complete raw output retained'
        builds = json.loads((artifacts / 'build.raw.json').read_text())
        assert builds['status'] == 'BUILT_NOT_YET_CONSUMED'
        assert [g['mode'] for g in builds['graphs']] == contract['graphs']
        assert digest(scratch / 'tools/build/build-number.json') == digest(root / 'tools/build/build-number.json')
        consumer = out / 'consumer'
        consumer.mkdir()
        package = consumer / 'node_modules/cocosair.js'
        package.mkdir(parents=True)
        production = builds['graphs'][0]
        shutil.copytree(artifacts / 'production-selected', package / 'runtime')
        for name in ['cocosair.module.d.ts', 'cocosair.legacy.d.ts']:
            file = scratch / 'build' / name
            assert file.stat().st_size > 100
            shutil.copy2(file, package / name)
        declarations = (package / 'cocosair.module.d.ts').read_text()
        assert '__testOnlyRegisterBox3DAdapter' not in declarations
        assert 'createAirApp' in declarations and 'solverSubSteps' in declarations and "'box3d'" in declarations
        save(package / 'package.json', {'name': 'cocosair.js', 'private': True, 'type': 'module',
             'exports': {'.': {'types@<5.0': './cocosair.legacy.d.ts', 'types': './cocosair.module.d.ts',
                               'import': './runtime/' + production['entry']}}})
        save(consumer / 'package.json', {'private': True, 'type': 'module'})
        shutil.copy2(HERE / 'esm45-typed-consumer.ts', consumer / 'typed-consumer.ts')
        shutil.copy2(HERE / 'esm45-package-consumer.mjs', consumer / 'package-consumer.mjs')
        save(consumer / 'tsconfig.json', {'compilerOptions': {'strict': True, 'noEmit': True,
             'skipLibCheck': contract['consumerSkipLibCheck'], 'target': 'ES2020', 'module': 'Node16',
             'moduleResolution': 'Node16', 'types': [], 'lib': ['ES2020', 'DOM']}, 'files': ['typed-consumer.ts']})
        type_result = run_stage(out, consumer, 'typed-consumer', ['node', root / 'node_modules/typescript/lib/tsc.js',
            '-p', consumer / 'tsconfig.json', '--pretty', 'false', '--listFiles', '--traceResolution'], 300)
        summary['stages'].append(type_result)
        save(out / 'attempt.raw.json', summary)
        assert type_result['accepted'], 'Fresh typed consumer failed'
        type_output = (out / type_result['stdout']['path']).read_text()
        for filename in ['cocosair.module.d.ts', 'cocosair.legacy.d.ts', 'lib.dom.d.ts']:
            assert filename in type_output, 'Type resolution did not demonstrate ' + filename
        for mode in contract['graphs']:
            raw_file = out / 'raw' / (mode + '.consumption.json')
            result = run_stage(out, scratch, mode, ['node', scratch / PREFIX / 'esm45-consume.mjs',
                scratch, artifacts, consumer, mode, raw_file], 120)
            summary['stages'].append(result)
            save(out / 'attempt.raw.json', summary)
            assert result['accepted'], mode + ' failed'
            report = json.loads(raw_file.read_text())
            expected_status = 'PASS_BOUNDED_PRODUCTION_REFUSAL_NOT_INTEGRATION' if mode == 'production-selected' else \
                'PASS_BOUNDED_TEST_ONLY_INTERNAL_ESM_N4_NOT_PUBLIC_INTEGRATION'
            assert report['status'] == expected_status and report['completedAt']
            assert len(report['checks']) == contract['expectedRuntimeCheckCounts'][mode]
            assert all(row['pass'] for row in report['checks'])
        assert [row['name'] for row in summary['stages']] == contract['requiredStages']
        summary['status'] = 'PASS_BOUNDED_ESM_DTS_CONSUMPTION_NOT_PUBLIC_INTEGRATION'
    except BaseException as error:
        summary['status'] = 'FAIL'
        summary['error'] = repr(error)
    finally:
        try:
            after = verify_inputs(root, baseline)
            save(out / 'inputs.after.json', after)
            assert before == after
            assert git(root, 'rev-parse', 'HEAD') == head and not git(root, 'status', '--porcelain')
            for row in fixture_rows:
                assert digest(root / row['path']) == row['sha256']
            if scratch.exists():
                for row in before:
                    copied = scratch / row['path']
                    assert copied.is_file() and digest(copied) == row['sha256'], 'Disposable frozen input changed: ' + row['path']
                summary['disposableOriginalInputsStable'] = True
            summary['sourceStable'] = True
        except BaseException as error:
            summary['sourceStable'] = False
            summary['status'] = 'STALE_OR_MUTATED_INPUT'
            summary['afterError'] = repr(error)
        # Preserve all generated products, maps, temporary DTS files, failed logs and original statuses.
        summary['completedAt'] = now()
        summary['cleanup'] = 'NONE: disposable source and every generated/log/raw file retained'
        save(out / 'attempt.raw.json', summary)
        inventory = []
        for file in sorted(out.rglob('*')):
            if file.is_file() and not any(p.is_symlink() for p in file.parents if p != out):
                inventory.append({'path': file.relative_to(out).as_posix(), 'bytes': file.stat().st_size, 'sha256': digest(file)})
        save(out / 'FULL-MANIFEST.json', {'schema': 'box3d-esm45-output-inventory-v1', 'files': inventory,
                                       'selfExcluded': 'FULL-MANIFEST.json'})
    print(json.dumps({'status': summary['status'], 'output': str(out), 'productionIntegration': summary['productionIntegration']}))
    return 0 if summary['status'] == 'PASS_BOUNDED_ESM_DTS_CONSUMPTION_NOT_PUBLIC_INTEGRATION' else 1


if __name__ == '__main__':
    raise SystemExit(main())
