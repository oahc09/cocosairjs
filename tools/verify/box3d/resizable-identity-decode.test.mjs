// Source-only identity controls: the explicit fake module does not implement physics.
// The strict decoder models the observed Firefox RAB restriction; this is not browser qualification.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Optional frozen source is only for RED/GREEN controls; the default reads this checkout.
const facadeUrl = process.env.BOX3D_IDENTITY_FACADE
    ? pathToFileURL(resolve(process.env.BOX3D_IDENTITY_FACADE))
    : new URL('../../../src/air/physics/box3d/binding/facade.mjs', import.meta.url);
const { createBox3DBinding } = await import(facadeUrl.href);
const lock = JSON.parse(readFileSync(new URL('../../physics/box3d/versions.lock.json', import.meta.url), 'utf8'));
const expected = Object.freeze({
    coreSha: lock.core.commit,
    bindingBaseSha: lock.bindingBase.commit,
    patchChainSha256: lock.patchLock.patchChainSha256,
    abiVersion: lock.implementation.abiVersion,
    variant: lock.compileContract.variant,
    schemaSha256: lock.apiSchemaSha256,
});
const identities = ['patchChainSha256', 'coreSha', 'schemaSha256'];
const NativeTextDecoder = globalThis.TextDecoder;
const rows = [];

function fixture(kind, overrides = {}) {
    const buffer =
        kind === 'shared'
            ? new SharedArrayBuffer(1024)
            : kind === 'resizable'
              ? new ArrayBuffer(1024, { maxByteLength: 2048 })
              : new ArrayBuffer(1024);
    assert.equal(buffer.resizable === true, kind === 'resizable', 'RAB support is required, never skipped');
    const heap = new Uint8Array(buffer);
    heap.fill(0xcc);
    const pointers = {};
    let cursor = 8;
    for (const key of identities) {
        pointers[key] = cursor;
        const bytes = new TextEncoder().encode(overrides[key] ?? expected[key]);
        heap.set(bytes, cursor);
        heap[cursor + bytes.length] = 0;
        cursor += bytes.length + 8;
    }
    const malloc = [];
    const free = [];
    const module = {
        HEAPU8: heap,
        _air_b3_patch_chain_sha: () => pointers.patchChainSha256,
        _air_b3_core_sha: () => pointers.coreSha,
        _air_b3_schema_sha: () => pointers.schemaSha256,
        _air_b3_abi_version: () => overrides.abiVersion ?? expected.abiVersion,
        _malloc(bytes) {
            malloc.push(bytes);
            assert.equal(bytes, 512);
            return 512;
        },
        _free(ptr) {
            free.push(ptr);
            assert.equal(ptr, 512);
        },
    };
    return { module, buffer, heap, pointers, malloc, free };
}

function strictDecoder(action) {
    const calls = [];
    class StrictTextDecoder extends NativeTextDecoder {
        decode(input, options) {
            const buffer = ArrayBuffer.isView(input) ? input.buffer : input;
            if (buffer instanceof ArrayBuffer && buffer.resizable)
                throw new TypeError('Mock Firefox restriction: TextDecoder rejects resizable ArrayBuffer input');
            const text = super.decode(input, options);
            calls.push({ input, text });
            return text;
        }
    }
    globalThis.TextDecoder = StrictTextDecoder;
    try {
        return action(calls);
    } finally {
        globalThis.TextDecoder = NativeTextDecoder;
    }
}

function check(name, action) {
    try {
        const evidence = strictDecoder(action);
        rows.push({ name, status: 'PASS', ...(evidence ? { evidence } : {}) });
    } catch (error) {
        rows.push({ name, status: 'FAIL', error: { name: error.name, code: error.code, message: error.message } });
    }
}

function rejectBeforeMalloc(f, identity = expected, message) {
    assert.throws(
        () => createBox3DBinding(f.module, identity),
        (error) => {
            assert.equal(error.code, 'AIR_E_BOX3D_ABI');
            if (message) assert.equal(error.message, message);
            return true;
        },
    );
    assert.deepEqual(f.malloc, []);
    assert.deepEqual(f.free, []);
}

