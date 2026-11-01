# Copyright (c) 2026-2027 oahc09@gmail.com
# SPDX-License-Identifier: MIT
"""Lossless content-addressed evidence pack. Unique raw is never excluded by extension.

The explicit config chooses source directories and exact regenerable cache subtrees.
All remaining regular files, including ignored .log files and failed attempts, are
mapped to byte-exact objects. Verification reads every object and every alias.
"""
from pathlib import Path, PurePosixPath
import argparse, datetime, hashlib, json, os, re, stat, zipfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe(name):
    p = PurePosixPath(name)
    assert name and not p.is_absolute() and '..' not in p.parts and str(p) == name
    return name


def verify(archive):
    with zipfile.ZipFile(archive) as z:
        assert len(z.namelist()) == len(set(z.namelist())), 'Duplicate ZIP members'
        manifest_bytes = z.read('inventory.json')
        manifest = json.loads(manifest_bytes)
        assert manifest['schema'] == 'box3d-content-addressed-evidence-v1'
        files = manifest['files']
        assert len({row['path'] for row in files}) == len(files), 'Duplicate logical paths'
        hashes = {row['sha256'] for row in files}
        assert set(z.namelist()) == {'inventory.json'} | {'objects/' + h for h in hashes}
        objects = {}
        for h in sorted(hashes):
            data = z.read('objects/' + h)
            assert sha(data) == h, 'Object hash mismatch'
            objects[h] = len(data)
        for row in files:
            safe(row['path'])
            assert row['mode'] in ['100644', '100755']
            assert objects[row['sha256']] == row['bytes'], 'Alias size mismatch'
        assert sum(row['bytes'] for row in files) == manifest['logicalBytes']
        assert sum(objects.values()) == manifest['uniqueBytes']
        return {'status': 'PASS_ALL_OBJECTS_AND_LOGICAL_ALIASES_READ_AND_HASH_VERIFIED',
                'files': len(files), 'uniqueObjects': len(objects),
                'logicalBytes': manifest['logicalBytes'], 'uniqueBytes': manifest['uniqueBytes'],
                'inventorySha256': sha(manifest_bytes), 'excludedCaches': manifest['excludedCaches'],
                'scope': 'Exact named directory bytes, not automatic semantic validation of every JSON reference.'}


def pack(config_path, output):
    assert not output.exists(), 'Never overwrite an evidence archive'
    config_bytes = config_path.read_bytes()
    config = json.loads(config_bytes)
    rows, exclusions, objects = [], [], {}
    aliases = set()
    for item in config['roots']:
        alias, root = safe(item['alias']), Path(item['directory']).resolve()
        assert '/' not in alias and alias not in aliases and root.is_dir()
        aliases.add(alias)
        excluded = {safe(row['path']): row for row in item.get('regenerableCaches', [])}
        for name, policy in excluded.items():
            assert policy['kind'] == 'JEST_TRANSFORM_CACHE' and policy['reason']
            parts = Path(name).parts
            is_attempt_cache = len(parts) == 2 and parts[1] == 'jest-cache' and re.fullmatch(r'(?:attempt[0-9]+|set[0-9]+-[a-z0-9-]+)', parts[0]) is not None
            assert name == 'shared-jest-transforms' or is_attempt_cache, 'Only exact known Jest cache directories are supported'
            if is_attempt_cache:
                cache = root / name
                assert cache.is_dir() and not cache.is_symlink()
                assert all(child.name.startswith(('jest-transform-cache-', 'haste-map-', 'perf-cache-'))
                           for child in cache.iterdir()), 'Attempt cache includes non-Jest data'
        for path in sorted(root.rglob('*')):
            if path.is_dir() and not path.is_symlink():
                continue
            assert path.is_file() and not path.is_symlink(), 'Nonregular evidence requires separate explicit handling'
            rel = path.relative_to(root).as_posix()
            data = path.read_bytes()
            row = {'path': alias + '/' + rel, 'bytes': len(data), 'sha256': sha(data),
                   'mode': '100755' if path.stat().st_mode & stat.S_IXUSR else '100644'}
            policy = next((policy for name, policy in excluded.items() if rel == name or rel.startswith(name + '/')), None)
            if policy:
                exclusions.append({**row, 'kind': policy['kind'], 'reason': policy['reason']})
            else:
                rows.append(row)
                objects.setdefault(row['sha256'], path)
    manifest = {'schema': 'box3d-content-addressed-evidence-v1',
                'createdAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'configSha256': sha(config_bytes), 'roots': config['roots'],
                'files': rows, 'logicalBytes': sum(row['bytes'] for row in rows),
                'uniqueBytes': sum(path.stat().st_size for path in objects.values()),
                'excludedCaches': exclusions,
                'scope': config['scope'], 'knownEvidenceGaps': config.get('knownEvidenceGaps', [])}
    with zipfile.ZipFile(output, 'x', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr('inventory.json', json.dumps(manifest, separators=(',', ':'), ensure_ascii=False) + '\n')
        for h, path in sorted(objects.items()):
            data = path.read_bytes()
            assert sha(data) == h, 'Source changed while archiving'
            z.writestr('objects/' + h, data)
    result = verify(output)
    result.update({'archiveBytes': output.stat().st_size, 'archiveSha256': sha(output.read_bytes())})
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config')
    parser.add_argument('--archive', required=True)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    archive = Path(args.archive).resolve()
    if args.verify:
        result = verify(archive)
        result.update({'archiveBytes': archive.stat().st_size, 'archiveSha256': sha(archive.read_bytes())})
    else:
        assert args.config
        result = pack(Path(args.config).resolve(), archive)
    print(json.dumps(result, separators=(',', ':'), ensure_ascii=False))
