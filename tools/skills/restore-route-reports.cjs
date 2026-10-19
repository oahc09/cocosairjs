#!/usr/bin/env node
'use strict';

// Restore historical report bytes, never execute snapshots or recapture results.
// Default/--check is read-only; --out must be a new isolated temporary directory.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');

const REPO_ROOT = path.resolve(__dirname, '../..');
const RECOVERY = 'ai/plans/skills-token-evidence/recovery';
const MANIFEST_PATH = `${RECOVERY}/compressed-route-reports.json`;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const PURPOSE = 'Lossless storage of four historical routing reports; restoration is not a new execution.';
const CONTRACT = Object.freeze({
    publication_inventory: `${RECOVERY}/publication-inventory.json`,
    publication_inventory_git_blob_sha: 'de422cb6c09f1720f8ebf58df400a023a62905c2',
    purpose: PURPOSE,
    reports: Object.freeze(
        [
            ['s2b-attempt2-route.json', 1316031, '35b941a8a81a083bbd62abf157dd7bbc76606baf', 'PASS'],
            ['s2b-attempt3-route.json', 1316033, 'eadf54e0ea0a2eb3cad4414f5311d63e2294eeab', 'PASS'],
            ['final-route.json', 1320744, '6b6d7a6927de7ca1ca03714b1eaf313668d1cc50', 'PASS'],
            ['final-route-attempt1.json', 1600925, 'd50836366625add547ff6f50818c4e19627f6106', 'FAIL'],
        ].map(([name, original_bytes, original_git_blob_sha, status]) =>
            Object.freeze({ logical_path: `${RECOVERY}/${name}`, original_bytes, original_git_blob_sha, status }),
        ),
    ),
});
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const gitBlobSha = (bytes) => crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
    assert(object(value), `${label} must be an object`);
    assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} fields differ`);
}

function relativePath(value) {
    assert(
        typeof value === 'string' &&
            value.length > 0 &&
            !path.isAbsolute(value) &&
            !/[\\\0:]/u.test(value) &&
            value.split('/').every((part) => part && part !== '.' && part !== '..'),
        'Unsafe repository-relative path',
    );
    return value;
}

function inside(root, target) {
    const relative = path.relative(root, target);
    return (
        relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
    );
}

function noSymlinks(filename, allowMissing = false) {
    const absolute = path.resolve(filename);
    let cursor = path.parse(absolute).root;
    for (const part of absolute.slice(cursor.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        try {
            assert(!fs.lstatSync(cursor).isSymbolicLink(), `Symlink is not permitted: ${cursor}`);
        } catch (error) {
            if (allowMissing && error.code === 'ENOENT') return;
            throw error;
        }
    }
}

function readBounded(filename, limit) {
    assert(Number.isSafeInteger(limit) && limit >= 0 && limit <= MAX_INPUT_BYTES, 'Invalid input size limit');
    noSymlinks(filename);
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const stat = fs.fstatSync(fd);
        assert(stat.isFile(), `Input is not a regular file: ${filename}`);
        assert(stat.size <= limit, `Input exceeds size limit: ${filename}`);
        const buffer = Buffer.alloc(limit + 1);
        let size = 0;
        while (size < buffer.length) {
            const count = fs.readSync(fd, buffer, size, buffer.length - size, null);
            if (count === 0) break;
            size += count;
        }
        assert(size <= limit && size === stat.size, `Input changed or exceeds size limit: ${filename}`);
        return buffer.subarray(0, size);
    } finally {
        fs.closeSync(fd);
    }
}

function parseJson(bytes, label) {
    let text;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        throw new Error(`${label} is not valid UTF-8`);
    }
    return JSON.parse(text);
}

// The policy argument exists only for small, synthetic unit fixtures. The CLI
// always uses the frozen CONTRACT above and has no flag or environment override.
function validateManifest(manifest, inventoryBytes, policy = CONTRACT) {
    exactKeys(
        manifest,
        ['schema', 'purpose', 'publication_inventory', 'publication_inventory_git_blob_sha', 'entries'],
        'Manifest',
    );
    assert.equal(manifest.schema, 1, 'Unsupported manifest schema');
    assert.equal(manifest.purpose, policy.purpose, 'Manifest purpose differs');
    assert.equal(manifest.publication_inventory, policy.publication_inventory, 'Publication inventory path differs');
    assert.equal(
        manifest.publication_inventory_git_blob_sha,
        policy.publication_inventory_git_blob_sha,
        'Publication inventory pin differs',
    );
    assert.equal(
        gitBlobSha(inventoryBytes),
        policy.publication_inventory_git_blob_sha,
        'Historical publication inventory bytes differ',
    );
    const inventory = parseJson(inventoryBytes, 'Publication inventory');
    assert.equal(inventory.schema, 1, 'Unsupported publication inventory schema');
    assert(Array.isArray(inventory.artifacts), 'Publication inventory artifacts are missing');
    assert.equal(inventory.artifact_count, inventory.artifacts.length, 'Publication inventory count differs');
    const inventoryEntries = new Map();
    for (const item of inventory.artifacts) {
        assert(object(item), 'Invalid publication inventory entry');
        relativePath(item.path);
        assert(!inventoryEntries.has(item.path), 'Duplicate publication inventory path');
        inventoryEntries.set(item.path, item);
    }
    assert(Array.isArray(manifest.entries), 'Manifest entries are missing');
    assert.equal(manifest.entries.length, policy.reports.length, 'Exactly four fixed report entries are required');
    const expected = new Map(policy.reports.map((item) => [item.logical_path, item]));
    const seen = new Set();
    const validated = [];
    for (const entry of manifest.entries) {
        exactKeys(
            entry,
            [
                'logical_path',
                'artifact_path',
                'original_bytes',
                'original_git_blob_sha',
                'original_sha256',
                'gzip_bytes',
                'gzip_sha256',
                'status',
            ],
            'Report entry',
        );
        relativePath(entry.logical_path);
        relativePath(entry.artifact_path);
        assert(!seen.has(entry.logical_path), 'Duplicate logical report path');
        seen.add(entry.logical_path);
        const pin = expected.get(entry.logical_path);
        assert(pin, 'Report path is outside the four fixed reports');
        assert.equal(entry.artifact_path, `${entry.logical_path}.gz`, 'Compressed artifact path differs');
        for (const field of ['original_bytes', 'original_git_blob_sha', 'status']) {
            assert.equal(entry[field], pin[field], `Historical report ${field} differs: ${entry.logical_path}`);
        }
        const historical = inventoryEntries.get(entry.logical_path);
        assert(historical, 'Report is missing from historical publication inventory');
        assert.equal(historical.bytes, pin.original_bytes, 'Historical publication byte count differs');
        assert.equal(historical.sha, pin.original_git_blob_sha, 'Historical publication Git blob SHA differs');
        assert(/^[a-f0-9]{64}$/u.test(entry.original_sha256), 'Invalid original SHA-256');
        assert(/^[a-f0-9]{64}$/u.test(entry.gzip_sha256), 'Invalid gzip SHA-256');
        assert(
            Number.isSafeInteger(entry.gzip_bytes) && entry.gzip_bytes > 0 && entry.gzip_bytes <= MAX_INPUT_BYTES,
            'Invalid gzip byte count',
        );
        validated.push({ entry, pin });
    }
    assert.deepEqual([...seen].sort(), [...expected.keys()].sort(), 'A fixed report is missing');
    return validated;
}

function decodeEntry(entry, compressed, pin) {
    assert(Buffer.isBuffer(compressed), 'Compressed report must be bytes');
    assert(
        Number.isSafeInteger(pin.original_bytes) && pin.original_bytes > 0 && pin.original_bytes < MAX_INPUT_BYTES,
        'Invalid bounded original size',
    );
    for (const field of ['logical_path', 'original_bytes', 'original_git_blob_sha', 'status']) {
        assert.equal(entry[field], pin[field], `Historical report ${field} differs`);
    }
    assert.equal(compressed.length, entry.gzip_bytes, 'Gzip byte count differs');
    assert.equal(sha256(compressed), entry.gzip_sha256, 'Gzip SHA-256 differs');
    // zlib verifies the gzip CRC and complete stream. The output cap is one byte
    // above the fixed original length, never a manifest-controlled unbounded cap.
    const restored = zlib.gunzipSync(compressed, { maxOutputLength: pin.original_bytes + 1 });
    assert.equal(restored.length, pin.original_bytes, 'Restored original byte count differs');
    assert.equal(gitBlobSha(restored), pin.original_git_blob_sha, 'Restored original Git blob SHA differs');
    assert.equal(sha256(restored), entry.original_sha256, 'Restored original SHA-256 differs');
    const report = parseJson(restored, 'Restored report');
    assert(object(report) && report.status === pin.status, 'Restored historical JSON status differs');
    return restored;
}

function parseArgs(argv) {
    if (argv.length === 0 || (argv.length === 1 && argv[0] === '--check')) return { mode: 'check' };
    assert(
        argv.length === 2 && argv[0] === '--out' && argv[1] && !argv[1].startsWith('--'),
        'Usage: --check (default) OR --out <new absolute isolated temporary directory>',
    );
    return { mode: 'restore', out: argv[1] };
}

function validateOutput(output, tempRoot, protectedRoots) {
    assert(typeof output === 'string' && path.isAbsolute(output), '--out must be absolute');
    const out = path.resolve(output);
    const temporary = path.resolve(tempRoot);
    noSymlinks(temporary);
    noSymlinks(out, true);
    assert(
        out !== temporary && inside(temporary, out),
        '--out must be below RUNNER_TEMP or the OS temporary directory',
    );
    assert(!fs.existsSync(out), '--out must be a new, nonexistent directory');
    assert(fs.lstatSync(path.dirname(out)).isDirectory(), '--out parent must already exist');
    for (const root of protectedRoots.map((item) => path.resolve(item))) {
        assert(!inside(root, out) && !inside(out, root), '--out must be isolated from sources and working directory');
    }
    return out;
}

function writeRestoredFiles(files, output, tempRoot, protectedRoots) {
    const out = validateOutput(output, tempRoot, protectedRoots);
    const names = new Set();
    for (const file of files) {
        relativePath(file.logical_path);
        assert(!names.has(file.logical_path), 'Duplicate restored path');
        names.add(file.logical_path);
        assert(Buffer.isBuffer(file.bytes), 'Restored content must be bytes');
        assert(file.bytes.length < MAX_INPUT_BYTES, 'Restored content exceeds size limit');
    }
    // The caller validates every compressed input before reaching this first write.
    fs.mkdirSync(out, { mode: 0o700 });
    for (const file of files) {
        const target = path.resolve(out, file.logical_path);
        assert(inside(out, target), 'Restored path escaped output');
        noSymlinks(target, true);
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
        noSymlinks(path.dirname(target));
        fs.writeFileSync(target, file.bytes, { flag: 'wx', mode: 0o600 });
        assert(readBounded(target, file.bytes.length).equals(file.bytes), 'Restored disk bytes differ');
    }
    const actual = [];
    function walk(directory, prefix = '') {
        noSymlinks(directory);
        for (const name of fs.readdirSync(directory)) {
            const filename = path.join(directory, name);
            const logical = prefix ? `${prefix}/${name}` : name;
            const stat = fs.lstatSync(filename);
            assert(!stat.isSymbolicLink(), 'Symlink in restored output');
            if (stat.isDirectory()) walk(filename, logical);
            else {
                assert(stat.isFile(), 'Non-file in restored output');
                actual.push(logical);
            }
        }
    }
    walk(out);
    assert.deepEqual(actual.sort(), [...names].sort(), 'Restored output file set differs');
    return out;
}

function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    const tempRoot = process.env.RUNNER_TEMP || os.tmpdir();
    const protectedRoots = [REPO_ROOT, process.cwd()];
    if (args.out) validateOutput(args.out, tempRoot, protectedRoots);
    const manifest = parseJson(
        readBounded(path.join(REPO_ROOT, MANIFEST_PATH), 64 * 1024),
        'Compressed report manifest',
    );
    const inventoryBytes = readBounded(path.join(REPO_ROOT, CONTRACT.publication_inventory), MAX_INPUT_BYTES);
    const validated = validateManifest(manifest, inventoryBytes);
    // Do not create --out until ALL four streams and historical identities pass.
    const files = validated.map(({ entry, pin }) => ({
        logical_path: entry.logical_path,
        bytes: decodeEntry(entry, readBounded(path.join(REPO_ROOT, entry.artifact_path), entry.gzip_bytes), pin),
        original_status: pin.status,
        original_git_blob_sha: pin.original_git_blob_sha,
    }));
    if (args.out) writeRestoredFiles(files, args.out, tempRoot, protectedRoots);
    return {
        schema: 1,
        status: 'PASS',
        operation: args.mode,
        publication_inventory_git_blob_sha: CONTRACT.publication_inventory_git_blob_sha,
        historical_reports_reexecuted: false,
        file_count: files.length,
        original_bytes: files.reduce((sum, file) => sum + file.bytes.length, 0),
        files: files.map(({ logical_path, bytes, original_status, original_git_blob_sha }) => ({
            logical_path,
            bytes: bytes.length,
            sha256: sha256(bytes),
            original_git_blob_sha,
            original_status,
            byte_verification: 'PASS',
        })),
    };
}

module.exports = {
    CONTRACT,
    MANIFEST_PATH,
    sha256,
    gitBlobSha,
    relativePath,
    readBounded,
    validateManifest,
    decodeEntry,
    parseArgs,
    validateOutput,
    writeRestoredFiles,
    main,
};

if (require.main === module) {
    try {
        process.stdout.write(`${JSON.stringify(main(), null, 2)}\n`);
    } catch (error) {
        process.stdout.write(
            `${JSON.stringify({ schema: 1, status: 'FAIL', historical_reports_reexecuted: false, error: error.message }, null, 2)}\n`,
        );
        process.exitCode = 1;
    }
}
