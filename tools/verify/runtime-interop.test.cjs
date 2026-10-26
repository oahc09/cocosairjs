const test = require('node:test');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { CASE_IDS, parseArgs, probesPassed, verifyPresentation, withDeadline } = require('./runtime-interop.cjs');
const { SCENE_IDS, matrixPassed } = require('./runtime-interop/scene-contract.cjs');
const { verifyScenePresentation } = require('./runtime-interop/scene-oracles.cjs');
const android = require('./runtime-interop-android.cjs');

test('Android screenshot crop preserves actual screen coordinates and rejects out-of-screen bounds', () => {
    const screen = new PNG({ width: 40, height: 30 });
    screen.data.fill(0);
    screen.data.set([23, 45, 67, 255], (9 * 40 + 14) * 4);
    const bytes = PNG.sync.write(screen);
    const crop = PNG.sync.read(android.cropScreen(bytes, { x: 14, y: 9, width: 8, height: 6 }));
    assert.deepEqual([...crop.data.subarray(0, 4)], [23, 45, 67, 255]);
    assert.equal(crop.width, 8);
    assert.equal(crop.height, 6);
    assert.throws(() => android.cropScreen(bytes, { x: 39, y: 0, width: 8, height: 6 }), /bounds/);
    assert.throws(
        () =>
            android.parseArgs([
                '--serial=x',
                '--apk=x',
                '--assets=x',
                '--out=x',
                '--build-report=x',
                '--case=air',
                '--matrix',
            ]),
        /cannot be combined/,
    );
});

test('complete behavior contract rejects omitted, duplicate, incomplete and unexecuted results', () => {
    const result = () => ({
        schema: 'air-runtime-interop-probes-v1',
        completed: true,
        pass: true,
        cases: CASE_IDS.map((id) => ({ id, status: 'PASS' })),
    });
    assert.equal(probesPassed(result()), true);
    for (const alter of [
        (r) => r.cases.pop(),
        (r) => {
            r.cases[4] = r.cases[0];
        },
        (r) => {
            r.completed = false;
        },
        (r) => {
            r.cases[3].status = 'NOT_RUN';
        },
        (r) => {
            r.cases[3].status = 'BLOCKED';
        },
    ]) {
        const r = result();
        alter(r);
        assert.equal(probesPassed(r), false);
    }
});

test('independent PNG oracle rejects a clear-only image and reversed colors', () => {
    const png = new PNG({ width: 32, height: 32 });
    function fill(subject) {
        for (let y = 0; y < 32; y++)
            for (let x = 0; x < 32; x++) {
                const rgba = subject && x >= 8 && x < 24 && y >= 8 && y < 24 ? [255, 0, 0, 255] : [0, 0, 255, 255];
                png.data.set(rgba, (y * 32 + x) * 4);
            }
        return PNG.sync.write(png);
    }
    assert.equal(verifyPresentation(fill(false), 'probes').pass, false);
    assert.equal(verifyPresentation(fill(true), 'probes').pass, true);
    assert.equal(verifyPresentation(fill(true), 'air').pass, true);
    for (let i = 0; i < png.data.length; i += 4) [png.data[i], png.data[i + 2]] = [png.data[i + 2], png.data[i]];
    assert.equal(verifyPresentation(PNG.sync.write(png), 'probes').pass, false);
});

test('host deadline bounds a hung operation outside the page and retains operation errors', async () => {
    await assert.rejects(
        withDeadline(() => new Promise(() => {}), 20, 'hung host'),
        /hung host exceeded/,
    );
    await assert.rejects(
        withDeadline(
            () => {
                throw Error('real failure');
            },
            1000,
            'host',
        ),
        /real failure/,
    );
    assert.equal(await withDeadline(() => Promise.resolve(7), 1000, 'host'), 7);
});

test('CLI refuses ambiguous host selection and native runs without an executable', () => {
    assert.equal(parseArgs(['--out=output/interop']).host, 'browser');
    assert.throws(() => parseArgs(['--out=x', '--host=mystral']), /executable/);
    assert.throws(() => parseArgs(['--out=x', '--host=unknown']), /host/);
    assert.throws(() => parseArgs(['--out=x', '--host-build=build.json']), /host=mystral/);
    assert.throws(() => parseArgs(['--out=x', '--out=y']), /Duplicate/);
    assert.throws(() => parseArgs(['--out=x', '--capture-executable=capture.exe']), /mystral --headed/);
    assert.throws(
        () => parseArgs(['--out=x', '--host=mystral', '--executable=host.exe', '--capture-executable=capture.exe']),
        /headed/,
    );
    assert.equal(
        parseArgs([
            '--out=x',
            '--host=mystral',
            '--executable=host.exe',
            '--headed',
            '--capture-executable=capture.exe',
        ])['capture-executable'],
        'capture.exe',
    );
});

test('matrix contract requires every scene and both independent capture phases', async () => {
    const runner = await import('./runtime-interop/scene-runner.mjs');
    assert.deepEqual([...runner.SCENE_IDS], [...SCENE_IDS]);
    const values = Object.fromEntries(
        SCENE_IDS.map((id) => [
            `scene-${id}`,
            {
                id: `scene-${id}`,
                status: 'PASS',
                observations: {
                    gpuErrors: [],
                    cleanup: { release: { status: 'released' } },
                    presentation: { before: { pass: true }, after: { pass: true } },
                },
            },
        ]),
    );
    assert.equal(matrixPassed(values), true);
    delete values['scene-skin'].observations.presentation.after;
    assert.equal(matrixPassed(values), false);
    delete values['scene-compute'];
    assert.equal(matrixPassed(values), false);
});

test('scene PNG oracle rejects unchanged effects and UI with only a changing sprite', () => {
    const png = new PNG({ width: 320, height: 240 });
    const fill = (color) => {
        for (let i = 0; i < png.data.length; i += 4) png.data.set([20, 40, 80, 255], i);
        for (let y = 137; y < 193; y++) for (let x = 80; x < 240; x++) png.data.set(color, (y * 320 + x) * 4);
        return PNG.sync.write(png);
    };
    const before = fill([40, 100, 220, 255]);
    const after = fill([230, 70, 40, 255]);
    assert.equal(verifyScenePresentation(before, 'scene-skin', { phase: 'before' }).pass, true);
    assert.equal(verifyScenePresentation(before, 'scene-skin', { phase: 'after', previousBytes: before }).pass, false);
    assert.equal(verifyScenePresentation(before, 'scene-pbr', { phase: 'before' }).pass, false);
    assert.equal(verifyScenePresentation(after, 'scene-ui', { phase: 'after', previousBytes: before }).pass, false);
    fill([40, 100, 220, 255]);
    for (let y = 50; y < 60; y++) for (let x = 50; x < 60; x++) png.data.set([255, 255, 255, 255], (y * 320 + x) * 4);
    assert.equal(verifyScenePresentation(PNG.sync.write(png), 'scene-ui', { phase: 'before' }).pass, true);
    for (let y = 137; y < 193; y++)
        for (let x = 80; x < 240; x++) if (x >= 218 || y >= 185) png.data.set([20, 40, 80, 255], (y * 320 + x) * 4);
    assert.equal(verifyScenePresentation(PNG.sync.write(png), 'scene-ui', { phase: 'before' }).pass, false);
});
