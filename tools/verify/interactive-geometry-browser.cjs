'use strict';
// IER-04 geometry browser collector (review revision).
// Independent recomputation from raw uploads + recorded camera; live-resize rows carry real
// measured values (over-budget rows stay FAIL); WebKit live-resize rendering block is recorded
// with minimal evidence. Pure gates + require.main guard.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { validateEvidence } = require('./interactive-improvement-evidence.cjs');
const { launchOptions } = require('./browser-engines.cjs');

const ROOT = path.resolve(__dirname, '../..');
const INPUTS = [
    'build/cocosair.module.js',
    'build/cocosair.module.d.ts',
    'examples/interactive-geometry/src/main.ts',
    'examples/interactive-geometry/src/geometry-contract.ts',
    'examples/interactive-geometry/index.html',
    'tools/verify/interactive-geometry-browser.cjs',
    'tools/verify/interactive-improvement-evidence.cjs',
    'tools/verify/interactive-geometry-browser.tsconfig.json',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
    'examples/shared/asset-lifecycle.js',
    'examples/shared/asset-lifecycle.d.ts',
    'tools/verify/interactive-geometry-audit.cjs',
];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function fingerprint(file) {
    const b = fs.readFileSync(path.resolve(ROOT, file));
    return { path: file, bytes: b.length, sha256: sha(b) };
}
const PAGE_VIEWPORT = { width: 640, height: 400 };
const CAMS = ['default', 'low', 'oblique'];
const DPRS = [1, 1.25, 2];
const PROJS = ['persp', 'ortho'];
/** Every engine covers the FULL frozen matrix: baseline + LIVE resize + offset. */
function planFor() {
    const rows = [];
    for (const projection of PROJS) {
        for (const dpr of DPRS) {
            for (const cam of CAMS) {
                rows.push({ projection, dpr, cam, caseType: 'cut' });
                rows.push({ projection, dpr, cam, caseType: 'resized' }); // live resize, same page
            }
        }
    }
    rows.push({ projection: 'persp', dpr: 1, cam: 'default', caseType: 'offset' });
    return rows;
}
const GESTURE = { a: { x: 200, y: 130 }, b: { x: 430, y: 260 } };
const GESTURE_RESIZED = { a: { x: 150, y: 100 }, b: { x: 360, y: 210 } };
const CUT_ERROR_BUDGET = 0.15; // frozen new-example design target
const BLADE_ERROR_BUDGET = 1.5;
const RIBBON_MIN_MOVED_PX = 0.5;

function finiteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

/** Independent world→CSS projection from the recorded camera evidence (bottom-up screen). */
function projectWorldToCss(world, camera) {
    if (!world || ![world.x, world.y, world.z].every(finiteNumber) || !camera) return null;
    const m = camera.viewProjection;
    if (!Array.isArray(m) || m.length !== 16) return null;
    const [x, y, z] = [world.x, world.y, world.z];
    // cocos Mat4 named fields m00..m15 map to COLUMN-major storage: clip = M * [x,y,z,1]
    const clipW = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (Math.abs(clipW) < 1e-9) return null;
    const clipX = (m[0] * x + m[4] * y + m[8] * z + m[12]) / clipW;
    const clipY = (m[1] * x + m[5] * y + m[9] * z + m[13]) / clipW;
    const vp = camera.viewport;
    const backing = camera.backing;
    const cssSize = camera.cssSize;
    const screenX = (vp.x + ((clipX + 1) / 2) * vp.width) * backing.width;
    const screenY = (vp.y + ((clipY + 1) / 2) * vp.height) * backing.height;
    const scaleX = backing.width / cssSize.width;
    const scaleY = backing.height / cssSize.height;
    return { x: screenX / scaleX, y: (backing.height - screenY) / scaleY };
}
/** Center line of an uploaded quad + node translation → world endpoints. */
function uploadedCenterLine(upload) {
    const p = upload.positions;
    const t = upload.nodeTranslation ?? [0, 0, 0];
    if (!Array.isArray(p) || p.length < 12 || p.length % 3 !== 0) return null;
    const at = (i) => ({ x: p[i * 3] + t[0], y: p[i * 3 + 1] + t[1], z: p[i * 3 + 2] + t[2] });
    const a = at(0),
        b = at(1),
        c = at(2),
        d = at(3);
    return [
        { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, z: (a.z + c.z) / 2 },
        { x: (b.x + d.x) / 2, y: (b.y + d.y) / 2, z: (b.z + d.z) / 2 },
    ];
}
function pointToSegmentDistance(point, a, b) {
    const abx = b.x - a.x,
        aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) return Math.hypot(point.x - a.x, point.y - a.y);
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / len2));
    return Math.hypot(point.x - (a.x + abx * t), point.y - (a.y + aby * t));
}
/** Perpendicular distance to the infinite line a-b (cut vertices lie on the extended line). */
function pointToLineDistance(point, a, b) {
    const abx = b.x - a.x,
        aby = b.y - a.y;
    const len = Math.hypot(abx, aby);
    if (len === 0) return Math.hypot(point.x - a.x, point.y - a.y);
    return Math.abs((point.x - a.x) * aby - (point.y - a.y) * abx) / len;
}
/** Recompute all three object errors from raw evidence; never trusts reported scalars.
 *  Total: any non-finite value, malformed array, or missing identity returns a structured
 *  rejection — NaN comparisons can never let a record through. */
function recomputeErrors(record) {
    const camera = record?.modelState?.raw?.camera;
    const uploads = record?.modelState?.raw?.uploads;
    const cssLine = record?.modelState?.raw?.cssLine;
    if (
        !camera ||
        !uploads ||
        !Array.isArray(cssLine) ||
        cssLine.length !== 2 ||
        !cssLine.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    ) {
        return { ok: false, reason: 'raw evidence missing or cssLine malformed' };
    }
    if (
        !Array.isArray(camera.viewProjection) ||
        camera.viewProjection.length !== 16 ||
        !camera.viewProjection.every((v) => Number.isFinite(v))
    )
        return { ok: false, reason: 'camera matrix non-finite' };
    if (
        !camera.viewport ||
        ![camera.viewport.x, camera.viewport.y, camera.viewport.width, camera.viewport.height].every(Number.isFinite)
    ) {
        return { ok: false, reason: 'camera viewport non-finite' };
    }
    if (
        !camera.backing ||
        ![camera.backing.width, camera.backing.height].every((v) => Number.isInteger(v) && v > 0) ||
        !camera.cssSize ||
        ![camera.cssSize.width, camera.cssSize.height].every((v) => Number.isFinite(v) && v > 0)
    ) {
        return { ok: false, reason: 'camera backing/cssSize invalid' };
    }
    const out = {};
    for (const key of ['stroke', 'cut', 'blade']) {
        const upload = uploads[key];
        if (
            !upload ||
            !Array.isArray(upload.positions) ||
            upload.positions.length < 12 ||
            upload.positions.length % 3 !== 0 ||
            !upload.positions.every(Number.isFinite)
        ) {
            return { ok: false, reason: `${key} upload malformed/non-finite` };
        }
        if (
            !Array.isArray(upload.indices16) ||
            upload.indices16.length === 0 ||
            !upload.indices16.every((v) => Number.isInteger(v) && v >= 0 && v < upload.positions.length / 3)
        ) {
            return { ok: false, reason: `${key} indices malformed` };
        }
        if (
            !Array.isArray(upload.nodeTranslation) ||
            upload.nodeTranslation.length !== 3 ||
            !upload.nodeTranslation.every(Number.isFinite)
        )
            return { ok: false, reason: `${key} nodeTranslation invalid` };
    }
    // stroke: two-side midpoint centerline (its own explicit definition)
    {
        const line = uploadedCenterLine(uploads.stroke);
        if (!line) return { ok: false, reason: 'stroke centerline degenerate' };
        const p0 = projectWorldToCss(line[0], camera);
        const p1 = projectWorldToCss(line[1], camera);
        if (!p0 || !p1 || ![p0.x, p0.y, p1.x, p1.y].every(Number.isFinite))
            return { ok: false, reason: 'stroke projection degenerate' };
        out.stroke = [
            Math.hypot(p0.x - cssLine[0].x, p0.y - cssLine[0].y),
            Math.hypot(p1.x - cssLine[1].x, p1.y - cssLine[1].y),
        ];
    }
    // cut: PER-VERTEX projection of every actual uploaded cut vertex onto the received input
    // line (point-to-segment). A broad quad can never pass via its centerline.
    {
        const t = uploads.cut.nodeTranslation;
        const errors = [];
        for (let i = 0; i < uploads.cut.positions.length / 3; i++) {
            const world = {
                x: uploads.cut.positions[i * 3] + t[0],
                y: uploads.cut.positions[i * 3 + 1] + t[1],
                z: uploads.cut.positions[i * 3 + 2] + t[2],
            };
            const css = projectWorldToCss(world, camera);
            if (!css || !Number.isFinite(css.x) || !Number.isFinite(css.y))
                return { ok: false, reason: `cut vertex ${i} projection degenerate` };
            errors.push(pointToLineDistance(css, cssLine[0], cssLine[1])); // boundary vertices on the extended knife line
        }
        out.cutMax = Math.max(...errors);
        out.cutMean = errors.reduce((a, v) => a + v, 0) / errors.length;
        out.cut = [out.cutMax, out.cutMean];
    }
    // blade: actual uploaded center + perpendicular distance to the input line
    {
        const t = uploads.blade.nodeTranslation;
        const positions = uploads.blade.positions;
        const line = uploadedCenterLine(uploads.blade);
        if (!line) return { ok: false, reason: 'blade centerline degenerate' };
        const center = {
            x: (line[0].x + line[1].x) / 2,
            y: (line[0].y + line[1].y) / 2,
            z: (line[0].z + line[1].z) / 2,
        };
        void t;
        void positions;
        const bladeCss = projectWorldToCss(center, camera);
        if (!bladeCss || !Number.isFinite(bladeCss.x)) return { ok: false, reason: 'blade projection degenerate' };
        out.blade = pointToSegmentDistance(bladeCss, cssLine[0], cssLine[1]);
    }
    const drift0 = projectWorldToCss(record.modelState.raw.worldHits?.[0], camera);
    const drift1 = projectWorldToCss(record.modelState.raw.worldHits?.[1], camera);
    if (!drift0 || !drift1) return { ok: false, reason: 'worldHits projection degenerate' };
    out.lineDrift = Math.max(
        Math.hypot(drift0.x - cssLine[0].x, drift0.y - cssLine[0].y),
        Math.hypot(drift1.x - cssLine[1].x, drift1.y - cssLine[1].y),
    );
    return { ok: true, ...out };
}

