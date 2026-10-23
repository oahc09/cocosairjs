/* Source-only diagnostic consumer checks. No engine/native/browser is loaded. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = path.join(root, 'examples/box3d-rigidbody-playground/src/backend-observation.ts');
const source = fs.readFileSync(file, 'utf8');
const moduleScope = { exports: {} };
const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
    fileName: file,
});
assert.equal(compiled.diagnostics.length, 0);
vm.runInNewContext(compiled.outputText, {
    module: moduleScope,
    exports: moduleScope.exports,
    Object,
    Number,
    String,
    Set,
    Error,
});
const { readBackendObservation: read } = moduleScope.exports;
let tests = 0;
function test(name, check) {
    check();
    tests++;
    console.log(`PASS (consumer fixture only): ${name}`);
}
function fixture(change = {}) {
    let countReads = 0;
    const copied = {
        state: 'ready',
        commandOwner: { phase: 'idle', commandPhase: 'idle' },
        generation: 2,
        nativeObservationCurrent: true,
        native: { nativeStepIndex: 42, nativeCompleted: true, snapshotAvailable: true },
        componentEventsSupported: false,
        debugPresented: false,
        ...change,
    };
    const counts = { bodies: 103, shapes: 103, contacts: 17, joints: 0, liveBytes: 98304n };
    const world = {
        impl: { backend: 'box3d' },
        diagnostics: () => copied,
        getNativeCounts() {
            countReads++;
            return counts;
        },
    };
    return { world, copied, counts, countReads: () => countReads };
}
test('uses real supplied step/contact fields; serializes bigint bytes as string', () => {
    const f = fixture(),
        r = read(f.world);
    assert.equal(r.availability, 'available');
    assert.equal(r.nativeStep, 42);
    assert.equal(r.contacts, 17);
    assert.equal(r.counts.liveBytes, '98304');
    assert.equal(f.countReads(), 1);
    assert.equal(r.componentEventsSupported, false);
    assert.equal(r.debugPresented, false);
    assert.ok(JSON.stringify(r));
    assert.ok(Object.isFrozen(r));
    assert.ok(Object.isFrozen(r.counts));
    f.counts.contacts = 99;
    f.copied.native.nativeStepIndex = 99;
    assert.equal(r.contacts, 17);
    assert.equal(r.nativeStep, 42);
});
test('real zero is preserved; missing is never converted to zero', () => {
    const f = fixture();
    f.copied.native.nativeStepIndex = 0;
    f.counts.contacts = 0;
    assert.equal(read(f.world).nativeStep, 0);
    assert.equal(read(f.world).contacts, 0);
    f.copied.native = null;
    delete f.world.getNativeCounts;
    const r = read(f.world);
    assert.equal(r.nativeStep, null);
    assert.equal(r.contacts, null);
});
for (const state of ['faulted', 'destroying', 'destroyed', 'destroy-failed', 'stepping'])
    test(`world ${state} makes no native count call`, () => {
        const f = fixture({ state, nativeObservationCurrent: false }),
            r = read(f.world);
        assert.equal(f.countReads(), 0);
        assert.equal(r.nativeStep, null);
        assert.equal(r.contacts, null);
        assert.equal(r.cachedNativeStep, 42);
        assert.equal(r.availability, 'unavailable');
    });
for (const phase of ['solving', 'closed', 'faulted', 'material', 'control', 'writeback', 'preflight'])
    test(`owner ${phase} makes no native count call`, () => {
        const f = fixture({ commandOwner: { phase, commandPhase: 'idle' } }),
            r = read(f.world);
        assert.equal(f.countReads(), 0);
        assert.equal(r.contacts, null);
        assert.equal(r.nativeStep, null);
    });
test('committing command phase makes no native count call', () => {
    const f = fixture({ commandOwner: { phase: 'idle', commandPhase: 'committing' } });
    assert.equal(read(f.world).contacts, null);
    assert.equal(f.countReads(), 0);
});
test('stale cached step is separately labeled; current guarded counts can remain readable', () => {
    const f = fixture({ nativeObservationCurrent: false }),
        r = read(f.world);
    assert.equal(r.nativeStep, null);
    assert.equal(r.cachedNativeStep, 42);
    assert.equal(r.contacts, 17);
    assert.equal(r.availability, 'partial');
});
test('missing owner blocks native counts', () => {
    const f = fixture({ commandOwner: null }),
        r = read(f.world);
    assert.equal(r.contacts, null);
    assert.equal(f.countReads(), 0);
});
test('missing methods, foreign backend and thrown diagnostics remain unavailable', () => {
    for (const world of [
        null,
        {},
        { impl: { backend: 'cannon' } },
        { impl: { backend: 'box3d' } },
        {
            impl: { backend: 'box3d' },
            diagnostics() {
                throw new Error('closed');
            },
        },
    ]) {
        const r = read(world);
        assert.equal(r.contacts, null);
        assert.equal(r.nativeStep, null);
        assert.equal(r.availability, 'unavailable');
    }
});
test('count read throw is caught once; valid step is retained as partial', () => {
    const f = fixture();
    let calls = 0;
    f.world.getNativeCounts = () => {
        calls++;
        throw new Error('reader unavailable');
    };
    const r = read(f.world);
    assert.equal(calls, 1);
    assert.equal(r.contacts, null);
    assert.equal(r.nativeStep, 42);
    assert.equal(r.availability, 'partial');
});
test('malformed, negative, unsafe and non-bigint count data are not reported', () => {
    for (const invalid of [
        { contacts: -1 },
        { bodies: Number.MAX_SAFE_INTEGER + 1 },
        { shapes: NaN },
        { joints: 0.5 },
        { liveBytes: 123 },
        { liveBytes: -1n },
    ]) {
        const f = fixture();
        Object.assign(f.counts, invalid);
        assert.equal(read(f.world).contacts, null);
    }
});
test('capability flags are never promoted; changed contract prevents native count call', () => {
    for (const invalid of [
        { componentEventsSupported: true },
        { debugPresented: true },
        { componentEventsSupported: undefined },
    ]) {
        const f = fixture(invalid),
            r = read(f.world);
        assert.equal(r.contacts, null);
        assert.equal(f.countReads(), 0);
        assert.equal(r.availability, 'unavailable');
    }
});
console.log(
    JSON.stringify({
        scope: 'LIMITED_CPU_CONSUMER_FIXTURES_ONLY',
        tests,
        sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
        nativeExecuted: false,
        engineExecuted: false,
        browserExecuted: false,
    }),
);
