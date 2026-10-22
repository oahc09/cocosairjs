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
// Pure protocol controls only. No engine, native adapter, multi-world or product-completeness claim.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const source = 'src/cocos/physics/framework/physics-material-bindings.ts';
const runner = 'tools/verify/box3d/neutral-material-bindings-control.mjs';
const out = path.resolve(process.argv[2] ?? '/tmp/box3d-neutral-material-ledger-20261022/run-1');
await mkdir(out, { recursive: true });
const sha = (text) => createHash('sha256').update(text).digest('hex');
const manifest = {};
for (const name of [source, runner]) {
    const bytes = await readFile(name);
    manifest[name] = { sha256: sha(bytes), bytes: bytes.length };
    await copyFile(name, path.join(out, path.basename(name)));
}
await writeFile(path.join(out, 'source-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const command = [
    'node',
    'node_modules/typescript/bin/tsc',
    '--strict',
    '--target',
    'ES2022',
    '--module',
    'commonjs',
    '--skipLibCheck',
    '--outDir',
    path.join(out, 'compiled'),
    path.join(out, 'physics-material-bindings.ts'),
];
const compilation = spawnSync(command[0], command.slice(1), { encoding: 'utf8' });
await writeFile(
    path.join(out, 'compile-command.json'),
    `${JSON.stringify({ command, cwd: process.cwd(), exit: compilation.status, signal: compilation.signal }, null, 2)}\n`,
);
await writeFile(path.join(out, 'compile.stdout'), compilation.stdout ?? '');
await writeFile(path.join(out, 'compile.stderr'), compilation.stderr ?? '');
assert.equal(compilation.status, 0, compilation.stdout + compilation.stderr);
const { PhysicsMaterialBindingsRegistry: Registry } = require(path.join(out, 'compiled/physics-material-bindings.js'));
const results = [];
function check(name, fn) {
    try {
        fn();
        results.push({ name, status: 'PASS_PURE_PROTOCOL_CONTROL' });
    } catch (error) {
        results.push({ name, status: 'FAIL', error: String(error), stack: error?.stack });
    }
}
function thrown(fn) {
    try {
        fn();
        return { threw: false };
    } catch (error) {
        return { threw: true, error };
    }
}
function sameThrown(fn, expected) {
    const result = thrown(fn);
    assert.equal(result.threw, true);
    assert.equal(result.error, expected);
}
function setup(options = {}) {
    const registry = options.registry ?? new Registry();
    const worldIdentity = options.worldIdentity ?? {};
    const world = registry.getOrRegisterMaterialWorld(worldIdentity);
    const asset = options.asset ?? {};
    const source = options.source ?? {};
    const adapter = options.adapter ?? {};
    const binding = options.binding ?? adapter;
    const ownerIdentity = options.ownerIdentity ?? worldIdentity;
    const role = options.role ?? 'explicit';
    let current = asset,
        reads = 0;
    const owner = options.foreign
        ? undefined
        : registry.registerMaterialBindingOwner(ownerIdentity, options.generation ?? 1, worldIdentity);
    if (owner && options.declare !== false) owner.declareBinding(source, adapter, binding, role);
    const lease = registry.registerMaterialSource({
        source,
        adapter,
        world,
        role,
        current: asset,
        initialized: options.initialized ?? true,
        readActualCache: () => {
            ++reads;
            return options.read ? options.read(() => current, registry) : current;
        },
    });
    return {
        registry,
        world,
        worldIdentity,
        asset,
        source,
        adapter,
        binding,
        owner,
        ownerIdentity,
        lease,
        setCurrent(value) {
            current = value;
        },
        reads() {
            return reads;
        },
        row: {
            owner: ownerIdentity,
            generation: options.generation ?? 1,
            binding,
            role,
            initialized: options.initialized ?? true,
        },
    };
}
function foreign(registry, asset, extra = {}) {
    return setup({ ...extra, registry, asset, foreign: true });
}
function covered(s) {
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    assert.equal(lock.disposition, 'covered');
    lock.compare([s.row]);
    lock.assertValid();
    lock.close();
}
check('live exact source claim admits with frozen exact expected row', () => {
    const s = setup();
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    assert.equal(lock.disposition, 'covered');
    assert(Object.isFrozen(lock));
    assert(Object.isFrozen(lock.expectedBindings));
    assert(Object.isFrozen(lock.expectedBindings[0]));
    assert.deepEqual(lock.expectedBindings, [s.row]);
    lock.compare([s.row]);
    lock.close();
});
check('foreign-only leaves identity readers and invalid coefficient getters untouched', () => {
    let coefficients = 0;
    const asset = {
        get friction() {
            ++coefficients;
            throw 0;
        },
    };
    const s = setup({
        foreign: true,
        asset,
        read() {
            throw 'must not read';
        },
    });
    const lock = s.registry.lockMaterialValuesCoverage(asset);
    assert.equal(lock.disposition, 'legacy');
    lock.compare([]);
    lock.assertValid();
    lock.close();
    s.registry.assertMaterialBindingDestroyable(asset);
    assert.equal(coefficients, 0);
    assert.equal(s.reads(), 0);
});
check('foreign unknown remains legacy without a participating hazard', () => {
    const s = setup({ foreign: true });
    s.registry.closeMaterialSource(s.lease);
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    assert.equal(lock.disposition, 'legacy');
    lock.close();
    s.registry.assertMaterialBindingDestroyable(s.asset);
});
for (const field of ['owner', 'generation', 'binding', 'role', 'initialized'])
    check(`S1 ${field} mismatch rejected before coefficient read`, () => {
        const s = setup();
        const lock = s.registry.lockMaterialValuesCoverage(s.asset);
        let coefficients = 0;
        const wrong = {
            ...s.row,
            [field]: field === 'generation' ? 9 : field === 'initialized' ? false : field === 'role' ? 'default' : {},
        };
        assert.throws(() => {
            lock.compare([wrong]);
            ++coefficients;
        });
        assert.equal(coefficients, 0);
        lock.close();
    });
check('missing S1 row cannot turn neutral ownership into legacy', () => {
    const s = setup();
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    assert.throws(() => lock.compare([]));
    lock.close();
});
check('extra S1 row cannot claim unobserved coverage', () => {
    const s = setup({ foreign: true });
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    assert.throws(() => lock.compare([s.row]));
    lock.close();
});
check('duplicate S1 row cannot conceal a missing exact binding', () => {
    const s = setup();
    const source = {},
        adapter = {};
    s.owner.declareBinding(source, adapter, adapter, 'explicit');
    s.registry.registerMaterialSource({
        source,
        adapter,
        world: s.world,
        role: 'explicit',
        current: s.asset,
        initialized: true,
        readActualCache: () => s.asset,
    });
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    assert.throws(() => lock.compare([s.row, s.row]));
    lock.close();
});
for (const state of ['live', 'provisional', 'pending', 'unknown'])
    check(`mixed foreign ${state} source refuses before participating identity reads`, () => {
        const s = setup();
        const f = foreign(s.registry, s.asset, { initialized: state !== 'provisional' });
        if (state === 'pending') f.registry.prepareBindingIdentity(f.lease, f.asset, {}, 'setter');
        if (state === 'unknown') f.registry.closeMaterialSource(f.lease);
        assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
    });
check('raw-opaque role cannot become an executable claim', () => {
    const s = setup();
    foreign(s.registry, s.asset, { role: 'raw-opaque' });
    assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
});
check('declared provisional B3 source is a destroy and values hazard', () => {
    const s = setup({ initialized: false });
    assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
    s.registry.markMaterialSourceInitialized(s.lease);
    s.row.initialized = true;
    covered(s);
});
check('B3 world marks source hazardous before owner attaches/declaration', () => {
    const s = setup({ declare: false, initialized: false });
    assert.equal(s.registry.diagnostics(s.lease).participating, false);
    assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
    s.owner.declareBinding(s.source, s.adapter, s.binding, 'explicit');
    assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
    s.registry.markMaterialSourceInitialized(s.lease);
    s.row.initialized = true;
    covered(s);
});
check('owner declaration after source capture associates only exact source/adapter/world/role', () => {
    const s = setup({ declare: false });
    s.owner.declareBinding({}, s.adapter, s.binding, 'explicit');
    assert.throws(() => s.owner.claim(s.lease, s.adapter, s.binding, 'explicit'));
    s.owner.declareBinding(s.source, s.adapter, s.binding, 'explicit');
    s.owner.claim(s.lease, s.adapter, s.binding, 'explicit');
    covered(s);
});
check('raw source using same adapter does not inherit semantic owner declaration', () => {
    const s = setup();
    const raw = s.registry.registerMaterialSource({
        source: {},
        adapter: s.adapter,
        world: s.world,
        role: 'raw-opaque',
        current: s.asset,
        initialized: true,
        readActualCache: () => s.asset,
    });
    assert.equal(s.registry.diagnostics(raw).participating, false);
    assert.throws(() => s.owner.claim(raw, s.adapter, s.binding, 'explicit'));
    assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
});
check('default claim uses real System binding identity rather than world adapter identity', () => {
    const system = {},
        world = {};
    const s = setup({ role: 'default', source: system, binding: system, adapter: world, worldIdentity: world });
    covered(s);
});
check('forged and cross-registry source leases cannot publish identities', () => {
    const s = setup();
    assert.throws(() => s.registry.prepareBindingIdentity({}, s.asset, {}, 'setter'));
    assert.throws(() => new Registry().markMaterialSourceInitialized(s.lease));
    covered(s);
});
check('forged and cross-registry world leases cannot acquire sources', () => {
    const s = setup();
    assert.throws(() =>
        new Registry().registerMaterialSource({
            source: {},
            adapter: {},
            world: s.world,
            role: 'explicit',
            current: {},
            readActualCache: () => null,
        }),
    );
});
check('world identity does not silently obtain a fresh generation', () => {
    const s = setup();
    assert.equal(s.registry.getOrRegisterMaterialWorld(s.worldIdentity), s.world);
    assert.throws(() => s.registry.registerMaterialWorld(s.worldIdentity));
});
check('owner generation must be fresh and cannot alias same actual world', () => {
    const s = setup();
    assert.throws(() => s.registry.registerMaterialBindingOwner(s.ownerIdentity, 1, {}));
    assert.throws(() => s.registry.registerMaterialBindingOwner({}, 2, s.worldIdentity));
});
check('identity transition publication calls no source reader or callbacks', () => {
    const s = setup();
    const next = {};
    const token = s.registry.prepareBindingIdentity(s.lease, s.asset, next, 'setter');
    const reads = s.reads();
    token.recordEntered();
    s.setCurrent(next);
    token.publishActual(next);
    assert.equal(s.reads(), reads);
    s.registry.assertMaterialBindingDestroyable(s.asset);
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(next));
});
check('legacy same-id candidate with unchanged actual publishes before rather than parameter', () => {
    const s = setup();
    const next = {};
    const token = s.registry.prepareBindingIdentity(s.lease, s.asset, next, 'legacy same id');
    token.recordEntered();
    token.publishActual(s.asset);
    s.registry.assertMaterialBindingDestroyable(next);
    covered(s);
});
check('explicit null is default dependence, never a fake asset row', () => {
    const s = setup();
    const token = s.registry.prepareBindingIdentity(s.lease, s.asset, null, 'setter');
    token.recordEntered();
    s.setCurrent(null);
    token.publishActual(null);
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    assert.equal(lock.disposition, 'legacy');
    lock.close();
    s.registry.assertMaterialBindingDestroyable(s.asset);
});
check('entered setter failure with unchanged cache retains both hazards as unknown', () => {
    const s = setup();
    const next = {};
    const token = s.registry.prepareBindingIdentity(s.lease, s.asset, next, 'setter');
    token.recordEntered();
    token.fail(s.asset);
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
    assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(next));
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
});
check('pure pre-effect validation refusal restores source and permits later valid attempt', () => {
    const s = setup();
    const rejected = {};
    s.registry.prepareBindingIdentity(s.lease, s.asset, rejected, 'validation').fail(s.asset);
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'live');
    s.registry.assertMaterialBindingDestroyable(rejected);
    covered(s);
    const next = {};
    const token = s.registry.prepareBindingIdentity(s.lease, s.asset, next, 'setter');
    token.recordEntered();
    s.setCurrent(next);
    token.publishActual(next);
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'live');
});
check('pre-effect failure with changed actual cannot infer safe restoration', () => {
    const s = setup();
    const next = {};
    s.registry.prepareBindingIdentity(s.lease, s.asset, next, 'setter').fail(next);
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
});
check('later publication failure retains old/candidate after initially successful publish', () => {
    const s = setup();
    const next = {};
    const token = s.registry.prepareBindingIdentity(s.lease, s.asset, next, 'setter');
    token.recordEntered();
    s.setCurrent(next);
    token.publishActual(next);
    token.fail(next);
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(next));
});
check('clone reserves late actual identity before any getter and retains old/candidate on failure', () => {
    const s = setup();
    const next = {};
    const token = s.registry.prepareBindingIdentity(s.lease, s.asset, s.asset, 'clone');
    token.recordEntered('clone allocation');
    token.reserveCandidate(next);
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(next));
    token.fail(s.asset);
    assert.equal(s.registry.diagnostics(s.lease).hazards, 2);
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
});
check('clone reservation requires entered allocation and is single-use', () => {
    const s = setup();
    const token = s.registry.prepareBindingIdentity(s.lease, s.asset, s.asset, 'clone');
    assert.throws(() => token.reserveCandidate({}));
    token.recordEntered();
    const next = {};
    token.reserveCandidate(next);
    assert.throws(() => token.reserveCandidate({}));
    token.fail(s.asset);
});
check('clone publishes late reserved actual identity successfully', () => {
    const s = setup();
    const next = {};
    const token = s.registry.prepareBindingIdentity(s.lease, s.asset, s.asset, 'clone');
    token.recordEntered();
    token.reserveCandidate(next);
    s.setCurrent(next);
    token.publishActual(next);
    s.registry.assertMaterialBindingDestroyable(s.asset);
    assert.equal(s.registry.diagnostics(s.lease).hazards, 1);
});
check('unreserved actual publication cannot erase any old/candidate hazard', () => {
    const s = setup();
    const next = {};
    const token = s.registry.prepareBindingIdentity(s.lease, s.asset, next, 'setter');
    token.recordEntered();
    assert.throws(() => token.publishActual({}));
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(next));
    assert.equal(s.registry.diagnostics(s.lease).coveragePoisoned, true);
});
check('unknown source cannot be healed by later success or initialized flags', () => {
    const s = setup();
    const next = {};
    s.registry.markMaterialSourceUnknown(s.lease);
    const token = s.registry.prepareBindingIdentity(s.lease, s.asset, next, 'setter');
    token.recordEntered();
    s.setCurrent(next);
    token.publishActual(next);
    s.registry.markMaterialSourceInitialized(s.lease);
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
});
check('old token cannot poison or overwrite a later identity generation', () => {
    const s = setup();
    const first = s.registry.prepareBindingIdentity(s.lease, s.asset, s.asset, 'setter');
    first.publishActual(s.asset);
    const next = s.registry.prepareBindingIdentity(s.lease, s.asset, s.asset, 'setter');
    assert.throws(() => first.fail());
    next.publishActual(s.asset);
    covered(s);
});
check('token receiver and consumed authority are authenticated', () => {
    const s = setup();
    const token = s.registry.prepareBindingIdentity(s.lease, s.asset, s.asset, 'setter');
    assert.throws(() => token.publishActual.call({}, s.asset));
    token.publishActual(s.asset);
    assert.throws(() => token.publishActual(s.asset));
});
const lockedActions = {
    'identity reserve': (s) => s.registry.prepareBindingIdentity(s.lease, s.asset, {}, 'setter'),
    'foreign acquisition': (s) => foreign(s.registry, s.asset),
    'raw opaque effect': (s) => s.registry.recordMaterialAcquisitionUnknown(s.asset),
    'unknown cleanup': (s) => s.registry.closeMaterialSource(s.lease),
    'source initialization': (s) => s.registry.markMaterialSourceInitialized(s.lease),
    'owner closure': (s) => s.owner.close(),
    'release proof issuance': (s) => s.owner.confirmBindingReleased(s.lease),
    'asset destruction': (s) => s.registry.assertMaterialBindingDestroyable(s.asset),
};
for (const [name, action] of Object.entries(lockedActions))
    check(`lock rejects ${name} and latches swallowed first failure`, () => {
        const s = setup();
        const lock = s.registry.lockMaterialValuesCoverage(s.asset);
        const result = thrown(() => action(s));
        assert.equal(result.threw, true);
        sameThrown(() => lock.assertValid(), result.error);
        lock.close();
        lock.close();
        assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'live');
    });
