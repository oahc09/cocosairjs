"""Consume exact attempt-c Library artifacts. No rebuild and no edits to the original attempt."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import stat
import subprocess
import sys
import traceback
import zipfile

HERE = Path(__file__).resolve().parent
PREFIX = 'tools/verify/box3d/'
sys.dont_write_bytecode = True  # Import the frozen helpers without writing into the source checkout.


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + '\n')


def execute(args):
    root, out = Path(args.root).resolve(), Path(args.out).resolve()
    assert not out.exists(), 'Never overwrite a continuation or failed attempt'
    assert root not in out.parents and out not in root.parents
    freeze = json.loads(Path(args.freeze_receipt).read_text())
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    assert head == freeze['gitCommit'] and freeze['status'] == 'SOURCE_GIT_AND_LIBRARY_FROZEN'
    assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=root)
    assert freeze['libraryFileId'] and freeze['libraryRoundTripVerified'] is True
    assert digest(freeze['sourceArchivePath']) == freeze['sourceArchiveSHA256'] == freeze['libraryRoundTripSHA256']
    own = sorted(HERE.glob('esm45-*')) + [HERE / n for n in [
        'esm46-consume-continuation.py', 'esm46-consume-artifacts.json', 'esm46-consume-README.md']]
    assert len(own) == 15, 'Twelve unchanged original fixtures plus three new continuation files'
    source_rows = []
    with zipfile.ZipFile(freeze['sourceArchivePath']) as z:
        for file in own:
            rel = PREFIX + file.name
            b = file.read_bytes()
            assert b == (root / rel).read_bytes() == subprocess.check_output(['git', 'show', head + ':' + rel], cwd=root)
            member = freeze.get('sourceArchivePrefix', '') + rel
            assert z.namelist().count(member) == 1 and z.read(member) == b
            source_rows.append({'path': rel, 'bytes': len(b), 'sha256': digest(file)})
    lock = json.loads((HERE / 'esm46-consume-artifacts.json').read_text())
    proof = json.loads(Path(args.build_roundtrip).read_text())
    assert proof['status'] == 'VERIFIED_ORIGINAL_FAILURE_PRESERVED'
    assert proof['libraryFileId'] == lock['archiveLibraryFileId']
    archive = Path(proof['downloadedPath']).resolve()
    assert archive.stat().st_size == proof['zipBytes'] == lock['archiveBytes']
    assert digest(archive) == proof['zipSHA256'] == lock['archiveSHA256']
    baseline = json.loads((HERE / 'esm45-baseline.json').read_text())
    assert digest(HERE / 'esm45-baseline.json') == lock['baselineManifestSHA256']
    contract = json.loads((HERE / 'esm45-contract.json').read_text())
    # The unchanged module has a guarded main; importing it runs no build or consumer.
    spec = importlib.util.spec_from_file_location('frozen_esm45_runner', HERE / 'esm45-run.py')
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)
    input_proof, preserved = runner.verify_input_archive_proof(args.input_roundtrip, baseline, lock['baselineManifestSHA256'])
    before = runner.verify_inputs(root, baseline)
    assert subprocess.check_output(['node', '--version'], text=True).strip() == baseline['nodeExpected']
    assert json.loads((root / 'node_modules/typescript/package.json').read_text())['version'] == '4.9.5'
    assert digest(root / contract['n4RelativeDirectory'] / 'box3d-st.wasm') == contract['n4WasmSHA256']
    out.mkdir(parents=True)
    (out / 'raw').mkdir()
    summary = {'schema': 'box3d-esm46-consumption-continuation-v1', 'status': 'RUNNING',
               'startedAt': runner.now(), 'consumptionSourceCommit': head,
               'generatedSourceCommit': lock['generatedSourceCommit'], 'priorAttemptStatus': 'FAIL_UNCHANGED',
               'buildInvocationCount': 0, 'dtsBuildInvocationCount': 0, 'archiveLibraryFileId': proof['libraryFileId'],
               'archiveSHA256': lock['archiveSHA256'], 'fixtureInputs': source_rows, 'stages': [],
               'productionIntegration': contract['productionIntegration'], 'globalAcceptance': contract['globalAcceptance'],
               'dtsWarningBoundary': lock['dtsWarningBoundary'],
               'consumerScope': 'TS4.9 strict/noEmit + skipLibCheck:true, three negative controls; only APIs actually consumed, not complete SDK correctness'}
    save(out / 'continuation.raw.json', summary)
    save(out / 'freeze-receipt.json', freeze)
    save(out / 'build-roundtrip-proof.json', proof)
    save(out / 'input-roundtrip-proof.json', input_proof)
    save(out / 'inputs.before.json', before)
    save(out / 'inputs.library-roundtrip.json', preserved)
    save(out / 'artifact-lock.json', lock)
    try:
        with zipfile.ZipFile(archive) as z:
            for row in lock['members']:
                name, relative = row['path'], Path(row['destination'])
                assert not relative.is_absolute() and '..' not in relative.parts
                assert z.namelist().count(name) == 1
                b = z.read(name)
                assert len(b) == row['bytes'] and hashlib.sha256(b).hexdigest() == row['sha256']
                assert stat.S_IMODE(z.getinfo(name).external_attr >> 16) == row['mode']
                if row['role'] == 'fixture':
                    rel = PREFIX + relative.name
                    assert b == (root / rel).read_bytes()
                    assert b == subprocess.check_output(['git', 'show', lock['generatedSourceCommit'] + ':' + rel], cwd=root)
                target = out / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b)
                target.chmod(row['mode'])
        prior = json.loads((out / 'prior-build-evidence/attempt.raw.json').read_text())
        assert prior['status'] == 'FAIL' and prior['sourceCommit'] == lock['generatedSourceCommit']
        assert prior['sourceStable'] and prior['disposableOriginalInputsStable']
        assert [(s['name'], s['exitCode'], s['accepted']) for s in prior['stages']] == [
            ('actual-esm-build', 0, True), ('actual-dts-build', 0, True)]
        artifacts = out / 'esm-artifacts'
        builds = json.loads((artifacts / 'build.raw.json').read_text())
        assert builds['status'] == 'BUILT_NOT_YET_CONSUMED'
        assert [g['mode'] for g in builds['graphs']] == contract['graphs']
        for g in builds['graphs']:
            assert digest(artifacts / g['mode'] / g['entry']) == g['entrySHA256']
        consumer = out / 'consumer'
        package = consumer / 'node_modules/cocosair.js'
        package.mkdir(parents=True)
        production = builds['graphs'][0]
        shutil.copytree(artifacts / 'production-selected', package / 'runtime')
        for name in ['cocosair.module.d.ts', 'cocosair.legacy.d.ts']:
            file = out / 'dts' / name
            assert file.stat().st_size > 100
            shutil.copy2(file, package / name)
        declarations = (package / 'cocosair.module.d.ts').read_text()
        assert '__testOnlyRegisterBox3DAdapter' not in declarations
        assert 'createAirApp' in declarations and 'solverSubSteps' in declarations
        assert re.search(r'''(["'])box3d\1''', declarations), 'Same box3d literal, either quote style'
        save(package / 'package.json', {'name': 'cocosair.js', 'private': True, 'type': 'module',
             'exports': {'.': {'types@<5.0': './cocosair.legacy.d.ts', 'types': './cocosair.module.d.ts',
                               'import': './runtime/' + production['entry']}}})
        save(consumer / 'package.json', {'private': True, 'type': 'module'})
        shutil.copy2(HERE / 'esm45-typed-consumer.ts', consumer / 'typed-consumer.ts')
        shutil.copy2(HERE / 'esm45-package-consumer.mjs', consumer / 'package-consumer.mjs')
        save(consumer / 'tsconfig.json', {'compilerOptions': {'strict': True, 'noEmit': True,
             'skipLibCheck': contract['consumerSkipLibCheck'], 'target': 'ES2020', 'module': 'Node16',
             'moduleResolution': 'Node16', 'types': [], 'lib': ['ES2020', 'DOM']}, 'files': ['typed-consumer.ts']})
        result = runner.run_stage(out, consumer, 'typed-consumer', ['node', root / 'node_modules/typescript/lib/tsc.js',
            '-p', consumer / 'tsconfig.json', '--pretty', 'false', '--listFiles', '--traceResolution'], 300)
        summary['stages'].append(result)
        save(out / 'continuation.raw.json', summary)
        assert result['accepted'], 'Fresh typed consumer failed'
        type_output = (out / result['stdout']['path']).read_text()
        for name in ['cocosair.module.d.ts', 'cocosair.legacy.d.ts', 'lib.dom.d.ts']:
            assert name in type_output, 'Missing declaration resolution identity: ' + name
        for mode in contract['graphs']:
            raw_file = out / 'raw' / (mode + '.consumption.json')
            result = runner.run_stage(out, root, mode, ['node', HERE / 'esm45-consume.mjs',
                root, artifacts, consumer, mode, raw_file], 120)
            summary['stages'].append(result)
            save(out / 'continuation.raw.json', summary)
            assert result['accepted'], mode + ' failed'
            report = json.loads(raw_file.read_text())
            expected = 'PASS_BOUNDED_PRODUCTION_REFUSAL_NOT_INTEGRATION' if mode == 'production-selected' else \
                'PASS_BOUNDED_TEST_ONLY_INTERNAL_ESM_N4_NOT_PUBLIC_INTEGRATION'
            assert report['status'] == expected and report['completedAt']
            assert len(report['checks']) == contract['expectedRuntimeCheckCounts'][mode]
            assert all(row['pass'] for row in report['checks'])
        assert [s['name'] for s in summary['stages']] == contract['requiredStages'][2:]
        summary['status'] = 'PASS_BOUNDED_CONSUMPTION_CONTINUATION_NOT_NEW_BUILD_NOT_PUBLIC_INTEGRATION'
    except BaseException as error:
        summary['status'] = 'FAIL'
        summary['error'] = repr(error)
        summary['traceback'] = traceback.format_exc()
    finally:
        try:
            after = runner.verify_inputs(root, baseline)
            save(out / 'inputs.after.json', after)
            assert before == after
            assert runner.git(root, 'rev-parse', 'HEAD') == head and not runner.git(root, 'status', '--porcelain')
            assert all(digest(root / r['path']) == r['sha256'] for r in source_rows)
            assert digest(archive) == lock['archiveSHA256']
            for r in lock['members']:
                p = out / r['destination']
                if p.exists():
                    assert digest(p) == r['sha256'], 'Mutated restored artifact: ' + r['destination']
            summary['sourceAndArtifactStable'] = True
        except BaseException as error:
            summary.update(status='STALE_OR_MUTATED_INPUT', afterError=repr(error), sourceAndArtifactStable=False)
        summary['completedAt'] = runner.now()
        summary['cleanup'] = 'NONE; original attempt-c untouched; all continuation output retained'
        save(out / 'continuation.raw.json', summary)
        files = [{'path': p.relative_to(out).as_posix(), 'bytes': p.stat().st_size, 'sha256': digest(p)}
                 for p in sorted(out.rglob('*')) if p.is_file()]
        save(out / 'FULL-MANIFEST.json', {'files': files, 'selfExcluded': 'FULL-MANIFEST.json'})
    print(json.dumps({'status': summary['status'], 'output': str(out), 'priorAttemptStatus': 'FAIL_UNCHANGED'}))
    return 0 if summary['status'].startswith('PASS_BOUNDED_CONSUMPTION_CONTINUATION') else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ['root', 'out', 'freeze-receipt', 'input-roundtrip', 'build-roundtrip']:
        parser.add_argument('--' + option, required=True)
    parser.add_argument('--execute-child', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.execute_child:
        return execute(args)
    # Preserve the same outer capture layout even when preflight fails before out exists.
    import datetime
    out = Path(args.out).resolve()
    files = {k: Path(str(out) + s) for k, s in {
        'launch': '.launch.json', 'exit': '.exit.json', 'stdout': '.stdout.log', 'stderr': '.stderr.log'}.items()}
    assert not out.exists() and not any(p.exists() for p in files.values())
    out.parent.mkdir(parents=True, exist_ok=True)
    now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    command = [sys.executable, '-B', str(Path(__file__).resolve()), '--execute-child', *sys.argv[1:]]
    record = {'schema': 'box3d-esm46-continuation-outer-launch-v1', 'command': command,
              'cwd': str(Path(args.root).resolve()), 'startedAt': now()}
    save(files['launch'], record)
    with files['stdout'].open('xb') as so, files['stderr'].open('xb') as se:
        result = subprocess.run(command, cwd=args.root, stdout=so, stderr=se)
    record.update(exitCode=result.returncode, completedAt=now())
    record['logs'] = {k: {'path': str(files[k]), 'bytes': files[k].stat().st_size, 'sha256': digest(files[k])}
                      for k in ['stdout', 'stderr']}
    save(files['exit'], record)
    print(json.dumps(record))
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
