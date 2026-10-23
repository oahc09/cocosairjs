"""Capture the entire runner, including preflight failures, without executing it on import."""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    for option in ['root', 'out', 'freeze-receipt', 'input-roundtrip']:
        parser.add_argument('--' + option, required=True)
    args = parser.parse_args()
    out = Path(args.out).resolve()
    files = {key: Path(str(out) + suffix) for key, suffix in {
        'launch': '.launch.json', 'exit': '.exit.json', 'stdout': '.stdout.log', 'stderr': '.stderr.log'}.items()}
    assert not out.exists() and not any(p.exists() for p in files.values()), 'Never overwrite an earlier attempt'
    out.parent.mkdir(parents=True, exist_ok=True)
    command = [sys.executable, str(Path(__file__).with_name('esm45-run.py')), *sys.argv[1:]]
    now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    record = {'schema': 'box3d-esm45-outer-launch-v1', 'command': command,
              'cwd': str(Path(args.root).resolve()), 'startedAt': now()}
    files['launch'].write_text(json.dumps(record, indent=2) + '\n')
    with files['stdout'].open('xb') as stdout, files['stderr'].open('xb') as stderr:
        result = subprocess.run(command, cwd=args.root, stdout=stdout, stderr=stderr)
    record.update(exitCode=result.returncode, completedAt=now())
    record['logs'] = {key: {'path': str(files[key]), 'bytes': files[key].stat().st_size,
                           'sha256': hashlib.sha256(files[key].read_bytes()).hexdigest()}
                      for key in ['stdout', 'stderr']}
    files['exit'].write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record))
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
