# Copyright (c) 2026-2027 oahc09@gmail.com
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
"""Explicit completed-evidence Git closure; no build or physical acceptance."""
from pathlib import Path
import argparse, hashlib, json, os, subprocess, sys


def digest(data):
    return hashlib.sha256(data).hexdigest()


def relative_path(value):
    if not isinstance(value, str) or not value or value.startswith('/') or '..' in Path(value).parts:
        raise ValueError('Expected safe repository-relative path')
    return value


def git_index(root):
    entries = {}
    data = subprocess.check_output(['git', 'ls-files', '--stage', '-z'], cwd=root)
    for row in data.split(b'\0'):
        if not row:
            continue
        header, name = row.split(b'\t', 1)
        mode, blob, stage = header.decode().split()
        if stage != '0':
            raise ValueError('Unmerged index cannot qualify evidence')
        entries[name.decode()] = (mode, blob)
    return entries


def identity(root, name):
    p = root / relative_path(name)
    if p.is_symlink():
        data = os.readlink(p).encode()
        mode = '120000'
    else:
        data = p.read_bytes()
        mode = '100755' if p.stat().st_mode & 0o111 else '100644'
    return {'path': name, 'mode': mode, 'bytes': len(data), 'sha256': digest(data),
            'gitBlobSha1': hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()}


def pointer(value, expression):
    if expression == '':
        return value
    if not expression.startswith('/'):
        raise ValueError('Expected JSON pointer')
    for token in expression[1:].split('/'):
        token = token.replace('~1', '/').replace('~0', '~')
        value = value[int(token)] if isinstance(value, list) else value[token]
    return value


def scan(root, config, manifest_path):
    index = git_index(root)
    roots = [relative_path(x).rstrip('/') for x in config['requiredRoots']]
    exceptions = {relative_path(x['path']): x for x in config.get('exceptions', [])}
    if len(exceptions) != len(config.get('exceptions', [])):
        raise ValueError('Duplicate exception')
    for name, item in exceptions.items():
        if not item.get('reason'):
            raise ValueError('Exception needs reason')
        if item['kind'] == 'REGENERABLE_PYTHON_CACHE':
            if not name.endswith('.pyc') or '__pycache__' not in Path(name).parts:
                raise ValueError('Cache exception cannot cover raw evidence')
        elif item['kind'] != 'ACTIVE_UNCOMPLETED_WORK':
            raise ValueError('Unknown exception kind')
    files = {}
    excluded = []
    for base in roots:
        directory = root / base
        if not directory.is_dir():
            raise ValueError('Required evidence root absent: ' + base)
        for p in sorted(directory.rglob('*')):
            if p.is_dir() and not p.is_symlink():
                continue
            name = p.relative_to(root).as_posix()
            if name == manifest_path:
                continue  # Explicit self-reference exclusion, not a wildcard.
            if name in exceptions:
                row = identity(root, name)
                item = exceptions[name]
                if row['sha256'] != item['sha256']:
                    raise ValueError('Exception changed: ' + name)
                excluded.append({**item, 'bytes': row['bytes']})
                continue
            row = identity(root, name)
            if name not in index:
                ignored = subprocess.run(['git', 'check-ignore', '-q', '--', name], cwd=root).returncode == 0
                raise ValueError(('Ignored' if ignored else 'Untracked') + ' required evidence: ' + name)
            if index[name] != (row['mode'], row['gitBlobSha1']):
                raise ValueError('Required evidence differs from staged Git bytes: ' + name)
            files[name] = row
    for name in config.get('additionalFiles', []):
        row = identity(root, name)
        if index.get(name) != (row['mode'], row['gitBlobSha1']):
            raise ValueError('Additional deliverable not exactly staged: ' + name)
        files[name] = row
    references = []
    documents = {}
    for spec in config.get('manifestReferences', []):
        source = relative_path(spec['manifestPath'])
        target = relative_path(spec['retainedPath'])
        if source not in files or target not in files:
            raise ValueError('Manifest/reference not in explicit delivery inventory: ' + source + ' -> ' + target)
        if source not in documents:
            documents[source] = json.loads((root / source).read_bytes())
        expected = pointer(documents[source], spec['sha256Pointer'])
        if expected != files[target]['sha256']:
            raise ValueError('Manifest reference hash does not match retained bytes: ' + target)
        references.append({**spec, 'verifiedSha256': expected})
    return {'files': sorted(files.values(), key=lambda row: row['path']), 'references': references,
            'exceptionsObserved': excluded, 'exceptionPathsNotPresent': sorted(set(exceptions) - {x['path'] for x in excluded})}


def freeze(root, config, manifest_path):
    result = scan(root, config, manifest_path)
    return {'schema': 'box3d-explicit-evidence-delivery-v1', 'config': config, **result,
            'scope': 'Exact completed evidence roots and declared manifest references, plus explicitly named additional files. Not full repository/build/runtime or every historical external reference closure.',
            'selfReferenceExclusion': manifest_path,
            'activeIncompletePaths': [x['path'] for x in result['exceptionsObserved'] if x['kind'] == 'ACTIVE_UNCOMPLETED_WORK']}


def verify(root, manifest, manifest_path, require_commit=False):
    actual = scan(root, manifest['config'], manifest_path)
    for name in ['files', 'references', 'exceptionsObserved', 'exceptionPathsNotPresent']:
        if actual[name] != manifest[name]:
            raise ValueError('Explicit inventory changed: ' + name)
    if manifest.get('selfReferenceExclusion') != manifest_path:
        raise ValueError('Manifest self path mismatch')
    row = identity(root, manifest_path)
    if git_index(root).get(manifest_path) != (row['mode'], row['gitBlobSha1']):
        raise ValueError('Delivery manifest itself is not exactly staged')
    commit = None
    if require_commit:
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip()
        committed = {}
        for entry in subprocess.check_output(['git', 'ls-tree', '-rz', commit], cwd=root).split(b'\0'):
            if not entry:
                continue
            header, name = entry.split(b'\t', 1)
            mode, kind, blob = header.decode().split()
            committed[name.decode()] = (mode, blob)
        for item in [*actual['files'], row]:
            if committed.get(item['path']) != (item['mode'], item['gitBlobSha1']):
                raise ValueError('Deliverable is staged but not in source checkpoint HEAD: ' + item['path'])
    return {'status': 'PASS_SCOPED_COMPLETED_EVIDENCE_CLOSURE', 'files': len(actual['files']),
            'manifestReferences': len(actual['references']), 'observedExceptions': actual['exceptionsObserved'],
            'activeIncompletePaths': manifest['activeIncompletePaths'], 'committedSnapshot': commit, 'physicalAcceptance': 'NO_STATUS_CHANGE'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='.')
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--freeze-config')
    parser.add_argument('--require-commit', action='store_true')
    args = parser.parse_args()
    root = Path(args.root).resolve()
    try:
        relative_path(args.manifest)
        if args.freeze_config:
            out = root / args.manifest
            if out.exists():
                raise ValueError('Never overwrite earlier delivery manifest')
            result = freeze(root, json.loads(Path(args.freeze_config).read_bytes()), args.manifest)
            out.write_text(json.dumps(result, indent=2) + '\n')
            print(json.dumps({'status': 'FROZEN_REQUIRES_STAGING_AND_VERIFICATION', 'files': len(result['files']), 'references': len(result['references'])}))
        else:
            print(json.dumps(verify(root, json.loads((root / args.manifest).read_bytes()), args.manifest, args.require_commit)))
    except Exception as error:
        print(json.dumps({'status': 'FAIL_EVIDENCE_CLOSURE', 'error': str(error)}))
        sys.exit(1)