function classifyPixel(r, g, b) {
    if (r > 180 && r - g > 60 && r - b > 60) return 'red';
    if (r > 200 && g > 200 && b < 150 && Math.abs(r - g) < 45) return 'yellow';
    if (b > 190 && g > 190 && r < 210) return 'cyan';
    return null;
}
/** Three-object pixel oracle: red cut along the gesture line + yellow stroke + cyan blade. */
function cutOracle(gesture, dpr) {
    const minX = Math.min(gesture.a.x, gesture.b.x),
        maxX = Math.max(gesture.a.x, gesture.b.x);
    const minY = Math.min(gesture.a.y, gesture.b.y),
        maxY = Math.max(gesture.a.y, gesture.b.y);
    const region = [
        Math.round(minX * dpr),
        Math.round(minY * dpr),
        Math.max(4, Math.round((maxX - minX) * dpr)),
        Math.max(4, Math.round((maxY - minY) * dpr)),
    ];
    const linePixels = Math.hypot(maxX - minX, maxY - minY) * 7 * dpr * dpr;
    return {
        region,
        kind: 'red',
        minPixels: Math.floor(0.1 * linePixels), // real line width ~0.24px antialiased
        strokeMinPixels: 2,
        bladeMinPixels: 2,
    }; // presence floors; positional fidelity is enforced by the independent recomputation
}
function countColors(png, region) {
    const counts = { red: 0, yellow: 0, cyan: 0 };
    for (let y = region[1]; y < region[1] + region[3] && y < png.height; y++) {
        for (let x = region[0]; x < region[0] + region[2] && x < png.width; x++) {
            const i = (png.width * y + x) << 2;
            const kind = classifyPixel(png.data[i], png.data[i + 1], png.data[i + 2]);
            if (kind) counts[kind] += 1;
        }
    }
    return counts;
}

function checkCase(record, caseId, runId, context = {}) {
    const errors = [];
    const check = (v, label) => {
        if (!v) errors.push(label);
    };
    if (!record || typeof record !== 'object') return { ok: false, errors: ['record missing'] };
    if (record.result !== 'PASS' && record.result !== 'FAIL')
        errors.push(`result ${record.result} must be PASS or an honest FAIL`);
    const css = record.layoutReceipt?.css;
    const dpr = record.dpr;
    if (!css || !finiteNumber(css.width) || !finiteNumber(css.height) || ![1, 1.25, 2].includes(dpr)) {
        return { ok: false, errors: ['css/dpr missing or NaN'] };
    }
    if (context.browserExpected && record.browser !== context.browserExpected)
        errors.push(`browser "${record.browser}" != "${context.browserExpected}"`);
    if (record.receivedEvent?.isTrusted !== true) errors.push('received event is not trusted');
    check(record.modelState?.receivedEventIsTrusted === true, 'modelState trust flag missing/false');
    check(
        record.clock?.method === 'STEP_CLOCK' && record.clock.enginePaused === true,
        'engine must be paused on the step clock',
    );
    check(
        record.submittedFrame?.afterDraw === true &&
            Number.isSafeInteger(record.submittedFrame.step) &&
            record.submittedFrame.step === record.clock.stepped,
        'step receipt mismatch',
    );
    check(record.submittedFrame?.inputSequence === record.receivedEvent?.sequence, 'inputSequence != event sequence');
    const times = [record.receivedEvent?.timestamp, record.submittedFrame?.timestamp, record.observationTimestamp].map(
        Date.parse,
    );
    check(times.every(Number.isFinite) && times[0] <= times[1] && times[1] <= times[2], 'observation order');
    check(record.modelState?.receivedSequence === record.receivedEvent?.sequence, 'model correlation');
    const raw = record.modelState?.raw;
    const events = raw?.inputEvents;
    check(Array.isArray(events) && events.length === 2, 'exact down/up raw events required');
    if (Array.isArray(events) && events.length === 2) {
        const [down, up] = events;
        check(
            down.type === 'pointerdown' && up.type === 'pointerup' && down.isTrusted === true && up.isTrusted === true,
            'raw pointer types/trust',
        );
        check(
            Number.isSafeInteger(down.sequence) &&
                down.sequence > 0 &&
                down.sequence < up.sequence &&
                up.sequence === record.receivedEvent.sequence,
            'raw input sequence',
        );
        check(
            Number.isSafeInteger(raw.session) &&
                raw.session === record.modelState.session &&
                down.session === raw.session &&
                up.session === raw.session,
            'raw input session',
        );
        check(
            Number.isSafeInteger(raw.measuredAtStep) &&
                raw.measuredAtStep >= 0 &&
                raw.measuredAtStep < record.submittedFrame.step,
            'raw pre-step measurement',
        );
        check(
            Number.isFinite(Date.parse(down.timestamp)) &&
                Date.parse(down.timestamp) <= Date.parse(up.timestamp) &&
                Date.parse(up.timestamp) <= times[1],
            'raw event time order',
        );
        check(raw.rect && [raw.rect.left, raw.rect.top].every(finiteNumber), 'raw canvas rect');
        check(
            raw.rect?.left === record.layoutReceipt.rect?.left && raw.rect?.top === record.layoutReceipt.rect?.top,
            'rect correlation',
        );
        for (const [i, ev] of events.entries()) {
            check(
                [ev.clientX, ev.clientY].every(finiteNumber) &&
                    raw.cssLine?.[i] &&
                    Math.abs(ev.clientX - raw.rect?.left - raw.cssLine[i].x) < 1e-6 &&
                    Math.abs(ev.clientY - raw.rect?.top - raw.cssLine[i].y) < 1e-6,
                'raw client to CSS correlation',
            );
        }
    }
    check(
        raw?.camera?.backing?.width === record.layoutReceipt.backing?.width &&
            raw?.camera?.backing?.height === record.layoutReceipt.backing?.height &&
            raw?.camera?.cssSize?.width === css.width &&
            raw?.camera?.cssSize?.height === css.height,
        'camera layout correlation',
    );
    // Independent recomputation from raw uploads (never trust reported scalars).
    const recomputed = recomputeErrors(record);
    if (!recomputed.ok) errors.push(`recomputation: ${recomputed.reason}`);
    else {
        const gesture = caseId.endsWith('resized') ? GESTURE_RESIZED : GESTURE;
        void gesture;
        const overCut = recomputed.cutMax > CUT_ERROR_BUDGET; // per-vertex max, never centerline
        const overStroke = Math.max(...recomputed.stroke) > CUT_ERROR_BUDGET;
        const overBlade = recomputed.blade > BLADE_ERROR_BUDGET;
        // An honest FAIL carries the real numbers; a PASS must have all chains inside budget.
        if (record.result === 'PASS' && (overCut || overStroke || overBlade)) {
            errors.push(
                `PASS claimed but recomputed errors over budget: cut=${recomputed.cut} stroke=${recomputed.stroke} blade=${recomputed.blade} drift=${recomputed.lineDrift}`,
            );
        }
        if (record.result === 'FAIL' && !record.modelState?.blocked && !(overCut || overStroke || overBlade)) {
            errors.push('FAIL claimed but recomputed errors are inside budget');
        }
    }
    // Identity, byte hash and PNG decoding apply even to blocked observations.
    const basicValidation = validateEvidence(record, {
        sdkModuleSha256: context.sdkModuleSha256,
        appSha256: context.appSha256,
        harnessSha256: context.harnessSha256,
        selectedRunId: runId,
        selectedCaseId: caseId,
        ...(record.result === 'PASS'
            ? { visibilityOracle: cutOracle(caseId.endsWith('resized') ? GESTURE_RESIZED : GESTURE, dpr) }
            : {}),
    });
    check(basicValidation.ok, `basic evidence: ${basicValidation.failures.join(' | ')}`);
    // Three-object pixel evidence (blocked rows carry an explicit blocked reason instead).
    if (record.modelState?.blocked) {
        if (typeof record.modelState.blocked !== 'string' || record.modelState.blocked.length < 8)
            errors.push('blocked reason must be explicit');
        if (record.result !== 'FAIL') errors.push('blocked rows must carry an honest FAIL result');
    } else {
        const gesture = caseId.endsWith('resized') ? GESTURE_RESIZED : GESTURE;
        const oracle = cutOracle(gesture, dpr);
        let png = null;
        try {
            png = PNG.sync.read(fs.readFileSync(path.resolve(ROOT, record.pngPath)));
        } catch (e) {
            return { ok: false, errors: [`png unreadable: ${e.message}`] };
        }
        const colors = countColors(png, oracle.region);
        check(colors.red >= oracle.minPixels, `cut red ${colors.red} < ${oracle.minPixels}`);
        check(colors.yellow >= oracle.strokeMinPixels, `stroke yellow ${colors.yellow} < ${oracle.strokeMinPixels}`);
        check(colors.cyan >= oracle.bladeMinPixels, `blade cyan ${colors.cyan} < ${oracle.bladeMinPixels}`);
    }
    check(record.modelState?.hitTarget === true, 'gesture did not hit the target slab');
    check(record.modelState?.measuredBeforeFirstStep === true, 'cut not measured before the first simulated step');
    return { ok: errors.length === 0, errors, recomputed };
}

