# Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""One authorized, source-frozen WASM Debug build. No download, cleanup or retry.

Resource observations are sampled each second, not a filesystem reservation.
Stops preserve every partial artifact. Pure boundary controls never launch a build.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time

START_FREE = 2 * 1024 ** 3
LOW_WATER = 2_000_000_000
OUTPUT_LIMIT = 250_000_000
CHECKPOINT_SHA = 'a9d5eee5a951d097279d01aeb86127caf73c82e9c43c14c7dad71228cca42e51'
PACKAGE_SHA = 'd574428df9ecf00790e28636bdc47027432737c31621b18cdb418123afda4ac1'


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def free_bytes(path):
    stat = os.statvfs(path)
    return stat.f_bavail * stat.f_frsize


def output_bytes(path):
    if not path.exists():
        return 0
    return sum(p.lstat().st_size for p in path.rglob('*') if p.is_file() and not p.is_symlink())


def resource_reason(free, size, before=False):
    if before and free < START_FREE:
        return 'INSUFFICIENT_START_FREE_BYTES'
    if not before and free < LOW_WATER:
        return 'SHARED_FILESYSTEM_LOW_WATER'
    if size > OUTPUT_LIMIT:
        return 'NEW_OUTPUT_SIZE_LIMIT'
    return None


def boundary_controls():
    cases = [
        (START_FREE - 1, 0, True, 'INSUFFICIENT_START_FREE_BYTES'),
        (START_FREE, 0, True, None),
        (START_FREE + 1, 0, True, None),
        (LOW_WATER - 1, 0, False, 'SHARED_FILESYSTEM_LOW_WATER'),
        (LOW_WATER, 0, False, None),
        (LOW_WATER + 1, 0, False, None),
        (START_FREE, OUTPUT_LIMIT - 1, False, None),
        (START_FREE, OUTPUT_LIMIT, False, None),
        (START_FREE, OUTPUT_LIMIT + 1, False, 'NEW_OUTPUT_SIZE_LIMIT'),
        (START_FREE, OUTPUT_LIMIT + 1, True, 'NEW_OUTPUT_SIZE_LIMIT'),
        (LOW_WATER - 1, OUTPUT_LIMIT + 1, False, 'SHARED_FILESYSTEM_LOW_WATER'),
    ]
    for free, size, before, expected in cases:
        assert resource_reason(free, size, before) == expected
    return {'status': 'PASS_PURE_RESOURCE_BOUNDARIES_NO_BUILD', 'cases': len(cases),
            'startMinimumBytes': START_FREE, 'lowWaterBytes': LOW_WATER,
            'maximumNewOutputBytes': OUTPUT_LIMIT, 'casesRaw': cases}


def snapshot_inputs(root, inputs):
    result = []
    assert len(inputs) == 50 and len({row['path'] for row in inputs}) == 50
    for row in inputs:
        path = (root / row['path']).resolve()
        assert path.is_relative_to(root), row['path']
        actual = {'path': row['path'], 'bytes': path.stat().st_size, 'sha256': digest(path)}
        actual['matches'] = actual['sha256'] == row['sha256'] and actual['bytes'] == row.get('bytes', actual['bytes'])
        result.append(actual)
    return result


def toolchain_check(root, monitor):
    directory = root.parent / 'box3d-toolchain-20261022'
    entry = directory / 'use-toolchain.sh'
    provenance = json.loads((directory / 'toolchain-provenance.json').read_text())
    lock = json.loads((root / 'tools/physics/box3d/versions.lock.json').read_text())
    assert provenance['emsdk']['version'] == lock['emsdk']['candidateVersion'] == '6.0.2'
    assert provenance['emsdk']['commit'] == lock['emsdk']['emsdkCommit']
    assert provenance['emsdk']['emscripten_commit'] == lock['emsdk']['emscriptenCommit']
    package = provenance['packages'][0]
    assert package['sha256'] == lock['emsdk']['packageSha256'] == PACKAGE_SHA
    archive = directory / package['path']
    assert archive.stat().st_size == package['size_bytes'] and digest(archive) == PACKAGE_SHA
    for row in provenance['official_metadata']:
        assert digest(directory / 'emsdk' / row['path']) == row['sha256']
    # Probe only installed official tool paths and version text, never dump env/secrets.
    command = ['bash', '--noprofile', '--norc', '-c',
               'set -e; source "$1"; command -v emcc emcmake cmake ninja node; '
               'emcc --version; cmake --version; ninja --version; node --version',
               'box3d-toolchain-probe', str(entry)]
    observed = subprocess.run(command, cwd=root, capture_output=True, timeout=30)
    (monitor / 'toolchain.stdout.log').write_bytes(observed.stdout)
    (monitor / 'toolchain.stderr.log').write_bytes(observed.stderr)
    (monitor / 'toolchain.exit.txt').write_text(str(observed.returncode) + '\n')
    assert observed.returncode == 0, 'Official toolchain probe failed'
    text = observed.stdout.decode()
    lines = text.splitlines()
    for tool in lines[:4]:
        assert Path(tool).resolve().is_relative_to(directory), tool
    assert '6.0.2' in text and 'cmake version 4.4.4' in text and '1.13.2' in text
    identity = {'packageSha256': PACKAGE_SHA, 'packageBytes': archive.stat().st_size,
                'emsdk': provenance['emsdk'], 'versionCommand': command,
                'entrySha256': digest(entry), 'provenanceSha256': digest(directory / 'toolchain-provenance.json'),
                'resolvedTools': [{'path': line, 'sha256': digest(Path(line).resolve())} for line in lines[:5]]}
    (monitor / 'toolchain-identity.json').write_text(json.dumps(identity, indent=2) + '\n')
    return entry, identity


