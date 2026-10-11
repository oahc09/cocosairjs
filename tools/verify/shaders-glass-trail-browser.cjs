'use strict';
/** W4 C03 Glass Trail native collector; no SDK build, installed dependencies, extra canvas or standalone GL rendering. */
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto'),
    cp = require('node:child_process');
const { shaderLaunchOptions } = require('./shaders-browser-launch.cjs');
const { startIsolationProxy, navigateWithDPRRepair } = require('./shaders-browser-environment.cjs');
const contract = require('./shaders-effect-contract.cjs'),
    oracle = require('./shaders-glass-trail-oracle.cjs'),
    performanceOracle = require('./shaders-glass-trail-performance.cjs');
const ROOT = path.resolve(__dirname, '../..'),
    EXAMPLE = 'examples/shader-glass-trail';
const INPUTS = [
    `${EXAMPLE}/src/main.ts`,
    `${EXAMPLE}/src/parameters.ts`,
    `${EXAMPLE}/src/trail_stage.frag`,
    `${EXAMPLE}/src/glass_stage.frag`,
    `${EXAMPLE}/src/recorder.ts`,
    `${EXAMPLE}/src/effect.generated.ts`,
    `${EXAMPLE}/parameters.json`,
    `${EXAMPLE}/index.html`,
    `${EXAMPLE}/generate-effect.cjs`,
    `${EXAMPLE}/example.json`,
    `${EXAMPLE}/README.md`,
    `${EXAMPLE}/UPSTREAM.md`,
    `${EXAMPLE}/LICENSE.reference.txt`,
    'examples/shared/shader-blocks.js',
    'tools/verify/shaders-glass-trail-oracle.cjs',
    'tools/verify/shaders-glass-trail-browser.cjs',
    'tools/verify/shaders-glass-trail.tsconfig.json',
    'tools/verify/shaders-glass-trail-performance.cjs',
    'tools/verify/shaders-browser-environment.cjs',
    'tools/verify/shaders-browser-launch.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
    'tools/verify/shaders-effect-contract.cjs',
    // Mother CPU oracles imported by the C03 composition oracle + their definitions.
    'tools/verify/shaders-cursor-trail-oracle.cjs',
    'tools/verify/shaders-glass-oracle.cjs',
    'examples/shader-cursor-trail/parameters.json',
    'examples/shader-glass/parameters.json',
    // API evidence production helper + its actual dependency + API inventory.
    'tools/verify/shaders-api-evidence.cjs',
    'tools/examples/spec-evidence.cjs',
    'docs/example-api-inventory.json',
    'examples/shared/shader-lifecycle.ts',
    'examples/shared/asset-lifecycle.js',
    'examples/shared/asset-lifecycle.d.ts',
];
const SDK = ['build/cocosair.module.js', 'build/cocosair.module.d.ts', 'build/npm/cocosair.module.js'];
const REFERENCE = {
    repo: 'shader-effects-inc/shaders',
    commit: 'dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a',
    license: 'MIT',
    files: [
        'packages/core/src/shaders/CursorTrail/index.ts',
        'packages/core/src/shaders/Glass/index.ts',
        'packages/core/src/gpu/kit/effects/glass.ts',
        'packages/core/src/gpu/kit/blur.ts',
        'packages/core/src/gpu/kit/blend.ts',
        'packages/core/src/gpu/kit/host/pointer.ts',
        'packages/core/src/gpu/kit/agents.ts',
        'packages/core/src/std/paint/materials.ts',
    ],
};

// Canonical pointer plan replayed by both the browser mouse feed and the CPU oracle.
const POINTER_PLAN = [
    { x: 0.2, y: 0.4 },
    { x: 0.3, y: 0.5 },
    { x: 0.4, y: 0.55 },
    { x: 0.5, y: 0.5 },
    { x: 0.65, y: 0.45 },
];

/** Replay frames for an entry: the AUTHORITATIVE per-simulation-frame ledger (real dt,
 * pointer actually used including age-continuation frames with no new pointer event, params,
 * packed bytes). The canonical POINTER_PLAN is a frozen interaction plan only — it is NEVER
 * used to paper over a missing ledger. */
function framesOf(entry) {
    const ledger = Array.isArray(entry?.simulationFrames)
        ? entry.simulationFrames
        : Array.isArray(entry?.snapshot?.simulationFrames)
          ? entry.snapshot.simulationFrames
          : [];
    if (!ledger.length) return null; // missing chain is an error, not a fallback
    return ledger.map((f) => ({
        x: f.pointer?.x,
        y: f.pointer?.y,
        dt: f.dt,
        aspect: f.aspect,
        trailLength: f.trailLength,
        trailRadius: f.trailRadius,
    }));
}
/** Seed the frozen real gesture on the CURRENT session: 5 trusted primary mouse moves
 * (each followed by a positive 1/60 step) plus the sixth continuation step. Used before
 * temporal A and re-seeded AFTER recreate so determinism/b/pause/resume share a real,
 * freshly-ingested trajectory instead of a stale ledger over a blank recorder. */
async function seedFrozenGesture(page) {
    await page.evaluate(() => window.__glasstrail.__resetSession());
    await page.evaluate(() => (window.__gtGLSessionStart = (window.__gtGLUploads || []).length));
    for (const point of POINTER_PLAN) {
        await page.mouse.move(point.x * 640, (1 - point.y) * 400);
        await page.evaluate((dt) => window.__glasstrail.step(dt), 1 / 60);
    }
    await page.evaluate((dt) => window.__glasstrail.step(dt), 1 / 60);
}

