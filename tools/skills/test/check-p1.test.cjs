'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const gate = require('../check-p1.cjs');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function fixture(callback) {
    const root = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'skills-p1-orchestration-test-'));
    const temp = path.join(root, 'temp');
    const repo = path.join(root, 'repo');
    const source = path.join(root, 'source');
    for (const directory of [temp, repo, source]) fs.mkdirSync(directory);
    try {
        return await callback({ root, temp, repo, source, out: path.join(temp, 'new-result') });
    } finally {
        const resolved = fs.realpathSync(root);
        assert.equal(path.dirname(resolved), fs.realpathSync(process.env.RUNNER_TEMP || os.tmpdir()));
        assert(path.basename(resolved).startsWith('skills-p1-orchestration-test-'));
        fs.rmSync(root, { recursive: true, force: true });
    }
}

function write(filename, content) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
}

function event(overrides = {}) {
    return { scenario_id: 'B1', complete: true, outcome: 'success', ...overrides };
}

test('fresh candidate reading evidence is explicitly selected without rebinding historical records', () => {
    const root = path.resolve(os.tmpdir(), 'skills-evidence-repo');
    const historical = 'ai/plans/skills-token-evidence/recovery/reading-candidate-B1/events.jsonl';
    const fresh = 'ai/plans/skills-token-evidence/reading-candidate-B1-20261024/events.jsonl';
    assert.equal(gate.candidateLoadPath(root), path.join(root, historical));
    assert.equal(gate.candidateLoadPath(root, fresh), path.join(root, fresh));
    const parsed = gate.parseArgs(['--source', '/source', '--out', '/tmp/out', '--candidate-loads', fresh]);
    assert.equal(parsed['candidate-loads'], fresh);
    for (const invalid of [
        '',
        null,
        '../../outside.jsonl',
        '/outside.jsonl',
        'ai/plans/skills-token-evidence/../outside.jsonl',
        fresh.replace('.jsonl', '.txt'),
    ]) {
        assert.throws(() => gate.candidateLoadPath(root, invalid));
    }
});

test('CLI requires explicit source and output, and rejects unknown, duplicate or valueless flags', () => {
    assert.deepEqual(gate.parseArgs(['--source', '/source', '--out', '/tmp/out']), {
        source: '/source',
        out: '/tmp/out',
    });
    for (const args of [
        [],
        ['--source', '/source'],
        ['--out', '/tmp/out'],
        ['--out'],
        ['--source', '--out'],
        ['--write'],
        ['--source=x'],
        ['--source', '/a', '--source', '/b', '--out', '/tmp/out'],
    ]) {
        assert.throws(() => gate.parseArgs(args));
    }
});

test('output must be a new absolute child of the approved temporary root', () =>
    fixture(({ temp, repo, source, out }) => {
        assert.equal(gate.validateOutput(out, temp, [repo, source]), out);
        assert.throws(() => gate.validateOutput('relative', temp, [repo, source]), /absolute/);
        assert.throws(() => gate.validateOutput(temp, temp, [repo, source]), /below/);
        assert.throws(() => gate.validateOutput(`${temp}-other/result`, temp, [repo, source]), /below/);
        assert.throws(() => gate.validateOutput(path.join(temp, '..', 'escape'), temp, [repo, source]), /below/);
        fs.mkdirSync(out);
        write(path.join(out, 'sentinel'), 'keep');
        assert.throws(() => gate.validateOutput(out, temp, [repo, source]), /nonexistent/);
        assert.equal(fs.readFileSync(path.join(out, 'sentinel'), 'utf8'), 'keep');
    }));

test('output cannot be inside a protected source or contain a protected source', () =>
    fixture(({ temp, out }) => {
        assert.throws(() => gate.validateOutput(out, temp, [temp]), /isolated/);
        assert.throws(() => gate.validateOutput(out, temp, [path.join(out, 'future-source')]), /isolated/);
    }));

test('output parent must already exist', () =>
    fixture(({ temp, repo }) => {
        assert.throws(() => gate.validateOutput(path.join(temp, 'missing', 'output'), temp, [repo]), /ENOENT/);
    }));