def stop_process(process):
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--source-checkpoint')
    parser.add_argument('--out')
    parser.add_argument('--monitor-out')
    args = parser.parse_args()
    if args.self_test:
        print(json.dumps(boundary_controls()))
        return 0
    assert args.source_checkpoint and args.out and args.monitor_out
    root = Path(__file__).resolve().parents[3]
    checkpoint = (root / args.source_checkpoint).resolve()
    target, monitor = (root / args.out).resolve(), (root / args.monitor_out).resolve()
    allowed = root / 'tools/physics/box3d/output'
    assert target.parent == monitor.parent == allowed and target != monitor
    assert not target.exists() and not monitor.exists(), 'Unique output and monitor required; never overwrite or resume'
    assert digest(checkpoint) == CHECKPOINT_SHA, 'Frozen N4 checkpoint differs'
    inputs = json.loads(checkpoint.read_text())['buildInputHashes']
    before = snapshot_inputs(root, inputs)
    assert all(row['matches'] for row in before), 'Frozen source preflight mismatch'
    monitor.mkdir()
    (monitor / 'inputs-before.json').write_text(json.dumps(before, indent=2) + '\n')
    (monitor / 'runner-source.py').write_bytes(Path(__file__).read_bytes())
    (monitor / 'boundary-controls.json').write_text(json.dumps(boundary_controls(), indent=2) + '\n')
    receipt = {'startedAt': utc(), 'executed': False, 'status': 'PREFLIGHT', 'scope': 'One finite WASM Debug build/Node qualification, not browser or all gates.',
               'sourceCheckpoint': str(checkpoint.relative_to(root)), 'sourceCheckpointSha256': CHECKPOINT_SHA,
               'runnerSha256': digest(Path(__file__)), 'startFreeBytes': free_bytes(root),
               'startMinimumBytes': START_FREE, 'lowWaterBytes': LOW_WATER, 'maximumNewOutputBytes': OUTPUT_LIMIT}
    process = None
    try:
        reason = resource_reason(receipt['startFreeBytes'], output_bytes(monitor), True)
        if reason:
            receipt.update(status='BLOCKED_RESOURCE_BEFORE_START', reason=reason)
        else:
            entry, identity = toolchain_check(root, monitor)
            receipt['toolchainIdentitySha256'] = digest(monitor / 'toolchain-identity.json')
            cmd = ['bash', '--noprofile', '--norc', '-c',
                   'set -e; source "$1"; exec node tools/physics/box3d/build.mjs --debug --out "$2"',
                   'box3d-wasm-debug', str(entry), str(target)]
            receipt['command'] = cmd
            receipt['immediateStartFreeBytes'] = free_bytes(root)
            reason = resource_reason(receipt['immediateStartFreeBytes'], output_bytes(monitor), True)
            if reason:
                receipt.update(status='BLOCKED_RESOURCE_BEFORE_START', reason=reason)
            else:
                with (monitor / 'stdout.log').open('wb') as stdout, (monitor / 'stderr.log').open('wb') as stderr, (monitor / 'resource-samples.jsonl').open('w') as samples:
                    process = subprocess.Popen(cmd, cwd=root, stdout=stdout, stderr=stderr, start_new_session=True)
                    receipt.update(pid=process.pid, executed=True, status='RUNNING')
                    (monitor / 'running.json').write_text(json.dumps(receipt, indent=2) + '\n')
                    while True:
                        free, size = free_bytes(root), output_bytes(target)
                        monitored = output_bytes(monitor)
                        sample = {'timeUTC': utc(), 'freeBytes': free, 'outputBytes': size, 'monitorBytes': monitored}
                        samples.write(json.dumps(sample) + '\n'); samples.flush()
                        reason = resource_reason(free, size + monitored)
                        if reason:
                            stop_process(process)
                            break
                        if process.poll() is not None:
                            break
                        time.sleep(1)
                    code = process.wait()
                    receipt.update(status='STOPPED_RESOURCE_LIMIT' if reason else 'BUILD_FINISHED', reason=reason, exitCode=code)
                    (monitor / 'exit.txt').write_text(str(code) + '\n')
    except BaseException as error:
        if process is not None:
            stop_process(process)
            receipt['exitCode'] = process.returncode
            (monitor / 'exit.txt').write_text(str(process.returncode) + '\n')
        receipt.update(status='ERROR_PRESERVED_NO_RETRY', error=repr(error))
    finally:
        after = snapshot_inputs(root, inputs)
        (monitor / 'inputs-after.json').write_text(json.dumps(after, indent=2) + '\n')
        receipt['frozenInputsAfter'] = 'PASS' if all(row['matches'] for row in after) else 'FAIL'
        artifacts = []
        if target.exists():
            for p in sorted(target.rglob('*')):
                if p.is_file() and not p.is_symlink():
                    artifacts.append({'path': str(p.relative_to(target)), 'bytes': p.stat().st_size, 'sha256': digest(p)})
        (monitor / 'output-files.json').write_text(json.dumps(artifacts, indent=2) + '\n')
        receipt.update(completedAt=utc(), endFreeBytes=free_bytes(root), finalOutputBytes=output_bytes(target), outputFileCount=len(artifacts), outputInventorySha256=digest(monitor / 'output-files.json'))
        (monitor / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))
    return 0 if receipt.get('status') == 'BUILD_FINISHED' and receipt.get('exitCode') == 0 and receipt['frozenInputsAfter'] == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
