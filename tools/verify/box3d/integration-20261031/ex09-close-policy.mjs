/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// A deliberate owner fault is retained as a FAILED close, never relabeled released.
// New scene-reclamation guard may reject the same terminal owner before final disposal.
const terminalFields = {
    core: ['worlds', 'trackedRequestedBytes'],
    bridge: [
        'worlds',
        'allocations',
        'bytes',
        'debugShapeHandles',
        'temporaryNodes',
        'temporaryBytes',
        'wireBuffers',
        'wireCapacityRecords',
        'wireLengthRecords',
        'capturedWorlds',
    ],
    mesh: ['resources', 'leases', 'references', 'borrowNodes', 'resourceStorageBytes'],
};
export function expectedFaultClose(receipt, intentionalFaultObserved) {
    if (intentionalFaultObserved !== true || !receipt || !Array.isArray(receipt.failures)) return false;
    const preparation = receipt.physicsPreparation,
        release = preparation?.moduleRelease;
    if (
        preparation?.status !== 'closed' ||
        preparation.cleanupErrors?.length !== 0 ||
        !Array.isArray(preparation.acquired) ||
        preparation.acquired.length === 0 ||
        !preparation.acquired.every((entry) => entry.cleanup === 'released') ||
        release?.status !== 'VERIFIED' ||
        release.verified !== true ||
        release.errors?.length !== 0 ||
        release.terminal?.schema !== 'air-box3d-module-release-snapshot-v1' ||
        release.terminal.schemaVersion !== 1 ||
        !Object.entries(terminalFields).every(
            ([group, fields]) =>
                fields.every((field) => release.terminal[group]?.[field] === 0) &&
                Object.values(release.terminal[group]).every((value) => value === 0),
        )
    )
        return false;
    if (receipt.status === 'released') return receipt.failures.length === 0;
    if (receipt.status !== 'failed') return false;
    const labels = receipt.failures.map((f) => f.label).sort();
    if (
        JSON.stringify(labels) !== JSON.stringify(['game-clock-terminal']) &&
        JSON.stringify(labels) !== JSON.stringify(['box3d-empty-world-reclamation', 'game-clock-terminal'])
    )
        return false;
    return receipt.failures.every(
        (f) => typeof f.message === 'string' && f.message.includes('AIR_E_BOX3D_WORLD_FAULTED'),
    );
}