/** Session-cursor contract: call BEFORE seeding a session; returns the cursor. */
async function glSessionStart(page) {
    return await page.evaluate(() => (window.__gtGLSessionStart = (window.__gtGLUploads || []).length));
}
/** Collect native GL uploads recorded SINCE the given cursor (per-session, exact count). */
async function readGLUploads(page, since = 0) {
    return await page.evaluate((from) => (window.__gtGLUploads || []).slice(from).map((u) => ({ ...u })), since);
}
const CAPTURES = [
    ['default', {}],
    ['box', { shape: 'rounded-box' }],
    ['glass-off', { glassEnabled: 'off' }],
    ['trail-off', { trailEnabled: 'off' }],
    ['both-off', { glassEnabled: 'off', trailEnabled: 'off' }],
    ['refraction-zero', { glassRefraction: 0 }],
    ['blur-vogel', { glassBlur: 8 }],
    ['aberration-max', { glassAberration: 2 }],
    ['inner-zoom', { glassInnerZoom: 0.6 }],
    ['trail-long', { trailLength: 2 }],
    ['background-light', {}],
];
const DPR2 = ['default', 'box'];
const CAPTURE_TIME = 0.25;
const BACKGROUND = (id) => (id === 'background-light' ? [180, 160, 140] : [8, 9, 12]);
const VISUAL_PLAN = [...CAPTURES.map(([id]) => ({ id, dpr: 1 })), ...DPR2.map((id) => ({ id, dpr: 2 }))].map(
    (entry) => {
        const [, patch] = CAPTURES.find(([id]) => id === entry.id);
        return { ...entry, patch };
    },
);
const INVALID_CASES = [
    { kind: 'null', parameter: '$', code: 'GLASSTRAIL_PARAMETERS' },
    { kind: 'unknown', parameter: 'unknown', code: 'GLASSTRAIL_UNKNOWN_PARAMETER' },
    { kind: 'nan', parameter: 'glassRefraction', code: 'GLASSTRAIL_PARAMETER_TYPE' },
    { kind: 'infinity', parameter: 'glassRefraction', code: 'GLASSTRAIL_PARAMETER_TYPE' },
    { kind: 'shape', parameter: 'shape', code: 'GLASSTRAIL_PARAMETER_ENUM' },
    { kind: 'color', parameter: 'trailColorA', code: 'GLASSTRAIL_COLOR_FORMAT' },
];
/** Frozen performance plan: 3 profiles per engine (9 windows total, single composition pass). */
const PERFORMANCE_PLAN = [
    { profile: { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 } },
    { profile: { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 } },
    { profile: { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 } },
];
const profiles = [
    { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 },
    { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 },
    { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 },
];
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fileIdentity = (file) => {
    const b = fs.readFileSync(path.resolve(ROOT, file));
    return {
        path: path.relative(ROOT, path.resolve(ROOT, file)).replace(/\\/g, '/'),
        bytes: b.length,
        sha256: hash(b),
    };
};
function currentIdentity() {
    return {
        inputs: [...INPUTS, ...SDK].map(fileIdentity),
        reference: {
            ...REFERENCE,
            files: REFERENCE.files.map((f) => fileIdentity('output/shaders-absorption/reference/' + f)),
        },
    };
}
const same = (a, b) => contract.canonical(a) === contract.canonical(b);
function pngDimensions(file) {
    try {
        const { PNG } = require('pngjs');
        const png = PNG.sync.read(fs.readFileSync(path.resolve(ROOT, file)));
        return { width: png.width, height: png.height };
    } catch (error) {
        return { error: String(error.message || error).split('\n')[0] };
    }
}
function checkPng(entry, label, errors, expectedSize) {
    try {
        const now = fileIdentity(entry.png.path);
        if (now.sha256 !== entry.png.sha256 || now.bytes !== entry.png.bytes)
            errors.push(`${label}: PNG identity drift`);
        const dims = pngDimensions(entry.png.path);
        if (dims.error) errors.push(`${label}: PNG unreadable ${dims.error}`);
        else if (
            (expectedSize && (dims.width !== expectedSize.width || dims.height !== expectedSize.height)) ||
            (!expectedSize && (dims.width <= 0 || dims.height <= 0))
        )
            errors.push(`${label}: PNG size ${dims.width}x${dims.height}`);
    } catch (error) {
        errors.push(`${label}: PNG ${String(error.message || error).split('\n')[0]}`);
    }
}
function validateBuild(report, errors) {
    const build = report.build;
    if (!build || typeof build !== 'object') {
        errors.push('build record required');
        return;
    }
    if (build.exitCode !== 0) errors.push('build exitCode must be 0');
    if (typeof build.bundleBytes !== 'number' || !Number.isFinite(build.bundleBytes) || build.bundleBytes <= 0)
        errors.push('build bundleBytes nonzero');
    try {
        const now = fileIdentity(build.raw.path);
        if (now.sha256 !== build.raw.sha256 || now.bytes !== build.raw.bytes) errors.push('build log identity');
        const text = fs.readFileSync(path.resolve(ROOT, build.raw.path), 'utf8');
        if (!text.includes('exitCode=0')) errors.push('build log content');
    } catch (error) {
        errors.push('build log unreadable');
    }
}
function validateCaptureTuples(e, errors) {
    const captures = e.captures;
    if (!Array.isArray(captures) || captures.length !== VISUAL_PLAN.length) {
        errors.push(`${e.engine}: visual tuple count ${captures?.length} != ${VISUAL_PLAN.length}`);
        return;
    }
    for (const [index, plan] of VISUAL_PLAN.entries()) {
        const c = captures[index],
            label = `${e.engine}:capture[${index}]`;
        if (!c || typeof c !== 'object') {
            errors.push(`${label}: object required`);
            continue;
        }
        if (c.id !== plan.id || c.dpr !== plan.dpr)
            errors.push(`${label}: tuple ${c.id}@${c.dpr} != frozen ${plan.id}@${plan.dpr}`);
        const expectedParams = { ...oracle.defaults(), ...plan.patch };
        if (!same(c.params, expectedParams)) errors.push(`${label}: params not frozen defaults+patch`);
        if (Object.values(c.params ?? {}).some((v) => typeof v === 'number' && !Number.isFinite(v)))
            errors.push(`${label}: non-finite param`);
        if (c.time !== CAPTURE_TIME) errors.push(`${label}: time ${c.time} != frozen ${CAPTURE_TIME}`);
        if (!same(c.presentation, { background: BACKGROUND(plan.id), linearDiagnostic: false }))
            errors.push(`${label}: presentation not frozen`);
        const snap = c.snapshot;
        if (!snap || typeof snap !== 'object') errors.push(`${label}: snapshot required`);
        else {
            if (!same(snap.params, expectedParams)) errors.push(`${label}: snapshot params`);
            if (snap.time !== CAPTURE_TIME) errors.push(`${label}: snapshot time`);
            if (!same(snap.viewport, { width: 640, height: 400 })) errors.push(`${label}: snapshot viewport`);
            if (snap.canvas?.width !== 640 * plan.dpr || snap.canvas?.height !== 400 * plan.dpr)
                errors.push(`${label}: snapshot backing ${snap.canvas?.width}x${snap.canvas?.height}`);
            if (snap.dpr !== plan.dpr) errors.push(`${label}: snapshot dpr`);
            // Shader variant contract: the ACTUALLY compiled defines must match the params
            // (changing glassBlur 0->8 must recompile USE_BLUR on the live material).
            const glassPass = Array.isArray(snap.shaderPasses)
                ? snap.shaderPasses.find((x) => x?.program?.includes('glass'))
                : null;
            if (!glassPass || typeof glassPass.defines !== 'object')
                errors.push(`${label}: compiled defines not recorded`);
            else {
                const wantBlur = expectedParams.glassBlur > 0,
                    wantAb = expectedParams.glassAberration > 0,
                    wantBox = expectedParams.shape === 'rounded-box';
                const gotBlur = glassPass.defines.USE_BLUR === true,
                    gotAb = glassPass.defines.USE_ABERRATION === true,
                    gotBox = glassPass.defines.SHAPE_BOX === true;
                if (gotBlur !== wantBlur || gotAb !== wantAb || gotBox !== wantBox)
                    errors.push(
                        `${label}: compiled variant mismatch (blur ${gotBlur}/${wantBlur}, aberration ${gotAb}/${wantAb}, box ${gotBox}/${wantBox})`,
                    );
            }
            // Variant swap receipt (present when pipeline flags changed after init): the
            // previous glass material must be retired 1->0 and destroyed; same instance;
            // borrowed RT retained. A leaked old material cannot pass.
            const vr = snap.variantReceipt;
            if (vr) {
                if (
                    vr.retired?.refCountBefore !== 1 ||
                    vr.retired?.refCountAfter !== 0 ||
                    vr.retired?.destroyed !== true
                )
                    errors.push(`${label}: variant retirement not paired (leak)`);
                if (vr.fresh?.refCount !== 1 || vr.fresh?.initialized !== true)
                    errors.push(`${label}: variant fresh material state invalid`);
                if (vr.sameInstance !== true) errors.push(`${label}: variant swap changed instance`);
                if (vr.borrowedTrailTargetRetained !== true)
                    errors.push(`${label}: variant swap dropped the borrowed RT`);
            }
        }
        // Pointer trajectory contract: the capture must carry the canonical plan, a matching
        // receipt, trusted primary pointer logs, and at least one real points upload.
        if (
            !Array.isArray(c.pointerPlan) ||
            c.pointerPlan.length !== POINTER_PLAN.length ||
            same(c.pointerPlan, POINTER_PLAN) === false
        )
            errors.push(`${label}: pointer plan not the canonical trajectory`);
        if (!Array.isArray(c.pointerReceipt) || c.pointerReceipt.length !== POINTER_PLAN.length)
            errors.push(`${label}: pointer receipt missing`);
        const logs = Array.isArray(c.pointerLog) ? c.pointerLog : [];
        if (logs.some((x) => x?.isTrusted !== true || x?.isPrimary !== true))
            errors.push(`${label}: untrusted or non-primary pointer events`);
        // Upload evidence lives on snapshot.trail (production structure). Each entry must
        // carry frame/bytes(512)/count/generation/packedSha256; frames strictly increase.
        const uploads = Array.isArray(snap?.trail?.uploads) ? snap.trail.uploads : [];
        if (
            !uploads.length ||
            uploads.some(
                (u) =>
                    !Number.isSafeInteger(u?.frame) ||
                    !Number.isFinite(u?.bytes) ||
                    u.bytes !== 512 ||
                    !Number.isSafeInteger(u?.count) ||
                    u.count <= 0 ||
                    !Number.isSafeInteger(u?.generation) ||
                    typeof u?.packedTag !== 'string' ||
                    !Array.isArray(u?.packed) ||
                    u.packed.length !== 256 ||
                    u.packed.some((w) => !Number.isInteger(w) || w < 0 || w > 65535) ||
                    !u?.uploadNativeReceipt ||
                    !Number.isSafeInteger(u.uploadNativeReceipt?.frame) ||
                    u.uploadNativeReceipt?.bytes !== 512,
            )
        )
            errors.push(`${label}: points upload evidence missing/invalid`);
        if (snap?.trail?.uploadCount !== uploads.length)
            errors.push(`${label}: uploadCount ${snap?.trail?.uploadCount} != uploads ${uploads.length}`);
        for (let u = 1; u < uploads.length; u++)
            if (uploads[u].frame <= uploads[u - 1].frame)
                errors.push(`${label}: upload frames not strictly increasing (duplicate step upload)`);
        // One upload per POSITIVE-dt simulation frame (ledger-authoritative, not self-reported):
        // age-continuation frames without new pointer events upload too.
        const ledger = Array.isArray(snap?.simulationFrames) ? snap.simulationFrames : [];
        if (uploads.length !== ledger.length)
            errors.push(
                `${label}: uploads ${uploads.length} != simulation frames ${ledger.length} (one upload per positive-dt frame)`,
            );
        // Anti-whitewash (authoritative): rebuild the packed texture from the ledger's own
        // frame sequence and require the RECORDED packed array to be byte-equal per frame.
        if (ledger.length && uploads.length === ledger.length) {
            const frames = ledger.map((f) => ({ x: f.pointer?.x, y: f.pointer?.y, dt: f.dt }));
            for (let k = 0; k < uploads.length; k++) {
                const rep = oracle.replay(frames.slice(0, k + 1), expectedParams, 640, 400);
                const rebuilt = Array.from(rep.bits);
                const recorded = uploads[k].packed;
                if (
                    rebuilt.length !== recorded?.length ||
                    rebuilt.some((w, k2) => w !== recorded[k2]) ||
                    rebuilt.some((w) => !Number.isInteger(w))
                )
                    errors.push(`${label}: upload ${k} packed bytes do not match CPU replay`);
            }
        } else if (!ledger.length) {
            errors.push(`${label}: simulation-frame ledger missing for packed cross-check`);
        }
        // Raw event <-> ledger binding: a frame that consumed a new pointer event must use the
        // pointer recomputed from that event's raw clientX/clientY over its recorded rect;
        // frames without a new event must HOLD the previous pointer.
        {
            const rawLogs = Array.isArray(c.pointerLog) ? c.pointerLog : [];
            let prevPointer = null;
            for (const [li, f] of ledger.entries()) {
                if (f.eventSequence !== null && f.eventSequence !== undefined) {
                    const ev = rawLogs.find(
                        (x) => x?.sequence === f.eventSequence && x?.isPrimary === true && x?.isTrusted === true,
                    );
                    if (!ev) errors.push(`${label}: frame ${li} eventSequence ${f.eventSequence} not in raw log`);
                    else {
                        const uvx = (ev.clientX - ev.rect.left) / Math.max(1, ev.rect.width);
                        const uvy = 1 - (ev.clientY - ev.rect.top) / Math.max(1, ev.rect.height);
                        if (Math.abs(uvx - f.pointer.x) > 1e-6 || Math.abs(uvy - f.pointer.y) > 1e-6)
                            errors.push(`${label}: frame ${li} pointer does not match raw event coordinates`);
                    }
                } else if (prevPointer && (prevPointer.x !== f.pointer.x || prevPointer.y !== f.pointer.y))
                    errors.push(`${label}: frame ${li} pointer changed without a new event`);
                prevPointer = f.pointer;
            }
        }
        // NATIVE GL upload hook (independent of self-reported receipts): the recorded
        // texSubImage2D/texImage2D calls for the 64x1 half-float points texture must match
        // the session's simulation frames exactly (count, 512 bytes, stable texture id).
        // hookErrors must be an explicit empty array per capture (missing/string reject).
        if (!Array.isArray(c.hookErrors) || c.hookErrors.length !== 0)
            errors.push(`${label}: hookErrors must be an explicit empty array`);
        const glLog = Array.isArray(c.glUploads) ? c.glUploads : [];
        const pointsUploads = glLog.filter((u) => u?.width === 64 && u?.height === 1);
        if (pointsUploads.some((u) => u.call !== 'texSubImage2D'))
            errors.push(`${label}: native 64x1 upload used a call other than texSubImage2D`);
        if (
            pointsUploads.some(
                (u) =>
                    u.target !== 3553 ||
                    u.level !== 0 ||
                    u.xoffset !== 0 ||
                    u.yoffset !== 0 ||
                    u.format !== 6408 ||
                    u.type !== 5131,
            )
        )
            errors.push(`${label}: native points upload target/level/offset/format/type invalid`);
        if (!glLog.length) errors.push(`${label}: native GL upload hook log missing (builtin-only logs rejected)`);
        else if (!pointsUploads.length) errors.push(`${label}: no native 64x1 points uploads in the session window`);
        else if (pointsUploads.length !== ledger.length)
            errors.push(
                `${label}: native 64x1 uploads ${pointsUploads.length} != simulation frames ${ledger.length} (exact count, double/missing rejected)`,
            );
        else if (pointsUploads.some((u) => u.bytes !== 512))
            errors.push(`${label}: native GL points upload bytes not 512 (whitewashed)`);
        else if (pointsUploads.some((u) => u?.texture == null))
            errors.push(`${label}: native points upload missing stable texture identity`);
        else if (new Set(pointsUploads.map((u) => u.texture)).size !== 1)
            errors.push(`${label}: native points uploads span multiple textures (wrong texture id)`);
        else if (
            pointsUploads.some(
                (u, gi2) => u.frame !== ledger[gi2]?.frame || u.sessionGeneration !== ledger[gi2]?.sessionGeneration,
            )
        )
            errors.push(`${label}: native upload frame/session does not bind the ledger`);
        // Native byte CONTENT: the hook's payloadWords (all 256 uint16 of the payload) must
        // equal the CPU-rebuilt packed payload for the matching upload.
        if (pointsUploads.length === uploads.length && ledger.length) {
            const ledFrames = ledger.map((f) => ({
                x: f.pointer?.x,
                y: f.pointer?.y,
                dt: f.dt,
                aspect: f.aspect,
                trailLength: f.trailLength,
                trailRadius: f.trailRadius,
            }));
            for (let gi = 0; gi < pointsUploads.length; gi++) {
                const rebuilt = Array.from(oracle.replay(ledFrames.slice(0, gi + 1), expectedParams, 640, 400).bits);
                const nativeWords = pointsUploads[gi].payloadWords;
                if (!Array.isArray(nativeWords) || nativeWords.length !== 256)
                    errors.push(`${label}: native upload ${gi} missing raw word payload`);
                else if (nativeWords.some((w, wi) => w !== rebuilt[wi]))
                    errors.push(`${label}: native upload ${gi} raw bytes do not match CPU replay`);
            }
        }
        checkPng(c, label, errors, { width: 640 * plan.dpr, height: 400 * plan.dpr });
        const capPlan = framesOf(c.snapshot) ?? framesOf(c);
        if (!capPlan) errors.push(`${label}: simulation-frame ledger missing`);
        try {
            const checked = capPlan
                ? oracle.pngAudit(path.resolve(ROOT, c.png.path), c.params, c.time, capPlan, c.presentation)
                : { errors: ['ledger missing'], measurements: 0 };
            if (checked.errors.length) errors.push({ capture: c.id, dpr: c.dpr, errors: checked.errors.slice(0, 3) });
        } catch (error) {
            errors.push(`${label}: pngAudit ${String(error.message || error).split('\n')[0]}`);
        }
        // Diagnostic material contract: the probe must preserve the live trajectory —
        // same instance, byte-equal packed points, and untouched frame/upload ledgers.
        const preserved = c.probe?.preserved;
        if (
            !preserved ||
            preserved.packedEqual !== true ||
            preserved.countEqual !== true ||
            preserved.instanceEqual !== true ||
            preserved.framesEqual !== true
        )
            errors.push(`${label}: linear probe did not preserve trajectory/instance/ledgers`);
        // Numeric temp-material evidence: refs 1 -> 0 (paired teardown) and the renderer's
        // shared-material pointer restored to the ORIGINAL material.
        const tempRefs = c.probe?.tempRefs;
        if (tempRefs?.before !== 1 || tempRefs?.after !== 0)
            errors.push(`${label}: probe temp material refs not paired (${tempRefs?.before}->${tempRefs?.after})`);
        if (c.probe?.rendererRestored !== true) errors.push(`${label}: probe renderer material pointer not restored`);
        try {
            const probe = capPlan
                ? oracle.probeAudit(c.probe, c.params, c.time, capPlan, {
                      width: 640 * plan.dpr,
                      height: 400 * plan.dpr,
                  })
                : { errors: ['ledger missing'], measurements: 0 };
            errors.push(
                ...probe.errors.map((x) => ({
                    engine: e.engine,
                    capture: c.id,
                    dpr: c.dpr,
                    stage: 'linear-probe',
                    error: x,
                })),
            );
        } catch (error) {
            errors.push(`${label}: probeAudit ${String(error.message || error).split('\n')[0]}`);
        }
    }
    // Per-set rebuild contract, judged from the actual shape change; probe retire/recreate stays
    // separate (it happens after these observations).
    let previousParams = oracle.defaults();
    for (const [index, plan] of VISUAL_PLAN.entries()) {
        const c = captures[index],
            label = `${e.engine}:capture[${index}] set`;
        if (plan.dpr === 2 && VISUAL_PLAN[index - 1] && VISUAL_PLAN[index - 1].dpr === 1)
            previousParams = oracle.defaults(); // fresh DPR2 page restarts from loaded defaults
        const set = c?.set;
        if (!set?.before || !set?.receipt || !c?.snapshot) {
            errors.push(`${label}: observation missing`);
            continue;
        }
        if (!same(set.before.params, previousParams)) errors.push(`${label}: before params chain`);
        const shapeChanged = c.params.shape !== set.before.params.shape;
        if (shapeChanged) {
            if (!set.receipt.retirement) errors.push(`${label}: shape switch without rebuild receipt`);
            if (set.receipt.retirement?.refs?.length !== oracle.OWNED_KINDS.length)
                errors.push(`${label}: rebuild retirement refs`);
            if (c.snapshot.instance === set.before.instance) errors.push(`${label}: shape switch did not rebuild`);
        } else {
            if (set.receipt.retirement !== null) errors.push(`${label}: uniform update rebuilt (retirement)`);
            if (c.snapshot.instance !== set.before.instance) errors.push(`${label}: uniform update rebuilt (instance)`);
        }
        previousParams = c.params;
    }
    if (e.dpr2PageClosed !== true) errors.push(`${e.engine}: dpr2 page not closed`);
}
function validateTemporal(e, errors) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
        errors.push('temporal engine object required');
        return;
    }
    const t = e.temporal;
    if (!t || typeof t !== 'object') {
        errors.push(e.engine + ': temporal observation required');
        return;
    }
    if (!same(t.params, oracle.defaults())) errors.push(e.engine + ': temporal params not defaults');
    const a = t.a,
        b = t.b;
    if (!a?.snapshot || !b?.snapshot || a.time !== CAPTURE_TIME || b.time !== 0.27) {
        errors.push(e.engine + ': temporal times not frozen plan');
        return;
    }
    const planned = oracle.auditPoints(640, 400);
    /** Structural pixel-scope gate: exact frozen point set, valid byte channels — this runs
     * BEFORE any arithmetic so NaN/Inf or wrong coordinates can never slip through a comparison. */
    const pixelScope = (snap, label) => {
        if (!snap || typeof snap !== 'object') {
            errors.push(e.engine + ': temporal ' + label + ' snapshot required');
            return null;
        }
        const pixels = snap.pixels;
        if (!Array.isArray(pixels) || pixels.length !== planned.length) {
            errors.push(e.engine + ': temporal ' + label + ' pixel count ' + pixels?.length + ' != ' + planned.length);
            return null;
        }
        for (const [i, point] of planned.entries()) {
            const row = pixels[i];
            if (!row || row.x !== point.x || row.y !== point.y) {
                errors.push(e.engine + ': temporal ' + label + ' point ' + i + ' not frozen plan');
                return null;
            }
            if (!oracle.byteChannels(row.rgba)) {
                errors.push(
                    e.engine + ': temporal ' + label + ' malformed byte channels at ' + point.x + ',' + point.y,
                );
                return null;
            }
        }
        return pixels;
    };
    const bindSnapshot = (snap, label, expected) => {
        if (!snap || typeof snap !== 'object') {
            errors.push(e.engine + ': temporal ' + label + ' snapshot required');
            return;
        }
        if (!same(snap.params, expected.params)) errors.push(e.engine + ': temporal ' + label + ' params binding');
        if (snap.time !== expected.time) errors.push(e.engine + ': temporal ' + label + ' time binding');
        if (!same(snap.viewport, { width: 640, height: 400 }))
            errors.push(e.engine + ': temporal ' + label + ' viewport');
        if (snap.dpr !== 1) errors.push(e.engine + ': temporal ' + label + ' dpr');
        if (
            snap.canvas?.width !== 640 ||
            snap.canvas?.height !== 400 ||
            snap.gpuReceipt?.canvas?.width !== 640 ||
            snap.gpuReceipt?.canvas?.height !== 400
        )
            errors.push(e.engine + ': temporal ' + label + ' canvas/receipt backing');
        if (!same(snap.background, BACKGROUND('default')))
            errors.push(e.engine + ': temporal ' + label + ' background');
        if (
            !Number.isSafeInteger(snap.frame) ||
            snap.frame < 0 ||
            !snap.gpuReceipt ||
            !Number.isSafeInteger(snap.gpuReceipt.frame) ||
            snap.gpuReceipt.frame < 0 ||
            // Director emits AFTER_DRAW, then advances totalFrames before step() resolves.
            snap.gpuReceipt.frame + 1 !== snap.frame ||
            snap.gpuReceipt.time !== snap.time
        )
            errors.push(e.engine + ': temporal ' + label + ' receipt frame/time binding');
        if (Array.isArray(snap.pixels)) {
            // Dynamic oracle: replay THIS snapshot's authoritative simulation-frame ledger
            // (real dt, age-continuation frames included) — never a fixed canonical plan.
            const plan = framesOf(snap);
            if (!plan) errors.push(e.engine + ': temporal ' + label + ' simulation-frame ledger missing');
            for (const [i, point] of planned.entries()) {
                const actual = snap.pixels[i];
                if (!actual || !oracle.byteChannels(actual.rgba)) continue;
                const expectedPixel = oracle.model(
                    point.x,
                    point.y,
                    640,
                    400,
                    expected.params,
                    expected.time,
                    plan,
                ).display;
                if (actual.rgba.some((value, c) => Math.abs(value - expectedPixel[c]) > oracle.BYTE_TOLERANCE))
                    errors.push(
                        e.engine + ': temporal ' + label + ' oracle pixel mismatch at ' + point.x + ',' + point.y,
                    );
            }
        }
    };
    bindSnapshot(a.snapshot, 'a', { params: t.params, time: CAPTURE_TIME });
    bindSnapshot(b.snapshot, 'b', { params: t.params, time: 0.27 });
    const gpuA = pixelScope(a.snapshot, 'a'),
        gpuB = pixelScope(b.snapshot, 'b');
    for (const [label, entry] of [
        ['a', a],
        ['b', b],
    ]) {
        const plan = framesOf(entry);
        if (!plan) errors.push(e.engine + ': temporal ' + label + ' simulation-frame ledger missing');
        try {
            const probe = plan
                ? oracle.probeAudit(entry.probe, t.params, entry.time, plan, {
                      width: 640,
                      height: 400,
                  })
                : { errors: ['ledger missing'], measurements: 0 };
            errors.push(
                ...probe.errors.map((x) => ({ engine: e.engine, stage: 'temporal-' + label + '-probe', error: x })),
            );
        } catch (error) {
            errors.push(e.engine + ': temporal ' + label + ' probe ' + String(error.message || error).split('\n')[0]);
        }
        checkPng({ png: entry.png }, e.engine + ':temporal-' + label, errors, { width: 640, height: 400 });
        try {
            const audited = plan
                ? oracle.pngAudit(path.resolve(ROOT, entry.png.path), t.params, entry.time, plan)
                : { errors: ['ledger missing'], measurements: 0 };
            if (audited.errors.length)
                errors.push({
                    engine: e.engine,
                    stage: 'temporal-' + label + '-png',
                    errors: audited.errors.slice(0, 3),
                });
        } catch (error) {
            errors.push(
                e.engine + ': temporal ' + label + ' png audit ' + String(error.message || error).split('\n')[0],
            );
        }
    }
    // Determinism: the recreate must be a DIFFERENT instance under the SAME frozen state, and the
    // raw pixels must match a byte-for-byte — the equal flag alone proves nothing.
    const det = t.determinism;
    const detPixels = pixelScope(det?.snapshot, 'det');
    if (det?.snapshot) {
        bindSnapshot(det.snapshot, 'det', { params: t.params, time: CAPTURE_TIME });
        if (
            det.snapshot.instance === undefined ||
            a.snapshot.instance === undefined ||
            det.snapshot.instance === a.snapshot.instance
        )
            errors.push(e.engine + ': temporal determinism instance not rebuilt');
        if (gpuA && detPixels) {
            let identical = true;
            for (const [i, point] of planned.entries()) {
                for (let c = 0; c < 4; c++)
                    if (detPixels[i].rgba[c] !== gpuA[i].rgba[c]) {
                        errors.push(
                            e.engine + ': temporal determinism byte mismatch at ' + point.x + ',' + point.y + '/' + c,
                        );
                        identical = false;
                        break;
                    }
            }
            // The self-reported flag must agree with the recomputed verdict, not replace it.
            if (det.equal !== identical) errors.push(e.engine + ': temporal determinism flag contradicts raw data');
        }
    } else errors.push(e.engine + ': temporal determinism snapshot required');
    // Pause observation: with the clock paused, stepping must NOT advance the simulation time
    // and the raw GPU pixels must be byte-identical to the paused 'before' snapshot.
    // All structure gates run BEFORE arithmetic; missing/NaN/typed-wrong values reject.
    const pz = t.pause;
    if (!pz || typeof pz !== 'object') {
        errors.push(e.engine + ': temporal pause observation required');
    } else {
        if (!same(pz.params, oracle.defaults())) errors.push(e.engine + ': temporal pause frozen params');
        bindSnapshot(pz.before, 'pauseBefore', { params: t.params ?? oracle.defaults(), time: CAPTURE_TIME });
        bindSnapshot(pz.after, 'pauseAfter', { params: t.params ?? oracle.defaults(), time: CAPTURE_TIME });
        if (pz.before?.time !== CAPTURE_TIME) errors.push(e.engine + ': temporal pause before time not frozen plan');
        if (pz.before?.paused !== true) errors.push(e.engine + ': temporal pause before state not paused');
        if (pz.paused !== true || pz.after?.paused !== true)
            errors.push(e.engine + ': temporal pause flag not observed');
        // Instance must be the SAME (paused stepping does not recreate); frame must advance
        // (the step clock still renders frames even while paused).
        for (const [label, snap] of [
            ['before', pz.before],
            ['after', pz.after],
        ])
            if (!Number.isSafeInteger(snap?.instance) || (snap?.instance ?? 0) <= 0)
                errors.push(e.engine + ': temporal pause ' + label + ' instance not positive safeInt');
        if (
            Number.isSafeInteger(pz.after?.instance) &&
            Number.isSafeInteger(pz.before?.instance) &&
            pz.after.instance !== pz.before.instance
        )
            errors.push(e.engine + ': temporal pause instance changed');
        if (
            Number.isSafeInteger(pz.after?.frame) &&
            Number.isSafeInteger(pz.before?.frame) &&
            pz.after.frame <= pz.before.frame
        )
            errors.push(e.engine + ': temporal pause frame did not advance');
        // AFTER time must exist, be finite, and equal the paused time (strictly).
        if (typeof pz.after?.time !== 'number' || !Number.isFinite(pz.after?.time))
            errors.push(e.engine + ': temporal pause after time missing/non-finite');
        else if (pz.after.time !== pz.before?.time) errors.push(e.engine + ': temporal pause advanced time');
        const pzA = pixelScope(pz.before, 'pauseBefore'),
            pzB = pixelScope(pz.after, 'pauseAfter');
        if (pzA && pzB) {
            for (const [i, point] of planned.entries()) {
                for (let c = 0; c < 4; c++)
                    if (pzA[i].rgba[c] !== pzB[i].rgba[c]) {
                        errors.push(
                            e.engine + ': temporal pause byte mismatch at ' + point.x + ',' + point.y + '/' + c,
                        );
                        break;
                    }
            }
        }
    }
    // Resume observation: fixed dt advance, time strictly = before + dt, CPU oracle recomputes.
    const rs = t.resume;
    if (!rs || typeof rs !== 'object') {
        errors.push(e.engine + ': temporal resume observation required');
    } else {
        if (!same(rs.params, oracle.defaults())) errors.push(e.engine + ': temporal resume frozen params');
        bindSnapshot(rs.before, 'resumeBefore', { params: t.params ?? oracle.defaults(), time: CAPTURE_TIME });
        // dt is the FROZEN production constant 1/60, not a self-reported value.
        const RESUME_DT = 1 / 60;
        if (rs.dt !== RESUME_DT)
            errors.push(e.engine + ': temporal resume dt not frozen production constant (got ' + rs.dt + ')');
        if (rs.dt > 0 && Number.isFinite(rs.before?.time))
            bindSnapshot(rs.after, 'resumeAfter', {
                params: rs.params ?? t.params ?? oracle.defaults(),
                time: rs.before.time + rs.dt,
            });
        if (rs.before?.time !== CAPTURE_TIME) errors.push(e.engine + ': temporal resume before time');
        if (rs.before?.paused !== false) errors.push(e.engine + ': temporal resume before state not unpaused');
        if (typeof rs.dt !== 'number' || !Number.isFinite(rs.dt) || rs.dt <= 0)
            errors.push(e.engine + ': temporal resume dt not finite positive');
        // Instance must stay the same; frame must advance by the step.
        for (const [label, snap] of [
            ['before', rs.before],
            ['after', rs.after],
        ])
            if (!Number.isSafeInteger(snap?.instance) || (snap?.instance ?? 0) <= 0)
                errors.push(e.engine + ': temporal resume ' + label + ' instance not positive safeInt');
        if (
            Number.isSafeInteger(rs.after?.instance) &&
            Number.isSafeInteger(rs.before?.instance) &&
            rs.after.instance !== rs.before.instance
        )
            errors.push(e.engine + ': temporal resume instance changed');
        if (
            Number.isSafeInteger(rs.after?.frame) &&
            Number.isSafeInteger(rs.before?.frame) &&
            rs.after.frame <= rs.before.frame
        )
            errors.push(e.engine + ': temporal resume frame did not advance');
        // Viewport/backing binding: the AFTER snapshot must still show the plan canvas.
        if (rs.after?.canvas?.width !== 640 || rs.after?.canvas?.height !== 400)
            errors.push(e.engine + ': temporal resume after canvas dims');
        // AFTER time must exist, be finite, and equal before + dt (not self-reported).
        const resumedPixels = pixelScope(rs.after, 'resumeAfter');
        if (typeof rs.after?.time !== 'number' || !Number.isFinite(rs.after?.time)) {
            errors.push(e.engine + ': temporal resume after time missing/non-finite');
        } else if (Number.isFinite(rs.before?.time)) {
            // The resumed time is before + the FROZEN constant, not before + self-reported dt.
            const expectedTime = rs.before.time + RESUME_DT;
            if (rs.after.time !== expectedTime)
                errors.push(
                    e.engine + ': temporal resume time != before+dt (' + rs.after.time + ' vs ' + expectedTime + ')',
                );
            if (rs.after.time <= rs.before.time) errors.push(e.engine + ': temporal resume time did not advance');
            if (rs.after.paused !== false) errors.push(e.engine + ': temporal resume after not unpaused');
            if (resumedPixels) {
                for (const [i, point] of planned.entries()) {
                    const cpu = oracle.model(
                        point.x,
                        point.y,
                        640,
                        400,
                        rs.params ?? t.params ?? oracle.defaults(),
                        expectedTime,
                        framesOf(rs.after ?? rs.before) ?? [],
                    ).display;
                    for (let c = 0; c < 4; c++)
                        if (Math.abs(resumedPixels[i].rgba[c] - cpu[c]) > oracle.BYTE_TOLERANCE)
                            errors.push(
                                e.engine + ': temporal resume CPU mismatch at ' + point.x + ',' + point.y + '/' + c,
                            );
                }
            }
        }
    }
    // Adjacent-time drift: SIGNED channel deltas recomputed from the raw bytes against the
    // independent CPU display-chain prediction (frozen <= 3 codes CPU-side).
    if (gpuA && gpuB) {
        for (const [i, point] of planned.entries()) {
            const framesA = framesOf(a),
                framesB = framesOf(b);
            if (!framesA || !framesB) {
                errors.push(e.engine + ': temporal drift simulation-frame ledger missing');
                continue;
            }
            const cpuA = oracle.model(point.x, point.y, 640, 400, t.params, a.time, framesA).display;
            const cpuB = oracle.model(point.x, point.y, 640, 400, t.params, b.time, framesB).display;
            for (let c = 0; c < 3; c++) {
                const cpuDelta = cpuB[c] - cpuA[c];
                if (Math.abs(cpuDelta) > 3)
                    errors.push('temporal CPU drift exceeds frozen threshold at ' + point.x + ',' + point.y + '/' + c);
                const gpuDelta = gpuB[i].rgba[c] - gpuA[i].rgba[c];
                if (Math.abs(gpuDelta - cpuDelta) > oracle.BYTE_TOLERANCE + 3)
                    errors.push('temporal GPU drift disagrees with CPU at ' + point.x + ',' + point.y + '/' + c);
            }
        }
    }
}

