/** Narrow CPU/VM checks only; no SDK, browser, physics, or whole-round acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { transformSync } from 'esbuild';
import * as prettier from 'prettier';
import { captureReportText } from '../../../../examples/box3d-gift-workshop/src/report-export.mjs';
import { createCommittedMotionObserver } from '../../../../examples/box3d-gift-workshop/src/committed-motion-observation.mjs';
// Only the enumerated admission delta is removed; historical baseline SHA values stay unchanged.
const admissionDelta = JSON.parse(readFileSync(new URL('./fixtures/sdk223-admission-delta.json', import.meta.url)));
function beforeAdmission(path, text) {
    for (const { before, after } of admissionDelta[path] || []) {
        assert.ok(after.length > 0);
        assert.equal(text.split(after).length, 2, 'exact unique admission delta: ' + path);
        text = text.replace(after, before);
    }
    return text;
}
const mainPath = 'examples/box3d-gift-workshop/src/main.ts';
const main = readFileSync(new URL('../../../../' + mainPath, import.meta.url), 'utf8');
const start = '    // Independent read-only export:';
const end = "    Object.defineProperty(window, '__BOX3D_GIFT_WORKSHOP__', {";
const handler = main.slice(main.indexOf(start), main.indexOf(end));
function harness(observe, download) {
    const button = { disabled: true };
    const state = { reads: 0, downloads: [], messages: [], timers: [] };
    vm.runInNewContext(handler, {
        el: (id) => {
            assert.equal(id, 'export-committed-motion');
            return button;
        },
        say: (id, text) => {
            assert.equal(id, 'committed-motion-export-status');
            state.messages.push(text);
        },
        observeCommittedMotionV1: () => {
            state.reads++;
            return observe();
        },
        captureReportText,
        Blob,
        downloadReportBlob: (blob, filename) => {
            state.downloads.push({ blob, filename });
            download?.();
        },
        setTimeout: (callback, delay) => {
            assert.equal(delay, 500);
            state.timers.push(callback);
        },
    });
    return { button, state, click: () => button.onclick(), release: () => state.timers.shift()() };
}
const snapshot = () => ({
    ok: true,
    pendingSdkWrites: 'unknown',
    guaranteedNoPendingWrites: false,
    scope: { roundGeneration: 2, activeTick: 17 },
    head: { position: { x: 1 } },
    items: [],
});
test('one getter read, detached JSON, identity filename, unknown retained, duplicate clicks blocked', async () => {
    const value = snapshot();
    const ui = harness(() => value);
    assert.equal(ui.button.disabled, false);
    ui.click();
    ui.click();
    assert.equal(ui.state.reads, 1);
    assert.equal(ui.state.downloads.length, 1);
    assert.equal(ui.button.disabled, true);
    const { blob, filename } = ui.state.downloads[0];
    assert.equal(filename, 'EX09-committed-motion-g2-t17.json');
    assert.equal(blob.type, 'application/json');
    value.head.position.x = 900;
    const exported = JSON.parse(await blob.text());
    assert.equal(exported.head.position.x, 1);
    assert.equal(exported.pendingSdkWrites, 'unknown');
    assert.equal(exported.guaranteedNoPendingWrites, false);
    assert.match(ui.state.messages.at(-1), /已请求下载.*unknown.*不是原生 idle/);
    ui.release();
    assert.equal(ui.button.disabled, false);
    ui.click();
    assert.equal(ui.state.reads, 2);
});
test('all observer rejection reasons stay visible without download or retry', () => {
    for (const reason of [
        'running',
        'closed',
        'app-boundary-unavailable',
        'uninitialized',
        'invalid-app-stamp',
        'invalid-item-scope',
        'invalid-held-scope',
        'stale-app-scope',
        'mass-pending-or-unavailable',
        'public-read-unavailable',
    ]) {
        const ui = harness(() => ({ ok: false, reason }));
        ui.click();
        ui.click();
        assert.equal(ui.state.reads, 1);
        assert.equal(ui.state.downloads.length, 0);
        assert.ok(ui.state.messages[0].includes(reason));
        assert.match(ui.state.messages[0], /未下载.*手动暂停/);
        ui.release();
        assert.equal(ui.button.disabled, false);
    }
});
test('getter, serialization and download failures remain recoverable', () => {
    for (const phase of ['getter', 'serialization', 'download']) {
        const ui = harness(
            () => {
                if (phase === 'getter') throw new Error('getter failed');
                const value = snapshot();
                if (phase === 'serialization') value.circular = value;
                return value;
            },
            () => {
                if (phase === 'download') throw new Error('download failed');
            },
        );
        ui.click();
        assert.match(ui.state.messages[0], /只读状态导出失败/);
        ui.release();
        assert.equal(ui.button.disabled, false);
    }
});
test('real observer refuses running/system-enabled and stale scope; export makes no body writes', () => {
    const c = {
        scene: {},
        flow: {},
        system: {},
        world: {},
        headBody: {},
        items: [],
        paused: true,
        systemEnabled: false,
        roundGeneration: 1,
        appObservedNativeTick: 1,
        activeTick: 1,
        inputGeneration: 1,
        heldEpoch: 0,
        state: 'ACTIVE',
        configVersion: 'test',
    };
    let reads = 0;
    const vector = Object.freeze({ x: 0, y: 0, z: 0 });
    const motion = Object.freeze({
        position: vector,
        rotation: Object.freeze({ ...vector, w: 1 }),
        worldCOM: vector,
        localCenter: vector,
        linearVelocity: vector,
        angularVelocity: vector,
        mass: 1,
        enabled: true,
        type: 1,
        massPending: false,
    });
    const observer = createCommittedMotionObserver({
        context: () => ({ ...c }),
        readMotion: () => {
            reads++;
            return motion;
        },
    });
    for (const mode of ['running', 'enabled', 'paused']) {
        c.paused = mode !== 'running';
        c.systemEnabled = mode === 'enabled';
        const ui = harness(observer);
        ui.click();
        assert.equal(ui.state.downloads.length, mode === 'paused' ? 1 : 0);
    }
    assert.equal(reads, 1);
    let contexts = 0;
    const stale = createCommittedMotionObserver({
        context: () => ({ ...c, roundGeneration: ++contexts }),
        readMotion: () => motion,
    });
    const ui = harness(stale);
    ui.click();
    assert.equal(ui.state.downloads.length, 0);
    assert.match(ui.state.messages[0], /stale-app-scope/);
});
test('source guard: additive binding only, baseline main/HTML preserved, report formatting proven and observer untouched', async () => {
    assert.equal(main.split(start).length, 2);
    assert.equal((handler.match(/observeCommittedMotionV1\(\)/g) || []).length, 1);
    assert.doesNotMatch(handler, /\b(?:pause|reset|step|flush|synchronize|report|applyActions|command)\s*\(/);
    assert.doesNotMatch(handler, /(?:transport|system|flow|input|scene|replay|observationTrace)\s*\./);
    // Exact byte digests of the delivered LOCAL snapshot 4f9f5cf, not upstream Git history.
    const baseline = {
        'examples/box3d-gift-workshop/src/main.ts': '4823be524588d0fa15790712aebdc10de1901c6cdb2b4d93419153198df031d1',
        'examples/box3d-gift-workshop/index.html': '33f1944149a6c0fe4e4f472041654ac72bfce5cdd8ccd36658679c5c7f9bb588',
        'examples/box3d-gift-workshop/src/report-export.mjs':
            'ed1a58a03c9098e69104583e4c751d2824d14ebea8d61b13f69039b8b0676b24',
        'examples/box3d-gift-workshop/src/committed-motion-observation.mjs':
            '83126a31256b3daf2592455cbc3a5685cc4e466ecde970c438a9586495587d02',
        'examples/box3d-gift-workshop/serve.cjs': '512109b84b158b7f135efd4bf806bd27001d9e5893a7c7424e49b52e4b01b381',
    };
    const digest = (text) => createHash('sha256').update(text).digest('hex');
    assert.equal(digest(beforeAdmission(mainPath, main).replace(handler, '')), baseline[mainPath]);
    const htmlPath = 'examples/box3d-gift-workshop/index.html';
    const html = readFileSync(new URL('./fixtures/delivered-index.html.txt', import.meta.url), 'utf8');
    assert.equal(digest(html), '228a0bd3aaed933babe08d8c6c34836c791d17f0f6287e3a40aa046663f242dd');
    assert.equal(prettier.version, '3.9.9');
    const config = JSON.parse(readFileSync('.prettierrc.json', 'utf8'));
    assert.equal(readFileSync(htmlPath, 'utf8'), await prettier.format(html, { ...config, filepath: htmlPath }));
    assert.equal((html.match(/id="export-committed-motion"/g) || []).length, 1);
    assert.match(html, /id="export-committed-motion" disabled/);
    assert.equal(
        digest(
            html
                .replace(
                    '\n                    <button id="export-committed-motion" disabled>导出当前已提交状态</button>',
                    '',
                )
                .replace(
                    '\n                <small id="committed-motion-export-status" role="status">请先手动暂停；只读快照不证明 SDK 无待写入。</small>',
                    '',
                ),
        ),
        baseline[htmlPath],
    );
    const reportPath = 'examples/box3d-gift-workshop/src/report-export.mjs';
    const originalReport = readFileSync(new URL('./fixtures/delivered-report-export.mjs.txt', import.meta.url), 'utf8');
    assert.equal(digest(originalReport), baseline[reportPath]);
    assert.equal(
        readFileSync(reportPath, 'utf8'),
        await prettier.format(originalReport, { ...config, filepath: reportPath }),
    );
    for (const path of ['src/committed-motion-observation.mjs', 'serve.cjs']) {
        const full = 'examples/box3d-gift-workshop/' + path;
        assert.equal(digest(beforeAdmission(full, readFileSync(full, 'utf8'))), baseline[full]);
    }
});
test('esbuild transforms entire main.ts without SDK build', () => {
    const result = transformSync(main, { loader: 'ts', format: 'esm', target: 'es2022' });
    assert.equal(result.warnings.length, 0);
    assert.match(result.code, /observeCommittedMotionV1/);
});
