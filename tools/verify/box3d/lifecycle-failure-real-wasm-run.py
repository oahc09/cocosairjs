"""Capture the first Python invocation and its collector/Jest chain. No native code is imported here."""
from pathlib import Path
import datetime
import json
import subprocess
import sys


def main():
    if len(sys.argv) not in (4, 5):
        raise SystemExit('Usage: lifecycle-failure-real-wasm-run.py <N4-dir> <new-output-dir> <--prepare|case> [input-roundtrip.json]')
    output = Path(sys.argv[2]).resolve()
    artifacts = {key: Path(str(output) + suffix) for key, suffix in {
        'stdout': '.python.stdout.log', 'stderr': '.python.stderr.log',
        'launch': '.python-launch.json', 'result': '.python-result.json',
    }.items()}
    assert not output.exists() and not any(path.exists() for path in artifacts.values()), 'Never overwrite any attempt'
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [sys.executable, str(Path(__file__).with_name('lifecycle-failure-real-wasm-invoke.py')), *sys.argv[1:]]
    record = {'schema': 'box3d-lifecycle-python-launch-v1', 'command': command,
              'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    artifacts['launch'].write_text(json.dumps(record, indent=2) + '\n')
    with artifacts['stdout'].open('xb') as stdout, artifacts['stderr'].open('xb') as stderr:
        result = subprocess.run(command, stdout=stdout, stderr=stderr)
    record.update(exit_code=result.returncode, completed_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    artifacts['result'].write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record))
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