function validateBoundaries(e, errors) {
    const plan = oracle.boundaryPlan(),
        rows = e.boundaries;
    if (
        !Array.isArray(rows) ||
        rows.length !== plan.length ||
        new Set(rows.map((b) => b.caseId)).size !== plan.length ||
        plan.some(
            (b) =>
                !rows.some(
                    (row) =>
                        row.caseId === b.caseId &&
                        row.parameter === b.parameter &&
                        row.boundary === b.boundary &&
                        row.value === b.value,
                ),
        )
    ) {
        errors.push(`${e.engine}: boundary exact set`);
        return;
    }
    const defaults = oracle.defaults();
    for (const row of rows) {
        const label = `boundary:${row.caseId}`;
        if (!row.before || !row.after || !row.receipt) {
            errors.push(`${label}: observation missing`);
            continue;
        }
        const frozenInput = { ...defaults, [row.parameter]: row.value };
        if (row.boundary === 'invalid') {
            if (row.receipt.ok !== false || !Array.isArray(row.receipt.errors) || row.receipt.errors.length === 0)
                errors.push(`${label}: invalid accepted`);
            if (!same(row.after.params, row.before.params)) errors.push(`${label}: partial parameter application`);
            if (row.after.instance !== row.before.instance) errors.push(`${label}: rebuild on rejection`);
            if (row.after.updates !== row.before.updates) errors.push(`${label}: update on rejection`);
        } else {
            if (row.receipt.ok !== true) errors.push(`${label}: valid rejected`);
            else if (!same(row.after.params, frozenInput)) errors.push(`${label}: after params not frozen input`);
            if (Object.values(row.after.params ?? {}).some((v) => typeof v === 'number' && !Number.isFinite(v)))
                errors.push(`${label}: non-finite after param`);
            if (row.parameter === 'shape' && row.boundary === 'default') {
                if (row.after.instance !== row.before.instance) errors.push(`${label}: default rebuild`);
            } else if (row.after.instance !== row.before.instance || row.receipt.retirement !== null)
                errors.push(`${label}: uniform update must not rebuild`);
        }
    }
}
function validateInvalids(e, errors) {
    const invalids = e.invalids;
    if (!Array.isArray(invalids) || invalids.length !== INVALID_CASES.length) {
        errors.push(`${e.engine}: invalid case count ${invalids?.length} != ${INVALID_CASES.length}`);
        return;
    }
    for (const [index, frozen] of INVALID_CASES.entries()) {
        const row = invalids[index],
            label = `${e.engine}:invalid[${index}]`;
        if (!row || typeof row !== 'object') {
            errors.push(`${label}: object required`);
            continue;
        }
        if (row.case?.kind !== frozen.kind || row.case?.parameter !== frozen.parameter)
            errors.push(`${label}: frozen case ${row.case?.kind}/${row.case?.parameter}`);
        if (row.receipt?.ok !== false || !Array.isArray(row.receipt?.errors) || row.receipt.errors.length === 0)
            errors.push(`${label}: accepted`);
        else if (!row.receipt.errors.some((x) => x?.code === frozen.code && x?.parameter === frozen.parameter))
            errors.push(`${label}: error code ${frozen.code}/${frozen.parameter}`);
        if (row.before && row.after) {
            if (!same(row.after.params, row.before.params)) errors.push(`${label}: partial application`);
            if (row.after.instance !== row.before.instance) errors.push(`${label}: rebuild`);
            if (row.after.updates !== row.before.updates) errors.push(`${label}: update leak`);
        } else errors.push(`${label}: before/after observation`);
    }
}
function validateNormal(e, errors) {
    const n = e.normal;
    if (!n || typeof n !== 'object') {
        errors.push(`${e.engine}: native controls required`);
        return;
    }
    const param = n.parameter;
    if (
        !param?.before ||
        !param?.after ||
        param.after.params.glassRefraction === param.before.params.glassRefraction ||
        param.after.instance !== param.before.instance
    )
        errors.push(`${e.engine}: trusted parameter control`);
    if (!n.pause || n.pause.before.time !== n.pause.after.time) errors.push(`${e.engine}: pause clock`);
    if (!n.resume || n.resume.after.time <= n.resume.before.time) errors.push(`${e.engine}: resume clock`);
    // Reset truth = the real-time completion receipt (fresh session, time 0), NOT a later
    // snapshot whose time may have advanced under the native pacer. The afterward snapshot
    // must remain active/consistent (time >= 0).
    const reset = n.reset;
    if (
        !reset?.receipt ||
        !same(reset.receipt.params, oracle.defaults()) ||
        reset.receipt.time !== 0 ||
        !Number.isSafeInteger(reset.receipt.sessionGeneration) ||
        reset.receipt.sessionGeneration <= 0
    )
        errors.push(`${e.engine}: reset receipt`);
    if (reset?.afterward && (reset.afterward.time < 0 || reset.afterward.released === true))
        errors.push(`${e.engine}: reset afterward not active`);
    const events = Array.isArray(n.events) ? n.events : [];
    const order = ['parameter', 'pause', 'resume', 'reset', 'release'];
    let cursor = -1;
    for (const event of events) {
        const prefix = event.type.split(':')[0];
        const at = order.indexOf(prefix);
        if (at >= 0) {
            if (at < cursor) errors.push(`${e.engine}: trusted event order`);
            cursor = at;
        }
        if (at >= 0 && event.isTrusted !== true) errors.push(`${e.engine}: untrusted ${prefix}`);
    }
    if (cursor !== order.length - 1) errors.push(`${e.engine}: trusted control coverage`);
    const release = n.release;
    if (
        !release ||
        release.retirement?.refs?.length !== oracle.OWNED_KINDS.length ||
        JSON.stringify(release.retirement?.refs?.map((r) => r.kind)?.sort()) !==
            JSON.stringify([...oracle.OWNED_KINDS].sort()) ||
        release.retirement.refs.some((r) => r.before !== 1 || r.after !== 0) ||
        release.retirement.renderersUnbound !== true ||
        release.retirement.nodesRemoved !== true ||
        release.sceneCleared !== true ||
        release.listenerAdds !== release.listenerRemoves ||
        // Ledger contract: every installed listener (ledger) is explicitly removed and the
        // counts reconcile; a post-release dispatch must no longer record anything.
        release.ledger !== release.listenerAdds ||
        release.postReleaseDispatchSilent !== true
    )
        errors.push(`${e.engine}: owned release`);
}
function validateLifecycle(e, errors) {
    const l = e.lifecycle;
    if (!l || typeof l !== 'object') {
        errors.push(`${e.engine}: lifecycle required`);
        return;
    }
    const recreated = l.recreated;
    if (
        !recreated?.trace ||
        recreated.trace.refs?.length !== oracle.OWNED_KINDS.length ||
        recreated.trace.refs.some((r) => r.before !== 1 || r.after !== 0)
    )
        errors.push(`${e.engine}: recreate retirement`);
    if (recreated?.trace?.id !== undefined && recreated?.snapshot?.instance !== undefined) {
        if (recreated.trace.id === recreated.snapshot.instance)
            errors.push(`${e.engine}: recreated instance not distinct`);
        if (recreated.trace.idempotent !== false) errors.push(`${e.engine}: recreate trace idempotence flag`);
    }
    if (l.samePromise !== true) errors.push(`${e.engine}: release promise identity`);
    if (l.terminalCode !== 'GLASSTRAIL_DISPOSED') errors.push(`${e.engine}: terminal guard code`);
    if (!l.release?.sceneCleared || l.release.listenerAdds !== l.release.listenerRemoves)
        errors.push(`${e.engine}: terminal cleanup`);
}
function validateResize(e, errors) {
    const r = e.resize;
    if (!r || typeof r !== 'object') {
        errors.push(`${e.engine}: live resize required`);
        return;
    }
    if (!same(r.before?.canvas?.css, { width: 640, height: 400 }) || r.before?.canvas?.width !== 640)
        errors.push(`${e.engine}: resize start 640x400`);
    if (!same(r.after?.canvas?.css, { width: 480, height: 320 }) || r.after?.canvas?.width !== 480)
        errors.push(`${e.engine}: resize result 480x320`);
    // The resize phase must run under the frozen default presentation — no background-light
    // pollution from the visual phase. Verified on both snapshots and both GPU receipts.
    for (const [label, snap] of [
        ['before', r.before],
        ['after', r.after],
    ]) {
        if (!same(snap?.params, oracle.defaults())) errors.push(`${e.engine}: resize ${label} params not defaults`);
        if (snap?.linearDiagnostic !== false) errors.push(`${e.engine}: resize ${label} linearDiagnostic`);
        if (!same(snap?.background, BACKGROUND('default'))) errors.push(`${e.engine}: resize ${label} background`);
        if (!same(snap?.gpuReceipt?.background, BACKGROUND('default')))
            errors.push(`${e.engine}: resize ${label} gpuReceipt background`);
    }
    const frames = Array.isArray(r.resizeFrames) ? r.resizeFrames : [];
    if (frames.length < 3) errors.push(`${e.engine}: resize observation frames`);
    // Per-frame aspect contract: historical frames may carry the PRE-resize aspect (they were
    // recorded then), but the LATEST frame — recorded at the post-resize backing — must carry
    // the post-resize aspect; replaying the OLD aspect on new frames is a fabricated ledger.
    {
        const rsFrames = Array.isArray(r.after?.simulationFrames) ? r.after.simulationFrames : [];
        if (rsFrames.length) {
            const want = r.after.canvas.width / r.after.canvas.height;
            const last = rsFrames[rsFrames.length - 1];
            if (Math.abs((last.aspect ?? want) - want) > 1e-9)
                errors.push(`${e.engine}: resize latest frame aspect ${last.aspect} != backing ${want}`);
            // The session was seeded at the PRE-resize viewport: earlier frames must carry the
            // pre-resize aspect (from r.before's canvas) — relabeling everything with the
            // final aspect is a fabricated ledger.
            const preAspect =
                r.before?.canvas?.width && r.before?.canvas?.height
                    ? r.before.canvas.width / r.before.canvas.height
                    : null;
            if (
                preAspect !== null &&
                Math.abs(preAspect - want) > 1e-9 &&
                !rsFrames.some((f) => Math.abs((f.aspect ?? 0) - preAspect) < 1e-9)
            )
                errors.push(`${e.engine}: resize ledger lost the pre-resize aspect ${preAspect}`);
        }
    }
    for (const [i, frame] of frames.entries()) {
        if (!frame?.canvas || frame.canvas.width !== 480 || frame.canvas.height !== 320)
            errors.push(`${e.engine}: resize frame ${i} backing`);
        if (i && frame.simulationStep <= frames[i - 1].simulationStep)
            errors.push(`${e.engine}: resize frame ${i} not advancing`);
    }
    checkPng(r, `${e.engine}:resize`, errors, { width: 480, height: 320 });
    try {
        const resizePlan = framesOf(r.after);
        if (!resizePlan) errors.push(e.engine + ': resize simulation-frame ledger missing');
        const gpu = resizePlan
            ? oracle.probeAudit(r.probe, oracle.defaults(), r.after.time, resizePlan, {
                  width: 480,
                  height: 320,
              })
            : { errors: ['ledger missing'], measurements: 0 };
        if (gpu.errors.length) errors.push({ engine: e.engine, stage: 'resize-probe', errors: gpu.errors.slice(0, 3) });
        const checked = resizePlan
            ? oracle.pngAudit(path.resolve(ROOT, r.png.path), oracle.defaults(), r.after.time, resizePlan)
            : { errors: ['ledger missing'], measurements: 0 };
        if (checked.errors.length)
            errors.push({ engine: e.engine, stage: 'live-resize-presentation', errors: checked.errors.slice(0, 3) });
    } catch (error) {
        errors.push(`${e.engine}: resize audit ${String(error.message || error).split('\n')[0]}`);
    }
}
function validateFilesInner(report) {
    const errors = [];
    if (!report || typeof report !== 'object') return { ok: false, errors: ['report object required'] };
    if (report.schemaVersion !== 'w4-c03-glass-trail/1') return { ok: false, errors: ['schema'] };
    if (
        !Array.isArray(report.inputs) ||
        !Array.isArray(report.engines) ||
        !Array.isArray(report.requestedEngines) ||
        report.requestedEngines.length === 0
    )
        return { ok: false, errors: ['report structure'] };
    for (const f of report.inputs || []) {
        try {
            const now = fileIdentity(f.path);
            if (now.sha256 !== f.sha256 || now.bytes !== f.bytes) errors.push(`drift:${f.path}`);
        } catch {
            errors.push(`missing:${f.path}`);
        }
    }
    const closure = currentIdentity();
    const apiCheck = require('./shaders-api-evidence.cjs').validateAPIEvidence(path.join(ROOT, EXAMPLE));
    errors.push(...apiCheck.errors.map((error) => 'API evidence: ' + error));
    if (JSON.stringify(report.inputs) !== JSON.stringify(closure.inputs)) errors.push('input closure');
    if (!report.reference || JSON.stringify(report.reference) !== JSON.stringify(closure.reference))
        errors.push('reference closure');
    const engines = report.requestedEngines;
    if (
        !Array.isArray(engines) ||
        new Set(engines).size !== engines.length ||
        engines.some((e) => !['chromium', 'firefox', 'webkit'].includes(e))
    )
        errors.push('engine set');
    if (!['functional', 'performance'].includes(report.phase)) errors.push('phase');
    if (
        new Set(report.engines?.map((e) => e?.engine)).size !== engines?.length ||
        report.engines?.some((e) => !e || !engines.includes(e.engine) || !e.browserVersion)
    )
        errors.push('actual engine set');
    validateBuild(report, errors);
    for (const entry of report.engines || []) {
        if (!entry || typeof entry !== 'object') {
            errors.push('engine entry object required');
            continue;
        }
        const e = entry;
        if (e.error) errors.push(`${e.engine}: engine error`);
        if (!Array.isArray(e.pageErrors) || e.pageErrors.length !== 0)
            errors.push(`${e.engine}: pageErrors must be an explicit empty array`);
        if (!Array.isArray(e.consoleErrors) || e.consoleErrors.length !== 0)
            errors.push(`${e.engine}: consoleErrors must be an explicit empty array`);
        if (
            !Array.isArray(e.shaderCompile) ||
            !e.shaderCompile.length ||
            e.shaderCompile.some((s) => s?.compiled !== true)
        )
            errors.push(`${e.engine}: shader compile`);
        if (e.pageClosed !== true) errors.push(`${e.engine}: page not closed`);
        if (e.browserClosed !== true) errors.push(`${e.engine}: browser not closed`);
        if (report.phase === 'performance') {
            const rows = e.performance || [];
            if (rows.length !== PERFORMANCE_PLAN.length)
                errors.push(`${e.engine}: performance rows ${rows.length} != ${PERFORMANCE_PLAN.length}`);
            for (const row of rows) {
                const p = profiles.find((q) => q.id === row?.profile?.id);
                if (!p) {
                    errors.push('unknown profile');
                    continue;
                }
                if (!same(row.profile, p)) errors.push(`${e.engine}: profile tuple mismatch`);
                errors.push(
                    ...performanceOracle.validatePerformance(row, p).errors.map((x) => `${e.engine}:${p.id}:${x}`),
                );
            }
        } else {
            validateCaptureTuples(e, errors);
            const resource = oracle.resourceAudit(e.resources);
            errors.push(...resource.errors.map((x) => `${e.engine}:resource:${x}`));
            validateTemporal(e, errors);
            validateBoundaries(e, errors);
            validateInvalids(e, errors);
            validateNormal(e, errors);
            validateLifecycle(e, errors);
            validateResize(e, errors);
        }
    }
    if (report.engines?.length !== engines?.length) errors.push('missing engine');
    if (report.phase === 'performance') {
        errors.push(...validatePerformanceEnvironment(report));
        const total = report.engines.reduce((n, e) => n + (e?.performance?.length || 0), 0);
        if (total !== engines.length * PERFORMANCE_PLAN.length)
            errors.push(`performance tuple total ${total} != ${engines.length * PERFORMANCE_PLAN.length}`);
    } else {
        if (report.cleanup?.serverClosed !== true) errors.push('owned server not closed');
        if (report.cleanup?.proxyClosed !== true) errors.push('proxy closure flag');
        if (report.cleanup?.errors?.length) errors.push('cleanup errors');
    }
    if (report.agentGate !== 'NOT_RUN') errors.push('agentGate must be NOT_RUN');
    if (report.subset !== true) errors.push('subset must be true');
    if (report.completed !== false) errors.push('completed must be false');
    if (typeof report.command !== 'string' || !report.command.includes('shaders-glass-trail-browser.cjs'))
        errors.push('command record');
    if (report.cwd !== ROOT) errors.push('cwd record');
    const started = Date.parse(report.startedAt),
        ended = Date.parse(report.endedAt);
    if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) errors.push('timestamp record');
    if (report.scopePassed === true && errors.length > 0) errors.push('scopePassed contradicts recomputed errors');
    if (report.exitCode !== undefined && report.exitCode !== (errors.length ? 1 : 0))
        errors.push('exitCode contradicts recomputed verdict');
    return { ok: errors.length === 0, errors };
}
function validateFiles(report) {
    try {
        return validateFilesInner(report);
    } catch (error) {
        return {
            ok: false,
            errors: [
                'validator total: ' +
                    String(error && error.message ? error.message : error) +
                    ' @ ' +
                    String((error && error.stack) || '')
                        .split(' at ')
                        .slice(1, 4)
                        .join(' | '),
            ],
        };
    }
}
function validatePerformanceEnvironment(report) {
    const errors = [],
        environment = require('./shaders-browser-environment.cjs');
    if (!report.cleanup?.proxyClosed || !report.cleanup?.serverClosed || report.cleanup?.errors?.length)
        errors.push('owned HTTP servers not closed');
    if (!report.authorization || !report.command?.includes('--authorization=' + report.authorization))
        errors.push('exclusive performance authorization missing');
    for (const e of report.engines) {
        if (!e || typeof e !== 'object') continue;
        const rows = e.performance || [];
        if (rows.length !== PERFORMANCE_PLAN.length)
            errors.push(e.engine + ': performance rows != ' + PERFORMANCE_PLAN.length);
        const seenProfileIds = new Set();
        for (const row of rows) {
            const tier = PERFORMANCE_PLAN.find((q) => q.profile.id === row?.profile?.id);
            if (!tier) {
                errors.push(e.engine + ': unknown performance profile ' + row?.profile?.id);
                continue;
            }
            if (seenProfileIds.has(row.profile.id))
                errors.push(e.engine + ': duplicate performance profile ' + row.profile.id);
            seenProfileIds.add(row.profile.id);
        }
        const expectedIds = PERFORMANCE_PLAN.map((q) => q.profile.id).sort();
        const actualIds = [...seenProfileIds].sort();
        if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds))
            errors.push(
                e.engine +
                    ': performance profile set ' +
                    JSON.stringify(actualIds) +
                    ' != ' +
                    JSON.stringify(expectedIds),
            );
        for (const row of rows) {
            const p = profiles.find((q) => q.id === row?.profile?.id);
            if (!p) {
                errors.push('unknown profile');
                continue;
            }
            if (contract.canonical(row.profile) !== contract.canonical(p)) errors.push('profile tuple mismatch');
            const expected = {
                viewport: p.viewport,
                dpr: p.dpr,
                backing: { w: p.viewport.width * p.dpr, h: p.viewport.height * p.dpr },
                crossOriginIsolated: true,
                headers: { coop: 'same-origin', coep: 'require-corp' },
            };
            const check = environment.validateEnvironmentReceipt(row.environmentReceipt, expected);
            errors.push(...check.errors.map((x) => e.engine + ':' + p.id + ':' + x));
            const precision = row.precision,
                raw = precision?.allRaw;
            if (
                !Array.isArray(raw) ||
                !raw.length ||
                raw.some((v) => !Number.isFinite(v) || v <= 0) ||
                precision.positiveCount !== raw.length ||
                !Number.isFinite(precision.minimumPositiveDeltaMs) ||
                Math.abs(Math.min(...raw) - precision.minimumPositiveDeltaMs) > 1e-9 ||
                precision.crossOriginIsolated !== true ||
                precision.calls !== 25000
            )
                errors.push('complete clock calibration invalid');
            const relRefs = row.release?.retirement?.refs;
            const relKinds = Array.isArray(relRefs) ? relRefs.map((r) => r?.kind).sort() : [];
            if (
                !row.release?.sceneCleared ||
                row.release.listenerAdds !== row.release.listenerRemoves ||
                !Array.isArray(relRefs) ||
                relRefs.length !== oracle.OWNED_KINDS.length ||
                JSON.stringify(relKinds) !== JSON.stringify([...oracle.OWNED_KINDS].sort()) ||
                relRefs.some(
                    (r) =>
                        r?.before !== 1 || r?.after !== 0 || !Number.isFinite(r?.before) || !Number.isFinite(r?.after),
                ) ||
                row.release.retirement.renderersUnbound !== true ||
                row.release.retirement.nodesRemoved !== true ||
                row.pageClosed !== true
            )
                errors.push('performance owned release not observed');
            for (const [label, rs] of [
                ['update', row.updateCalls],
                ['command', row.commands],
                ['dispatch', row.draws],
            ])
                if (!Array.isArray(rs) || !rs.some((r) => r?.ms > 0))
                    errors.push(label + ' below observable resolution');
            if (
                row.httpDocument?.status !== row.environmentReceipt?.responseStatus ||
                row.httpDocument?.url !== row.environmentReceipt?.url
            )
                errors.push('HTTP receipt mismatch');
            // fixedStart/fixedEnd strong binding to frozen defaults and profile plan.
            for (const [stateLabel, state] of [
                ['fixedStart', row.fixedStart],
                ['fixedEnd', row.fixedEnd],
            ]) {
                if (!state || typeof state !== 'object') {
                    errors.push(e.engine + ':' + p.id + ':' + stateLabel + ' missing');
                    continue;
                }
                if (!same(state.params, oracle.defaults()))
                    errors.push(e.engine + ':' + p.id + ':' + stateLabel + ' params not frozen defaults');
                for (const layer of ['glassEnabled', 'trailEnabled'])
                    if (state.params?.[layer] !== 'on')
                        errors.push(e.engine + ':' + p.id + ':' + stateLabel + ' ' + layer + ' not on');
                if (state.viewport?.width !== p.viewport.width || state.viewport?.height !== p.viewport.height)
                    errors.push(e.engine + ':' + p.id + ':' + stateLabel + ' viewport');
                if (state.dpr !== p.dpr) errors.push(e.engine + ':' + p.id + ':' + stateLabel + ' dpr');
                if (
                    state.canvas?.width !== p.viewport.width * p.dpr ||
                    state.canvas?.height !== p.viewport.height * p.dpr ||
                    !same(state.canvas?.css, p.viewport)
                )
                    errors.push(e.engine + ':' + p.id + ':' + stateLabel + ' canvas backing');
                if (!same(state.background, BACKGROUND('default')))
                    errors.push(e.engine + ':' + p.id + ':' + stateLabel + ' background');
                if (state.linearDiagnostic !== false)
                    errors.push(e.engine + ':' + p.id + ':' + stateLabel + ' linearDiagnostic');
                if (!Number.isSafeInteger(state.instance) || state.instance <= 0)
                    errors.push(e.engine + ':' + p.id + ':' + stateLabel + ' instance');
                if (typeof state.time !== 'number' || !Number.isFinite(state.time))
                    errors.push(e.engine + ':' + p.id + ':' + stateLabel + ' time not finite');
                if (!Number.isSafeInteger(state.frame) || state.frame < 0)
                    errors.push(e.engine + ':' + p.id + ':' + stateLabel + ' frame not non-negative safeInt');
                if (
                    !Array.isArray(state.shaderPasses) ||
                    state.shaderPasses.length === 0 ||
                    state.shaderPasses.some((sp) => sp?.shaderCompiled !== true)
                )
                    errors.push(e.engine + ':' + p.id + ':' + stateLabel + ' material passes');
            }
            if (
                Number.isSafeInteger(row.fixedStart?.frame) &&
                Number.isSafeInteger(row.fixedEnd?.frame) &&
                row.fixedEnd.frame <= row.fixedStart.frame
            )
                errors.push(e.engine + ':' + p.id + ': fixedEnd frame not advanced');
            if (
                Number.isFinite(row.fixedStart?.time) &&
                Number.isFinite(row.fixedEnd?.time) &&
                row.fixedEnd.time <= row.fixedStart.time
            )
                errors.push(e.engine + ':' + p.id + ': fixedEnd time not advanced');
            if (
                Number.isSafeInteger(row.fixedStart?.instance) &&
                Number.isSafeInteger(row.fixedEnd?.instance) &&
                row.fixedStart.instance !== row.fixedEnd.instance
            )
                errors.push(e.engine + ':' + p.id + ': fixed instance changed');
            // Single-pass contract: EVERY steady frame must show >= 1 beginRenderPass and the
            // native draw count must be >= 1. Missing command rows or zero-pass frames reject —
            // no length-based bypass.
            const steadyFrames = Array.isArray(row.frames) ? row.frames : [];
            const steadyIds = new Set((row.steadyFrameIds || []).map((x) => x));
            const passByFrame = new Map(),
                drawByFrame = new Map();
            for (const c of Array.isArray(row.commands) ? row.commands : []) {
                if (!c || typeof c !== 'object' || !Number.isSafeInteger(c.frame)) {
                    errors.push('command row structure');
                    continue;
                }
                if ((c.name ?? c.operation) === 'beginRenderPass')
                    passByFrame.set(c.frame, (passByFrame.get(c.frame) || 0) + 1);
            }
            for (const d of Array.isArray(row.draws) ? row.draws : []) {
                if (!d || typeof d !== 'object' || !Number.isSafeInteger(d.frame)) continue;
                drawByFrame.set(d.frame, (drawByFrame.get(d.frame) || 0) + (d.ms >= 0 ? 1 : 0));
            }
            const windowIds = steadyIds.size ? [...steadyIds] : steadyFrames.map((f) => f.frame);
            if (!windowIds.length) errors.push('steady window missing');
            for (const frame of windowIds) {
                if ((passByFrame.get(frame) || 0) < 1) errors.push(`frame ${frame} missing beginRenderPass`);
                if ((drawByFrame.get(frame) || 0) < 1) errors.push(`frame ${frame} missing native draw`);
            }
        }
    }
    return errors;
}
/** Install the native GL upload hook on a WebGL2RenderingContext-like prototype.
 * Exposed for Node tests: the SAME code path runs against a fake context to verify
 * argument forwarding, byte accounting and session binding. */
