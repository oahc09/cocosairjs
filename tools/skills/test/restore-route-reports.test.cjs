'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const tool = require('../restore-route-reports.cjs');
const clone = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
    const originals = tool.CONTRACT.reports.map((pin, index) =>
        Buffer.from(`${JSON.stringify({ status: pin.status, fixture: index })}\n`),
    );
    const reports = tool.CONTRACT.reports.map((pin, index) => ({
        ...pin,
        original_bytes: originals[index].length,
        original_git_blob_sha: tool.gitBlobSha(originals[index]),
    }));
    const inventory = Buffer.from(
        JSON.stringify({
            schema: 1,
            artifact_count: 4,
            artifacts: reports.map((pin) => ({
                path: pin.logical_path,
                bytes: pin.original_bytes,
                sha: pin.original_git_blob_sha,
            })),
        }),
    );
    const policy = { ...tool.CONTRACT, reports, publication_inventory_git_blob_sha: tool.gitBlobSha(inventory) };
    const archives = originals.map((bytes) => zlib.gzipSync(bytes));
    const manifest = {
        schema: 1,
        purpose: policy.purpose,
        publication_inventory: policy.publication_inventory,
        publication_inventory_git_blob_sha: policy.publication_inventory_git_blob_sha,
        entries: reports.map((pin, index) => ({
            ...pin,
            artifact_path: `${pin.logical_path}.gz`,
            original_sha256: tool.sha256(originals[index]),
            gzip_bytes: archives[index].length,
            gzip_sha256: tool.sha256(archives[index]),
        })),
    };
    return { originals, reports, inventory, policy, archives, manifest };
}

function archiveEntry(entry, compressed) {
    return { ...entry, gzip_bytes: compressed.length, gzip_sha256: tool.sha256(compressed) };
}