const ALL_ENGINES = ['chromium', 'firefox', 'webkit'];
function validateReport(report) {
    return validateMatrix(report, ALL_ENGINES);
}
/** Explicit selected scope never substitutes for the complete three-engine matrix. */
function validateSelectedReport(report, engines) {
    return validateMatrix(report, engines);
}
function validateMatrix(report, engines) {
    const errors = [];
    try {
        if (
            !Array.isArray(engines) ||
            !engines.length ||
            new Set(engines).size !== engines.length ||
            engines.some((e) => !ALL_ENGINES.includes(e))
        )
            return { ok: false, errors: ['invalid selected engine scope'] };
        if (
            report?.schemaVersion !== 'ier-geometry/2' ||
            !Array.isArray(report.rows) ||
            !Array.isArray(report.engines) ||
            report.engines.length !== engines.length ||
            engines.some((e) => !report.engines.includes(e))
        ) {
            return { ok: false, errors: ['invalid report header'] };
        }
        if (report.subset !== true || report.completed !== false)
            errors.push('subset/completed flags must stay honest');
        // Reject malformed scope before decoding the many matrix PNGs.
        const planKeys = report.engines.flatMap((engine) =>
            planFor().map((row) => `${engine}/${row.caseType}/${row.projection}/${row.cam}/${row.dpr}`),
        );
        const actualKeys = report.rows.map((r) => `${r.engine}/${r.caseType}/${r.projection}/${r.cam}/${r.dpr}`);
        if (
            actualKeys.length !== planKeys.length ||
            new Set(actualKeys).size !== actualKeys.length ||
            actualKeys.some((key) => !planKeys.includes(key))
        )
            return { ok: false, errors: ['exact matrix coverage required'] };
        for (const file of INPUTS) {
            const expected = report.fingerprints?.[file],
                actual = fingerprint(file);
            if (!expected || actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes)
                errors.push(`input drift ${file}`);
        }
        const plan = planFor();
        const failures = [];
        const expectedKeys = report.engines.flatMap((engine) =>
            plan.map((row) => `${engine}/${row.caseType}/${row.projection}/${row.cam}/${row.dpr}`),
        );
        const rowKeys = report.rows.map((r) => `${r.engine}/${r.caseType}/${r.projection}/${r.cam}/${r.dpr}`);
        if (new Set(rowKeys).size !== rowKeys.length) errors.push('duplicate plan rows');
        if (rowKeys.length !== expectedKeys.length)
            errors.push(`row count ${rowKeys.length} != exact plan ${expectedKeys.length}`);
        for (const key of expectedKeys) if (!rowKeys.includes(key)) errors.push(`missing plan row ${key}`);
        for (const key of rowKeys) if (!expectedKeys.includes(key)) errors.push(`extra row not in plan: ${key}`);
        for (const row of report.rows) {
            const tag = `${row.engine}/${row.caseType}/${row.projection}/${row.cam}/${row.dpr}`;
            if (row.error) errors.push(`${tag}: ${row.error}`);
            if (!Array.isArray(row.pageErrors) || !Array.isArray(row.consoleErrors)) {
                errors.push(`${tag}: raw arrays required`);
                continue;
            }
            if (row.pageErrors.length || row.consoleErrors.length) errors.push(`${tag}: browser errors`);
            if (!Array.isArray(row.cases) || row.cases.length !== 1) {
                errors.push(`${tag}: exactly one case required`);
                continue;
            }
            const record = row.cases[0];
            if (!record) {
                errors.push(`${tag}: case missing`);
                continue;
            }
            const expectedCase =
                row.caseType === 'resized' ? 'cut-resized' : row.caseType === 'offset' ? 'cut-offset' : 'cut-baseline';
            if (record.caseId !== expectedCase || record.dpr !== row.dpr || !row.browserVersion)
                errors.push(`${tag}: case/DPR/version mismatch`);
            const v = checkCase(record, expectedCase, report.runId, {
                sdkModuleSha256: report.fingerprints[INPUTS[0]].sha256,
                appSha256: report.fingerprints[INPUTS[2]].sha256,
                harnessSha256: report.fingerprints[INPUTS[5]].sha256,
                browserExpected: `${row.engine} ${row.browserVersion}`,
            });
            if (!v.ok) errors.push(`${tag}/${record.caseId}: ${v.errors.join(',')}`);
            if (record.result === 'FAIL')
                failures.push(`${tag}: honest FAIL recorded (${record.modelState?.blocked ?? 'over-budget errors'})`);
            if (record.modelState?.projection !== row.projection || record.modelState?.cam !== row.cam)
                errors.push(`${tag}: identity mismatch`);
            // Live resize rows record the before/after transition evidence.
            if (row.caseType === 'resized') {
                const transition = record.modelState?.resizeTransition;
                if (
                    !transition ||
                    !transition.before ||
                    !transition.after ||
                    transition.after.css.width === transition.before.css.width ||
                    !Number.isInteger(transition.before.session) ||
                    !Number.isInteger(transition.after.session) ||
                    transition.after.session <= transition.before.session
                ) {
                    errors.push(
                        `${tag}: live resize needs a real session advance + changed layout (fresh pages do not count)`,
                    );
                }
            }
        }
        for (const [list, name, perEngine] of [
            [report.ribbons, 'ribbons', 2],
            [report.meshRows, 'meshRows', 1],
            [report.lifecycles, 'lifecycles', 1],
        ]) {
            if (!Array.isArray(list)) {
                errors.push(`${name} missing`);
                continue;
            }
            for (const engine of report.engines) {
                const rows = list.filter((x) => x.engine === engine);
                if (rows.length !== perEngine)
                    errors.push(`${name}/${engine}: expected ${perEngine} unique rows, got ${rows.length}`);
            }
            if (list.some((x) => !report.engines.includes(x.engine))) errors.push(`${name}: unknown engine`);
            if (name === 'ribbons' && list.some((x) => ![1, 2].includes(x.dpr)))
                errors.push('ribbons: exact DPR1/2 required');
            const seen = new Set(list.map((x) => `${x.engine}/${x.dpr ?? ''}/${x.mode ?? ''}`));
            if (seen.size !== list.length) errors.push(`${name}: duplicate coverage rows`);
        }
        for (const ribbon of report.ribbons || []) {
            if (ribbon.error) {
                errors.push(`ribbon/${ribbon.engine}: ${ribbon.error}`);
                continue;
            }
            for (const key of ['before', 'after']) {
                const shot = ribbon[key];
                if (!shot || !fs.existsSync(path.resolve(ROOT, shot.pngPath))) {
                    errors.push(`ribbon/${ribbon.engine}: ${key} PNG missing`);
                    continue;
                }
                if (
                    sha(fs.readFileSync(path.resolve(ROOT, shot.pngPath))) !== shot.sha256 ||
                    fs.statSync(path.resolve(ROOT, shot.pngPath)).size !== shot.bytes
                ) {
                    errors.push(`ribbon/${ribbon.engine}: ${key} PNG identity mismatch`);
                }
            }
            const centroidOf = (png) => {
                let sx = 0,
                    sy = 0,
                    n = 0;
                for (let y = 0; y < png.height; y++)
                    for (let x = 0; x < png.width; x++) {
                        const i = (png.width * y + x) << 2;
                        if (classifyPixel(png.data[i], png.data[i + 1], png.data[i + 2])) {
                            sx += x;
                            sy += y;
                            n += 1;
                        }
                    }
                return n ? { x: sx / n, y: sy / n, n } : null;
            };
            let c0 = null,
                c1 = null;
            try {
                c0 = centroidOf(PNG.sync.read(fs.readFileSync(path.resolve(ROOT, ribbon.before.pngPath))));
                c1 = centroidOf(PNG.sync.read(fs.readFileSync(path.resolve(ROOT, ribbon.after.pngPath))));
            } catch (e) {
                errors.push(`ribbon/${ribbon.engine}: PNG decode failed`);
            }
            if (!c0 || !c1) errors.push(`ribbon/${ribbon.engine}: decoded PNG lacks visible geometry`);
            if (c0 && c1) {
                if (c1.n < 100) errors.push(`ribbon/${ribbon.engine}: after PNG blank (${c1.n}px)`);
                if (c0.n < 100) errors.push(`ribbon/${ribbon.engine}: before PNG blank (${c0.n}px)`);
                const delta = Math.hypot(c1.x - c0.x, c1.y - c0.y);
                if (!(delta >= RIBBON_MIN_MOVED_PX))
                    errors.push(
                        `ribbon/${ribbon.engine}: decoded centroid delta ${delta.toFixed(2)} < ${RIBBON_MIN_MOVED_PX}`,
                    );
                if (finiteNumber(ribbon.centroidDeltaPx) && Math.abs(ribbon.centroidDeltaPx - delta) > 1e-6) {
                    errors.push(
                        `ribbon/${ribbon.engine}: reported centroid ${ribbon.centroidDeltaPx} != decoded ${delta.toFixed(2)}`,
                    );
                }
            }
            if (!finiteNumber(ribbon.centroidDeltaPx) || !Number.isSafeInteger(ribbon.frames) || ribbon.frames < 20)
                errors.push('ribbon: finite motion/frame evidence required');
        }
        for (const mesh of report.meshRows || []) {
            if (mesh.error) {
                errors.push(`mesh/${mesh.engine}: ${mesh.error}`);
                continue;
            }
            if (!(mesh.frames > 0) || mesh.preflightOk !== true)
                errors.push(`mesh/${mesh.engine}: dual-path motion/preflight failed`);
            if (
                !Array.isArray(mesh.boundsBefore) ||
                !Array.isArray(mesh.boundsAfter) ||
                mesh.boundsBefore.length !== 6 ||
                mesh.boundsAfter.length !== 6 ||
                ![...mesh.boundsBefore, ...mesh.boundsAfter].every(finiteNumber)
            ) {
                errors.push(`mesh/${mesh.engine}: dynamic bounds must be real 6-number arrays`);
            }
            if (JSON.stringify(mesh.boundsBefore) === JSON.stringify(mesh.boundsAfter))
                errors.push(`mesh/${mesh.engine}: bounds did not move`);
            const nonClear = (png) => {
                let n = 0;
                for (let i = 0; i < png.width * png.height; i++) {
                    const j = i << 2;
                    if (png.data[j] > 25 || png.data[j + 1] > 25 || png.data[j + 2] > 35) n += 1;
                }
                return n;
            };
            for (const key of ['staticPng', 'dynamicPng', 'dynamicAfterPng']) {
                if (!mesh[key] || !fs.existsSync(path.resolve(ROOT, mesh[key].pngPath))) {
                    errors.push(`mesh/${mesh.engine}: ${key} missing`);
                    continue;
                }
                try {
                    const png = PNG.sync.read(fs.readFileSync(path.resolve(ROOT, mesh[key].pngPath)));
                    if (nonClear(png) < 100) errors.push(`mesh/${mesh.engine}: ${key} blank`);
                    if (
                        fs.statSync(path.resolve(ROOT, mesh[key].pngPath)).size !== mesh[key].bytes ||
                        sha(fs.readFileSync(path.resolve(ROOT, mesh[key].pngPath))) !== mesh[key].sha256
                    )
                        errors.push(`mesh/${mesh.engine}: ${key} sha mismatch`);
                } catch (e) {
                    errors.push(`mesh/${mesh.engine}: ${key} decode failed`);
                }
            }
            try {
                const a = PNG.sync.read(fs.readFileSync(path.resolve(ROOT, mesh.dynamicPng.pngPath)));
                const b = PNG.sync.read(fs.readFileSync(path.resolve(ROOT, mesh.dynamicAfterPng.pngPath)));
                const centroidOf = (png) => {
                    let sx = 0,
                        sy = 0,
                        n = 0;
                    for (let y = 0; y < png.height; y++)
                        for (let x = 0; x < png.width; x++) {
                            const i = (png.width * y + x) << 2;
                            if (png.data[i] > 180 && png.data[i + 1] > 110 && png.data[i] - png.data[i + 1] > 30) {
                                sx += x;
                                sy += y;
                                n += 1;
                            }
                        }
                    return n ? { x: sx / n, y: sy / n } : null;
                };
                const ca = centroidOf(a);
                const cb = centroidOf(b);
                if (!ca || !cb) errors.push(`mesh/${mesh.engine}: dynamic orange quad not visible in both frames`);
                else if (Math.hypot(cb.x - ca.x, cb.y - ca.y) < 1)
                    errors.push(`mesh/${mesh.engine}: dynamic quad did not move`);
            } catch (e) {
                errors.push(`mesh/${mesh.engine}: dynamic movement decode failed`);
            }
        }
        for (const life of report.lifecycles || []) {
            if (life.error) {
                errors.push(`lifecycle/${life.engine}: ${life.error}`);
                continue;
            }
            if (
                life.rounds !== 10 ||
                !Array.isArray(life.ownedPerRound) ||
                life.ownedPerRound.length !== 10 ||
                !life.ownedPerRound.every((n) => n === life.ownedPerRound[0])
            )
                errors.push(`lifecycle/${life.engine}: 10-reset owned stability missing`);
            if (life.staleUpNoCut !== true || life.newGestureWorks !== true)
                errors.push(`lifecycle/${life.engine}: stale/fresh gesture contract failed`);
            if (!Array.isArray(life.rawEvents) || life.rawEvents.length < 1)
                errors.push(`lifecycle/${life.engine}: raw pointer events missing`);
            if (
                life.idempotent !== true ||
                life.postReleaseError !== 'GEOMETRY_DISPOSED' ||
                life.controlsDisabled !== true
            ) {
                errors.push(`lifecycle/${life.engine}: release contract failed`);
            }
            if (
                !Array.isArray(life.refs) ||
                !life.refs.length ||
                !life.refs.every((r) => r.before === 1 && r.after === 0)
            ) {
                errors.push(`lifecycle/${life.engine}: release refs missing/unpaired`);
            }
            if (life.renderersUnbound !== true || life.nodesRemoved !== true)
                errors.push(`lifecycle/${life.engine}: renderer/node retirement not observed`);
            if (
                !Array.isArray(life.resetRounds) ||
                life.resetRounds.length !== 10 ||
                !life.resetRounds.every(
                    (r) =>
                        Array.isArray(r.refs) &&
                        r.refs.length === 4 &&
                        new Set(r.refs.map((ref) => ref.id)).size === 4 &&
                        r.refs.every((ref) => ref.before === 1 && ref.after === 0) &&
                        Array.isArray(r.retained) &&
                        r.retained.length === 6 &&
                        r.retained.every((ref) => ref.before === 1 && ref.after === 1),
                )
            ) {
                errors.push(`lifecycle/${life.engine}: actual retiring/retained references required`);
            }
            for (const name of ['reset', 'escape', 'resize']) {
                const v = life.variants?.[name];
                if (
                    !v ||
                    v.before.records !== 0 ||
                    v.after.records !== 0 ||
                    v.after.session <= v.before.session ||
                    !v.events?.some((e) => e.type === name && e.isTrusted === true) ||
                    !v.events?.some((e) => e.type === 'pointerdown' && e.isTrusted === true) ||
                    !v.events?.some((e) => e.type === 'pointerup' && e.isTrusted === true)
                )
                    errors.push(`lifecycle/${life.engine}: trusted ${name} cancellation missing`);
            }
            if (
                !Array.isArray(life.perRoundRefs) ||
                life.perRoundRefs.length !== 10 ||
                !life.perRoundRefs.every((paired) => paired === true)
            ) {
                errors.push(`lifecycle/${life.engine}: reset references missing or not paired`);
            }
        }
        // A structurally valid failure is still a failed observation. Preserve its record,
        // but never promote a mixed PASS/FAIL matrix to a successful scope.
        const normals = validateNormals(report);
        errors.push(...normals.errors, ...failures);
        return { ok: errors.length === 0, errors };
    } catch (e) {
        return { ok: false, errors: [`validator crash: ${String(e.message).split('\n')[0]}`] };
    }
}

