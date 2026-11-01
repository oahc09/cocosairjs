"""Package explicit raw case folders plus every referenced runtime CAS object, not prior manifests recursively."""
from pathlib import Path
import gzip
import hashlib
import json
import sys
import zipfile


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    assert len(sys.argv) >= 4, 'Usage: owner-activation-real-wasm-package.py <new-raw.zip> <input-roundtrip.json> <case-directory> [...]'
    output, proof_path, *case_paths = map(Path, sys.argv[1:])
    assert not output.exists()
    proof = json.loads(proof_path.read_text())
    assert proof['actual_download_verified'] is True
    assert sha(Path(proof['downloaded_path'])) == proof['sha256']
    files = {'input-roundtrip.json': proof_path}
    cases = []
    for directory in case_paths:
        receipt = json.loads((directory / 'receipt.json').read_text())
        raw_path = directory / 'native-and-app.raw.json'
        raw = json.loads(raw_path.read_text()) if raw_path.exists() else None
        if receipt.get('frozenInputs'):
            assert receipt['frozenInputs']['sha256'] == proof['sha256']
        for name in ('.launch.json', '.launch-result.json', '.collector.stdout.log', '.collector.stderr.log'):
            path = Path(str(directory) + name)
            assert path.is_file(), 'Direct invocation artifact missing: ' + str(path)
            files[directory.name + name] = path
        for path in sorted(directory.rglob('*')):
            if path.is_file():
                assert 'jest-cache' not in path.parts
                files[directory.name + '/' + str(path.relative_to(directory))] = path
        transitive = directory / 'transitive-inputs.raw.jsonl'
        object_count = 0
        if transitive.exists():
            for line in transitive.read_text().splitlines():
                entry = json.loads(line)
                path = Path(entry['object'])
                assert hashlib.sha256(gzip.decompress(path.read_bytes())).hexdigest() == entry['sha256']
                files['runtime-input-objects/' + entry['sha256'] + '.gz'] = path
                object_count += 1
        checks = next((entry['data']['checks'] for entry in reversed(raw.get('checkpoints', []))
                       if entry['name'] in ('final-checks', 'failed-checks')), []) if raw else []
        cases.append({'directory': directory.name, 'status': receipt['status'], 'child': receipt.get('child'),
                      'source_before_after_equal': receipt.get('inputsUnchanged'), 'runtime_manifest_entries': object_count,
                      'failed_checks': [entry['id'] for entry in checks if not entry['pass']],
                      'native_raw_sha256': sha(raw_path) if raw_path.exists() else None})
    manifest = {'schema': 'box3d-actual-activation-raw-batch-v1', 'cases': cases,
                'formalCells': {'total': 2128, 'status': 'NOT_RUN'}, 'gates': {'total': 9, 'status': 'NOT_RUN'},
                'externalInputLibraryId': proof['library_file_id'], 'externalInputSha256': proof['sha256'],
                'files': [{'path': name, 'bytes': path.stat().st_size, 'sha256': sha(path)} for name, path in sorted(files.items())]}
    manifest_path = output.with_suffix('.manifest.json')
    assert not manifest_path.exists()
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, path in sorted(files.items()):
            archive.write(path, name)
        archive.write(manifest_path, 'batch-manifest.json')
    print(json.dumps({'file': str(output.resolve()), 'bytes': output.stat().st_size, 'sha256': sha(output), 'cases': cases}, indent=2))


if __name__ == '__main__':
    main()
