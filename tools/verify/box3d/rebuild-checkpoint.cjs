/* Portable source checkpoint. No network, runtime build, or physical acceptance. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

function git(cwd, args, encoding = 'utf8') {
    return execFileSync('git', args, { cwd, encoding, maxBuffer: 512 * 1024 * 1024 });
}
function hash(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}
function trackedManifest(root, revision) {
    return git(root, ['ls-tree', '-rz', revision], 'buffer')
        .toString('utf8')
        .split('\0')
        .filter(Boolean)
        .map((entry) => {
            const [header, file] = entry.split('\t');
            const [mode, type, blob] = header.split(' ');
            assert.equal(type, 'blob', `Submodule or non-blob needs an explicit closure: ${file}`);
            const bytes = git(root, ['cat-file', 'blob', blob], 'buffer');
            return { path: file, mode, gitBlobSha1: blob, bytes: bytes.length, sha256: hash(bytes) };
        });
}
function verifyRestored(root, receipt) {
    assert.equal(git(root, ['rev-parse', 'HEAD']).trim(), receipt.commit);
    assert.equal(git(root, ['rev-parse', 'HEAD^{tree}']).trim(), receipt.tree);
    git(root, ['fsck', '--full', '--strict']);
    for (const item of receipt.files) {
        const file = path.join(root, item.path);
        const stat = fs.lstatSync(file);
        const bytes = item.mode === '120000' ? Buffer.from(fs.readlinkSync(file)) : fs.readFileSync(file);
        assert.equal(bytes.length, item.bytes, `Size: ${item.path}`);
        assert.equal(hash(bytes), item.sha256, `SHA-256: ${item.path}`);
        assert.equal(stat.isSymbolicLink(), item.mode === '120000', `File type: ${item.path}`);
        if (item.mode !== '120000' && process.platform !== 'win32') {
            assert.equal(Boolean(stat.mode & 0o111), item.mode === '100755', `Executable mode: ${item.path}`);
        }
    }
    assert.equal(git(root, ['status', '--porcelain']).trim(), '', 'Restored checkout must be clean');
    assert.equal(fs.existsSync(path.join(root, '.git', 'objects', 'info', 'alternates')), false);
    return { status: 'PASS', checkedFiles: receipt.files.length, independentObjectStore: true };
}
function checkpoint({ root, output, committedOnly = false, bundleOnly = false }) {
    root = fs.realpathSync(root);
    output = path.resolve(output);
    assert(!output.startsWith(root + path.sep) && output !== root, 'Output must be outside the source repository');
    assert(!fs.existsSync(output), 'Output must be a new directory; never overwrite earlier receipts');
    assert.equal(git(root, ['rev-parse', '--show-toplevel']).trim(), root);
    assert.equal(typeof bundleOnly, 'boolean', 'bundleOnly must be an explicit boolean');
    const dirty = git(root, ['status', '--porcelain']).trim();
    assert(
        committedOnly || !dirty,
        'Commit or explicitly choose --committed-only; uncommitted work is not in a bundle',
    );
    const commit = git(root, ['rev-parse', 'HEAD']).trim();
    const branch = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']).trim();
    const receipt = {
        schemaVersion: 1,
        kind: 'SOURCE_GIT_CHECKPOINT_NOT_PHYSICAL_ACCEPTANCE',
        createdAtUtc: new Date().toISOString(),
        commit,
        tree: git(root, ['rev-parse', 'HEAD^{tree}']).trim(),
        branch,
        committedOnly,
        bundleOnly,
        excludedWorkingTreeStatus: dirty ? dirty.split('\n') : [],
        refs: git(root, ['show-ref']).trim().split('\n'),
        history: git(root, ['log', '--all', '--format=%H %P %s']).trim().split('\n'),
        files: trackedManifest(root, commit),
        buildClosureVerified: false,
        physicalAcceptance: 'NOT_RUN',
        libraryRoundTrip: 'PENDING_EXTERNAL_STEP',
    };
    fs.mkdirSync(output, { recursive: false });
    const bundle = path.join(output, 'box3d-rebuild.bundle');
    git(root, ['bundle', 'create', bundle, '--all']);
    git(root, ['bundle', 'verify', bundle]);
    receipt.bundle = {
        file: path.basename(bundle),
        bytes: fs.statSync(bundle).size,
        sha256: hash(fs.readFileSync(bundle)),
    };
    if (bundleOnly) {
        receipt.localRestore = {
            status: 'NOT_RUN',
            reason: 'Bundle-only checkpoint; actual Library download must be independently restored and verified.',
        };
    } else {
        const restored = path.join(output, 'restored-local');
        git(output, ['clone', '--no-local', '--branch', branch, bundle, restored]);
        receipt.localRestore = verifyRestored(restored, receipt);
    }
    fs.writeFileSync(path.join(output, 'checkpoint-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    return receipt;
}
if (require.main === module) {
    const args = process.argv.slice(2);
    const index = args.indexOf('--output');
    assert(
        index >= 0 && args[index + 1],
        'Usage: node rebuild-checkpoint.cjs --output /new/directory [--committed-only] [--bundle-only]',
    );
    const result = checkpoint({
        root: path.resolve(__dirname, '../../..'),
        output: args[index + 1],
        committedOnly: args.includes('--committed-only'),
        bundleOnly: args.includes('--bundle-only'),
    });
    console.log(
        JSON.stringify({
            commit: result.commit,
            bundle: result.bundle,
            localRestore: result.localRestore,
            excludedPaths: result.excludedWorkingTreeStatus.length,
            libraryRoundTrip: result.libraryRoundTrip,
        }),
    );
}
module.exports = { checkpoint, verifyRestored, trackedManifest, hash };
