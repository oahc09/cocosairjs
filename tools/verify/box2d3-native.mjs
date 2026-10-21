/* Regression controls against the actual pinned WASM bridge; no mocked physics.
 * node tools/verify/box2d3-native.mjs [--runtime=/absolute/runtime/directory] */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtime =
    process.argv.find((arg) => arg.startsWith('--runtime='))?.slice('--runtime='.length) ??
    path.join(root, 'vendor/box2d/runtime');
const { default: factory } = await import(pathToFileURL(path.join(runtime, 'air-box2d.mjs')));
const rows = [];
async function test(name, run) {
    const api = await factory({ wasmBinary: fs.readFileSync(path.join(runtime, 'air-box2d.wasm')) });
    try {
        rows.push({ name, pass: true, data: await run(api) });
    } catch (error) {
        rows.push({ name, pass: false, error: String(error) });
        process.exitCode = 1;
    }
}
const square = [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
];
await test('point/AABB ignore collision masks; rays use only caller mask and shape category', (api) => {
    const w = api.createWorld({ x: 0, y: 0 }, () => ({}));
    const body = api.createBody(w, { type: 0 });
    const shape = api.createShape(body, 'circle', { radius: 1, category: 2, mask: 2, sensor: true });
    const query = () => {
        assert.deepEqual(api.query(w, 'point', { x: 0, y: 0 }), [shape]);
        assert.deepEqual(api.query(w, 'aabb', { x: -0.5, y: -0.5, maxX: 0.5, maxY: 0.5 }), [shape]);
        const ray = api.query(w, 'ray', { x: -2, y: 0, dx: 4, dy: 0, mask: 2 });
        assert.equal(ray.length, 1);
        assert.equal(ray[0].shape, shape);
        assert.equal(ray[0].fraction, 0.25);
        assert.deepEqual(api.query(w, 'ray', { x: -2, y: 0, dx: 4, dy: 0, mask: 1 }), []);
        assert.deepEqual(api.query(w, 'ray', { x: -2, y: 0, dx: 4, dy: 0, mask: 0 }), []);
    };
    query();
    api.shapeFilter(shape, 2, 0);
    query();
    api.bodyCommand(body, 'active', { value: 0 });
    assert.deepEqual(api.query(w, 'point', { x: 0, y: 0 }), []);
    assert.deepEqual(api.query(w, 'aabb', { x: -2, y: -2, maxX: 2, maxY: 2 }), []);
    assert.deepEqual(api.query(w, 'ray', { x: -2, y: 0, dx: 4, dy: 0, mask: 2 }), []);
    api.bodyCommand(body, 'active', { value: 1 });
    query();
    const other = api.createWorld({ x: 0, y: 0 }, () => ({}));
    assert.deepEqual(api.query(other, 'point', { x: 0, y: 0 }), []);
    api.destroyWorld(other);
    api.shapeFilter(shape, 0x80000000, 0);
    assert.equal(api.query(w, 'ray', { x: -2, y: 0, dx: 4, dy: 0, mask: 0x80000000 }).length, 1);
    api.destroyWorld(w);
    return { masks: [2, 0], sensor: true, disabledExcluded: true, highCategoryBit: true };
});
await test('all spatial queries are safe inside native pre-solve and preserve subsequent steps', (api) => {
    let calls = 0;
    const w = api.createWorld({ x: 0, y: -10 }, () => {
        assert(api.query(w, 'point', { x: 0, y: 0 }).includes(floor));
        assert(api.query(w, 'aabb', { x: -1, y: -1, maxX: 1, maxY: 1 }).includes(floor));
        assert(api.query(w, 'ray', { x: -3, y: 0, dx: 6, dy: 0, mask: 1 }).some((r) => r.shape === floor));
        calls++;
        return {};
    });
    const floor = api.createShape(api.createBody(w, { type: 0 }), 'polygon', { points: square });
    api.createShape(api.createBody(w, { type: 2, y: 2 }), 'polygon', { points: square });
    for (let i = 0; i < 10; i++) api.step(w, 1 / 60, 4);
    assert(calls > 0);
    api.destroyWorld(w);
    return { callbacks: calls, subsequentSteps: 10 };
});
await test('sleep snapshots retain contacts without replaying solver impulses, including final sleep tick', (api) => {
    const w = api.createWorld({ x: 0, y: -10 }, () => ({}));
    api.createShape(api.createBody(w, { type: 0 }), 'polygon', { points: square });
    const body = api.createBody(w, { type: 2, y: 4 });
    const shape = api.createShape(body, 'polygon', { points: square });
    let ticks = 0;
    while (api.bodyState(body).awake && ticks++ < 600) api.step(w, 1 / 60, 4);
    assert(!api.bodyState(body).awake, 'fixture must reach native sleep');
    let contacts = api.contacts(w);
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].solved, true, 'last step before sleep must still emit POST');
    for (let i = 0; i < 60; i++) {
        api.step(w, 1 / 60, 4);
        contacts = api.contacts(w);
        assert.equal(contacts.length, 1, 'sleep must not look like END');
        assert.equal(contacts[0].solved, false, 'retained impulse is not a new solve');
    }
    api.bodyCommand(body, 'awake', { value: 1 });
    api.step(w, 1 / 60, 4);
    assert.equal(api.contacts(w)[0].solved, true, 'wake resumes solving');
    api.step(w, 0, 4);
    assert.equal(api.contacts(w)[0].solved, false, 'zero duration does not solve');
    api.shapeFilter(shape, 2, 0);
    api.step(w, 1 / 60, 4);
    assert.equal(api.contacts(w).length, 0, 'filter changes still end the contact');
    api.destroyWorld(w);
    return { ticksToSleep: ticks, silentSleepSteps: 60, finalSleepStep: true, wake: true, filterEnd: true };
});
console.log(JSON.stringify({ pass: rows.every((row) => row.pass), rows }, null, 2));