for (const first of [0, false, '', null, undefined])
    check(`explicit failure latch preserves ${String(first)} exactly`, () => {
        const s = setup();
        const lock = s.registry.lockMaterialValuesCoverage(s.asset);
        lock.fail(first);
        lock.fail(new Error('secondary'));
        sameThrown(() => lock.assertValid(), first);
        lock.close();
    });
check('private cache mismatch is unknown, not automatically accepted native state', () => {
    const s = setup();
    const next = {};
    s.setCurrent(next);
    assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(next));
});
check('private identity reader failure preserves falsy primary and unknown hazard', () => {
    const s = setup({
        read() {
            throw 0;
        },
    });
    sameThrown(() => s.registry.lockMaterialValuesCoverage(s.asset), 0);
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
});
check('private identity reader swallowing reentry still rejects coverage', () => {
    const s = setup({
        read(current, registry) {
            try {
                registry.recordMaterialAcquisitionUnknown();
            } catch {}
            return current();
        },
    });
    assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
});
check('assertValid rechecks fixed private fields under retained lock', () => {
    const s = setup();
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    const next = {};
    s.setCurrent(next);
    assert.throws(() => lock.assertValid());
    lock.close();
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(next));
});
check('backend strings and public listener edits confer no authority', () => {
    const s = setup({ foreign: true, source: { backend: 'box3d', listeners: ['Box3D'] } });
    assert.equal(s.registry.diagnostics(s.lease).participating, false);
    s.source.listeners.length = 0;
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    assert.equal(lock.disposition, 'legacy');
    lock.close();
});
check('forged released string cannot clear an unknown binding', () => {
    const s = setup();
    s.registry.closeMaterialSource(s.lease);
    assert.throws(() => s.registry.closeMaterialSource(s.lease, 'released'));
    assert.throws(() => s.registry.closeMaterialSource(s.lease, {}));
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
});
check('wrong exact source proof cannot release another source generation', () => {
    const s = setup();
    const otherSource = {},
        otherAdapter = {};
    s.owner.declareBinding(otherSource, otherAdapter, otherAdapter, 'explicit');
    const other = s.registry.registerMaterialSource({
        source: otherSource,
        adapter: otherAdapter,
        world: s.world,
        role: 'explicit',
        current: s.asset,
        initialized: true,
        readActualCache: () => s.asset,
    });
    const proof = s.owner.confirmBindingReleased(s.lease);
    assert.throws(() => s.registry.closeMaterialSource(other, proof));
    s.registry.closeMaterialSource(s.lease, proof);
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
});
check('foreign cleanup cannot mint participation release proof', () => {
    const s = setup();
    const f = foreign(s.registry, s.asset);
    assert.throws(() => s.owner.confirmBindingReleased(f.lease));
    s.registry.closeMaterialSource(f.lease);
    assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
});
check('authentic independently confirmed source release clears only exact source', () => {
    const s = setup();
    s.registry.closeMaterialSource(s.lease);
    const proof = s.owner.confirmBindingReleased(s.lease);
    s.registry.closeMaterialSource(s.lease, proof);
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'released');
    s.registry.assertMaterialBindingDestroyable(s.asset);
    s.registry.closeMaterialSource(s.lease);
    s.registry.closeMaterialSource(s.lease, proof);
    assert.equal(s.registry.getMaterialSource(s.source), undefined);
});
check('world unknown close retains all source hazards and can later consume authentic release', () => {
    const s = setup();
    s.owner.close();
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
    assert.throws(() => s.registry.getOrRegisterMaterialWorld(s.worldIdentity));
    const proof = s.owner.confirmWorldReleased();
    s.owner.close(proof);
    s.owner.close();
    s.owner.close(proof);
    s.registry.assertMaterialBindingDestroyable(s.asset);
});
check('binding proof cannot masquerade as confirmed world release', () => {
    const s = setup();
    const proof = s.owner.confirmBindingReleased(s.lease);
    assert.throws(() => s.owner.close(proof));
    covered(s);
});
check('world proof cannot masquerade as exact binding release', () => {
    const s = setup();
    const proof = s.owner.confirmWorldReleased();
    assert.throws(() => s.registry.closeMaterialSource(s.lease, proof));
    covered(s);
});
check('same System source across world changes retains old generation hazard', () => {
    const s = setup({ role: 'default' });
    const newWorld = {};
    const newer = s.registry.registerMaterialSource({
        source: s.source,
        adapter: newWorld,
        world: s.registry.getOrRegisterMaterialWorld(newWorld),
        role: 'default',
        current: {},
        initialized: true,
        readActualCache: () => null,
    });
    assert.equal(s.registry.getMaterialSource(s.source), newer);
    assert.notEqual(newer, s.lease);
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'live');
});
check('raw asset-specific unknown blocks only matching B3 coverage', () => {
    const s = setup();
    const unrelated = {};
    s.registry.recordMaterialAcquisitionUnknown(unrelated);
    covered(s);
    s.registry.recordMaterialAcquisitionUnknown(s.asset);
    assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
});
check('raw asset marker remains legacy when no B3 hazard exists', () => {
    const s = setup({ foreign: true });
    s.registry.recordMaterialAcquisitionUnknown(s.asset);
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    assert.equal(lock.disposition, 'legacy');
    lock.close();
});
check('unknown acquisition without known asset sticky-blocks later B3 coverage', () => {
    const s = setup();
    s.registry.recordMaterialAcquisitionUnknown();
    assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
});
check('capacity exhaustion preserves indexed hazards and sticky coverage blocker', () => {
    const s = setup({ registry: new Registry({ counterLimit: 4 }) });
    assert.throws(() => s.registry.prepareBindingIdentity(s.lease, s.asset, {}, 'setter'));
    assert.equal(s.registry.diagnostics(s.lease).coveragePoisoned, true);
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
    assert.throws(() => s.registry.lockMaterialValuesCoverage(s.asset));
});
check('reduced limit validates finite safe positive count', () => {
    for (const counterLimit of [0, -1, NaN, Infinity, 1.5]) assert.throws(() => new Registry({ counterLimit }));
});
check('null default-dependent source cannot join a locked actual world', () => {
    const s = setup({ role: 'default' });
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    const result = thrown(() =>
        s.registry.registerMaterialSource({
            source: {},
            adapter: {},
            world: s.world,
            role: 'explicit',
            current: null,
            initialized: true,
            readActualCache: () => null,
        }),
    );
    assert.equal(result.threw, true);
    sameThrown(() => lock.assertValid(), result.error);
    lock.close();
});
check('global opaque acquisition rejects before effects while values are active', () => {
    const s = setup();
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    let effects = 0;
    const result = thrown(() => {
        s.registry.recordMaterialAcquisitionUnknown();
        ++effects;
    });
    assert.equal(result.threw, true);
    assert.equal(effects, 0);
    sameThrown(() => lock.assertValid(), result.error);
    lock.close();
});
check('forged capability refusal latches current values transaction even if caught', () => {
    const s = setup();
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    const result = thrown(() => s.registry.markMaterialSourceInitialized({}));
    assert.equal(result.threw, true);
    sameThrown(() => lock.assertValid(), result.error);
    lock.close();
});
function beginInitialization(s) {
    return s.registry.beginMaterialSourceInitialization(s.lease, s.source, s.adapter, s.worldIdentity);
}
check('initialization reads fixed private identity, never public material getters', () => {
    const source = {
        get sharedMaterial() {
            throw new Error('public getter must not run');
        },
        get material() {
            throw new Error('public clone getter must not run');
        },
    };
    const s = setup({ source, initialized: false });
    const scope = beginInitialization(s);
    assert(Object.isFrozen(scope));
    assert.equal(scope.readActualIdentity(), s.asset);
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'pending');
    assert.equal(s.registry.diagnostics(s.lease).initialized, false);
    scope.assertValid();
    scope.complete();
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'provisional');
    assert.equal(s.registry.diagnostics(s.lease).initialized, false);
    scope.close();
    scope.close();
    s.registry.markMaterialSourceInitialized(s.lease);
    s.row.initialized = true;
    covered(s);
});
for (const wrong of ['source', 'adapter', 'world', 'lease'])
    check(`initialization refuses wrong actual ${wrong}`, () => {
        const s = setup({ initialized: false });
        assert.throws(() =>
            s.registry.beginMaterialSourceInitialization(
                wrong === 'lease' ? {} : s.lease,
                wrong === 'source' ? {} : s.source,
                wrong === 'adapter' ? {} : s.adapter,
                wrong === 'world' ? {} : s.worldIdentity,
            ),
        );
        assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'provisional');
    });