test('output rejects both an existing symlink and a symlink ancestor', () =>
    fixture(({ temp, repo, source, out }) => {
        fs.symlinkSync(source, out, process.platform === 'win32' ? 'junction' : 'dir');
        assert.throws(() => gate.validateOutput(out, temp, [repo]), /Symlink/);
        assert.throws(() => gate.validateOutput(path.join(out, 'new'), temp, [repo]), /Symlink/);
    }));

test('read-only inputs reject symlinks, directories and absent files', () =>
    fixture(({ root, source }) => {
        const input = path.join(source, 'input');
        write(input, 'original');
        assert.equal(gate.readFile(input).toString(), 'original');
        const link = path.join(root, 'input-link');
        // A real directory reparse point works without elevated Windows symlink privileges.
        fs.symlinkSync(
            process.platform === 'win32' ? source : input,
            link,
            process.platform === 'win32' ? 'junction' : 'file',
        );
        assert.throws(() => gate.readFile(process.platform === 'win32' ? path.join(link, 'input') : link), /Symlink/);
        assert.throws(() => gate.readFile(source), /regular file/);
        assert.throws(() => gate.readFile(path.join(root, 'missing')), /ENOENT/);
    }));

test('writeNew refuses traversal, absolute paths, backslashes, NULs and overwrite', () =>
    fixture(({ temp }) => {
        for (const relative of [
            '../escape',
            '/tmp/escape',
            'a/../escape',
            './escape',
            'a\\escape',
            'a\0escape',
            'a//escape',
        ]) {
            assert.throws(() => gate.writeNew(temp, relative, 'bad'), /Unsafe|escaped/);
        }
        gate.writeNew(temp, 'new/file.txt', 'original');
        assert.throws(() => gate.writeNew(temp, 'new/file.txt', 'replacement'), /EEXIST/);
        assert.equal(fs.readFileSync(path.join(temp, 'new/file.txt'), 'utf8'), 'original');
    }));

