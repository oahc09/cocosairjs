/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Read-only input qualification shared by the collector and native Node preload.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sourcePaths = [
    ...fs
        .readdirSync(__dirname)
        .filter((name) => name.startsWith('body-component-real-wasm'))
        .map((name) => 'tools/verify/box3d/' + name),
    'src/exports/base.ts',
    'src/cocos/render-scene/index.ts',
    'src/air/bootstrap.ts',
    'src/air/app.ts',
    'src/air/app-config.ts',
    'src/air/physics-backend.ts',
    'src/air/physics/preparation.ts',
    'src/air/physics/box3d/prepare.ts',
    'src/air/physics/box3d/config.ts',
    ...[
        'world',
        'world-binding',
        'registration',
        'debug',
        'unsupported',
        'shared-body',
        'rigid-body',
        'box-sphere-shape',
        'box-sphere-geometry',
    ].map((name) => 'src/air/physics/box3d/' + name + '.ts'),
    'src/air/physics/box3d/loader/st-loader.mjs',
    'src/air/physics/box3d/loader/st-loader.d.mts',
    'src/air/physics/box3d/binding/facade.mjs',
    'src/air/physics/box3d/binding/facade.d.mts',
    'src/cocos/scene-graph/node.ts',
    'src/cocos/scene-graph/scene.ts',
    'src/cocos/scene-graph/node-activator.ts',
    'src/cocos/scene-graph/component.ts',
    'src/cocos/game/director.ts',
    'src/cocos/core/data/object.ts',
    'src/cocos/physics/framework/components/rigid-body.ts',
    'src/cocos/physics/framework/components/colliders/collider.ts',
    'src/cocos/physics/framework/components/colliders/box-collider.ts',
    'src/cocos/physics/framework/components/colliders/sphere-collider.ts',
    'src/cocos/physics/framework/physics-system.ts',
    'src/cocos/physics/framework/physics-selector.ts',
    'src/cocos/physics/framework/assets/physics-material.ts',
    'jest.config.js',
    'test/setup-dom.js',
    'test/setup-engine.js',
    'test/stubs/internal-constants.ts',
    'test/tsconfig.jest.json',
    'tsconfig.json',
    'package-lock.json',
].sort();
function sourceHashes(extraPaths = []) {
    return Object.fromEntries(
        [...new Set([...sourcePaths, ...extraPaths])]
            .sort()
            .map((name) => [name, hash(fs.readFileSync(path.join(root, name)))]),
    );
}
function inside(base, name) {
    const result = path.resolve(base, name);
    assert(!path.relative(base, result).startsWith('..') && !path.isAbsolute(name), 'Input path must remain relative');
    return result;
}
function qualify(directory) {
    const buildBytes = fs.readFileSync(path.join(directory, 'build-receipt.json'));
    const build = JSON.parse(buildBytes);
    assert.equal(build.status, 'PASS', 'Native build itself must have passed');
    assert(Array.isArray(build.inputHashes) && build.inputHashes.length > 0, 'Build inputs missing');
    const drift = build.inputHashes.filter((entry) => {
        const file = inside(root, entry.path);
        return !fs.existsSync(file) || hash(fs.readFileSync(file)) !== entry.sha256;
    });
    if (drift.length)
        throw Object.assign(new Error('Native artifact is not bound to the current input bytes'), {
            code: 'STALE_INPUT',
            paths: drift.map((entry) => entry.path),
        });
    const manifestBytes = fs.readFileSync(path.join(directory, 'manifest.json'));
    const manifest = JSON.parse(manifestBytes);
    assert(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0, 'Artifact inventory missing');
    for (const entry of manifest.artifacts) {
        const bytes = fs.readFileSync(inside(directory, entry.path));
        assert.equal(bytes.length, entry.bytes, entry.path);
        assert.equal(hash(bytes), entry.sha256, entry.path);
    }
    const facadeSha256 = hash(fs.readFileSync(path.join(directory, 'facade.mjs')));
    assert.equal(
        facadeSha256,
        hash(fs.readFileSync(path.join(root, 'src/air/physics/box3d/binding/facade.mjs'))),
        'Current production facade differs',
    );
    const identity = Object.fromEntries(
        ['coreSha', 'bindingBaseSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'].map((key) => [
            key,
            manifest[key],
        ]),
    );
    return {
        buildReceiptSha256: hash(buildBytes),
        buildInputHashes: build.inputHashes,
        artifacts: manifest.artifacts,
        descriptor: { identity, manifestSha256: hash(manifestBytes), facadeSha256 },
    };
}
module.exports = { root, hash, sourcePaths, sourceHashes, qualify };
