from pathlib import Path
import hashlib, json, sys
root = Path(__file__).resolve().parent
manifest = json.loads((root / 'closure-manifest.json').read_text())
errors = []
for item in manifest['files']:
    p = root / item['path']
    if not p.is_file():
        errors.append('Missing: ' + item['path'])
    elif hashlib.sha256(p.read_bytes()).hexdigest() != item['sha256'] or p.stat().st_size != item['bytes']:
        errors.append('Mismatch: ' + item['path'])
for manifest_path in [root / 'input-manifest.json', *root.glob('evidence/*/source-manifest.json')]:
    for item in json.loads(manifest_path.read_text())['files']:
        rel = item.get('snapshot', item.get('path'))
        p = root / rel
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != item['sha256']:
            errors.append('Unresolved input reference: ' + rel)
for results in root.glob('evidence/run-*/results.json'):
    for item in json.loads(results.read_text())['sources']:
        p = root / item['path']
        if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != item['sha256']:
            errors.append('Unresolved result source: ' + item['path'])
print(json.dumps({'status': 'PASS' if not errors else 'FAIL', 'files': len(manifest['files']), 'bytes': sum(x['bytes'] for x in manifest['files']), 'errors': errors}, indent=2))
sys.exit(bool(errors))