check('initialization refuses historical source generation after same source replacement', () => {
    const s = setup({ initialized: false });
    const nextWorld = {},
        nextAdapter = {};
    s.registry.registerMaterialSource({
        source: s.source,
        adapter: nextAdapter,
        world: s.registry.getOrRegisterMaterialWorld(nextWorld),
        role: 'explicit',
        current: s.asset,
        readActualCache: () => s.asset,
    });
    assert.throws(() => beginInitialization(s));
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
});
for (const state of ['initialized', 'unknown', 'released', 'world-closed', 'pending'])
    check(`initialization refuses ${state} source state`, () => {
        const s = setup({ initialized: state === 'initialized' });
        if (state === 'unknown') s.registry.markMaterialSourceUnknown(s.lease);
        if (state === 'released') s.registry.closeMaterialSource(s.lease, s.owner.confirmBindingReleased(s.lease));
        if (state === 'world-closed') s.owner.close();
        if (state === 'pending') s.registry.prepareBindingIdentity(s.lease, s.asset, s.asset, 'existing');
        assert.throws(() => beginInitialization(s));
    });
check('initialization is owner-authorized and ordinary foreign-only values remain legacy', () => {
    const s = setup({ foreign: true, initialized: false });
    assert.throws(() => beginInitialization(s));
    const lock = s.registry.lockMaterialValuesCoverage(s.asset);
    assert.equal(lock.disposition, 'legacy');
    lock.close();
    s.registry.assertMaterialBindingDestroyable(s.asset);
});
check('initialization admits only exact owner declaration and claim during actual attach', () => {
    const s = setup({ initialized: false, declare: false });
    const scope = beginInitialization(s);
    s.owner.declareBinding(s.source, s.adapter, s.binding, 'explicit');
    s.owner.claim(s.lease, s.adapter, s.binding, 'explicit');
    scope.assertValid();
    scope.complete();
    scope.close();
    assert.equal(s.registry.diagnostics(s.lease).initialized, false);
    s.registry.markMaterialSourceInitialized(s.lease);
    s.row.initialized = true;
    covered(s);
});
for (const wrong of ['source', 'adapter', 'owner-world', 'role', 'claim-binding'])
    check(`initialization latches incorrect ${wrong} declaration or claim`, () => {
        const s = setup({ initialized: false });
        const other = setup({ registry: s.registry, initialized: false });
        const scope = beginInitialization(s);
        const result = thrown(() => {
            if (wrong === 'claim-binding') s.owner.claim(s.lease, s.adapter, {}, 'explicit');
            else
                (wrong === 'owner-world' ? other.owner : s.owner).declareBinding(
                    wrong === 'source' ? {} : s.source,
                    wrong === 'adapter' ? {} : s.adapter,
                    s.binding,
                    wrong === 'role' ? 'default' : 'explicit',
                );
        });
        assert.equal(result.threw, true);
        sameThrown(() => scope.assertValid(), result.error);
        assert.equal(scope.fail(0), result.error);
        scope.close();
        assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
    });
