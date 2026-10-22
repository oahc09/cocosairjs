import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const build = resolve(process.argv[2]),
    out = resolve(process.argv[3]);
const bytes = readFileSync(resolve(build, 'manifest.json')),
    manifest = JSON.parse(bytes);
const { default: factory } = await import(pathToFileURL(resolve(build, 'box3d-st.mjs')));
const { createBox3DBinding } = await import(pathToFileURL(resolve(build, 'facade.mjs')));
const module = await factory({ wasmBinary: readFileSync(resolve(build, 'box3d-st.wasm')) });
const api = createBox3DBinding(module, manifest),
    w = api.createWorld([0, 0, 0]),
    b = api.createBody(w);
api.setBodyMass(w, b, 12);
api.createOffsetBox(b, [0.3, -0.2, 0.4], [1, 2, 3], [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)]);
api.setBodyMotionFactors(w, b, [0, 1, 1], [0, 1, 1]);
const before = api.bodyState(w, b);
const immediate = api.applyBodyImpulse(w, b, [2, 3, 4], [1, 2, 0.5]);
api.step(w);
const afterStep = api.bodyState(w, b);
const angularBefore = api.clearBodyState(w, b),
    angularImmediate = api.applyBodyAngularImpulse(w, b, [2, 3, 4]);
api.step(w);
const angularAfterStep = api.bodyState(w, b);
const passed =
    immediate.linearVelocity[0] === 0 &&
    immediate.angularVelocity[0] === 0 &&
    angularImmediate.angularVelocity[0] === 0;
const raw = {
    status: passed ? 'PASS' : 'FAIL_IMMEDIATE_LOCKED_VELOCITY',
    manifestSha256: createHash('sha256').update(bytes).digest('hex'),
    identity: api.identity,
    fixture: {
        halfExtents: [1, 2, 3],
        center: [0.3, -0.2, 0.4],
        localRotation: [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)],
        mass: 12,
        linearFactor: [0, 1, 1],
        angularFactor: [0, 1, 1],
        impulse: [2, 3, 4],
        relativeCOMOffset: [1, 2, 0.5],
    },
    before,
    immediate,
    afterStep,
    angularBefore,
    angularImmediate,
    angularAfterStep,
};
api.destroyWorld(w);
raw.finalCoreBytes = String(api.liveBytes());
raw.finalBridgeBytes = String(api.bridgeMemory().liveBytes);
api.dispose();
writeFileSync(resolve(out, 'raw.json'), JSON.stringify(raw, null, 2) + '\n');
console.log(
    JSON.stringify({
        status: raw.status,
        immediateLinearX: immediate.linearVelocity[0],
        immediateAngularX: immediate.angularVelocity[0],
        angularImmediateX: angularImmediate.angularVelocity[0],
    }),
);
if (!passed) process.exitCode = 1;
