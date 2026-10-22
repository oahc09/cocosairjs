/* Read-only native inputs; writes isolated temporary distribution/negative fixtures in output/.
 * Byte/provenance tests and one real Node staged-loader cycle, not browser/package acceptance.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { verifySTBuild, stageBox3DAssets, box3DAssetsPlugin } = require('../../build/box3d-assets.cjs');
const root = path.resolve(__dirname, '../../..');
assert(process.env.BOX3D_ST_TEST_BUILD, 'Set BOX3D_ST_TEST_BUILD to a fresh audited actual ST output');
const source = path.resolve(process.env.BOX3D_ST_TEST_BUILD);
const base = path.join(root, 'output');
fs.mkdirSync(base, { recursive: true });
const output = fs.mkdtempSync(path.join(base, 'box3d-assets-tests-'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJSON = (directory, name) => JSON.parse(fs.readFileSync(path.join(directory, name)));
const writeJSON = (directory, name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value));
function rehashAuditEvidence(directory, name) {
    const audit = readJSON(directory, 'artifact-audit.raw.json');
    const row = audit.evidence.find((item) => item.path === name);
    assert(row, `Required qualification evidence is missing: ${name}`);
    const bytes = fs.readFileSync(path.join(directory, name));
    Object.assign(row, { bytes: bytes.length, sha256: hash(bytes) });
    writeJSON(directory, 'artifact-audit.raw.json', audit);
}
function copyInputs(name) {
    const directory = path.join(output, name);
    fs.mkdirSync(directory);
    for (const file of fs.readdirSync(source)) {
        if (fs.statSync(path.join(source, file)).isFile())
            fs.copyFileSync(path.join(source, file), path.join(directory, file));
    }
    const link = 'CMakeFiles/air_box3d.dir/link.txt';
    fs.mkdirSync(path.dirname(path.join(directory, link)), { recursive: true });
    fs.copyFileSync(path.join(source, link), path.join(directory, link));
    return directory;
}
test('unselected builds do not read absent native inputs or create output/assets', async () => {
    const target = path.join(output, 'unselected');
    assert.equal(
        await stageBox3DAssets({
            features: ['air', 'physics-cannon'],
            outputDirectory: target,
            buildDirectory: '/not/a/build',
        }),
        null,
    );
    assert.equal(fs.existsSync(target), false);
    assert.equal(box3DAssetsPlugin(null), null);
});
test('actual audited native input produces trusted descriptor and exact separate ST files', async () => {
    const verified = await verifySTBuild(source);
    const result = await stageBox3DAssets({
        features: ['air', 'physics-box3d'],
        outputDirectory: path.join(output, 'positive'),
        buildDirectory: source,
    });
    assert.deepEqual(result.descriptor, verified.descriptor);
    assert(Object.isFrozen(result.descriptor) && Object.isFrozen(result.descriptor.identity));
    assert.equal(result.receipt.unusedMTAssetsCopied, 0);
    assert.deepEqual(
        fs.readdirSync(result.directory).sort(),
        [
            'LICENSE.Box3D.txt',
            'box3d-st.mjs',
            'box3d-st.wasm',
            'distribution-receipt.json',
            'facade.d.mts',
            'facade.mjs',
            'manifest.json',
        ].sort(),
    );
    for (const file of result.receipt.artifacts) {
        const bytes = fs.readFileSync(path.join(result.directory, file.path));
        assert.equal(bytes.length, file.bytes);
        assert.equal(hash(bytes), file.sha256);
    }
    const { createBox3DSTLoader } = await import(
        pathToFileURL(path.join(root, 'src/air/physics/box3d/loader/st-loader.mjs'))
    );
    const requests = [];
    const loader = createBox3DSTLoader(
        result.descriptor,
        { defaultAssetBaseUrl: 'https://distribution.invalid/nested/st/' },
        {
            fetch: async (url) => {
                const name = new URL(url).pathname.slice('/nested/st/'.length);
                assert(['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs'].includes(name));
                requests.push(name);
                return new Response(fs.readFileSync(path.join(result.directory, name)), {
                    headers: {
                        'content-type': name.endsWith('.wasm')
                            ? 'application/wasm'
                            : name.endsWith('.json')
                              ? 'application/json'
                              : 'text/javascript',
                    },
                });
            },
            loadModule: async (url) => {
                assert.equal(url, 'https://distribution.invalid/nested/st/box3d-st.mjs');
                return import(pathToFileURL(path.join(result.directory, 'box3d-st.mjs')));
            },
        },
    );
    const lease = await loader.prepare();
    const native = lease.binding,
        initial = native.liveBytes();
    const world = native.createWorld([0, -10, 0]);
    const body = native.createBody(world, { type: 2, position: [0, 20, 0] });
    native.createSphere(body, 0.5, 1);
    for (let i = 0; i < 60; i++) native.step(world, 1 / 60, 4);
    const state = native.bodySnapshot(body);
    assert(Math.abs(state[1] - 14.979169845581055) < 0.0001);
    native.destroyWorld(world);
    assert.equal(native.liveBytes(), initial);
    await lease.dispose();
    assert.deepEqual(requests, ['manifest.json', 'box3d-st.wasm', 'box3d-st.mjs']);
    assert.equal(loader.diagnostics().status, 'DISPOSED');
});
test('build injection is exact and lazy, leaves other modules untouched and resolves assets from runtime URL', async () => {
    const verified = await verifySTBuild(source);
    const plugin = box3DAssetsPlugin(verified);
    const id = path.join(root, 'src/air/physics/box3d/feature.ts');
    const code = "const descriptor = '__AIR_BOX3D_ST_DESCRIPTOR__';\nconst base = '__AIR_BOX3D_ST_ASSET_BASE__';\n";
    assert.equal(plugin.transform(code, path.join(root, 'src/air/app.ts')), null);
    const changed = plugin.transform(code, id);
    assert(!changed.code.includes('__AIR_'));
    assert(changed.code.includes(JSON.stringify(verified.descriptor)));
    assert(changed.code.includes("new URL('./physics/box3d/st/', import.meta.url).href"));
    assert(changed.map.toString().length > 0);
    assert.throws(() => plugin.transform(code + code, id), /Expected one/);
    assert.throws(() => plugin.transform('const value = 1;', id), /Expected one/);
});
test('corrupt/missing assets, stale identities, failed/incomplete inputs and audit tampering fail before copy', async () => {
    const mutations = [
        [
            'wasm-byte',
            (d) => {
                const p = path.join(d, 'box3d-st.wasm');
                const b = fs.readFileSync(p);
                b[b.length - 1] ^= 1;
                fs.writeFileSync(p, b);
            },
        ],
        ['loader-missing', (d) => fs.renameSync(path.join(d, 'box3d-st.mjs'), path.join(d, 'removed-loader'))],
        [
            'manifest-schema',
            (d) => {
                const m = readJSON(d, 'manifest.json');
                m.schemaSha256 = '0'.repeat(64);
                writeJSON(d, 'manifest.json', m);
            },
        ],
        [
            'manifest-patch',
            (d) => {
                const m = readJSON(d, 'manifest.json');
                m.patchChainSha256 = '0'.repeat(64);
                writeJSON(d, 'manifest.json', m);
            },
        ],
        [
            'extra-artifact',
            (d) => {
                const m = readJSON(d, 'manifest.json');
                m.artifacts.push({ ...m.artifacts[0], path: 'extra.mjs' });
                writeJSON(d, 'manifest.json', m);
            },
        ],
        [
            'duplicate-artifact',
            (d) => {
                const m = readJSON(d, 'manifest.json');
                m.artifacts[1] = m.artifacts[0];
                writeJSON(d, 'manifest.json', m);
            },
        ],
        [
            'traversal-artifact',
            (d) => {
                const m = readJSON(d, 'manifest.json');
                m.artifacts[0].path = '../box3d-st.mjs';
                writeJSON(d, 'manifest.json', m);
            },
        ],
        [
            'failed-build',
            (d) => {
                const r = readJSON(d, 'build-receipt.json');
                r.status = 'FAIL';
                writeJSON(d, 'build-receipt.json', r);
            },
        ],
        [
            'incomplete-inputs',
            (d) => {
                const r = readJSON(d, 'build-receipt.json');
                r.inputHashes.pop();
                writeJSON(d, 'build-receipt.json', r);
            },
        ],
        [
            'stale-input',
            (d) => {
                const r = readJSON(d, 'build-receipt.json');
                r.inputHashes[0].sha256 = '0'.repeat(64);
                writeJSON(d, 'build-receipt.json', r);
            },
        ],
        [
            'failed-command',
            (d) => {
                const r = readJSON(d, 'build-receipt.json');
                r.commands[0].exitCode = 1;
                writeJSON(d, 'build-receipt.json', r);
            },
        ],
        [
            'stale-audit',
            (d) => {
                const r = readJSON(d, 'artifact-audit.raw.json');
                r.auditScriptSha256 = '0'.repeat(64);
                writeJSON(d, 'artifact-audit.raw.json', r);
            },
        ],
        [
            'audit-evidence',
            (d) => {
                const r = readJSON(d, 'artifact-audit.raw.json');
                r.evidence[0].sha256 = '0'.repeat(64);
                writeJSON(d, 'artifact-audit.raw.json', r);
            },
        ],
        [
            'geometry-failed-rehashed',
            (d) => {
                const name = 'wasm-geometry-contract.raw.json';
                const r = readJSON(d, name);
                r.status = 'FAIL';
                writeJSON(d, name, r);
                rehashAuditEvidence(d, name);
            },
        ],
        [
            'geometry-stale-identity-rehashed',
            (d) => {
                const name = 'wasm-geometry-contract.raw.json';
                const r = readJSON(d, name);
                r.identity.schemaSha256 = '0'.repeat(64);
                writeJSON(d, name, r);
                rehashAuditEvidence(d, name);
            },
        ],
        [
            'geometry-wrong-pointer-width-rehashed',
            (d) => {
                const name = 'native-geometry-contract.raw.json';
                const r = readJSON(d, name);
                r.pointerBytes = 8;
                writeJSON(d, name, r);
                rehashAuditEvidence(d, name);
            },
        ],
        [
            'world-failed-qualification-rehashed',
            (d) => {
                const name = 'wasm-world-contract.raw.json';
                const r = readJSON(d, name);
                r.status = 'FAIL';
                writeJSON(d, name, r);
                rehashAuditEvidence(d, name);
            },
        ],
        [
            'world-stale-identity-rehashed',
            (d) => {
                const name = 'wasm-world-contract.raw.json';
                const r = readJSON(d, name);
                r.identity.schemaSha256 = '0'.repeat(64);
                writeJSON(d, name, r);
                rehashAuditEvidence(d, name);
            },
        ],
        [
            'world-wrong-pointer-width-rehashed',
            (d) => {
                const name = 'native-world-contract.raw.json';
                const r = readJSON(d, name);
                r.pointerBytes = 8;
                writeJSON(d, name, r);
                rehashAuditEvidence(d, name);
            },
        ],
        ...[
            [
                'body-failed-rehashed',
                'wasm-body-contract.raw.json',
                (r) => {
                    r.status = 'FAIL';
                },
            ],
            [
                'body-stale-identity-rehashed',
                'wasm-body-contract.raw.json',
                (r) => {
                    r.identity.schemaSha256 = '0'.repeat(64);
                },
            ],
            [
                'body-stale-fixture-rehashed',
                'wasm-body-contract.raw.json',
                (r) => {
                    r.fixtureSha256 = '0'.repeat(64);
                },
            ],
            [
                'body-missing-lock-check-rehashed',
                'wasm-body-contract.raw.json',
                (r) => {
                    delete r.checks.immediateImpulseLocks;
                },
            ],
            [
                'body-missing-small-box-check-rehashed',
                'wasm-body-contract.raw.json',
                (r) => {
                    r.checks.smallBoxNoSilentClamp = false;
                },
            ],
            [
                'body-native-failed-rehashed',
                'native-body-contract.raw.json',
                (r) => {
                    r.status = 'FAIL';
                },
            ],
            [
                'body-native-wrong-pointer-width-rehashed',
                'native-body-contract.raw.json',
                (r) => {
                    r.pointerBytes = 8;
                },
            ],
            [
                'body-native-missing-preflight-check-rehashed',
                'native-body-contract.raw.json',
                (r) => {
                    delete r.pendingGeometryLifecycle;
                },
            ],
        ].map(([label, name, mutate]) => [
            label,
            (d) => {
                const r = readJSON(d, name);
                mutate(r);
                writeJSON(d, name, r);
                rehashAuditEvidence(d, name);
            },
        ]),
        [
            'body-compile-source-omitted',
            (d) => {
                const r = readJSON(d, 'artifact-audit.raw.json');
                const index = r.compiledSourceHashes.findIndex((row) => row.path.endsWith('/body_control.c'));
                assert(index >= 0);
                r.compiledSourceHashes[index] = r.compiledSourceHashes[0];
                writeJSON(d, 'artifact-audit.raw.json', r);
            },
        ],
    ];
    for (const [name, mutate] of mutations) {
        const directory = copyInputs(name),
            target = path.join(output, name + '-rejected');
        mutate(directory);
        await assert.rejects(
            stageBox3DAssets({ features: ['physics-box3d'], outputDirectory: target, buildDirectory: directory }),
            undefined,
            name,
        );
        assert.equal(fs.existsSync(target), false, `${name} wrote output before validation`);
    }
});
test('existing old schema and symlink/overlap destinations cannot be silently distributed', async () => {
    await assert.rejects(verifySTBuild(path.join(root, 'tools/physics/box3d/output/wasm-patch-release-20261022-e')));
    await assert.rejects(
        stageBox3DAssets({ features: ['physics-box3d'], outputDirectory: source, buildDirectory: source }),
        /overlaps/,
    );
    const parent = path.join(output, 'symlink-output');
    fs.symlinkSync(path.join(output, 'positive'), parent);
    await assert.rejects(
        stageBox3DAssets({ features: ['physics-box3d'], outputDirectory: parent, buildDirectory: source }),
        /symlink/,
    );
});

test('all existing destination entries are checked before any output bytes change', async () => {
    for (const name of ['distribution-receipt.json', 'box3d-st.wasm', 'foreign-file']) {
        const target = path.join(output, 'target-conflict-' + name),
            dir = path.join(target, 'physics/box3d/st');
        fs.mkdirSync(dir, { recursive: true });
        const sentinel = path.join(dir, 'box3d-st.mjs');
        fs.writeFileSync(sentinel, 'keep-existing-bytes');
        if (name === 'foreign-file') fs.writeFileSync(path.join(dir, name), 'not-ours');
        else fs.symlinkSync(sentinel, path.join(dir, name));
        await assert.rejects(
            stageBox3DAssets({ features: ['physics-box3d'], outputDirectory: target, buildDirectory: source }),
        );
        assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep-existing-bytes');
        assert.equal(fs.readdirSync(dir).length, 2);
    }
});
