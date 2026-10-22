# Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
"""Run one already-authorized source-frozen host Debug build, never WASM or parallel builds.
No cleanup is performed. A resource-triggered stop preserves partial output and raw logs.
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


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-checkpoint', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--monitor-out', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    checkpoint = (root / args.source_checkpoint).resolve()
    target = (root / args.out).resolve()
    monitor = (root / args.monitor_out).resolve()
    allowed = root / 'tools/physics/box3d/output'
    assert target.parent == allowed and monitor.parent == allowed
    assert not target.exists() and not monitor.exists()
    freeze = json.loads(checkpoint.read_text())
    inputs = freeze.get('buildInputHashes')
    assert isinstance(inputs, list) and len(inputs) == 50

    def verify_inputs():
        for row in inputs:
            path = (root / row['path']).resolve()
            assert path.is_relative_to(root), row['path']
            data = path.read_bytes()
            assert hashlib.sha256(data).hexdigest() == row['sha256'], row['path']
            if 'bytes' in row:
                assert len(data) == row['bytes'], row['path']

    verify_inputs()
    monitor.mkdir()
    cmd = ['node', 'tools/physics/box3d/build.mjs', '--native', '--debug', '--out', str(target)]
    receipt = {'startedAt': utc(), 'scope': 'One source-frozen native Debug build only; not WASM or physics/Gate acceptance.',
               'command': cmd, 'sourceCheckpoint': str(checkpoint.relative_to(root)),
               'sourceCheckpointSha256': hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
               'startFreeBytes': free_bytes(root), 'startMinimumBytes': START_FREE,
               'lowWaterBytes': LOW_WATER, 'maximumNewOutputBytes': OUTPUT_LIMIT}
    reason = resource_reason(receipt['startFreeBytes'], 0, True)
    if reason:
        receipt.update(status='BLOCKED_RESOURCE_BEFORE_START', reason=reason, executed=False)
    else:
        with (monitor / 'stdout.log').open('wb') as stdout, (monitor / 'stderr.log').open('wb') as stderr, (monitor / 'resource-samples.jsonl').open('w') as samples:
            process = subprocess.Popen(cmd, cwd=root, stdout=stdout, stderr=stderr, start_new_session=True)
            receipt.update(pid=process.pid, executed=True)
            while process.poll() is None:
                free, size = free_bytes(root), output_bytes(target)
                samples.write(json.dumps({'timeUTC': utc(), 'freeBytes': free, 'outputBytes': size}) + '\n')
                samples.flush()
                reason = resource_reason(free, size)
                if reason:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                    break
                time.sleep(1)
            receipt.update(status='STOPPED_RESOURCE_LIMIT' if reason else 'BUILD_FINISHED', reason=reason, exitCode=process.wait())
        try:
            verify_inputs()
            receipt['frozenInputsAfter'] = 'PASS'
        except Exception as error:
            receipt['frozenInputsAfter'] = 'FAIL'
            receipt['sourceDrift'] = str(error)
    receipt.update(completedAt=utc(), endFreeBytes=free_bytes(root), finalOutputBytes=output_bytes(target))
    (monitor / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))
    return 0 if receipt.get('exitCode') == 0 and receipt.get('frozenInputsAfter') == 'PASS' else 1


if __name__ == '__main__':
    raise SystemExit(main())