function temporary(callback) {
    const root = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'route-restore-test-'));
    const source = path.join(root, 'source');
    fs.mkdirSync(source);
    try {
        return callback({ root, source, out: path.join(root, 'restored') });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

test('fixed CLI contract pins the four historical reports and immutable inventory', () => {
    assert.equal(tool.CONTRACT.publication_inventory_git_blob_sha, 'de422cb6c09f1720f8ebf58df400a023a62905c2');
    assert.deepEqual(
        tool.CONTRACT.reports.map(({ original_bytes, original_git_blob_sha, status }) => [
            original_bytes,
            original_git_blob_sha,
            status,
        ]),
        [
            [1316031, '35b941a8a81a083bbd62abf157dd7bbc76606baf', 'PASS'],
            [1316033, 'eadf54e0ea0a2eb3cad4414f5311d63e2294eeab', 'PASS'],
            [1320744, '6b6d7a6927de7ca1ca03714b1eaf313668d1cc50', 'PASS'],
            [1600925, 'd50836366625add547ff6f50818c4e19627f6106', 'FAIL'],
        ],
    );
    assert(Object.isFrozen(tool.CONTRACT) && tool.CONTRACT.reports.every(Object.isFrozen));
    assert.deepEqual(tool.parseArgs([]), { mode: 'check' });
    assert.deepEqual(tool.parseArgs(['--check']), { mode: 'check' });
    assert.deepEqual(tool.parseArgs(['--out', '/tmp/new']), { mode: 'restore', out: '/tmp/new' });
    for (const args of [
        ['--root', '/tmp'],
        ['--manifest', 'other'],
        ['--inventory-sha', 'other'],
        ['--check', '--out', '/tmp/new'],
        ['--out'],
        ['--out', '/a', '--out', '/b'],
    ])
        assert.throws(() => tool.parseArgs(args));
});

test('all four synthetic archives recover exact bytes and preserve historical FAIL', () => {
    const data = fixture();
    const validated = tool.validateManifest(data.manifest, data.inventory, data.policy);
    assert.equal(validated.length, 4);
    validated.forEach(({ entry, pin }, index) =>
        assert(tool.decodeEntry(entry, data.archives[index], pin).equals(data.originals[index])),
    );
    assert.equal(validated[3].pin.status, 'FAIL');
});

test('missing, extra, duplicate and unknown manifest entries fail', () => {
    const data = fixture();
    for (const entries of [
        data.manifest.entries.slice(1),
        [...data.manifest.entries, data.manifest.entries[0]],
        [...data.manifest.entries.slice(0, 3), data.manifest.entries[0]],
        [...data.manifest.entries.slice(0, 3), { ...data.manifest.entries[3], logical_path: 'ai/unknown.json' }],
    ]) {
        assert.throws(() => tool.validateManifest({ ...data.manifest, entries }, data.inventory, data.policy));
    }
});

test('manifest rejects changed original size, Git SHA, status, unknown fields and invalid gzip bounds', () => {
    const data = fixture();
    for (const patch of [
        { original_bytes: 1 },
        { original_git_blob_sha: 'f'.repeat(40) },
        { status: 'FAIL' },
        { unexpected: true },
        { gzip_bytes: 0 },
        { gzip_bytes: 3 * 1024 * 1024 },
        { gzip_bytes: 1.5 },
        { gzip_sha256: 'bad' },
        { original_sha256: 'bad' },
    ]) {
        const manifest = clone(data.manifest);
        Object.assign(manifest.entries[0], patch);
        assert.throws(() => tool.validateManifest(manifest, data.inventory, data.policy));
    }
});

test('both changed inventory bytes and a matching replacement manifest pin are rejected', () => {
    const data = fixture();
    const changed = Buffer.concat([data.inventory, Buffer.from('\n')]);
    assert.throws(() => tool.validateManifest(data.manifest, changed, data.policy), /inventory bytes/);
    assert.throws(
        () =>
            tool.validateManifest(
                { ...data.manifest, publication_inventory_git_blob_sha: tool.gitBlobSha(changed) },
                changed,
                data.policy,
            ),
        /inventory pin/,
    );
    assert.throws(() => tool.validateManifest(data.manifest, data.inventory), /inventory pin/);
});

test('publication inventory must independently contain the exact original report identity', () => {
    const data = fixture();
    for (const patch of [{ bytes: 1 }, { sha: 'f'.repeat(40) }, { path: 'ai/other.json' }]) {
        const inventory = JSON.parse(data.inventory);
        Object.assign(inventory.artifacts[0], patch);
        const bytes = Buffer.from(JSON.stringify(inventory));
        const policy = { ...data.policy, publication_inventory_git_blob_sha: tool.gitBlobSha(bytes) };
        const manifest = {
            ...data.manifest,
            publication_inventory_git_blob_sha: policy.publication_inventory_git_blob_sha,
        };
        assert.throws(
            () => tool.validateManifest(manifest, bytes, policy),
            /Historical publication|missing from historical/,
        );
    }
});

test('gzip length and hash mismatches fail before decompression', () => {
    const data = fixture();
    const entry = data.manifest.entries[0];
    assert.throws(
        () => tool.decodeEntry({ ...entry, gzip_bytes: entry.gzip_bytes + 1 }, data.archives[0], data.reports[0]),
        /Gzip byte count/,
    );
    assert.throws(
        () => tool.decodeEntry({ ...entry, gzip_sha256: '0'.repeat(64) }, data.archives[0], data.reports[0]),
        /Gzip SHA/,
    );
});

test('truncated gzip and bad CRC fail even if compressed hashes are updated', () => {
    const data = fixture();
    const badCrc = Buffer.from(data.archives[0]);
    badCrc[badCrc.length - 8] ^= 1;
    for (const compressed of [data.archives[0].subarray(0, -1), badCrc]) {
        assert.throws(
            () => tool.decodeEntry(archiveEntry(data.manifest.entries[0], compressed), compressed, data.reports[0]),
            /unexpected end|incorrect data check/,
        );
    }
});

test('oversized decompression is capped by the fixed original size', () => {
    const data = fixture();
    const compressed = zlib.gzipSync(Buffer.alloc(1024 * 1024, 65));
    assert.throws(
        () => tool.decodeEntry(archiveEntry(data.manifest.entries[0], compressed), compressed, data.reports[0]),
        /larger than|output|size|length/i,
    );
    const short = zlib.gzipSync(Buffer.from('{}'));
    assert.throws(
        () => tool.decodeEntry(archiveEntry(data.manifest.entries[0], short), short, data.reports[0]),
        /original byte count/,
    );
});

test('changing payload plus gzip and original hashes cannot escape the fixed historical Git SHA', () => {
    const data = fixture();
    const changed = Buffer.from(data.originals[0].toString().replace('PASS', 'FAIL'));
    assert.equal(changed.length, data.originals[0].length);
    const compressed = zlib.gzipSync(changed);
    const entry = { ...archiveEntry(data.manifest.entries[0], compressed), original_sha256: tool.sha256(changed) };
    assert.throws(() => tool.decodeEntry(entry, compressed, data.reports[0]), /original Git blob SHA/);
    const manifest = clone(data.manifest);
    manifest.entries[0] = { ...entry, original_git_blob_sha: tool.gitBlobSha(changed) };
    assert.throws(
        () => tool.validateManifest(manifest, data.inventory, data.policy),
        /Historical report original_git_blob_sha/,
    );
});

test('original SHA-256 and parsed JSON status are independently checked', () => {
    const data = fixture();
    assert.throws(
        () =>
            tool.decodeEntry(
                { ...data.manifest.entries[0], original_sha256: '0'.repeat(64) },
                data.archives[0],
                data.reports[0],
            ),
        /original SHA-256/,
    );
    const pin = { ...data.reports[3], status: 'PASS' };
    const entry = { ...data.manifest.entries[3], status: 'PASS' };
    assert.throws(() => tool.decodeEntry(entry, data.archives[3], pin), /JSON status/);
});

test('logical and gzip paths reject traversal, absolute paths and alternative artifact names', () => {
    const data = fixture();
    for (const name of ['../escape', '/tmp/escape', 'C:/escape', 'a\\escape', 'a//escape', 'a/./escape', 'a\0escape'])
        assert.throws(() => tool.relativePath(name), /Unsafe/);
    for (const artifact_path of [
        '../escape.gz',
        '/tmp/escape.gz',
        `${data.manifest.entries[0].logical_path}.other.gz`,
    ]) {
        const manifest = clone(data.manifest);
        manifest.entries[0].artifact_path = artifact_path;
        assert.throws(() => tool.validateManifest(manifest, data.inventory, data.policy));
    }
});

test('bounded file reads reject absent files, oversize inputs, symlinks and symlink parents', () =>
    temporary(({ root, source }) => {
        const file = path.join(source, 'artifact.gz');
        fs.writeFileSync(file, 'bytes');
        assert.equal(tool.readBounded(file, 5).toString(), 'bytes');
        assert.throws(() => tool.readBounded(file, 4), /size limit/);
        assert.throws(() => tool.readBounded(path.join(source, 'missing'), 10), /ENOENT/);
        fs.symlinkSync(file, path.join(source, 'link.gz'));
        fs.symlinkSync(source, path.join(root, 'linked-parent'), 'dir');
        assert.throws(() => tool.readBounded(path.join(source, 'link.gz'), 10), /Symlink/);
        assert.throws(() => tool.readBounded(path.join(root, 'linked-parent', 'artifact.gz'), 10), /Symlink/);
    }));

test('output refuses overwrite, symlinks, traversal outside temp and source overlap', () =>
    temporary(({ root, source, out }) => {
        assert.equal(tool.validateOutput(out, root, [source]), out);
        for (const candidate of [
            'relative',
            root,
            path.join(root, '..', 'escaped-output'),
            path.join(source, 'output'),
        ])
            assert.throws(() => tool.validateOutput(candidate, root, [source]));
        fs.symlinkSync(source, out, 'dir');
        assert.throws(() => tool.validateOutput(out, root, [source]), /Symlink/);
        fs.unlinkSync(out);
        fs.mkdirSync(out);
        fs.writeFileSync(path.join(out, 'sentinel'), 'keep');
        assert.throws(() => tool.writeRestoredFiles([], out, root, [source]), /nonexistent/);
        assert.equal(fs.readFileSync(path.join(out, 'sentinel'), 'utf8'), 'keep');
    }));

test('restoration writes only verified logical paths and independently rereads their bytes', () =>
    temporary(({ root, source, out }) => {
        const data = fixture();
        const files = tool
            .validateManifest(data.manifest, data.inventory, data.policy)
            .map(({ entry, pin }, index) => ({
                logical_path: entry.logical_path,
                bytes: tool.decodeEntry(entry, data.archives[index], pin),
            }));
        tool.writeRestoredFiles(files, out, root, [source]);
        files.forEach((file) => assert(fs.readFileSync(path.join(out, file.logical_path)).equals(file.bytes)));
        assert.throws(() => tool.writeRestoredFiles(files, out, root, [source]), /nonexistent/);
        const unsafe = path.join(root, 'unsafe-output');
        assert.throws(
            () =>
                tool.writeRestoredFiles([{ logical_path: '../escape', bytes: Buffer.from('bad') }], unsafe, root, [
                    source,
                ]),
            /Unsafe/,
        );
        assert(!fs.existsSync(unsafe));
    }));

test('CLI failures are JSON-only and validation failure creates no output directory', () =>
    temporary(({ root, source, out }) => {
        const copiedTool = path.join(source, 'tools/skills/restore-route-reports.cjs');
        fs.mkdirSync(path.dirname(copiedTool), { recursive: true });
        fs.copyFileSync(path.resolve(__dirname, '../restore-route-reports.cjs'), copiedTool);
        for (const args of [[], ['--check'], ['--inventory-sha', 'relaxed'], ['--out', out]]) {
            const result = spawnSync(process.execPath, [copiedTool, ...args], {
                cwd: source,
                encoding: 'utf8',
                env: { ...process.env, RUNNER_TEMP: root },
            });
            assert.equal(result.status, 1);
            assert.equal(result.stderr, '');
            const report = JSON.parse(result.stdout);
            assert.equal(report.status, 'FAIL');
            assert.equal(report.historical_reports_reexecuted, false);
            assert(!fs.existsSync(out));
        }
    }));