function installGLUploadHook(proto, host) {
    host.__gtGLUploads = [];
    host.__gtGLSessionStart = 0;
    host.__gtGLHookErrors = [];
    const identities = new WeakMap();
    let nextId = 0;
    const create = proto.createTexture;
    proto.createTexture = function (...args) {
        const texture = create.apply(this, args);
        if (texture) identities.set(texture, ++nextId);
        return texture;
    };
    for (const name of ['texSubImage2D', 'texImage2D']) {
        const original = proto[name];
        proto[name] = function (...args) {
            const result = original.apply(this, args);
            try {
                const sub = name === 'texSubImage2D';
                const [target, level] = args;
                const width = args[sub ? 4 : 3],
                    height = args[sub ? 5 : 4];
                const format = args[6],
                    type = args[7],
                    pixels = args[8];
                if (!ArrayBuffer.isView(pixels) || !Number.isInteger(width) || !Number.isInteger(height)) return result;
                const elementBytes = pixels.BYTES_PER_ELEMENT;
                const sourceOffset = args[9] ?? 0;
                const componentBytes = type === 5131 ? 2 : type === 5126 ? 4 : type === 5121 ? 1 : null;
                const requested =
                    componentBytes && format === 6408 ? width * height * 4 * componentBytes : pixels.byteLength;
                const bytes = Math.min(requested, pixels.byteLength - sourceOffset * elementBytes);
                const start = pixels.byteOffset + sourceOffset * elementBytes;
                const payloadWords =
                    bytes >= 0 && start % 2 === 0 && bytes % 2 === 0
                        ? Array.from(new Uint16Array(pixels.buffer, start, bytes / 2))
                        : null;
                const texture = this.getParameter(this.TEXTURE_BINDING_2D);
                const state = host.__glasstrail?.uploadContext?.() ?? null;
                host.__gtGLUploads.push({
                    call: name,
                    texture: texture ? (identities.get(texture) ?? null) : null,
                    target,
                    level,
                    xoffset: sub ? args[2] : 0,
                    yoffset: sub ? args[3] : 0,
                    width,
                    height,
                    format,
                    type,
                    bytes,
                    payloadWords,
                    frame: state?.frame ?? null,
                    sessionGeneration: state?.sessionGeneration ?? null,
                });
            } catch (error) {
                host.__gtGLHookErrors.push(String(error));
            }
            return result;
        };
    }
}

