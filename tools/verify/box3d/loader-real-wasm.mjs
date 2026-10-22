// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Real new WASM + current production facade/loader, with an explicit Node filesystem
// transport. This is not an HTTP, browser, CSP, application or complete WASM-08 gate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBox3DSTLoader } from '../../../src/air/physics/box3d/loader/st-loader.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = resolve(process.argv[2] ?? ''),
    out = resolve(process.argv[3] ?? '');
assert(process.argv.length === 4, 'Usage: node loader-real-wasm.mjs <built-artifact-directory> <new-output-directory>');
assert(!existsSync(out), 'Keep old raw evidence; choose a new output directory');
mkdirSync(out, { recursive: true });
const hash = (data) => createHash('sha256').update(data).digest('hex');
const inputPaths = [
    'src/air/physics/box3d/loader/st-loader.mjs',
    'src/air/physics/box3d/loader/st-loader.d.mts',
    'src/air/physics/box3d/binding/facade.mjs',
    'src/air/physics/box3d/binding/facade.d.mts',
    'tools/verify/box3d/loader-real-wasm.mjs',
];
const sourceHashes = () => inputPaths.map((path) => ({ path, sha256: hash(readFileSync(resolve(root, path))) }));
const before = sourceHashes();
const report = {
    schemaVersion: 1,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    scope: 'Node real-WASM loader lifecycle with filesystem transport; not browser, CSP, app or complete WASM-08',
    sourceHashes: before,
    inputDirectory: relative(root, dir),
    transportRequests: [],
    importRequests: [],
    cycles: [],
};
try {
    const build = JSON.parse(readFileSync(resolve(dir, 'build-receipt.json')));
    assert.equal(build.status, 'PASS');
    for (const item of build.inputHashes)
        assert.equal(hash(readFileSync(resolve(root, item.path))), item.sha256, item.path);
    report.buildReceiptSha256 = hash(readFileSync(resolve(dir, 'build-receipt.json')));
    const manifestBytes = readFileSync(resolve(dir, 'manifest.json'));
    const manifest = JSON.parse(manifestBytes);
    for (const item of manifest.artifacts) {
        const data = readFileSync(resolve(dir, item.path));
        assert.equal(data.length, item.bytes);
        assert.equal(hash(data), item.sha256);
    }
    assert.equal(
        hash(readFileSync(resolve(dir, 'facade.mjs'))),
        hash(readFileSync(resolve(root, 'src/air/physics/box3d/binding/facade.mjs'))),
    );
    const identity = Object.fromEntries(
        ['coreSha', 'bindingBaseSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'].map((k) => [
            k,
            manifest[k],
        ]),
    );
    report.identity = identity;
    const descriptor = {
        identity,
        manifestSha256: hash(manifestBytes),
        facadeSha256: hash(readFileSync(resolve(dir, 'facade.mjs'))),
    };
    const base = 'https://box3d-node-fixture.invalid/subpath/physics/st/';
    // .invalid URLs are never fetched. This transport reads exactly three reviewed local files.
    const loader = createBox3DSTLoader(
        descriptor,
        { defaultAssetBaseUrl: base },
        {
            async fetch(url, init) {
                assert.equal(init.signal.aborted, false);
                assert(url.startsWith(base));
                const path = url.slice(base.length);
                assert(['manifest.json', 'box3d-st.mjs', 'box3d-st.wasm'].includes(path));
                report.transportRequests.push(path);
                return new Response(readFileSync(resolve(dir, path)), {
                    headers: {
                        'content-type': path.endsWith('.json')
                            ? 'application/json'
                            : path.endsWith('.wasm')
                              ? 'application/wasm'
                              : 'text/javascript',
                    },
                });
            },
            async loadModule(url) {
                assert.equal(url, base + 'box3d-st.mjs');
                report.importRequests.push('box3d-st.mjs');
                return import(pathToFileURL(resolve(dir, 'box3d-st.mjs')).href);
            },
        },
    );
    for (let cycle = 0; cycle < 20; cycle++) {
        const pending = loader.prepare();
        assert.equal(loader.prepare({ workerCount: 1, solverSubSteps: 4 }), pending);
        const acquired = await pending,
            binding = acquired.binding;
        assert.deepEqual(binding.identity, identity);
        if (cycle === 0) report.runtimeIdentity = binding.identity;
        const initialBytes = binding.liveBytes();
        const world = binding.createWorld();
        const body = binding.createBody(world, { position: [0, 20, 0], enableSleep: false });
        binding.createSphere(body, 0.5, 12 / Math.PI);
        binding.applyCenterImpulse(body, [2, 0, 0]);
        const original = Array.from(binding.bodySnapshot(body));
        assert.throws(() => binding.setLinearVelocity(body, [Infinity, 0, 0]));
        assert.deepEqual(Array.from(binding.bodySnapshot(body)), original);
        const samples = [];
        for (let tick = 1; tick <= 60; tick++) {
            binding.step(world, 1 / 60, acquired.options.solverSubSteps);
            const snapshot = binding.bodySnapshot(body);
            samples.push([tick, snapshot[0], snapshot[1], snapshot[8]]);
        }
        assert(Math.abs(samples.at(-1)[2] - 15) <= 0.05);
        assert(Math.abs(samples.at(-1)[3] + 10) <= 0.01);
        binding.destroyWorld(world);
        const finalBytes = binding.liveBytes();
        assert.equal(finalBytes, initialBytes);
        await acquired.dispose();
        await acquired.dispose();
        assert.throws(() => binding.bodySnapshot(body), /disposed/);
        assert.throws(() => binding.createWorld(), /disposed/);
        const receipt = loader.diagnostics();
        assert.equal(receipt.status, 'DISPOSED');
        assert.deepEqual(
            receipt.cleanup.map((x) => x.resource),
            ['binding', 'module-reference'],
        );
        assert.deepEqual(receipt.cleanupErrors, []);
        report.cycles.push({
            cycle,
            generation: acquired.generation,
            initialLiveCoreBytes: String(initialBytes),
            finalLiveCoreBytesBeforeDispose: String(finalBytes),
            samples,
            receipt,
        });
    }
    assert.equal(report.transportRequests.length, 60);
    assert.equal(report.importRequests.length, 20);
    assert.deepEqual(sourceHashes(), before, 'Inputs changed during collection');
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = String(error?.stack ?? error);
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    writeFileSync(resolve(out, 'loader-real-wasm.raw.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(
        JSON.stringify({
            status: report.status,
            cycles: report.cycles.length,
            output: relative(root, out),
            error: report.error ?? null,
        }),
    );
}