test('writeNew refuses a symlinked parent without touching the target', () =>
    fixture(({ temp, source }) => {
        fs.symlinkSync(source, path.join(temp, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
        assert.throws(() => gate.writeNew(temp, 'link/new.txt', 'bad'), /Symlink/);
        assert.deepEqual(fs.readdirSync(source), []);
    }));

test('original snapshot identity is pinned, not accepted from candidate-derived hashes', () => {
    const files = [{ path: 'skills/example/SKILL.md', sha256: '0'.repeat(64), bytes: 1, git_blob_sha: '0'.repeat(40) }];
    const manifest = { schema: 1, base_commit: gate.SOURCE_COMMIT, snapshot_hash: gate.ORIGINAL_HASH, files };
    assert.throws(
        () => gate.validateManifestIdentity({ ...manifest, base_commit: 'a'.repeat(40) }, gate.ORIGINAL_HASH),
        /Git commit/,
    );
    assert.throws(
        () =>
            gate.validateManifestIdentity(
                { ...manifest, snapshot_hash: sha256(JSON.stringify(files)) },
                gate.ORIGINAL_HASH,
            ),
        /identity/,
    );
    assert.throws(() => gate.validateManifestIdentity(manifest, gate.ORIGINAL_HASH), /file list/);
    assert.throws(() => gate.validateManifestIdentity({ ...manifest, files: [] }, gate.ORIGINAL_HASH), /missing/);
    assert.throws(() => gate.validateManifestIdentity({ ...manifest, schema: 2 }, gate.ORIGINAL_HASH), /Unsupported/);
});

test('prerequisite replacement checks old bytes and exactly one occurrence', () => {
    const bytes = Buffer.from('before target after\n');
    const change = { path: 'skills/test.md', before_sha256: sha256(bytes), from: 'target', to: 'fixed' };
    assert.equal(gate.exactReplacement(bytes, change), 'before fixed after\n');
    assert.throws(() => gate.exactReplacement(Buffer.from('other'), change), /original hash/);
    assert.throws(() => gate.exactReplacement(bytes, { ...change, from: 'absent' }), /exactly once/);
    const repeated = Buffer.from('target target');
    assert.throws(
        () => gate.exactReplacement(repeated, { ...change, before_sha256: sha256(repeated) }),
        /exactly once/,
    );
    assert.throws(() => gate.exactReplacement(bytes, { ...change, from: '' }), /nonempty/);
});

test('prerequisite replacement rejects malformed UTF-8 even with a matching hash', () => {
    const bytes = Buffer.from([0xff, 0x61]);
    assert.throws(
        () =>
            gate.exactReplacement(bytes, { path: 'skills/test.md', before_sha256: sha256(bytes), from: 'a', to: 'b' }),
        /UTF-8/,
    );
});

test('missing, empty, synthetic B2, incomplete, failed and multiple B1 records fail closed', () =>
    fixture(({ temp }) => {
        const file = path.join(temp, 'events.jsonl');
        assert.throws(() => gate.validateB1Log(file), /ENOENT/);
        for (const content of [
            '',
            'invalid JSON',
            `${JSON.stringify(event({ scenario_id: 'B2' }))}\n`,
            `${JSON.stringify(event({ complete: false }))}\n`,
            `${JSON.stringify(event({ outcome: 'failure' }))}\n`,
            `${JSON.stringify(event())}\n${JSON.stringify(event())}\n`,
        ]) {
            write(file, content);
            assert.throws(() => gate.validateB1Log(file));
        }
        // This is only the preliminary shape check. The real CLI still recomputes
        // both reports and validates full hashes, protocols, reads and answer receipts.
        write(file, `${JSON.stringify(event())}\n`);
        gate.validateB1Log(file);
    }));

test('disk verification rejects missing, extra, byte-changed or hash-changed files', () => {
    const expected = [{ path: 'skills/test.md', bytes: 1, sha256: 'a', git_blob_sha: 'b' }];
    for (const actual of [
        [],
        [...expected, { path: 'skills/extra.md' }],
        [{ ...expected[0], bytes: 2 }],
        [{ ...expected[0], sha256: 'different' }],
        [{ ...expected[0], git_blob_sha: 'different' }],
    ]) {
        assert.throws(
            () => gate.verifyDisk({ enumerateFiles: () => actual }, '/synthetic-disk', expected),
            /Disk file set/,
        );
    }
});

test('format scope contains all new or byte-modified skill sources, without unchanged originals', () => {
    const before = [
        { path: 'skills/old.md', sha256: 'same' },
        { path: 'skills/changed.md', sha256: 'old' },
    ];
    const after = [
        { path: 'skills/old.md', sha256: 'same' },
        { path: 'skills/changed.md', sha256: 'new' },
        { path: 'skills/index.json', sha256: 'index' },
        { path: 'skills/new.cjs', sha256: 'code' },
    ];
    assert.deepEqual(gate.changedFormatFiles(before, after), [
        'skills/changed.md',
        'skills/index.json',
        'skills/new.cjs',
    ]);
});

test('CLI without explicit output cannot start or create a passing report', () => {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../check-p1.cjs'), '--source', os.tmpdir()], {
        encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Explicit --out/);
    assert.equal(result.stdout, '');
});

test('orchestration refuses an existing output without modifying its contents', () =>
    fixture(async ({ repo, source, out }) => {
        fs.mkdirSync(out);
        write(path.join(out, 'sentinel'), 'preserve');
        await assert.rejects(gate.run({ source, out }, repo), /nonexistent/);
        assert.deepEqual(fs.readdirSync(out), ['sentinel']);
        assert.equal(fs.readFileSync(path.join(out, 'sentinel'), 'utf8'), 'preserve');
    }));

test('missing current tools or future inputs produce FAIL, never a placeholder PASS', () =>
    fixture(async ({ repo, source, out }) => {
        const result = await gate.run({ source, out }, repo);
        assert.equal(result.status, 'FAIL');
        assert.deepEqual(result.gates, []);
        assert.match(result.error, /ENOENT/);
        assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8')).status, 'FAIL');
        assert.deepEqual(fs.readdirSync(source), []);
        assert.deepEqual(fs.readdirSync(repo), []);
    }));
