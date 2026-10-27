/*
Copyright (c) 2026-2027 oahc09@gmail.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

// Stateless copied observer. The WeakSet is only a reentrancy guard, never ownership.
const CORE_SHA = 'efca0c184d40fd6a82016983f1601c4d23965867';
const SCHEMA_SHA256 = '8af84ffb85ce311e9693d378c70ca3c788896b8aeee228700bbddd61c0ca8a04';
const PATCH_CHAIN_SHA256 = 'fce7869b3888ff9bfd417095e70ce72591893b2c3add1802e1a5bc32ca918bfe';
export const MODULE_RELEASE_WORDS = 38;
export const MODULE_RELEASE_SCHEMA = 'air-box3d-module-release-snapshot-v1';
const groups = Object.freeze({
    core: Object.freeze(['worlds', 'trackedRequestedBytes']),
    bridge: Object.freeze([
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
    ]),
    mesh: Object.freeze(['resources', 'leases', 'references', 'borrowNodes', 'resourceStorageBytes']),
});
const capturing = new WeakSet();
const failure = (message) => Object.assign(new Error(message), { code: 'AIR_E_BOX3D_MODULE_RELEASE' });
function text(module, pointer) {
    const heap = module.HEAPU8;
    if (!(heap instanceof Uint8Array) || !Number.isInteger(pointer) || pointer <= 0 || pointer >= heap.length)
        throw failure('Invalid module identity pointer');
    let end = pointer;
    while (end < heap.length && heap[end]) ++end;
    if (end === heap.length) throw failure('Unterminated module identity');
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(heap.subarray(pointer, end)));
}
function validateIdentity(module, expected) {
    if (
        !module ||
        typeof module !== 'object' ||
        !expected ||
        expected.abiVersion !== 1 ||
        expected.variant !== 'st-simd' ||
        expected.coreSha !== CORE_SHA ||
        expected.schemaSha256 !== SCHEMA_SHA256 ||
        expected.patchChainSha256 !== PATCH_CHAIN_SHA256
    )
        throw failure('Module release identity mismatch');
    for (const name of [
        '_malloc',
        '_free',
        '_air_b3_core_sha',
        '_air_b3_schema_sha',
        '_air_b3_patch_chain_sha',
        '_air_b3_abi_version',
        '_air_b3_module_release_snapshot_v1',
    ])
        if (typeof module[name] !== 'function') throw failure(`Missing module release export: ${name}`);
    if (
        !(module.HEAPU8 instanceof Uint8Array) ||
        (typeof SharedArrayBuffer !== 'undefined' && module.HEAPU8.buffer instanceof SharedArrayBuffer) ||
        module._air_b3_abi_version() !== 1 ||
        text(module, module._air_b3_core_sha()) !== CORE_SHA ||
        text(module, module._air_b3_schema_sha()) !== SCHEMA_SHA256 ||
        text(module, module._air_b3_patch_chain_sha()) !== PATCH_CHAIN_SHA256
    )
        throw failure('Native module release identity mismatch');
}
/** Captures this actual factory module without retaining it. Generic observer scratch
 * is outside core/bridge requested-byte accounting and is freed even on a failed read. */
export function captureModuleReleaseSnapshot(module, expectedIdentity) {
    if (!module || typeof module !== 'object') throw failure('No actual module to observe');
    if (capturing.has(module)) throw failure('Reentrant module release observation');
    capturing.add(module);
    let pointer = 0;
    let primaryError;
    try {
        validateIdentity(module, expectedIdentity);
        pointer = module._malloc(MODULE_RELEASE_WORDS * 4);
        if (!Number.isSafeInteger(pointer) || pointer <= 0 || pointer % 4)
            throw failure('Cannot allocate aligned module observer scratch');
        const status = module._air_b3_module_release_snapshot_v1(pointer, MODULE_RELEASE_WORDS);
        if (status !== 0)
            throw Object.assign(failure(`Native module release snapshot refused (${status})`), {
                nativeStatus: status,
            });
        // A fresh view AFTER native calls: malloc/native callbacks may have grown memory.
        const heap = module.HEAPU8;
        if (!(heap instanceof Uint8Array) || pointer + MODULE_RELEASE_WORDS * 4 > heap.byteLength)
            throw failure('Module release snapshot outside current heap');
        const words = new Uint32Array(
            new Uint8Array(heap.subarray(pointer, pointer + MODULE_RELEASE_WORDS * 4)).buffer,
        );
        if (words[0] !== 1 || words[1] !== MODULE_RELEASE_WORDS || words[2] !== 17 || words[3] !== 0)
            throw failure('Module release snapshot version/layout mismatch');
        let at = 4;
        const result = { schema: MODULE_RELEASE_SCHEMA, schemaVersion: 1 };
        for (const [group, keys] of Object.entries(groups)) {
            const values = {};
            for (const key of keys) {
                const value = words[at++] + words[at++] * 0x100000000;
                if (!Number.isSafeInteger(value)) throw failure(`Unsafe module release integer: ${group}.${key}`);
                values[key] = value;
            }
            result[group] = Object.freeze(values);
        }
        return Object.freeze(result);
    } catch (error) {
        primaryError = error;
        throw error;
    } finally {
        // Nested finally removes the guard even if an injected allocator cleanup fails.
        try {
            if (pointer) module._free(pointer);
        } catch (cleanupError) {
            if (!primaryError) throw cleanupError;
            if (typeof primaryError === 'object' && primaryError !== null && Object.isExtensible(primaryError))
                Object.defineProperty(primaryError, 'observerCleanupError', {
                    value: String(cleanupError),
                    enumerable: true,
                });
        } finally {
            capturing.delete(module);
        }
    }
}
function validateSnapshot(value) {
    if (
        !value ||
        value.schema !== MODULE_RELEASE_SCHEMA ||
        value.schemaVersion !== 1 ||
        Object.keys(value).sort().join(',') !== 'bridge,core,mesh,schema,schemaVersion'
    )
        throw failure('Invalid copied module release snapshot');
    for (const [group, keys] of Object.entries(groups)) {
        if (!value[group] || Object.keys(value[group]).sort().join(',') !== [...keys].sort().join(','))
            throw failure(`Invalid copied module release group: ${group}`);
        for (const key of keys)
            if (!Number.isSafeInteger(value[group][key]) || value[group][key] < 0)
                throw failure(`Invalid copied module release value: ${group}.${key}`);
    }
}
/** Scope-limited comparison, never a total malloc/heap/GC or all-handle proof. */
export function verifyModuleReleased(baseline, terminal) {
    validateSnapshot(baseline);
    validateSnapshot(terminal);
    for (const [label, snapshot] of [
        ['baseline', baseline],
        ['terminal', terminal],
    ]) {
        if (snapshot.core.worlds !== 0) throw failure(`${label}: native core worlds remain`);
        for (const group of ['bridge', 'mesh'])
            for (const [key, value] of Object.entries(snapshot[group]))
                if (value !== 0) throw failure(`${label}: registered native ${group}.${key} remains`);
    }
    if (terminal.core.trackedRequestedBytes !== baseline.core.trackedRequestedBytes)
        throw failure('Same-module core tracked requested bytes did not return to factory baseline');
    return true;
}