function validateNormals(report) {
    const errors = [];
    const rows = report.normals;
    const expected = report.engines.flatMap((engine) => ['mesh', 'cut', 'ribbon'].map((mode) => `${engine}/${mode}`));
    if (
        !Array.isArray(rows) ||
        rows.length !== expected.length ||
        new Set(rows.map((r) => `${r.engine}/${r.mode}`)).size !== expected.length ||
        rows.some((r) => !expected.includes(`${r.engine}/${r.mode}`))
    )
        return { ok: false, errors: ['exact normal-mode coverage required'] };
    for (const r of rows) {
        const tag = `normal/${r.engine}/${r.mode}`;
        if (
            r.error ||
            !Array.isArray(r.pageErrors) ||
            r.pageErrors.length ||
            !Array.isArray(r.consoleErrors) ||
            r.consoleErrors.length
        )
            errors.push(`${tag}: browser errors`);
        const a = r.before,
            b = r.running;
        if (
            a?.clock?.method !== 'NATIVE_PACER' ||
            b?.clock?.method !== 'NATIVE_PACER' ||
            a.clock.enginePaused !== false ||
            b.clock.enginePaused !== false ||
            !Number.isSafeInteger(a.clock.totalFrames) ||
            !(b.clock.totalFrames > a.clock.totalFrames) ||
            b.submittedFrame?.afterDraw !== true
        )
            errors.push(`${tag}: native frame progression missing`);
        if (
            !Array.isArray(r.resets) ||
            r.resets.length !== 3 ||
            !r.resets.every(
                (x) =>
                    x.after.modelState.session > x.before.modelState.session &&
                    x.after.modelState.ownedRefCount === a.modelState.ownedRefCount,
            )
        )
            errors.push(`${tag}: reset/session ownership changed`);
        for (const type of ['reset', 'escape', 'release']) {
            if (!r.events?.some((e) => e.type === type && e.isTrusted === true && Number.isSafeInteger(e.sequence)))
                errors.push(`${tag}: trusted ${type} missing`);
        }
        const c = r.cleanup;
        if (
            !c ||
            c.controlsDisabled !== true ||
            c.controlsDetached !== true ||
            c.pointerDetached !== true ||
            c.renderersUnbound !== true ||
            c.nodesRemoved !== true ||
            !Array.isArray(c.refs) ||
            c.refs.length !== a?.modelState?.ownedRefCount ||
            !c.refs.every((x) => x.before === 1 && x.after === 0) ||
            r.releaseIdentity !== true ||
            !c.rendererValidity?.length ||
            !c.rendererValidity.every((v) => v === false)
        )
            errors.push(`${tag}: terminal cleanup incomplete`);
        try {
            const shot = r.visible,
                bytes = fs.readFileSync(path.resolve(ROOT, shot.pngPath));
            if (sha(bytes) !== shot.sha256 || bytes.length !== shot.bytes) errors.push(`${tag}: PNG identity`);
            const png = PNG.sync.read(bytes);
            const counts = { red: 0, yellow: 0, cyan: 0, orange: 0, blue: 0 };
            for (let i = 0; i < png.data.length; i += 4) {
                const [red, green, blue] = png.data.subarray(i, i + 3);
                const kind = classifyPixel(red, green, blue);
                if (kind) counts[kind]++;
                if (red > 180 && green > 110 && red - green > 30) counts.orange++;
                if (blue > 160 && blue - red > 60) counts.blue++;
            }
            if (
                (r.mode === 'cut' && !(counts.red > 100 && counts.yellow > 2 && counts.cyan > 2)) ||
                (r.mode === 'mesh' && !(counts.blue > 100 && counts.orange > 100)) ||
                (r.mode === 'ribbon' && !(counts.cyan > 100))
            )
                errors.push(`${tag}: visible geometry missing`);
        } catch (e) {
            errors.push(`${tag}: PNG unavailable ${e.message}`);
        }
    }
    return { ok: errors.length === 0, errors };
}

