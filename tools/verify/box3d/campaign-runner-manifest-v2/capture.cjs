/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Restore exact lock bytes, never re-anchor a lock to current product sources.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '../../../..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const families = { collision: 'public-collision-esm', fixed: 'public-fixed-joint', hinge: 'public-hinge-joint' };
const relative = (file) => {
    assert(!path.isAbsolute(file) && !file.split('/').includes('..'));
    return file;
};
function gitBlobs(revision, files, repository = ROOT) {
    assert.match(revision, /^[a-f0-9]{40}$/);
    const bytes = execFileSync('git', ['cat-file', '--batch'], {
        cwd: path.resolve(repository),
        input: files.map((file) => `${revision}:${relative(file)}\n`).join(''),
        maxBuffer: 256 * 1024 * 1024,
    });
    let offset = 0;
    const result = new Map();
    for (const file of files) {
        const end = bytes.indexOf(10, offset),
            header = bytes.subarray(offset, end).toString();
        offset = end + 1;
        if (header.endsWith(' missing')) continue;
        const match = /^([a-f0-9]{40}) blob (\d+)$/.exec(header);
        assert(match, 'Expected Git blob');
        const size = Number(match[2]);
        result.set(file, bytes.subarray(offset, offset + size));
        offset += size + 1;
    }
    return result;
}
function dependencyFiles(root = ROOT) {
    const seen = new Set(),
        files = [];
    function walk(dir) {
        for (const item of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (item.name === 'node_modules') continue;
            const file = path.join(dir, item.name);
            if (item.isDirectory()) walk(file);
            else if (item.isFile()) files.push(file);
            else if (item.isSymbolicLink()) {
                assert(fs.statSync(file).isFile(), 'Directory symlink not supported in dependency');
                files.push(file);
            }
        }
    }
    function visit(name, base) {
        const require = createRequire(path.join(base, 'package.json'));
        let entry;
        try {
            entry = require.resolve(name + '/package.json');
        } catch {
            entry = require.resolve(name);
        }
        let dir = path.dirname(entry),
            manifest;
        while (true) {
            const candidate = path.join(dir, 'package.json');
            if (fs.existsSync(candidate)) {
                const value = JSON.parse(fs.readFileSync(candidate));
                if (value.name === name) {
                    manifest = value;
                    break;
                }
            }
            const parent = path.dirname(dir);
            assert.notEqual(parent, dir, 'Cannot resolve dependency manifest: ' + name);
            dir = parent;
        }
        dir = fs.realpathSync(dir);
        if (seen.has(dir)) return;
        seen.add(dir);
        walk(dir);
        for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) visit(dependency, dir);
    }
    visit('jsdom', root);
    return files.sort();
}
function capture(family, lockPath, fixtureRevision, out) {
    assert(families[family], 'Unknown fixture family');
    assert.match(fixtureRevision, /^[a-f0-9]{40}$/);
    const lockBytes = fs.readFileSync(lockPath),
        lock = JSON.parse(lockBytes);
    assert.match(lock.producerCommit, /^[a-f0-9]{40}$/);
    const prefix = `tools/verify/box3d/${families[family]}/`;
    const fixturePaths = execFileSync('git', ['ls-tree', '-r', '--name-only', fixtureRevision, '--', prefix], {
        cwd: ROOT,
    })
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean);
    assert(fixturePaths.includes(prefix + 'consumer.mjs') && fixturePaths.includes(prefix + 'inputs.mjs'));
    const fixtureBlobs = gitBlobs(fixtureRevision, fixturePaths);
    const fixture =
        lock.fixture ??
        fixturePaths.map((file) => ({
            path: file,
            bytes: fixtureBlobs.get(file).length,
            sha256: sha(fixtureBlobs.get(file)),
        }));
    assert.deepEqual(
        [...fixture.map((r) => r.path)].sort(),
        fixturePaths.sort(),
        'Exact fixture directory closure required',
    );
    const wanted = [...lock.source, ...fixture];
    const paths = [...new Set(wanted.map((r) => relative(r.path)))];
    const preserved = gitBlobs(fixtureRevision, paths),
        produced = gitBlobs(lock.producerCommit, paths);
    // Build a complete, verified in-memory set before creating the exclusive destination.
    const restored = wanted.map((row) => {
        let bytes = preserved.get(row.path),
            origin = fixtureRevision;
        if (!bytes || sha(bytes) !== row.sha256) {
            bytes = produced.get(row.path);
            origin = lock.producerCommit;
        }
        if ((!bytes || sha(bytes) !== row.sha256) && row.path.split('/').includes('node_modules')) {
            bytes = fs.readFileSync(path.join(ROOT, row.path));
            origin = 'HASH_VERIFIED_INSTALLED_DEPENDENCY';
        }
        assert(
            bytes && bytes.length === row.bytes && sha(bytes) === row.sha256,
            'No exact preserved input: ' + row.path,
        );
        return { ...row, origin, data: bytes };
    });
    if (family === 'collision') assert.deepEqual(fixtureBlobs.get(prefix + 'inputs.lock.json'), lockBytes);
    fs.mkdirSync(out);
    // Host dependencies are shared read-only, never installed or modified here.
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(out, 'node_modules'), 'dir');
    for (const row of restored) {
        if (row.path.startsWith('node_modules/')) continue;
        const file = path.join(out, row.path);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, row.data, { flag: 'wx' });
    }
    fs.writeFileSync(path.join(out, 'original-input-lock.json'), lockBytes, { flag: 'wx' });
    const receipt = {
        schema: 'box3d-preserved-fixture-root-v1',
        family,
        fixtureRevision,
        producerCommit: lock.producerCommit,
        lockSha256: sha(lockBytes),
        sharedDependencies: path.join(ROOT, 'node_modules'),
        files: restored.map(({ data, ...row }) => row),
        scope: 'RESTORED_INPUTS_NOT_TEST_RESULT',
    };
    fs.writeFileSync(path.join(out, 'capture.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    return receipt;
}
module.exports = { capture, dependencyFiles, families, gitBlobs };
