/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Retain the existing receipt qualifier and explicitly run the complete current asset gate. No fallback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function safe(base, name) {
    assert(!path.isAbsolute(name) && !name.split('/').includes('..'));
    return path.join(base, name);
}
function sourceHashes() {
    const lock = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-lock.json')));
    assert.equal(lock.status, 'FROZEN_DRAG_SOURCE_ONLY_NOT_TEST_RESULT');
    const actual = {};
    for (const entry of lock.sources) {
        const base = entry.scope === 'fixture' ? __dirname : root;
        actual[`${entry.scope}:${entry.path}`] = hash(fs.readFileSync(safe(base, entry.path)));
        assert.equal(actual[`${entry.scope}:${entry.path}`], entry.sha256, `Source drift: ${entry.path}`);
    }
    return actual;
}
async function verifyArtifact(directory) {
    assert.equal(process.env.DRAG76_QUALIFICATION, 'full');
    const qualified = require(path.join(root, 'tools/verify/box3d/owner-dynamic-command-real-wasm-inputs.cjs')).qualify(
        directory,
    );
    const verified = await require(path.join(root, 'tools/build/box3d-assets.cjs')).verifySTBuild(directory);
    assert.deepEqual(verified.descriptor, qualified.descriptor, 'Full gate/receipt descriptor mismatch');
    const build = JSON.parse(fs.readFileSync(path.join(directory, 'build-receipt.json')));
    const auditBytes = fs.readFileSync(path.join(directory, 'artifact-audit.raw.json'));
    assert(['Release', 'Debug'].includes(process.env.DRAG76_VARIANT));
    assert.equal(build.mode, process.env.DRAG76_VARIANT);
    assert.equal(JSON.parse(auditBytes).status, 'PASS');
    assert(
        build.inputHashes.some((entry) => entry.path === 'tools/physics/box3d/native/hull_bridge.c'),
        'Fresh Hull native source must be in the full build closure',
    );
    assert.equal(build.hullContract?.status, 'PASS', 'Actual native hull contract must pass');
    assert.equal(build.hullCoreContract?.status, 'PASS', 'Actual checked core hull contract must pass');
    assert.equal(build.hullLegacyComparison?.status, 'PASS', 'Legacy differential must pass');
    return {
        mode: build.mode,
        hullContract: build.hullContract,
        hullCoreContract: build.hullCoreContract,
        scope: 'REAL_FULL_NATIVE_RECEIPT_LIMITED_COCOS_HULL_FIXTURE_ONLY',
        artifactAuditSha256: hash(auditBytes),
        ...qualified,
    };
}
function captureInputs(out, artifactDirectory) {
    sourceHashes();
    const lockBytes = fs.readFileSync(path.join(__dirname, 'source-lock.json'));
    const lock = JSON.parse(lockBytes),
        rows = [];
    const retain = (relative, bytes) => {
        const destination = safe(out, relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, bytes, { flag: 'wx' });
        rows.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) });
    };
    retain('inputs/fixture/source-lock.json', lockBytes);
    for (const entry of lock.sources) {
        const bytes = fs.readFileSync(safe(entry.scope === 'fixture' ? __dirname : root, entry.path));
        assert.equal(hash(bytes), entry.sha256, `Capture source drift: ${entry.path}`);
        retain(`inputs/${entry.scope}/${entry.path}`, bytes);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(artifactDirectory, 'manifest.json')));
    const audit = JSON.parse(fs.readFileSync(path.join(artifactDirectory, 'artifact-audit.raw.json')));
    const names = new Set([
        'manifest.json',
        'build-receipt.json',
        'artifact-audit.raw.json',
        ...manifest.artifacts.map((entry) => entry.path),
        ...audit.evidence.map((entry) => entry.path),
        ...fs
            .readdirSync(artifactDirectory)
            .filter((name) => name.endsWith('.raw.json') || /^command-\d+\.(stdout|stderr)\.txt$/.test(name)),
    ]);
    const addTree = (directory, allFiles) => {
        for (const entry of fs.readdirSync(safe(artifactDirectory, directory), { withFileTypes: true })) {
            const name = `${directory}/${entry.name}`;
            if (entry.isDirectory()) addTree(name, allFiles);
            else if (entry.isFile() && (allFiles || /\.(json|jsonl|txt|cjs)$/.test(entry.name))) names.add(name);
        }
    };
    // Keep actual patched bytes as well as pinned upstream + patches; legacy baseline has a different prefix chain.
    addTree('staged-core', true);
    addTree('hull-legacy-baseline/staged-core', true);
    addTree('hull-legacy-baseline', false);
    for (const name of names) retain(`inputs/native-artifact/${name}`, fs.readFileSync(safe(artifactDirectory, name)));
    rows.sort((a, b) => a.path.localeCompare(b.path));
    const bytes = Buffer.from(JSON.stringify(rows, null, 2) + '\n');
    fs.writeFileSync(path.join(out, 'inputs-manifest.json'), bytes, { flag: 'wx' });
    return { files: rows.length, manifestSha256: hash(bytes) };
}
module.exports = { root, hash, sourceHashes, verifyArtifact, captureInputs };