for (const [name, action] of Object.entries(lockedActions))
    check(`initialization latches swallowed ${name} before native acquisition`, () => {
        const s = setup({ initialized: false });
        const scope = beginInitialization(s);
        let native = 0;
        const result = thrown(() => action(s));
        assert.equal(result.threw, true);
        sameThrown(() => {
            scope.assertValid();
            ++native;
        }, result.error);
        assert.equal(native, 0);
        assert.equal(scope.fail(false), result.error);
        scope.close();
        assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
    });
check('initialization captures A-to-B-to-A transition attempts even when final cache equals A', () => {
    const s = setup({ initialized: false });
    const scope = beginInitialization(s);
    const b = {};
    const first = thrown(() => s.registry.prepareBindingIdentity(s.lease, s.asset, b, 'getter changes A to B'));
    s.setCurrent(b);
    const second = thrown(() => s.registry.prepareBindingIdentity(s.lease, b, s.asset, 'getter changes B to A'));
    s.setCurrent(s.asset);
    assert.equal(first.threw, true);
    assert.equal(second.threw, true);
    sameThrown(() => scope.assertValid(), first.error);
    assert.equal(scope.fail(second.error), first.error);
    scope.close();
});
check('coefficient getter swallowed values mutation cannot continue to native or publication', () => {
    let s, caught;
    const asset = {
        get friction() {
            caught = thrown(() => s.registry.lockMaterialValuesCoverage(asset));
            return 0.3;
        },
    };
    s = setup({ asset, initialized: false });
    const scope = beginInitialization(s);
    let native = 0;
    assert.equal(scope.readActualIdentity().friction, 0.3);
    assert.equal(caught.threw, true);
    sameThrown(() => {
        scope.assertValid();
        ++native;
        scope.complete();
    }, caught.error);
    assert.equal(native, 0);
    assert.equal(scope.fail('later error'), caught.error);
    scope.close();
});
check('initialization catches unrelated foreign values admission too without permanent foreign policy change', () => {
    const s = setup({ initialized: false });
    const f = foreign(s.registry, {});
    const scope = beginInitialization(s);
    const result = thrown(() => f.registry.lockMaterialValuesCoverage(f.asset));
    assert.equal(result.threw, true);
    sameThrown(() => scope.assertValid(), result.error);
    scope.fail(result.error);
    scope.close();
    const lock = f.registry.lockMaterialValuesCoverage(f.asset);
    assert.equal(lock.disposition, 'legacy');
    lock.close();
});
for (const first of [0, false, '', null, undefined])
    check(`initialization cleanup preserves coefficient getter failure ${String(first)}`, () => {
        const asset = {
            get friction() {
                throw first;
            },
        };
        const s = setup({ asset, initialized: false });
        const scope = beginInitialization(s);
        const result = thrown(() => scope.readActualIdentity().friction);
        assert.equal(result.threw, true);
        assert.equal(result.error, first);
        assert.equal(scope.fail(first), first);
        scope.close();
        scope.close();
        sameThrown(() => scope.assertValid(), first);
        assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
        assert.equal(s.registry.diagnostics(s.lease).initialized, false);
        assert.throws(() => s.registry.assertMaterialBindingDestroyable(asset));
        s.registry.closeMaterialSource(s.lease, s.owner.confirmBindingReleased(s.lease));
        s.registry.assertMaterialBindingDestroyable(asset);
    });
