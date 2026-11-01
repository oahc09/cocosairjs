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
    assert.equal(lock.status, 'FROZEN_CAPSULE_SOURCE_ONLY_NOT_TEST_RESULT');
    const actual = {};
    for (const entry of lock.sources) {
        const base = entry.scope === 'fixture' ? __dirname : root;
        actual[`${entry.scope}:${entry.path}`] = hash(fs.readFileSync(safe(base, entry.path)));
        assert.equal(actual[`${entry.scope}:${entry.path}`], entry.sha256, `Source drift: ${entry.path}`);
    }
    return actual;
}
async function verifyArtifact(directory) {
    assert.equal(process.env.CAPSULE56_QUALIFICATION, 'full');
    const qualified = require(path.join(root, 'tools/verify/box3d/owner-dynamic-command-real-wasm-inputs.cjs')).qualify(
        directory,
    );
    const verified = await require(path.join(root, 'tools/build/box3d-assets.cjs')).verifySTBuild(directory);
    assert.deepEqual(verified.descriptor, qualified.descriptor, 'Full gate/receipt descriptor mismatch');
    const build = JSON.parse(fs.readFileSync(path.join(directory, 'build-receipt.json')));
    const auditBytes = fs.readFileSync(path.join(directory, 'artifact-audit.raw.json'));
    assert.equal(build.mode, 'Release');
    assert.equal(JSON.parse(auditBytes).status, 'PASS');
    assert(
        build.inputHashes.some((entry) => entry.path === 'tools/physics/box3d/native/capsule_contract.c'),
        'Fresh Capsule native source must be in the full build closure',
    );
    return {
        scope: 'REAL_FULL_NATIVE_RELEASE_RECEIPT_LIMITED_COCOS_CAPSULE_FIXTURE_ONLY',
        artifactAuditSha256: hash(auditBytes),
        ...qualified,
    };
}
module.exports = { root, hash, sourceHashes, verifyArtifact };