async function main(args = process.argv.slice(2)) {
    const value = (key) =>
        args
            .find((x) => x.startsWith(`--${key}=`))
            ?.split('=')
            .slice(1)
            .join('=');
    if (value('verify')) {
        const r = JSON.parse(fs.readFileSync(value('verify'), 'utf8'));
        const result = validateFiles(r);
        console.log(JSON.stringify(result));
        return result.ok ? 0 : 1;
    }
    const out = value('out');
    if (!out || fs.existsSync(out)) throw new Error('Explicit new --out required');
    const phase = value('phase') || 'functional',
        selected = value('browser') || 'all';
    if (
        !['functional', 'performance'].includes(phase) ||
        !['all', 'chromium', 'firefox', 'webkit'].includes(selected) ||
        args.some((a) => !a.startsWith('--'))
    )
        throw new Error('Invalid phase/browser/argument');
    if (phase === 'performance' && !value('authorization')) throw new Error('Exclusive --authorization required');
    const requestedEngines = selected === 'all' ? ['chromium', 'firefox', 'webkit'] : [selected],
        startedAt = new Date().toISOString();
    const identity = currentIdentity();
    const report = {
        schemaVersion: 'w4-c03-glass-trail/1',
        phase,
        requestedEngines,
        startedAt,
        authorization: value('authorization') || null,
        command: [process.execPath, ...process.argv.slice(1)].join(' '),
        cwd: ROOT,
        identity,
        inputs: identity.inputs,
        reference: identity.reference,
        engines: [],
        agentGate: 'NOT_RUN',
        subset: true,
        completed: false,
    };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const artifacts = `${out.replace(/\.json$/, '')}-artifacts`;
    fs.mkdirSync(artifacts, { recursive: true });
    const buildLog = path.join(artifacts, 'build.log');
    const build = cp.spawnSync(
        process.execPath,
        ['node_modules/typescript/bin/tsc', '-p', 'tools/verify/shaders-glass-trail.tsconfig.json'],
        { cwd: ROOT, encoding: 'utf8' },
    );
    fs.writeFileSync(
        buildLog,
        `command=node node_modules/typescript/bin/tsc -p tools/verify/shaders-glass-trail.tsconfig.json\nexitCode=${build.status}\n${build.stdout}${build.stderr}`,
        { flag: 'wx' },
    );
    report.build = {
        command: 'node node_modules/typescript/bin/tsc -p tools/verify/shaders-glass-trail.tsconfig.json',
        exitCode: build.status,
        raw: fileIdentity(buildLog),
    };
    const esbuild = require('esbuild'),
        { startExampleServer } = require('./competitive-example-server.cjs');
    const bundled = esbuild.buildSync({
        entryPoints: [path.join(ROOT, EXAMPLE, 'src/main.ts')],
        bundle: true,
        format: 'esm',
        target: 'es2022',
        external: ['cocosair'],
        write: false,
    });
    report.build.bundleBytes = bundled.outputFiles[0].contents.length;
    if (build.status !== 0) throw new Error('Strict TS failed');
    const server = await startExampleServer(ROOT);
    let isolationProxy = null;

    async function installProbe(page) {
        await page.addInitScript({
            content: `(${installGLUploadHook.toString()})(WebGL2RenderingContext.prototype, window);`,
        });
        await page.addInitScript(() => {
            window.__glasstrailCompile = [];
            // NATIVE upload hook: every texSubImage2D/texImage2D call is recorded with its
            // actual texture object, target, format/type and byte payload length BEFORE the
            // engine imports — independent evidence the points texture really uploaded.
            const proto = WebGL2RenderingContext.prototype;
            const compile = proto.compileShader;
            proto.compileShader = function (shader) {
                compile.call(this, shader);
                window.__glasstrailCompile.push({
                    compiled: this.getShaderParameter(shader, this.COMPILE_STATUS),
                    log: this.getShaderInfoLog(shader),
                });
            };
            const live = { buffer: new Set(), texture: new Set() },
                identities = new WeakMap(),
                events = [];
            let id = 0;
            for (const [kind, create, destroy] of [
                ['buffer', 'createBuffer', 'deleteBuffer'],
                ['texture', 'createTexture', 'deleteTexture'],
            ]) {
                const oldCreate = proto[create],
                    oldDestroy = proto[destroy];
                proto[create] = function (...args) {
                    const object = oldCreate.apply(this, args);
                    if (object) {
                        const ownID = ++id;
                        identities.set(object, ownID);
                        live[kind].add(ownID);
                        events.push({ kind, operation: create, id: ownID });
                    }
                    return object;
                };
                proto[destroy] = function (object) {
                    const ownID = object && identities.get(object);
                    const result = oldDestroy.call(this, object);
                    if (ownID) {
                        live[kind].delete(ownID);
                        events.push({
                            kind,
                            operation: destroy,
                            id: ownID,
                            nativeAliveAfter: kind === 'buffer' ? this.isBuffer(object) : this.isTexture(object),
                        });
                    }
                    return result;
                };
            }
            window.__glasstrailGfx = () => ({
                bufferCount: live.buffer.size,
                textureCount: live.texture.size,
                events: [...events],
                scope: 'all native GL objects in the single Cocos context since pre-import prototype instrumentation',
            });
        });
    }
    try {
        if (phase === 'performance') isolationProxy = await startIsolationProxy(server);
        for (const engine of requestedEngines) {
            const browser = await require('playwright')[engine].launch({
                ...shaderLaunchOptions(engine),
                headless: true,
            });
            const e = {
                engine,
                browserVersion: browser.version(),
                pageErrors: [],
                consoleErrors: [],
                captures: [],
                boundaries: [],
                performance: [],
                pageClosed: false,
                dpr2PageClosed: false,
                browserClosed: false,
            };
            report.engines.push(e);
            const page = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 1 });
            page.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
            page.on('console', (x) => {
                if (x.type() === 'error') e.consoleErrors.push(x.text());
            });
            await installProbe(page);
            try {
                if (phase === 'performance') {
                    await page.close();
                    e.pageClosed = page.isClosed();
                    for (const planEntry of PERFORMANCE_PLAN) {
                        const profile = planEntry.profile;
                        const perfPage = await browser.newPage({
                            viewport: profile.viewport,
                            deviceScaleFactor: profile.dpr,
                        });
                        const perfEntry = { profile };
                        e.performance.push(perfEntry);
                        let ready = false,
                            timingStarted = false,
                            timingStopped = false;
                        perfPage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                        perfPage.on('console', (x) => {
                            if (x.type() === 'error') e.consoleErrors.push(x.text());
                        });
                        try {
                            await installProbe(perfPage);
                            const expected = {
                                viewport: profile.viewport,
                                dpr: profile.dpr,
                                backing: {
                                    w: profile.viewport.width * profile.dpr,
                                    h: profile.viewport.height * profile.dpr,
                                },
                                crossOriginIsolated: true,
                                headers: { coop: 'same-origin', coep: 'require-corp' },
                            };
                            const envReceipt = await navigateWithDPRRepair(
                                perfPage,
                                isolationProxy.origin + '/' + EXAMPLE + '/?test=1&_isolate=1',
                                expected,
                            );
                            perfEntry.environmentReceipt = envReceipt;
                            if (!envReceipt.ok) throw Error('Environment: ' + envReceipt.errors.join('; '));
                            await perfPage.waitForFunction(() => window.__glasstrail?.ready, null, { timeout: 60000 });
                            ready = true;
                            const precision = await perfPage.evaluate(() => {
                                const start = performance.now();
                                let previous = start,
                                    minimum = Infinity;
                                const positives = [];
                                for (let i = 0; i < 25000; i++) {
                                    const now = performance.now(),
                                        delta = now - previous;
                                    if (delta > 0) {
                                        positives.push(delta);
                                        minimum = Math.min(minimum, delta);
                                    }
                                    previous = now;
                                }
                                return {
                                    crossOriginIsolated,
                                    calls: 25000,
                                    startedAtMs: start,
                                    endedAtMs: performance.now(),
                                    minimumPositiveDeltaMs: Number.isFinite(minimum) ? minimum : null,
                                    positiveCount: positives.length,
                                    allRaw: positives,
                                    clock: 'performance.now wall-clock quantization',
                                    zeroMeaning:
                                        'Zero observed durations are below observable timer precision, not zero cost',
                                };
                            });
                            const perfGlCursor = await glSessionStart(perfPage);
                            await perfPage.evaluate(() => window.__glasstrail.startPerformance());
                            timingStarted = true;
                            await perfPage.waitForTimeout(6000);
                            const metrics = await perfPage.evaluate(() => window.__glasstrail.stopPerformance());
                            timingStopped = true;
                            // Session-only native upload proof: the hook log slice for THIS
                            // window plus any hook errors (independent of self-reported data).
                            metrics.glUploads = await readGLUploads(perfPage, perfGlCursor);
                            metrics.hookErrors = await perfPage.evaluate(() =>
                                (window.__gtGLHookErrors || []).map((x) => String(x)),
                            );
                            const gfxObjects = await perfPage.evaluate(() => window.__glasstrailGfx());
                            Object.assign(perfEntry, {
                                ...metrics,
                                gfxObjects,
                                precision,
                                httpDocument: {
                                    url: envReceipt.url,
                                    status: envReceipt.responseStatus,
                                    deliveredHeaders: envReceipt.deliveredHeaders,
                                    method: 'Real HTTP isolation proxy; exact source bytes; no route.fulfill',
                                },
                            });
                            e.shaderCompile = [
                                ...(e.shaderCompile || []),
                                ...(await perfPage.evaluate(() => window.__glasstrailCompile)),
                            ];
                        } catch (error) {
                            perfEntry.error = String(error.stack || error);
                            e.error = perfEntry.error;
                        } finally {
                            try {
                                if (timingStarted && !timingStopped)
                                    perfEntry.failureStop = await perfPage.evaluate(() =>
                                        window.__glasstrail.stopPerformance(),
                                    );
                            } catch (error) {
                                e.pageErrors.push('failure stop: ' + String(error.stack || error));
                            }
                            try {
                                const constructed =
                                    ready || (await perfPage.evaluate(() => !!window.__glasstrail?.ready));
                                if (constructed)
                                    perfEntry.release = await perfPage.evaluate(() => window.__glasstrail.release());
                            } catch (error) {
                                e.pageErrors.push('release: ' + String(error.stack || error));
                            }
                            await perfPage.close();
                            perfEntry.pageClosed = perfPage.isClosed();
                        }
                    }
                } else {
                    const normalPage = await browser.newPage({
                        viewport: { width: 640, height: 400 },
                        deviceScaleFactor: 1,
                    });
                    normalPage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                    normalPage.on('console', (x) => {
                        if (x.type() === 'error') e.consoleErrors.push(x.text());
                    });
                    await normalPage.goto(`${server.origin}/${EXAMPLE}/`);
                    await normalPage.waitForFunction(() => window.__glasstrail?.ready);
                    await normalPage.waitForTimeout(250);
                    const parameterBefore = await normalPage.evaluate(() => window.__glasstrail.snapshot());
                    await normalPage.locator('[data-parameter=glassRefraction]').focus();
                    await normalPage.keyboard.press('ArrowRight');
                    const parameterAfter = await normalPage.evaluate(() => window.__glasstrail.snapshot());
                    await normalPage.keyboard.press('Home');
                    await normalPage.locator('#pause').click();
                    const pauseBefore = await normalPage.evaluate(() => window.__glasstrail.snapshot());
                    await normalPage.waitForTimeout(160);
                    const pauseAfter = await normalPage.evaluate(() => window.__glasstrail.snapshot());
                    await normalPage.locator('#resume').click();
                    const resumeBefore = await normalPage.evaluate(() => window.__glasstrail.snapshot());
                    await normalPage.waitForTimeout(200);
                    const resumeAfter = await normalPage.evaluate(() => window.__glasstrail.snapshot());
                    await normalPage.locator('#reset').click();
                    // Wait for the handler's REAL completion receipt (fresh session, time 0);
                    // the native pacer may advance time afterward — the receipt is the truth.
                    const reset = {
                        receipt: await normalPage
                            .waitForFunction(() => window.__glasstrail.snapshot().resetReceipt ?? null, null, {
                                timeout: 10000,
                            })
                            .then((h) => h.jsonValue()),
                        afterward: await normalPage.evaluate(() => window.__glasstrail.snapshot()),
                    };
                    // Real trusted release: click the button, await the page's cached release
                    // promise (the same instance the click handler started), read events after.
                    await normalPage.locator('#release').click();
                    const nativeRelease = await normalPage.evaluate(() => window.__glasstrail.release());
                    const eventsAfterRelease = await normalPage.evaluate(() => window.__glasstrail.snapshot().events);
                    e.normal = {
                        parameter: { before: parameterBefore, after: parameterAfter },
                        pause: { before: pauseBefore, after: pauseAfter },
                        resume: { before: resumeBefore, after: resumeAfter },
                        reset,
                        events: eventsAfterRelease,
                        release: nativeRelease,
                    };
                    await normalPage.close();
                    await page.goto(`${server.origin}/${EXAMPLE}/?test=1`);
                    await page.waitForFunction(() => window.__glasstrail?.ready);
                    let dpr2Page = null;
                    try {
                        for (const [dpr, ids] of [
                            [1, CAPTURES.map(([id]) => id)],
                            [2, DPR2],
                        ]) {
                            let capturePage = page;
                            if (dpr === 2) {
                                // DPR 2 functional set runs on a fresh page with deviceScaleFactor 2.
                                dpr2Page = capturePage = await browser.newPage({
                                    viewport: { width: 640, height: 400 },
                                    deviceScaleFactor: 2,
                                });
                                capturePage.on('pageerror', (x) => e.pageErrors.push(String(x.stack || x)));
                                capturePage.on('console', (x) => {
                                    if (x.type() === 'error') e.consoleErrors.push(x.text());
                                });
                                await installProbe(capturePage);
                                await capturePage.goto(`${server.origin}/${EXAMPLE}/?test=1`);
                                await capturePage.waitForFunction(() => window.__glasstrail?.ready, null, {
                                    timeout: 60000,
                                });
                            }
                            for (const id of ids) {
                                const [, patch] = CAPTURES.find(([captureId]) => captureId === id),
                                    params = { ...oracle.defaults(), ...patch },
                                    presentation = { background: BACKGROUND(id), linearDiagnostic: false };
                                await capturePage.evaluate((p) => window.__glasstrail.setPresentation(p), presentation);
                                const setBefore = await capturePage.evaluate(() => window.__glasstrail.snapshot());
                                const setReceipt = await capturePage.evaluate(
                                    (p) => window.__glasstrail.set(p),
                                    params,
                                );
                                const glCursor = await glSessionStart(capturePage);
                                await capturePage.evaluate(() => window.__glasstrail.__resetSession());
                                // Real trusted pointer trajectory: Playwright mouse moves along the
                                // canonical plan; each move advances the sim so the recorder ingests it.
                                const pointerReceipt = [];
                                for (const point of POINTER_PLAN) {
                                    await capturePage.mouse.move(point.x * 640, (1 - point.y) * 400);
                                    await capturePage.evaluate(() => window.__glasstrail.step(1 / 60));
                                    pointerReceipt.push(point);
                                }
                                // Extra steps let the capsule chain render; trajectory stays fixed.
                                await capturePage.evaluate(() => window.__glasstrail.step(1 / 60));
                                const pointerLog = await capturePage.evaluate(
                                    () => window.__glasstrail.snapshot().pointerLog,
                                );
                                await capturePage.evaluate((t) => window.__glasstrail.setTime(t), CAPTURE_TIME);
                                const snapshot = await capturePage.evaluate(() => window.__glasstrail.step(0));
                                await capturePage.waitForTimeout(30);
                                const png = path.join(artifacts, `${engine}-${id}-dpr${dpr}.png`);
                                await capturePage.screenshot({ path: png });
                                const probe = await capturePage.evaluate(() => window.__glasstrail.linearProbe());
                                const liveFrames = framesOf(snapshot) ?? [];
                                const audit = oracle.pngAudit(png, params, CAPTURE_TIME, liveFrames, presentation);
                                const probeCheck = oracle.probeAudit(probe, params, CAPTURE_TIME, liveFrames, {
                                    width: 640 * dpr,
                                    height: 400 * dpr,
                                });
                                const glUploads = await readGLUploads(capturePage, glCursor);
                                const hookErrors = await capturePage.evaluate(() =>
                                    (window.__gtGLHookErrors || []).map((x) => String(x)),
                                );
                                e.captures.push({
                                    hookErrors,
                                    id,
                                    dpr,
                                    params,
                                    time: CAPTURE_TIME,
                                    presentation,
                                    glUploads,
                                    pointerPlan: POINTER_PLAN,
                                    pointerReceipt,
                                    pointerLog,
                                    snapshot,
                                    set: { before: setBefore, receipt: setReceipt, after: snapshot },
                                    png: fileIdentity(png),
                                    probe,
                                    audit,
                                    probeCheck,
                                });
                                console.log(
                                    JSON.stringify({
                                        engine,
                                        capture: id,
                                        dpr,
                                        errors: [...audit.errors, ...probeCheck.errors].slice(0, 2),
                                    }),
                                );
                            }
                        }
                    } finally {
                        if (dpr2Page) {
                            await dpr2Page.close().catch(() => {});
                            e.dpr2PageClosed = dpr2Page.isClosed();
                        } else e.dpr2PageClosed = true;
                    }
                    // GPU temporal evidence on the same page: determinism (retire/recreate,
                    // same seed/params/time), adjacent-time drift against the CPU prediction,
                    // and the speed-0 freeze. Raw readPixels come from the AFTER_DRAW receipt.
                    await page.evaluate((p) => window.__glasstrail.setPresentation(p), {
                        background: BACKGROUND('default'),
                        linearDiagnostic: false,
                    });
                    await page.evaluate((p) => window.__glasstrail.set(p), oracle.defaults());
                    // Fresh session with the frozen REAL gesture ingested (not a stale ledger).
                    await seedFrozenGesture(page);
                    await page.evaluate((t) => window.__glasstrail.setTime(t), CAPTURE_TIME);
                    await page.evaluate(() => window.__glasstrail.step(0));
                    const temporalA = await page.evaluate(() => window.__glasstrail.snapshot());
                    const temporalPngA = path.join(artifacts, engine + '-temporal-a.png');
                    // A submitted frame is not necessarily presented yet. Keep simulation time
                    // frozen while waiting for the compositor, as in the live-resize capture.
                    await page.evaluate(
                        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
                    );
                    await page.waitForTimeout(80);
                    await page.screenshot({ path: temporalPngA });
                    const temporalProbeA = await page.evaluate(() => window.__glasstrail.linearProbe());
                    // Determinism: retire + recreate (fresh recorder — BLANK unless reseeded),
                    // then feed the SAME frozen trusted gesture again and re-freeze the state.
                    await page.evaluate(() => window.__glasstrail.recreate());
                    await page.evaluate((p) => window.__glasstrail.set(p), oracle.defaults());
                    await seedFrozenGesture(page);
                    await page.evaluate((t) => window.__glasstrail.setTime(t), CAPTURE_TIME);
                    const temporalDet = await page.evaluate(() => window.__glasstrail.step(0));
                    const determinismEqual = await page.evaluate(
                        (a) => JSON.stringify(a) === JSON.stringify(window.__glasstrail.snapshot().pixels),
                        temporalA.pixels,
                    );
                    // Adjacent time: t = 0.27 (render-only; the det trajectory is preserved).
                    await page.evaluate((t) => window.__glasstrail.setTime(t), 0.27);
                    const temporalB = await page.evaluate(() => window.__glasstrail.step(0));
                    const temporalPngB = path.join(artifacts, engine + '-temporal-b.png');
                    await page.evaluate(
                        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
                    );
                    await page.waitForTimeout(80);
                    await page.screenshot({ path: temporalPngB });
                    const temporalProbeB = await page.evaluate(() => window.__glasstrail.linearProbe());
                    // Pause observation: freeze time, pause, step — time must not advance.
                    await page.evaluate((p) => window.__glasstrail.set(p), oracle.defaults());
                    await page.evaluate((t) => window.__glasstrail.setTime(t), CAPTURE_TIME);
                    await page.evaluate(() => window.__glasstrail.step(0));
                    await page.evaluate(() => window.__glasstrail.pause());
                    const temporalPauseBefore = await page.evaluate(() => window.__glasstrail.snapshot());
                    await page.evaluate(() => window.__glasstrail.step(1 / 60));
                    const temporalPauseAfter = await page.evaluate(() => window.__glasstrail.snapshot());
                    // Resume observation: fixed dt, time advances.
                    await page.evaluate(() => window.__glasstrail.resume());
                    const temporalResumeDt = 1 / 60;
                    const temporalResumeBefore = await page.evaluate(() => window.__glasstrail.snapshot());
                    await page.evaluate((dt) => window.__glasstrail.step(dt), temporalResumeDt);
                    const temporalResumeAfter = await page.evaluate(() => window.__glasstrail.snapshot());
                    e.temporal = {
                        params: oracle.defaults(),
                        a: {
                            time: CAPTURE_TIME,
                            snapshot: temporalA,
                            presentationWaitMs: 80,
                            png: fileIdentity(temporalPngA),
                            probe: temporalProbeA,
                        },
                        b: {
                            time: 0.27,
                            snapshot: temporalB,
                            presentationWaitMs: 80,
                            png: fileIdentity(temporalPngB),
                            probe: temporalProbeB,
                        },
                        determinism: { equal: determinismEqual, snapshot: temporalDet },
                        pause: {
                            params: oracle.defaults(),
                            before: temporalPauseBefore,
                            after: temporalPauseAfter,
                            paused: temporalPauseAfter?.paused === true,
                        },
                        resume: {
                            params: oracle.defaults(),
                            before: temporalResumeBefore,
                            after: temporalResumeAfter,
                            dt: temporalResumeDt,
                        },
                    };
                    await page.evaluate((p) => window.__glasstrail.set(p), oracle.defaults());
                    await page.evaluate(() => window.__glasstrail.step(0));
                    for (const b of oracle.boundaryPlan()) {
                        const params = { ...oracle.defaults(), [b.parameter]: b.value };
                        const before = await page.evaluate(() => window.__glasstrail.snapshot());
                        const receipt = await page.evaluate((p) => window.__glasstrail.set(p), params);
                        if (receipt.ok) await page.evaluate(() => window.__glasstrail.step(0));
                        const after = await page.evaluate(() => window.__glasstrail.snapshot());
                        e.boundaries.push({ ...b, params, before, receipt, after });
                    }
                    const invalids = await page.evaluate(async () => {
                        const base = window.__glasstrail.snapshot().params;
                        const cases = [
                            { kind: 'null', parameter: '$', input: null },
                            { kind: 'unknown', parameter: 'unknown', input: { ...base, unknown: 1 } },
                            { kind: 'nan', parameter: 'glassRefraction', input: { ...base, glassRefraction: NaN } },
                            {
                                kind: 'infinity',
                                parameter: 'glassRefraction',
                                input: { ...base, glassRefraction: Infinity },
                            },
                            { kind: 'shape', parameter: 'shape', input: { ...base, shape: 'triangle' } },
                            { kind: 'color', parameter: 'trailColorA', input: { ...base, trailColorA: 'red' } },
                        ];
                        const before = window.__glasstrail.snapshot();
                        const receipts = await Promise.all(cases.map((c) => window.__glasstrail.set(c.input)));
                        const after = window.__glasstrail.snapshot();
                        return cases.map((c, i) => ({
                            case: { kind: c.kind, parameter: c.parameter },
                            receipt: receipts[i],
                            before,
                            after,
                        }));
                    });
                    e.invalids = invalids;
                    // The background-light capture leaves a light presentation behind; the
                    // resource/resize phase runs under the frozen default presentation.
                    await page.evaluate((p) => window.__glasstrail.setPresentation(p), {
                        background: BACKGROUND('default'),
                        linearDiagnostic: false,
                    });
                    await page.evaluate((p) => window.__glasstrail.set(p), oracle.defaults());
                    await page.evaluate(() => window.__glasstrail.step(0));
                    e.resources = await page.evaluate(() => window.__glasstrail.cycles());
                    // cycles() leaves a fresh blank recorder: seed the frozen REAL gesture at the
                    // OLD viewport so the resize actually reflows a live trajectory.
                    await seedFrozenGesture(page);
                    const before = await page.evaluate(() => window.__glasstrail.snapshot());
                    await page.setViewportSize({ width: 480, height: 320 });
                    await page.waitForTimeout(250);
                    const resizeFrames = await page.evaluate(async () => {
                        const rows = [];
                        // One positive-dt step at the NEW aspect ingests with aspect 480/320;
                        // the rest are render-only presentations of the same trajectory.
                        rows.push(await window.__glasstrail.step(1 / 60));
                        for (let i = 0; i < 4; i++) rows.push(await window.__glasstrail.step(0));
                        return rows;
                    });
                    const after = resizeFrames.at(-1);
                    await page.evaluate(
                        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
                    );
                    const resizePng = path.join(artifacts, `${engine}-live-resize.png`);
                    await page.waitForTimeout(80);
                    await page.screenshot({ path: resizePng });
                    const resizeProbe = await page.evaluate(() => window.__glasstrail.linearProbe());
                    const resizePlanFrames = framesOf(after) ?? [];
                    const resizeAudit = resizePlanFrames.length
                        ? oracle.pngAudit(resizePng, oracle.defaults(), before.time, resizePlanFrames)
                        : { errors: ['resize ledger missing'], measurements: 0 };
                    const resizeProbeCheck = resizePlanFrames.length
                        ? oracle.probeAudit(resizeProbe, oracle.defaults(), before.time, resizePlanFrames, {
                              width: 480,
                              height: 320,
                          })
                        : { errors: ['resize ledger missing'], measurements: 0 };
                    e.resize = {
                        before,
                        after,
                        resizeFrames,
                        png: fileIdentity(resizePng),
                        probe: resizeProbe,
                        audit: resizeAudit,
                        probeCheck: resizeProbeCheck,
                        presentationWaitMs: 80,
                    };
                    const recreated = await page.evaluate(() => window.__glasstrail.recreate());
                    const terminal = await page.evaluate(async () => {
                        const x = window.__glasstrail.release(),
                            y = window.__glasstrail.release();
                        const release = await x;
                        let terminalCode;
                        try {
                            await window.__glasstrail.step(0);
                        } catch (error) {
                            terminalCode = error.code;
                        }
                        return { release, samePromise: x === y, terminalCode };
                    });
                    e.lifecycle = { recreated, ...terminal };
                    e.shaderCompile = await page.evaluate(() => window.__glasstrailCompile);
                }
            } catch (error) {
                e.error = String(error.stack || error);
            } finally {
                await page.close().catch(() => {});
                e.pageClosed = page.isClosed();
                await browser.close();
                e.browserClosed = !browser.isConnected();
            }
        }
    } finally {
        report.cleanup = { proxyClosed: phase !== 'performance', serverClosed: false, errors: [] };
        try {
            if (isolationProxy) {
                await isolationProxy.close();
                report.cleanup.proxyClosed = isolationProxy.closed;
            }
        } catch (error) {
            report.cleanup.errors.push(String(error.stack || error));
        }
        try {
            await server.close();
            report.cleanup.serverClosed = true;
        } catch (error) {
            report.cleanup.errors.push(String(error.stack || error));
        }
        report.endedAt = new Date().toISOString();
        report.validation = validateFiles(report);
        report.scopePassed = report.validation.ok;
        report.exitCode = report.scopePassed ? 0 : 1;
        fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(
            JSON.stringify({ out, scopePassed: report.scopePassed, errors: report.validation.errors.slice(0, 5) }),
        );
    }
    return report.exitCode;
}
module.exports = {
    main,
    installGLUploadHook,
    POINTER_PLAN,
    validateCaptureTuples,
    validateBoundaries,
    validateInvalids,
    validateNormal,
    validateLifecycle,
    validateResize,
    validateBuild,
    validateTemporal,
    PERFORMANCE_PLAN,
    validateFiles,
    validatePerformanceEnvironment,
    INPUTS,
    SDK,
    REFERENCE,
    CAPTURES,
    DPR2,
    VISUAL_PLAN,
    INVALID_CASES,
    profiles,
    currentIdentity,
    CAPTURE_TIME,
    BACKGROUND,
};
if (require.main === module)
    main()
        .then((code) => (process.exitCode = code))
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