check('strict decoder rejects actual RAB buffer and views; old direct subarray decode reproduces failure', () => {
    const f = fixture('resizable');
    const ptr = f.pointers.patchChainSha256;
    const end = ptr + expected.patchChainSha256.length;
    const decoder = new TextDecoder();
    for (const input of [f.buffer, f.heap.subarray(ptr, end), new DataView(f.buffer, ptr, end - ptr)])
        assert.throws(() => decoder.decode(input), { name: 'TypeError', message: /Mock Firefox restriction/ });
    assert.deepEqual(f.malloc, []);
});

check('fixed-length Uint8Array copy decodes the actual identity from RAB', (calls) => {
    const f = fixture('resizable');
    const ptr = f.pointers.patchChainSha256;
    const copy = new Uint8Array(f.heap.subarray(ptr, ptr + expected.patchChainSha256.length));
    assert.notEqual(copy.buffer, f.buffer);
    assert.equal(copy.buffer.resizable, false);
    assert.equal(new TextDecoder().decode(copy), expected.patchChainSha256);
    assert.equal(calls.length, 1);
});

for (const kind of ['fixed', 'resizable']) {
    check(`${kind}: initializes from exact terminated native identities, allocates once and frees once`, (calls) => {
        const f = fixture(kind);
        const before = Array.from(f.heap);
        const binding = createBox3DBinding(f.module, expected);
        assert.deepEqual(binding.identity, expected);
        assert(Object.isFrozen(binding.identity));
        assert.deepEqual(
            calls.map(({ text }) => text),
            identities.map((key) => expected[key]),
        );
        for (const { input } of calls) {
            assert(input instanceof Uint8Array);
            assert.equal(input.buffer.resizable, false);
            if (kind === 'resizable') assert.notEqual(input.buffer, f.buffer);
        }
        assert.deepEqual(Array.from(f.heap), before, 'Reading identities must not mutate the native heap');
        assert.deepEqual(f.malloc, [512]);
        binding.dispose();
        binding.dispose();
        assert.deepEqual(f.free, [512]);
        return { decoded: calls.map(({ text }) => text), malloc: f.malloc, free: f.free };
    });

    for (const key of Object.keys(expected)) {
        check(`${kind}: expected ${key} mismatch rejects before malloc`, () => {
            const invalid = { ...expected, [key]: typeof expected[key] === 'number' ? 2 : 'wrong' };
            rejectBeforeMalloc(fixture(kind), invalid);
        });
    }
    for (const key of [...identities, 'abiVersion']) {
        check(`${kind}: native ${key} mismatch rejects before malloc`, () => {
            rejectBeforeMalloc(fixture(kind, { [key]: key === 'abiVersion' ? 2 : 'wrong' }));
        });
    }
    check(`${kind}: missing native patch identity export rejects before malloc`, () => {
        const f = fixture(kind);
        delete f.module._air_b3_patch_chain_sha;
        rejectBeforeMalloc(f);
    });
    for (const key of identities) {
        check(`${kind}: unterminated native ${key} rejects before malloc`, () => {
            const f = fixture(kind);
            f.heap.fill(0x78, f.pointers[key]);
            rejectBeforeMalloc(f, expected, 'Unterminated native identity');
        });
    }
}

check('grown real RAB with a length-tracking HEAPU8 still initializes', () => {
    const f = fixture('resizable');
    f.buffer.resize(2048);
    assert.equal(f.heap.length, 2048);
    const binding = createBox3DBinding(f.module, expected);
    assert.deepEqual(binding.identity, expected);
    binding.dispose();
    assert.deepEqual(f.malloc, [512]);
    assert.deepEqual(f.free, [512]);
});

check('SharedArrayBuffer identity module remains rejected before malloc', () => {
    rejectBeforeMalloc(fixture('shared'));
});

const failed = rows.filter(({ status }) => status === 'FAIL').length;
console.log(
    JSON.stringify(
        {
            scope: 'MOCKED_IDENTITY_ONLY_SOURCE_CONTROL_NOT_NATIVE_PHYSICS_OR_BROWSER_QUALIFICATION',
            runtime: process.version,
            facadeSha256: createHash('sha256').update(readFileSync(facadeUrl)).digest('hex'),
            testSha256: createHash('sha256')
                .update(readFileSync(new URL(import.meta.url)))
                .digest('hex'),
            expected,
            counts: { total: rows.length, passed: rows.length - failed, failed, skipped: 0 },
            rows,
        },
        null,
        2,
    ),
);
process.exitCode = failed ? 1 : 0;
