import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedFaultClose } from './ex09-close-policy.mjs';
const make = () => ({
    status: 'failed',
    failures: [
        { label: 'box3d-empty-world-reclamation', message: '[AIR_E_BOX3D_WORLD_FAULTED] scene release storage' },
        { label: 'game-clock-terminal', message: '[AIR_E_BOX3D_WORLD_FAULTED] Game/System clock control' },
    ],
    physicsPreparation: {
        status: 'closed',
        cleanupErrors: [],
        acquired: [{ cleanup: 'released' }, { cleanup: 'released' }],
        moduleRelease: {
            status: 'VERIFIED',
            verified: true,
            errors: [],
            terminal: {
                schema: 'air-box3d-module-release-snapshot-v1',
                schemaVersion: 1,
                core: { worlds: 0, trackedRequestedBytes: 0 },
                bridge: {
                    worlds: 0,
                    allocations: 0,
                    bytes: 0,
                    debugShapeHandles: 0,
                    temporaryNodes: 0,
                    temporaryBytes: 0,
                    wireBuffers: 0,
                    wireCapacityRecords: 0,
                    wireLengthRecords: 0,
                    capturedWorlds: 0,
                },
                mesh: { resources: 0, leases: 0, references: 0, borrowNodes: 0, resourceStorageBytes: 0 },
            },
        },
    },
});
test('accept exact deliberate fault stages with terminal zero resources without changing failed status', () => {
    const r = make();
    assert(expectedFaultClose(r, true));
    assert.equal(r.status, 'failed');
    r.failures.shift();
    assert(expectedFaultClose(r, true));
});
for (const [name, change] of [
    ['unexpected stage', (r) => r.failures.push({ label: 'other', message: 'AIR_E_BOX3D_WORLD_FAULTED' })],
    ['duplicate stage', (r) => r.failures.push(r.failures[0])],
    ['ABI failure', (r) => (r.failures[0].message = 'AIR_E_BOX3D_ABI')],
    ['missing original terminal fault', (r) => r.failures.pop()],
    ['unverified cleanup', (r) => (r.physicsPreparation.moduleRelease.verified = false)],
    ['cleanup exception', (r) => r.physicsPreparation.cleanupErrors.push('oops')],
    ['unreleased acquisition', (r) => (r.physicsPreparation.acquired[0].cleanup = 'failed')],
    ['missing acquisitions', (r) => (r.physicsPreparation.acquired = [])],
    ['retained world', (r) => (r.physicsPreparation.moduleRelease.terminal.core.worlds = 1)],
    ['retained allocator', (r) => (r.physicsPreparation.moduleRelease.terminal.bridge.bytes = 1)],
    ['retained mesh', (r) => (r.physicsPreparation.moduleRelease.terminal.mesh.resources = 1)],
    ['missing terminal', (r) => delete r.physicsPreparation.moduleRelease.terminal],
    ['missing counter', (r) => delete r.physicsPreparation.moduleRelease.terminal.bridge.wireBuffers],
    ['wrong terminal schema', (r) => (r.physicsPreparation.moduleRelease.terminal.schema = 'wrong')],
    ['fabricated released', (r) => (r.status = 'released')],
])
    test(`reject ${name}`, () => {
        const r = make();
        change(r);
        assert.equal(expectedFaultClose(r, true), false);
    });
test('never accept healthy or absent deliberate-fault proof', () => {
    assert.equal(expectedFaultClose(make(), false), false);
    assert.equal(expectedFaultClose(make(), undefined), false);
});
