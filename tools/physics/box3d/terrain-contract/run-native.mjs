// Explicit future invocation only; do NOT execute during preparation.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { runNativeTerrainLifetime } from './native-terrain-lifetime.mjs';
assert.equal(process.argv[2], '--authorized-fresh-st', 'explicit fresh-build execution authorization required');
assert.ok(process.argv[3] && process.argv[4], 'runtime dir and fresh report path required');
const dir = resolve(process.argv[3]),
    out = resolve(process.argv[4]);
assert.ok(!existsSync(out), 'never overwrite evidence');
const hash = (data) => createHash('sha256').update(data).digest('hex');
const assets = Object.fromEntries(
    ['manifest.json', 'box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs'].map((f) => [f, hash(readFileSync(join(dir, f)))]),
);
const fixture = Object.fromEntries(
    ['oracle.mjs', 'native-terrain-lifetime.mjs', 'run-native.mjs'].map((f) => [
        f,
        hash(readFileSync(new URL(f, import.meta.url))),
    ]),
);
let api;
const report = { status: 'RUNNING', assets, fixture, C17: 'NOT_QUALIFIED_NATIVE_ONLY', C19: 'NOT_RUN' };
try {
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'))),
        { default: factory } = await import(pathToFileURL(join(dir, 'box3d-st.mjs'))),
        { createBox3DBinding } = await import(pathToFileURL(join(dir, 'facade.mjs')));
    api = createBox3DBinding(await factory({ wasmBinary: readFileSync(join(dir, 'box3d-st.wasm')) }), manifest);
    report.identity = api.identity;
    report.native = runNativeTerrainLifetime(api);
    report.status = 'PASS';
    report.C19 = 'NATIVE_MESH_BRIDGE_DESTRUCTION_PASS; PUBLIC_TERRAIN_COHORT_REQUIRES_SEPARATE_RUN';
} catch (e) {
    report.status = 'FAIL';
    report.error = e.stack;
    process.exitCode = 1;
} finally {
    try {
        api?.dispose();
    } catch (e) {
        report.status = 'FAIL';
        report.cleanupError = e.stack;
        process.exitCode = 1;
    }
    writeFileSync(out, JSON.stringify(report, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n', {
        flag: 'wx',
    });
    console.log(JSON.stringify({ status: report.status, output: out }));
}