async function main() {
    const argv = process.argv.slice(2);
    const verify = argv.find((a) => a.startsWith('--verify='));
    if (verify) {
        const report = JSON.parse(fs.readFileSync(verify.slice(9)));
        const selected = argv.find((a) => a.startsWith('--browser='))?.slice(10);
        const r = selected && selected !== 'all' ? validateSelectedReport(report, [selected]) : validateReport(report);
        process.stdout.write(JSON.stringify(r) + '\n');
        process.exitCode = r.ok ? 0 : 1;
        return;
    }
    const outArg = argv.find((a) => a.startsWith('--out='));
    assert(outArg, 'explicit --out=<new.json> required');
    const out = path.resolve(ROOT, outArg.slice(6));
    assert(!fs.existsSync(out), 'report already exists');
    const artifacts = out.replace(/\.json$/, '') + '-artifacts';
    fs.mkdirSync(artifacts, { recursive: true });
    const choice = (argv.find((a) => a.startsWith('--browser=')) || '--browser=all').slice(10);
    assert(choice === 'all' || ALL_ENGINES.includes(choice), 'unknown browser selection');
    const engines = choice === 'all' ? ALL_ENGINES.slice() : [choice];
    const startedAt = new Date().toISOString();
    const runId = 'ier-geo-' + crypto.randomUUID();
    const command = [process.execPath, ...process.argv.slice(1)];
    const report = {
        schemaVersion: 'ier-geometry/2',
        runId,
        engines,
        startedAt,
        command,
        cwd: ROOT,
        subset: true,
        completed: false,
        captureMethod:
            'Real trusted pointer gestures → recorded camera evidence → independent recomputation; live resize on the SAME page; step-clock pages wait two browser rAF before the compositor screenshot',
        fingerprints: Object.fromEntries(INPUTS.map((f) => [f, fingerprint(f)])),
        rows: [],
        ribbons: [],
        meshRows: [],
        lifecycles: [],
        normals: [],
        limitations: [
            'Independent recreated scenes; original full-scene parity is outside this example and referenceComparison remains NOT_RUN; 0.15 CSS px is the unchanged design target.',
            'Historical WebKit26.6 live-resize failures are separate evidence, not a diagnosis of this run. Current missing pixels remain honest FAIL with cause unestablished by this collector.',
            'GPU memory/time unavailable; inspectAirGeometry sampled triangles are not a topology certification.',
        ],
    };
    const pw = require('playwright');
    const { startExampleServer } = require('./competitive-example-server.cjs');
    const server = await startExampleServer(ROOT);
    const sleepTwoFrames = (page) =>
        page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    async function gesture(page, g) {
        const rect = await page.evaluate(() => {
            const r = document.querySelector('#GameCanvas').getBoundingClientRect();
            return { left: r.left, top: r.top };
        });
        await page.mouse.move(rect.left + g.a.x, rect.top + g.a.y);
        await page.mouse.down();
        await page.mouse.move(rect.left + g.b.x, rect.top + g.b.y);
        await page.mouse.up();
    }
    async function cutRow(browser, engine, entry) {
        const row = {
            engine,
            browserVersion: browser.version(),
            caseType: entry.caseType,
            projection: entry.projection,
            cam: entry.cam,
            dpr: entry.dpr,
            pageErrors: [],
            consoleErrors: [],
            cases: [],
        };
        report.rows.push(row);
        const page = await browser.newPage({ viewport: { ...PAGE_VIEWPORT }, deviceScaleFactor: entry.dpr });
        page.on('pageerror', (e) => row.pageErrors.push(String(e)));
        page.on('console', (m) => {
            if (m.type() === 'error') row.consoleErrors.push(m.text());
        });
        const dir = path.join(
            artifacts,
            `${engine}-${entry.caseType}-${entry.projection}-${entry.cam}-dpr${entry.dpr}`,
        );
        fs.mkdirSync(dir, { recursive: true });
        try {
            const offset = entry.caseType === 'offset' ? '&offset=1' : '';
            await page.goto(
                `${server.origin}/examples/interactive-geometry/?mode=cut&test=1&proj=${entry.projection}&cam=${entry.cam}${offset}`,
            );
            await page.waitForFunction(() => !!window.__geometry, null, { timeout: 45000, polling: 100 });
            await page.evaluate(() => window.__geometry.step());
            let resizeTransition = null;
            if (entry.caseType === 'resized') {
                const before = await page.evaluate(() => window.__geometry.snapshot());
                await page.setViewportSize({ width: 480, height: 320 });
                // Give the browser time to dispatch the resize event (the engine adapter and
                // our session listener both react to it), then settle explicitly.
                await page.waitForTimeout(250);
                await page.evaluate(async () => {
                    const target = window.__geometry.snapshot().modelState.session;
                    for (let i = 0; i < 60 && window.__geometry.snapshot().modelState.session < target; i++) {
                        await window.__geometry.step();
                        await new Promise((resolve) => setTimeout(resolve, 10));
                    }
                    let stable = 0,
                        last = '';
                    for (let i = 0; i < 60 && stable < 3; i++) {
                        await window.__geometry.step();
                        const s = window.__geometry.snapshot();
                        const key = JSON.stringify([s.layoutReceipt.backing, s.modelState.session]);
                        if (key === last) stable += 1;
                        else {
                            stable = 0;
                            last = key;
                        }
                    }
                });
                const after = await page.evaluate(() => window.__geometry.snapshot());
                resizeTransition = {
                    before: {
                        backing: before.layoutReceipt.backing,
                        css: before.layoutReceipt.css,
                        session: before.modelState.session,
                    },
                    after: {
                        backing: after.layoutReceipt.backing,
                        css: after.layoutReceipt.css,
                        session: after.modelState.session,
                    },
                    sessionAdvanced: after.modelState.session - before.modelState.session,
                };
            }
            // settle the camera mapping before the gesture (WebKit can lag a frame after load/resize)
            await page.evaluate(async () => {
                let last = '',
                    stable = 0;
                for (let i = 0; i < 40 && stable < 3; i++) {
                    await window.__geometry.step();
                    const c = window.__geometry.calibrate();
                    const key = JSON.stringify([c.topCss, c.rightCss]);
                    if (key === last) stable += 1;
                    else {
                        stable = 0;
                        last = key;
                    }
                }
            });
            const g = entry.caseType === 'resized' ? GESTURE_RESIZED : GESTURE;
            await gesture(page, g);
            const observation = await page.evaluate(() => window.__geometry.step());
            await sleepTwoFrames(page);
            const bytes = await page.screenshot();
            let blocked = await page.evaluate(() => {
                const s = window.__geometry.snapshot();
                return s.modelState.records === 0 ? 'no record created' : null;
            });
            if (!blocked) {
                // Whole-scene presenting check: the dark slab must cover most of the canvas.
                const screen = PNG.sync.read(bytes);
                let colored = 0;
                for (let i = 0; i < screen.width * screen.height; i++) {
                    const j = i << 2;
                    if (screen.data[j] > 25 || screen.data[j + 1] > 25 || screen.data[j + 2] > 35) colored += 1;
                }
                const required = countColors(screen, cutOracle(g, entry.dpr).region);
                if (
                    colored < screen.width * screen.height * 0.005 ||
                    (required.red === 0 && required.yellow === 0 && required.cyan === 0)
                ) {
                    blocked =
                        'screenshot does not present the required scene; no current native control or root cause established';
                    // Deep GL diagnostics (WebKit live-resize investigation): actual gl state.
                    row.glDiagnostics = await page
                        .evaluate(() => {
                            const canvas = document.querySelector('#GameCanvas');
                            const gl = canvas.getContext('webgl2');
                            if (!gl) return { context: 'none' };
                            const drawingBuffer = { w: gl.drawingBufferWidth, h: gl.drawingBufferHeight };
                            const viewport = gl.getParameter(gl.VIEWPORT);
                            const scissor = gl.getParameter(gl.SCISSOR_TEST);
                            const scissorBox = gl.getParameter(gl.SCISSOR_BOX);
                            const error = gl.getError();
                            const canvasState = {
                                width: canvas.width,
                                height: canvas.height,
                                clientW: canvas.clientWidth,
                                clientH: canvas.clientHeight,
                            };
                            const centerPixel = new Uint8Array(4);
                            gl.readPixels(
                                Math.floor(drawingBuffer.w / 2),
                                Math.floor(drawingBuffer.h / 2),
                                1,
                                1,
                                gl.RGBA,
                                gl.UNSIGNED_BYTE,
                                centerPixel,
                            );
                            return {
                                drawingBuffer,
                                viewport,
                                scissor,
                                scissorBox,
                                error,
                                canvasState,
                                centerPixel: Array.from(centerPixel),
                            };
                        })
                        .catch((e) => ({ error: String(e) }));
                }
            }
            const png = path.join(dir, 'case.png');
            fs.writeFileSync(png, bytes, { flag: 'wx' });
            const now = new Date().toISOString();
            const raw = observation.modelState.raw;
            const recomputed = raw ? recomputeErrors({ modelState: { raw } }) : null;
            const honestFail =
                blocked ||
                (recomputed &&
                    recomputed.ok &&
                    (Math.max(...recomputed.cut) > CUT_ERROR_BUDGET ||
                        Math.max(...recomputed.stroke) > CUT_ERROR_BUDGET ||
                        recomputed.blade > BLADE_ERROR_BUDGET));
            const record = {
                schemaVersion: 'ier-evidence/2',
                runId,
                caseId:
                    entry.caseType === 'resized'
                        ? 'cut-resized'
                        : entry.caseType === 'offset'
                          ? 'cut-offset'
                          : 'cut-baseline',
                appFingerprint: report.fingerprints[INPUTS[2]],
                sdkFingerprint: report.fingerprints[INPUTS[0]],
                harnessFingerprint: report.fingerprints[INPUTS[5]],
                browser: `${engine} ${browser.version()}`,
                viewport: observation.layoutReceipt.viewport,
                dpr: entry.dpr,
                inputMethod: 'REAL_POINTER_GESTURE',
                seed: 0,
                receivedEvent: observation.receivedEvent,
                modelState: {
                    ...observation.modelState,
                    resizeTransition,
                    receivedEventIsTrusted: observation.receivedEvent.isTrusted === true,
                },
                layoutReceipt: observation.layoutReceipt,
                submittedFrame: observation.submittedFrame,
                pngPath: path.relative(ROOT, png).replace(/\\/g, '/'),
                pngSha256: sha(bytes),
                pngBytes: bytes.length,
                observationTimestamp: now,
                clock: observation.clock,
                sourceStatus: 'recreated',
                comparisonDimensions: ['projection', 'geometry', 'layout'],
                limitations: [...report.limitations],
                referenceComparison: { result: 'NOT_RUN', reason: 'External source not observed' },
                result: honestFail ? 'FAIL' : 'PASS',
                method: 'STEP_CLOCK',
                execution: { command: command.join(' '), cwd: ROOT, exitCode: 0, startedAt, endedAt: now },
            };
            if (blocked)
                record.modelState.blocked = `Current screenshot observation: ${blocked}; historical environment attribution is not reused`;
            row.cases.push(record);
        } catch (error) {
            row.error = String(error.stack || error);
        } finally {
            await page.close();
        }
        process.stdout.write(
            `${engine} ${entry.caseType}/${entry.projection}/${entry.cam}/dpr${entry.dpr}: ${row.cases.length ? row.cases[0].result : 'ERROR'}\n`,
        );
    }
    async function ribbonRow(browser, engine, dpr) {
        const ribbon = { engine, dpr };
        report.ribbons.push(ribbon);
        const page = await browser.newPage({ viewport: { ...PAGE_VIEWPORT }, deviceScaleFactor: dpr });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        try {
            await page.goto(`${server.origin}/examples/interactive-geometry/?mode=ribbon&test=1`);
            await page.waitForFunction(() => !!window.__geometry, null, { timeout: 45000, polling: 100 });
            // settle the camera mapping first (same as cut rows)
            await page.evaluate(async () => {
                let last = '',
                    stable = 0;
                for (let i = 0; i < 40 && stable < 3; i++) {
                    await window.__geometry.step();
                    const c = window.__geometry.calibrate();
                    const key = JSON.stringify([c.topCss, c.rightCss]);
                    if (key === last) stable += 1;
                    else {
                        stable = 0;
                        last = key;
                    }
                }
            });
            await sleepTwoFrames(page);
            const dir = path.join(artifacts, `${engine}-ribbon-dpr${dpr}`);
            fs.mkdirSync(dir, { recursive: true });
            const beforeBytes = await page.screenshot();
            const beforePath = path.join(dir, 'before.png');
            fs.writeFileSync(beforePath, beforeBytes, { flag: 'wx' });
            for (let i = 0; i < 20; i++) await page.evaluate(() => window.__geometry.step());
            await sleepTwoFrames(page);
            const afterBytes = await page.screenshot();
            const afterPath = path.join(dir, 'after.png');
            fs.writeFileSync(afterPath, afterBytes, { flag: 'wx' });
            const before = PNG.sync.read(beforeBytes);
            const after = PNG.sync.read(afterBytes);
            const centroid = (png) => {
                let sx = 0,
                    sy = 0,
                    n = 0;
                for (let y = 0; y < png.height; y++)
                    for (let x = 0; x < png.width; x++) {
                        const i = (png.width * y + x) << 2;
                        if (classifyPixel(png.data[i], png.data[i + 1], png.data[i + 2])) {
                            sx += x;
                            sy += y;
                            n += 1;
                        }
                    }
                return n ? { x: sx / n, y: sy / n, n } : null;
            };
            const c0 = centroid(before);
            const c1 = centroid(after);
            ribbon.before = {
                pngPath: path.relative(ROOT, beforePath).replace(/\\/g, '/'),
                sha256: sha(beforeBytes),
                bytes: beforeBytes.length,
            };
            ribbon.after = {
                pngPath: path.relative(ROOT, afterPath).replace(/\\/g, '/'),
                sha256: sha(afterBytes),
                bytes: afterBytes.length,
            };
            ribbon.coloredPixels = c1 ? c1.n : 0;
            ribbon.centroidDeltaPx = c0 && c1 ? Math.hypot(c1.x - c0.x, c1.y - c0.y) : 0;
            ribbon.frames = await page.evaluate(() => window.__geometry.snapshot().modelState.frames);
            if (errors.length) ribbon.error = errors.join(' | ');
        } catch (error) {
            ribbon.error = String(error.stack || error);
        } finally {
            await page.close();
        }
    }
    async function meshRow(browser, engine) {
        const mesh = { engine };
        report.meshRows.push(mesh);
        const page = await browser.newPage({ viewport: { ...PAGE_VIEWPORT } });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        try {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    await page.goto(`${server.origin}/examples/interactive-geometry/?mode=mesh&test=1`);
                    break;
                } catch (navError) {
                    if (attempt === 2) throw navError;
                    await page.waitForTimeout(500);
                }
            }
            await page.waitForFunction(() => !!window.__geometry, null, { timeout: 45000, polling: 100 });
            await page.evaluate(() => window.__geometry.step());
            const dir = path.join(artifacts, `${engine}-mesh`);
            fs.mkdirSync(dir, { recursive: true });
            const shot = async (name) => {
                await sleepTwoFrames(page);
                const bytes = await page.screenshot();
                const file = path.join(dir, name);
                fs.writeFileSync(file, bytes, { flag: 'wx' });
                return {
                    pngPath: path.relative(ROOT, file).replace(/\\/g, '/'),
                    sha256: sha(bytes),
                    bytes: bytes.length,
                };
            };
            mesh.staticPng = await shot('static.png');
            const boundsBefore = await page.evaluate(
                () => window.__geometry.snapshot().modelState.dynamicBoundsNumbers,
            );
            mesh.boundsBefore = boundsBefore;
            mesh.dynamicPng = await shot('dynamic.png');
            for (let i = 0; i < 10; i++) await page.evaluate(() => window.__geometry.step());
            mesh.dynamicAfterPng = await shot('dynamic-after.png');
            const later = await page.evaluate(() => window.__geometry.snapshot());
            mesh.frames = later.modelState.frames;
            mesh.preflightOk = later.modelState.lastPreflightOk;
            mesh.boundsAfter = later.modelState.dynamicBoundsNumbers;
            if (errors.length) mesh.error = errors.join(' | ');
        } catch (error) {
            mesh.error = String(error.stack || error);
        } finally {
            await page.close();
        }
    }
    async function lifecycleRow(browser, engine) {
        const life = { engine };
        report.lifecycles.push(life);
        const page = await browser.newPage({ viewport: { ...PAGE_VIEWPORT } });
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        try {
            await page.goto(`${server.origin}/examples/interactive-geometry/?mode=cut&test=1`);
            await page.waitForFunction(() => !!window.__geometry, null, { timeout: 45000, polling: 100 });
            await page.evaluate(() => window.__geometry.step());
            // 10 real resets with per-round asset refs + node retirement
            const cycle = await page.evaluate(async () => window.__geometry.resetCycle(10));
            life.rounds = cycle.rounds;
            life.resetRounds = cycle.perRound;
            life.ownedPerRound = cycle.rows.map((x) => x.ownedAfter);
            life.perRoundRefs =
                cycle.perRound?.map((x) => x.refs.every((rf) => rf.before === 1 && rf.after === 0)) ?? [];
            life.perRoundNodes = cycle.perRound?.map((x) => x.nodes > 0) ?? [];
            const rect = await page.evaluate(() => {
                const r = document.querySelector('#GameCanvas').getBoundingClientRect();
                return { left: r.left, top: r.top };
            });
            const readState = () =>
                page.evaluate(() => ({
                    records: window.__geometry.snapshot().modelState.records,
                    session: window.__geometry.snapshot().modelState.session,
                    event: window.__geometry.snapshot().receivedEvent,
                }));
            life.variants = {};
            for (const name of ['reset', 'escape', 'resize']) {
                const before = await readState();
                const eventStart = await page.evaluate(() => window.__geometry.userEvents().length);
                await page.mouse.move(rect.left + 200, rect.top + 130);
                await page.mouse.down();
                if (name === 'reset') {
                    await page.locator('#reset').focus();
                    await page.keyboard.press('Enter');
                }
                if (name === 'escape') await page.keyboard.press('Escape');
                if (name === 'resize') await page.setViewportSize({ width: 480, height: 320 });
                await page.waitForFunction(
                    (session) => window.__geometry.snapshot().modelState.session > session,
                    before.session,
                    { polling: 50 },
                );
                await page.mouse.move(rect.left + 430, rect.top + 260);
                await page.mouse.up();
                const after = await readState();
                const events = await page.evaluate((start) => window.__geometry.userEvents().slice(start), eventStart);
                life.variants[name] = { before, after, events };
            }
            life.rawEvents = await page.evaluate(() => window.__geometry.userEvents());
            life.staleUpNoCut = Object.values(life.variants).every(
                (v) => v.after.records === 0 && v.after.session > v.before.session,
            );
            // fresh trusted gesture works afterwards
            await page.setViewportSize({ width: 640, height: 400 });
            await page.evaluate(async () => {
                for (let i = 0; i < 12; i++) await window.__geometry.step();
            });
            const r2 = await page.evaluate(() => {
                const b = document.querySelector('#GameCanvas').getBoundingClientRect();
                return { left: b.left, top: b.top };
            });
            await page.mouse.move(r2.left + 200, r2.top + 130);
            await page.mouse.down();
            await page.mouse.move(r2.left + 430, r2.top + 260);
            await page.mouse.up();
            const fresh = await page.evaluate(() => window.__geometry.snapshot().modelState.records);
            life.newGestureWorks = fresh >= 1;
            // release LAST: idempotent, refs, unbind order, terminal
            const release = await page.evaluate(async () => {
                const first = window.__geometry.release();
                const second = window.__geometry.release();
                const cleanup = await first;
                let postReleaseError = null;
                try {
                    await window.__geometry.step();
                } catch (e) {
                    postReleaseError = String(e.message).includes('GEOMETRY_DISPOSED')
                        ? 'GEOMETRY_DISPOSED'
                        : String(e.message);
                }
                return {
                    refs: cleanup.refs,
                    idempotent: first === second,
                    renderersUnbound: cleanup.renderersUnbound === true,
                    nodesRemoved: cleanup.nodesRemoved === true,
                    controlsDisabled: cleanup.controlsDisabled === true,
                    postReleaseError,
                };
            });
            Object.assign(life, release);
            if (errors.length) life.error = errors.join(' | ');
        } catch (error) {
            life.error = String(error.stack || error);
        } finally {
            await page.close();
        }
    }
    async function normalRow(browser, engine, mode) {
        const row = { engine, mode, browserVersion: browser.version(), pageErrors: [], consoleErrors: [] };
        report.normals.push(row);
        const page = await browser.newPage({ viewport: { ...PAGE_VIEWPORT } });
        page.on('pageerror', (e) => row.pageErrors.push(String(e)));
        page.on('console', (m) => {
            if (m.type() === 'error') row.consoleErrors.push(m.text());
        });
        try {
            await page.goto(`${server.origin}/examples/interactive-geometry/?mode=${mode}`);
            await page.waitForFunction(() => !!window.__geometryNormal, null, { polling: 100, timeout: 45000 });
            row.before = await page.evaluate(() => window.__geometryNormal.snapshot());
            await page.waitForTimeout(400);
            if (mode === 'cut') await gesture(page, GESTURE);
            row.running = await page.evaluate(() => window.__geometryNormal.snapshot());
            await sleepTwoFrames(page);
            const file = path.join(artifacts, `${engine}-normal-${mode}.png`);
            const bytes = await page.screenshot();
            fs.writeFileSync(file, bytes, { flag: 'wx' });
            row.visible = {
                pngPath: path.relative(ROOT, file).replace(/\\/g, '/'),
                sha256: sha(bytes),
                bytes: bytes.length,
            };
            row.resets = [];
            for (let i = 0; i < 3; i++) {
                const before = await page.evaluate(() => window.__geometryNormal.snapshot());
                await page.locator('#reset').click();
                await page.waitForFunction(
                    (session) => window.__geometryNormal.snapshot().modelState.session > session,
                    before.modelState.session,
                    { polling: 50 },
                );
                row.resets.push({ before, after: await page.evaluate(() => window.__geometryNormal.snapshot()) });
            }
            await page.keyboard.press('Escape');
            await page.locator('#release').click();
            const receipt = await page.evaluate(async () => {
                const first = window.__geometryNormal.release(),
                    second = window.__geometryNormal.release();
                return {
                    cleanup: await first,
                    releaseIdentity: first === second,
                    events: window.__geometryNormal.userEvents(),
                };
            });
            Object.assign(row, receipt);
        } catch (e) {
            row.error = String(e.stack || e);
        } finally {
            await page.close();
        }
        process.stdout.write(`${engine} normal/${mode}: ${row.error ? 'ERROR' : 'COLLECTED'}\n`);
    }
    try {
        for (const engine of engines) {
            const browser = await pw[engine].launch({ ...launchOptions(engine), headless: true });
            try {
                for (const entry of planFor()) await cutRow(browser, engine, entry);
                for (const dpr of [1, 2]) await ribbonRow(browser, engine, dpr);
                await meshRow(browser, engine);
                await lifecycleRow(browser, engine);
                for (const mode of ['mesh', 'cut', 'ribbon']) await normalRow(browser, engine, mode);
            } finally {
                await browser.close();
            }
        }
    } finally {
        await server.close();
    }
    report.endedAt = new Date().toISOString();
    report.validation = validateReport(report);
    report.scopePassed = report.validation.ok;
    report.selectedValidation = validateSelectedReport(report, engines);
    report.selectedScopePassed = report.selectedValidation.ok;
    report.exitCode = report.selectedScopePassed ? 0 : 1;
    fs.writeFileSync(out, JSON.stringify(report, null, 2), { flag: 'wx' });
    process.stdout.write(
        JSON.stringify({
            out,
            scopePassed: report.scopePassed,
            selectedScopePassed: report.selectedScopePassed,
            errors: report.selectedValidation.errors.slice(0, 16),
        }) + '\n',
    );
    process.exitCode = report.exitCode;
}

module.exports = {
    checkCase,
    validateReport,
    validateSelectedReport,
    validateNormals,
    cutOracle,
    planFor,
    recomputeErrors,
    projectWorldToCss,
    uploadedCenterLine,
    GESTURE,
    GESTURE_RESIZED,
    CUT_ERROR_BUDGET,
    BLADE_ERROR_BUDGET,
    PAGE_VIEWPORT,
    INPUTS,
};
if (require.main === module)
    main().catch((e) => {
        console.error(e.stack);
        process.exitCode = 1;
    });