for (const first of [0, false, '', null, undefined])
    check(`initial private identity reader failure ${String(first)} closes scope and retains hazard`, () => {
        const s = setup({
            initialized: false,
            read() {
                throw first;
            },
        });
        sameThrown(() => beginInitialization(s), first);
        assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
        s.registry.closeMaterialSource(s.lease, s.owner.confirmBindingReleased(s.lease));
        s.registry.assertMaterialBindingDestroyable(s.asset);
    });
check('swallowed admission inside fixed private identity reader fails begin itself', () => {
    let s, caught;
    s = setup({
        initialized: false,
        read(current, registry) {
            caught = thrown(() => registry.markMaterialSourceInitialized(s.lease));
            return current();
        },
    });
    const result = thrown(() => beginInitialization(s));
    assert.equal(result.threw, true);
    assert.equal(result.error, caught.error);
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
    assert.equal(s.registry.diagnostics(s.lease).initialized, false);
    s.registry.closeMaterialSource(s.lease, s.owner.confirmBindingReleased(s.lease));
});
check('even exact owner declaration reentry inside fixed reader latches failure', () => {
    let s, caught;
    s = setup({
        initialized: false,
        read(current) {
            caught = thrown(() => s.owner.declareBinding(s.source, s.adapter, s.binding, 'explicit'));
            return current();
        },
    });
    const result = thrown(() => beginInitialization(s));
    assert.equal(result.threw, true);
    assert.equal(result.error, caught.error);
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
});
check('initial private cache drift preserves old and newly observed actual hazards', () => {
    const s = setup({ initialized: false });
    const next = {};
    s.setCurrent(next);
    assert.throws(() => beginInitialization(s));
    assert.equal(s.registry.diagnostics(s.lease).hazards, 2);
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(next));
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
});
check('assertValid before native rejects private cache drift without native effects', () => {
    const s = setup({ initialized: false });
    const scope = beginInitialization(s);
    const next = {};
    s.setCurrent(next);
    let native = 0;
    assert.throws(() => {
        scope.assertValid();
        ++native;
    });
    assert.equal(native, 0);
    scope.close();
    assert.equal(s.registry.diagnostics(s.lease).hazards, 2);
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
});
check('assertValid after native detects drift and blocks publication while preserving hazards', () => {
    const s = setup({ initialized: false });
    const scope = beginInitialization(s);
    let native = 0;
    scope.assertValid();
    ++native;
    const next = {};
    s.setCurrent(next);
    const result = thrown(() => scope.assertValid());
    assert.equal(result.threw, true);
    sameThrown(() => scope.complete(), result.error);
    assert.equal(scope.fail(result.error), result.error);
    scope.close();
    assert.equal(native, 1);
    assert.equal(s.registry.diagnostics(s.lease).hazards, 2);
});
check('complete independently revalidates before metadata publication', () => {
    const s = setup({ initialized: false });
    const scope = beginInitialization(s);
    s.setCurrent({});
    assert.throws(() => scope.complete());
    scope.close();
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
});
check('unfinished initialization close conservatively retains unknown and releases its admission guard', () => {
    const s = setup({ initialized: false });
    const scope = beginInitialization(s);
    scope.close();
    scope.close();
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
    assert.equal(s.registry.diagnostics(s.lease).initialized, false);
    s.registry.closeMaterialSource(s.lease);
    const proof = s.owner.confirmBindingReleased(s.lease);
    s.registry.closeMaterialSource(s.lease, proof);
});
check('completed initialization keeps admission guard until finally close', () => {
    const s = setup({ initialized: false });
    const scope = beginInitialization(s);
    scope.complete();
    const result = thrown(() => s.registry.markMaterialSourceInitialized(s.lease));
    assert.equal(result.threw, true);
    assert.equal(scope.fail(result.error), result.error);
    scope.close();
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
});
check('initialization receiver and single-use complete authority cannot be borrowed or replayed', () => {
    const s = setup({ initialized: false });
    const scope = beginInitialization(s);
    const result = thrown(() => scope.assertValid.call({}));
    assert.equal(result.threw, true);
    assert.equal(scope.fail(result.error), result.error);
    scope.close();
    const t = setup({ initialized: false });
    const second = beginInitialization(t);
    second.complete();
    assert.throws(() => second.complete());
    second.close();
    assert.equal(t.registry.diagnostics(t.lease).lifecycle, 'unknown');
});
check('private reader cannot swallow reentrant scope close to bypass pending initialization', () => {
    let scope, caught;
    const s = setup({
        initialized: false,
        read(current) {
            if (scope) caught = thrown(() => scope.close());
            return current();
        },
    });
    scope = beginInitialization(s);
    const result = thrown(() => scope.readActualIdentity());
    assert.equal(result.threw, true);
    assert.equal(result.error, caught.error);
    scope.close();
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'unknown');
});
check('initialization rejects superseded actual owner generation even with retained old source', () => {
    const ownerIdentity = {};
    const s = setup({ ownerIdentity, initialized: false });
    setup({ registry: s.registry, ownerIdentity, generation: 2, initialized: false });
    assert.throws(() => beginInitialization(s));
    assert.equal(s.registry.diagnostics(s.lease).lifecycle, 'provisional');
    assert.throws(() => s.registry.assertMaterialBindingDestroyable(s.asset));
});
const summary = {
    kind: 'PURE_PROTOCOL_ONLY',
    pass: results.filter((item) => item.status !== 'FAIL').length,
    fail: results.filter((item) => item.status === 'FAIL').length,
    total: results.length,
    formalCells: { count: 2128, status: 'NOT_RUN' },
    nineGates: 'UNPASSED',
    stagedCommandsSupported: false,
    unifiedTransactionsSupported: false,
    realAdapterCoverage: 'NOT_CLAIMED',
    results,
};
await writeFile(path.join(out, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, total: summary.total, evidence: out }));
for (const result of results) if (result.status === 'FAIL') console.error(`${result.name}\n${result.stack}`);
process.exitCode = summary.fail ? 1 : 0;
