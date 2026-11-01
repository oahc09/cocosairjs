"""Capture the entire collector invocation directly. No tests run merely by importing this file."""
from pathlib import Path
import datetime
import json
import subprocess
import sys


def main():
    if len(sys.argv) not in (4, 5):
        raise SystemExit('Usage: owner-target-real-wasm-run.py <N4-dir> <new-output-dir> <--prepare|case> [input-roundtrip.json]')
    root = Path(__file__).resolve().parents[3]
    artifact, destination, case, *proof = sys.argv[1:]
    # The argument-count check below is intentionally explicit to prevent silently omitted proof.
    if case == '--prepare':
        assert not proof
    else:
        assert len(proof) == 1
    out = Path(destination).resolve()
    stem = out.parent / out.name
    files = {name: Path(str(stem) + suffix) for name, suffix in {
        'launch': '.launch.json', 'result': '.launch-result.json',
        'stdout': '.collector.stdout.log', 'stderr': '.collector.stderr.log',
    }.items()}
    assert not out.exists() and not any(path.exists() for path in files.values()), 'Never overwrite an earlier attempt'
    out.parent.mkdir(parents=True, exist_ok=True)
    command = ['node', 'tools/verify/box3d/owner-target-real-wasm.mjs', artifact, str(out), case, *proof]
    head = lambda: subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    record = {'schema': 'box3d-target-raw-launch-v1', 'case': case, 'command': command, 'cwd': str(root),
              'head_before': head(), 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    files['launch'].write_text(json.dumps(record, indent=2) + '\n')
    with files['stdout'].open('wb') as stdout, files['stderr'].open('wb') as stderr:
        result = subprocess.run(command, cwd=root, stdout=stdout, stderr=stderr)
    record.update(exit_code=result.returncode, head_after=head(), completed_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    files['result'].write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record))
    if record['head_before'] != record['head_after']:
        raise SystemExit('Source HEAD changed during collection; raw attempt retained')
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
