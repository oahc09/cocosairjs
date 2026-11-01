/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Read-only qualification; never builds, downloads or mutates native inputs.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const base = require('./world-real-wasm-inputs.cjs');
const { root, hash } = base;
const twoDDirectory = path.join(root, 'vendor/box2d/runtime');
const twoDModuleUrl = pathToFileURL(path.join(twoDDirectory, 'air-box2d.mjs')).href;
const twoDWasmUrl = pathToFileURL(path.join(twoDDirectory, 'air-box2d.wasm')).href;
const scenarios = [
    'both',
    '2d-failure',
    '3d-failure',
    'init-failure',
    '3d-only',
    '2d-builtin',
    '2d-cannon',
    'default-builtin',
    'default-cannon',
];
function qualifyTwoD() {
    const manifest = require('../../build/box2d3.cjs').check();
    assert.equal(manifest.commit, '178495ba35695aefe9c321e569d2277f06db3b90');
    const receiptPath = path.join(twoDDirectory, 'receipt.json');
    const receipt = JSON.parse(fs.readFileSync(receiptPath));
    assert.equal(receipt.sourceManifest, hash(fs.readFileSync(path.join(root, 'vendor/box2d/manifest.json'))));
    assert.equal(receipt.version, manifest.version);
    assert.equal(receipt.emscripten, manifest.emscripten);
    assert.deepEqual(Object.keys(receipt.inputs).sort(), [
        'tools/build/box2d/CMakeLists.txt',
        'tools/build/box2d/bridge.cpp',
        'tools/build/box2d/contact-material.c',
        'tools/build/box2d/nfd.h',
        'tools/build/box2d/samples.cpp',
    ]);
    assert.deepEqual(Object.keys(receipt.files).sort(), ['LICENSE.Box2D.txt', 'air-box2d.mjs', 'air-box2d.wasm']);
    for (const [file, sha] of Object.entries(receipt.inputs))
        assert.equal(hash(fs.readFileSync(path.join(root, file))), sha, `2D bridge input drift: ${file}`);
    for (const [file, sha] of Object.entries(receipt.files))
        assert.equal(hash(fs.readFileSync(path.join(twoDDirectory, file))), sha, `2D artifact drift: ${file}`);
    return { sourceCommit: manifest.commit, receiptSha256: hash(fs.readFileSync(receiptPath)), receipt };
}
function sourceHashes(threeD, twoD) {
    return base.sourceHashes([
        ...fs
            .readdirSync(__dirname)
            .filter((name) => name.startsWith('coexist-real-wasm'))
            .map((name) => 'tools/verify/box3d/' + name),
        ...threeD.buildInputHashes.map((entry) => entry.path),
        ...Object.keys(twoD.receipt.inputs),
        ...Object.keys(twoD.receipt.files).map((name) => 'vendor/box2d/runtime/' + name),
        'vendor/box2d/manifest.json',
        'vendor/box2d/runtime/receipt.json',
        'tools/build/box2d3.cjs',
        'src/air/physics-2d/box2d3.ts',
        'src/cocos/physics-2d/framework/physics-system.ts',
        'src/cocos/physics-2d/framework/physics-selector.ts',
        'src/cocos/physics-2d/box2d/instantiate.ts',
        'src/cocos/physics-2d/box2d/physics-world.ts',
        'src/cocos/physics/cocos/instantiate.ts',
        'src/cocos/physics/cocos/builtin-world.ts',
        'src/cocos/physics/cannon/instantiate.ts',
        'src/cocos/physics/cannon/cannon-world.ts',
        'src/cocos/physics/cannon/cannon-shared-body.ts',
        'src/exports/physics-builtin.ts',
        'src/exports/physics-cannon.ts',
        'src/exports/physics-2d-box2d.ts',
        'src/cocos/game/game.ts',
        'src/cocos/game/director.ts',
        'src/cocos/core/event/callbacks-invoker.ts',
        'node_modules/@cocos/cannon/package.json',
        'node_modules/@cocos/cannon/build/cannon.js',
        'node_modules/@cocos/box2d/package.json',
        'node_modules/@cocos/box2d/index.js',
        'src/@types/box2d.d.ts',
        'src/node_modules/@cocos/cannon/package.json',
        'src/node_modules/@cocos/cannon/build/cannon.js',
        'src/node_modules/@cocos/box2d/package.json',
        'src/node_modules/@cocos/box2d/index.js',
    ]);
}
module.exports = {
    root,
    hash,
    qualifyThreeD: base.qualify,
    qualifyTwoD,
    sourceHashes,
    twoDDirectory,
    twoDModuleUrl,
    twoDWasmUrl,
    scenarios,
};
