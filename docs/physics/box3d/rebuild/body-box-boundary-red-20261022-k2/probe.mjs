import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const dir = resolve(process.argv[2]),
    out = resolve(process.argv[3]);
const bytes = readFileSync(resolve(dir, 'manifest.json')),
    manifest = JSON.parse(bytes);
const { default: factory } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')));
const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')));
const module = await factory({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) }),
    api = createBox3DBinding(module, manifest),
    w = api.createWorld([0, 0, 0]),
    b = api.createBody(w);
api.setBodyMass(w, b, 1);
const before = { state: api.bodyState(w, b), counts: Array.from(api.worldCounts(w).counts) };
let error = null;
try {
    api.createOffsetBox(b, [0, 0, 0], [1e-4, 1e-4, 1e-4]);
} catch (e) {
    error = { code: e.code, message: e.message };
}
const after = { state: api.bodyState(w, b), counts: Array.from(api.worldCounts(w).counts) };
const intendedInertia = (2 / 3) * 1e-8;
const raw = {
    status: error ? 'PASS_REJECTED' : 'FAIL_UNANNOUNCED_CORE_BOX_CLAMP',
    identity: api.identity,
    manifestSha256: createHash('sha256').update(bytes).digest('hex'),
    input: { halfExtents: [1e-4, 1e-4, 1e-4], mass: 1 },
    intendedInertia,
    before,
    after,
    error,
};
api.destroyWorld(w);
raw.finalCoreBytes = String(api.liveBytes());
raw.finalBridgeBytes = String(api.bridgeMemory().liveBytes);
api.dispose();
writeFileSync(resolve(out, 'raw.json'), JSON.stringify(raw, null, 2) + '\n');
console.log(JSON.stringify({ status: raw.status, intendedInertia, actualInertia: after.state.inertia[0] }));
if (!error) process.exitCode = 1;
