'use strict';
// Focused real browser collector. Serving never builds or mutates the SDK.
const fs = require('fs'),
    path = require('path'),
    crypto = require('crypto'),
    { PNG } = require('pngjs');
const ROOT = path.resolve(__dirname, '../..'),
    ENGINES = ['chromium', 'firefox', 'webkit'];
const CUES = [0.4, 1.5, 2.8, 4, 5.3, 6.6, 7.9, 9.2, 10.5, 11.8, 13.1, 14.4];
const INPUTS = [
    'build/cocosair.module.js',
    'build/cocosair.module.d.ts',
    'examples/interactive-timeline/index.html',
    'examples/interactive-timeline/src/main.ts',
    'examples/interactive-timeline/src/timeline-contract.ts',
    'examples/interactive-timeline/assets/original-16s.wav',
    'examples/shared/asset-lifecycle.js',
    'tools/verify/interactive-timeline-browser.cjs',
    'tools/verify/interactive-timeline-browser.tsconfig.json',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
];
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex'),
    fingerprint = (p) => {
        const b = fs.readFileSync(path.resolve(ROOT, p));
        return { path: p, sha256: hash(b), bytes: b.length };
    };
const finite = Number.isFinite,
    positive = (x) => finite(x) && x > 0;
function expected(stage) {
    if (![0, 1, 2].includes(stage)) throw Error('invalid stage');
    return Array.from({ length: 18 }, (_, i) => ({
        position: [
            ((i % 6) - 2.5) * 0.5 * (stage === 1 ? 1.5 : 1),
            (Math.floor(i / 6) - 1) * 0.7 * (stage === 1 ? 1.5 : 1),
            0,
        ],
        scale: stage === 2 ? [1.4, 0.45, 1] : [1, 1, 1],
    }));
}
function poseError(s, stage) {
    const target = expected(stage);
    if (s.poses?.length !== 18) throw Error('18 native parts required');
    let error = 0;
    for (let i = 0; i < 18; i++)
        for (const key of ['position', 'scale'])
            for (let j = 0; j < 3; j++) {
                const v = s.poses[i][key]?.[j];
                if (!finite(v)) throw Error('non-finite native pose');
                error = Math.max(error, Math.abs(v - target[i][key][j]));
            }
    for (const [key, want] of [
        ['z', 6 + stage],
        ['orthoHeight', 2.5 + stage * 0.25],
    ]) {
        if (!finite(s.camera?.[key])) throw Error('camera');
        error = Math.max(error, Math.abs(s.camera[key] - want));
    }
    return error;
}
function readPNG(record) {
    const b = fs.readFileSync(path.resolve(ROOT, record.path));
    if (hash(b) !== record.sha256 || b.length !== record.bytes) throw Error('PNG drift');
    return PNG.sync.read(b);
}
function countPatch(p, s, world, kind) {
    const r = s.layout.rect,
        d = s.layout.dpr;
    if (!positive(d) || !positive(r.height) || !positive(s.camera.orthoHeight)) throw Error('layout');
    const x = (r.left + r.width / 2 + (world.x * r.height) / (2 * s.camera.orthoHeight)) * d,
        y = (r.top + r.height / 2 - (world.y * r.height) / (2 * s.camera.orthoHeight)) * d;
    let n = 0;
    for (let py = Math.max(0, Math.floor(y - 4 * d)); py < Math.min(p.height, y + 4 * d); py++)
        for (let px = Math.max(0, Math.floor(x - 4 * d)); px < Math.min(p.width, x + 4 * d); px++) {
            const i = (py * p.width + px) * 4,
                R = p.data[i],
                G = p.data[i + 1],
                B = p.data[i + 2];
            if (kind === 'green' ? G > 120 && G > R * 1.5 && G > B * 1.3 : R > 140 && R > B * 1.5) n++;
        }
    return { pixels: n, x, y };
}
function checkState(r, state) {
    const errors = [];
    try {
        const s = state.snapshot;
        if (
            s.disposed ||
            s.submitted !== s.sequence ||
            !Number.isSafeInteger(s.sequence) ||
            s.sequence < 0 ||
            !finite(Date.parse(s.submissionTimestamp)) ||
            !Number.isSafeInteger(s.frames) ||
            s.frames < 1
        )
            errors.push('submission');
        if (s.clock.method !== (r.clock ?? 'NATIVE_PACER')) errors.push('clock method');
        const p = readPNG(state.png);
        if (
            Math.abs(p.width - r.viewport.width * s.layout.dpr) > 1 ||
            Math.abs(p.height - r.viewport.height * s.layout.dpr) > 1
        )
            errors.push('viewport');
        if (state.kind === 'assembly') {
            const error = poseError(s, state.expectedStage);
            if (state.expectConverged ? error > 0.002 : !(error > 0.002)) errors.push('native convergence');
            if (state.expectConverged) {
                for (const v of expected(state.expectedStage))
                    if (countPatch(p, s, { x: v.position[0], y: v.position[1] }, 'red').pixels < 8)
                        errors.push('native part not visible');
            }
        } else if (state.kind === 'cue') {
            const a = s.audio,
                c = a.cues.find((c) => c.cueId === state.cueId),
                want = CUES[state.cueId];
            if (s.mode !== 'audio' || a.nodePositions.length !== 12 || a.activeNodes.length !== 12)
                errors.push('audio scene shape');
            if (
                !c ||
                c.targetAudioTime !== want ||
                !finite(c.nodeActivationTime) ||
                c.nodeActivationTime < want ||
                !a.activeNodes[state.cueId] ||
                c.generation !== s.generation
            )
                errors.push('cue identity/activation');
            if (
                c &&
                (!finite(c.contextTime) ||
                    !finite(c.origin) ||
                    Math.abs(c.nodeActivationTime - (c.contextTime - c.origin)) > 0.004 ||
                    !Number.isSafeInteger(c.frame))
            )
                errors.push('audio clock activation relation');
            const o = state.observation;
            if (
                !o ||
                !finite(o.audioBefore) ||
                !finite(o.audioAfter) ||
                o.audioBefore < c.nodeActivationTime ||
                o.audioAfter < o.audioBefore ||
                !o.startedAt ||
                !o.endedAt
            )
                errors.push('visible observation interval');
            if (countPatch(p, s, a.nodePositions[state.cueId], 'green').pixels < 8) errors.push('cue not visible');
            if (a.error || a.state !== 'running') errors.push('audio state');
        } else errors.push('unknown state kind');
    } catch (e) {
        errors.push(e.message);
    }
    return { pass: !errors.length, errors };
}
function samePose(a, b) {
    return JSON.stringify(a.poses) === JSON.stringify(b.poses) && JSON.stringify(a.camera) === JSON.stringify(b.camera);
}
function checkAssembly(row) {
    const errors = [];
    try {
        const names = [
            'initial',
            'intermediate',
            'target1',
            'paused',
            'speed-feedback',
            'resumed',
            'reset',
            'back',
            'replay',
            'last-target',
            'end',
        ];
        if (
            row.states.length !== names.length ||
            names.some((n) => row.states.filter((s) => s.name === n).length !== 1)
        )
            errors.push('state coverage');
        for (const s of row.states) for (const e of checkState(row, s).errors) errors.push(s.name + ': ' + e);
        const x = row.observations;
        if (
            !samePose(x.pauseBefore, x.pauseAfter) ||
            x.pauseBefore.logicalTime !== x.pauseAfter.logicalTime ||
            !x.pauseAfter.paused
        )
            errors.push('pause freeze');
        if (
            x.speedAfter.logicalTime !== x.pauseAfter.logicalTime ||
            !samePose(x.speedAfter, x.pauseAfter) ||
            x.speedAfter.speed !== 3 ||
            x.speedAfter.materialColor.r !== 235 ||
            x.speedAfter.materialColor.g !== 175
        )
            errors.push('paused speed feedback');
        if (!(x.resumeAfter.logicalTime > x.speedAfter.logicalTime) || x.resumeAfter.paused) errors.push('resume');
        if (x.reset.logicalTime !== 0 || x.reset.rangeValue !== 0 || poseError(x.reset, 0) > 0.002)
            errors.push('reset');
        if (x.end.rangeValue !== 499 || x.end.logicalTime !== 499 || poseError(x.end, 2) > 0.002)
            errors.push('range End');
        if (x.late.accepted !== false || x.late.token >= x.late.current || poseError(x.afterLate, 2) > 0.002)
            errors.push('late callback');
        for (const name of ['mode', 'resize']) {
            const c = x.cancels[name];
            if (
                c.retired.generation <= c.held.generation ||
                c.late.dragCommits !== c.retired.dragCommits ||
                !c.late.events.some((e) => e.type === 'range-release' && e.accepted === false) ||
                c.fresh.dragCommits !== c.late.dragCommits + 1
            )
                errors.push(name + ' range cancel');
        }
        if (
            !row.receivedEvents.some((e) => e.type === 'target' && e.isTrusted) ||
            !row.receivedEvents.some((e) => e.type === 'pause' && e.isTrusted) ||
            !row.receivedEvents.some((e) => e.type === 'resume' && e.isTrusted) ||
            !row.receivedEvents.some((e) => e.type === 'seek' && e.isTrusted) ||
            row.receivedEvents.some((e, i) => i && e.sequence <= row.receivedEvents[i - 1].sequence)
        )
            errors.push('trusted control events');
        if (
            row.clock === 'STEP_CLOCK' &&
            (!x.stepBefore.clock.stepped ||
                x.stepAfter.clock.stepped <= x.stepBefore.clock.stepped ||
                x.stepAfter.audio.ready ||
                x.stepAfter.audio.state !== null)
        )
            errors.push('deterministic separation');
        checkRelease(row.release, errors);
    } catch (e) {
        errors.push(e.message);
    }
    return { pass: !errors.length, errors };
}
function checkRelease(r, errors) {
    if (
        !r?.samePromise ||
        !r.quiet ||
        !r.controlsDisabled ||
        r.receipt.refs.length !== 3 ||
        r.receipt.refs.some((v) => v.before !== 1 || v.after !== 0) ||
        r.after.ownedRefs.some((v) => v !== 0) ||
        !r.receipt.domAborted ||
        r.postReleaseError !== 'TIMELINE_DISPOSED'
    )
        errors.push('release');
}
function checkAudioCompletion(completion) {
    const errors = [];
    try {
        if (!completion || completion.contract !== 'natural-and-explicit/1')
            throw Error('audio completion controls missing');
        const { beforeNatural, naturalEnd, beforeStop, afterStop } = completion;
        for (const snapshot of [beforeNatural, naturalEnd, beforeStop, afterStop]) {
            const audio = snapshot.audio;
            if (
                ['endedCurrent', 'sourceStops', 'sourceCreates'].some(
                    (key) => !Number.isSafeInteger(audio[key]) || audio[key] < 0,
                ) ||
                audio.sourceCreates !== audio.startedSources.length ||
                !audio.startedSources.length
            )
                throw Error('audio completion source counters');
        }
        if (
            !beforeNatural.audio.playing ||
            naturalEnd.audio.endedCurrent !== beforeNatural.audio.endedCurrent + 1 ||
            naturalEnd.audio.sourceStops !== beforeNatural.audio.sourceStops ||
            naturalEnd.audio.sourceCreates !== beforeNatural.audio.sourceCreates ||
            naturalEnd.audio.startedSources.at(-1).id !== beforeNatural.audio.startedSources.at(-1).id ||
            naturalEnd.audio.playing ||
            !naturalEnd.audio.startedSources.at(-1)?.ended ||
            naturalEnd.audio.startedSources.at(-1)?.stopped
        )
            errors.push('natural end must not be explicit stop');
        if (
            !beforeStop.audio.playing ||
            afterStop.audio.playing ||
            afterStop.audio.sourceStops !== beforeStop.audio.sourceStops + 1 ||
            afterStop.audio.sourceCreates !== beforeStop.audio.sourceCreates ||
            afterStop.audio.startedSources.at(-1).id !== beforeStop.audio.startedSources.at(-1).id ||
            afterStop.audio.endedCurrent !== beforeStop.audio.endedCurrent ||
            !afterStop.audio.startedSources.at(-1)?.stopped ||
            afterStop.audio.startedSources.at(-1)?.ended
        )
            errors.push('explicit stop must not be natural end');
    } catch (error) {
        errors.push(error.message);
    }
    return { pass: !errors.length, errors };
}
function checkAudio(row) {
    const errors = [];
    if (row.notRun) {
        const issues = [row.engine + ' WebAudio NOT_RUN: ' + row.notRun.reason];
        if (row.capability?.AudioContext !== 'undefined' || row.capability?.webkitAudioContext !== 'undefined')
            issues.push('unjustified notRun');
        checkRelease(row.release, issues);
        return { pass: false, notRun: true, errors: issues };
    }
    try {
        if (row.states.length !== 12 || row.states.some((s, i) => s.cueId !== i)) errors.push('12 cue coverage');
        for (let i = 0; i < row.states.length; i++) {
            const previous = i === 0 ? row.audioBaseline : row.states[i - 1];
            if (
                !previous ||
                countPatch(
                    readPNG(previous.png),
                    previous.snapshot,
                    row.states[i].snapshot.audio.nodePositions[i],
                    'green',
                ).pixels >= 8
            )
                errors.push('previous cue must be absent ' + i);
        }
        for (const s of row.states) for (const e of checkState(row, s).errors) errors.push('cue' + s.cueId + ': ' + e);
        errors.push(...checkAudioCompletion(row.completion).errors);
        const x = row.controls;
        for (const snap of Object.values(x)) {
            if (!snap || !snap.audio) throw Error('missing control snapshot');
            const a = snap.audio;
            if (
                !finite(a.currentTime) ||
                !finite(a.origin) ||
                !finite(a.time) ||
                a.time < 0 ||
                !finite(a.duration) ||
                Math.abs(a.duration - 16.2) > 0.002 ||
                !Number.isSafeInteger(a.sourceCreates) ||
                !Number.isSafeInteger(a.sourceStops) ||
                a.sourceCreates !== a.startedSources.length ||
                a.startedSources.some(
                    (v, i) => v.id !== i + 1 || !finite(v.offset) || !Number.isSafeInteger(v.generation),
                )
            )
                errors.push('control clock/source values');
            poseError(snap, snap.stage);
        }
        if (
            x.pauseAfter.audio.currentTime - x.pauseSettled.audio.currentTime > 0.005 ||
            x.pauseAfter.audio.time !== x.pauseSettled.audio.time ||
            !samePose(x.pauseAfter, x.pauseSettled)
        )
            errors.push('audio pause');
        if (
            x.resumeAfter.audio.sourceCreates !== x.pauseAfter.audio.sourceCreates ||
            x.resumeAfter.audio.origin !== x.pauseAfter.audio.origin ||
            x.resumeAfter.audio.currentTime - x.pauseAfter.audio.currentTime < 0.1
        )
            errors.push('audio resume');
        if (
            x.muteAfter.audio.time - x.muteBefore.audio.time < 0.1 ||
            !finite(x.muteAfter.audio.rms) ||
            x.muteAfter.audio.rms > 0.0005 ||
            !x.muteAfter.audio.muted
        )
            errors.push('mute tap/time');
        if (!(x.muteBefore.audio.rms > 0.001)) errors.push('tap alive before mute');
        if (
            x.replayAfter.audio.sourceCreates !== x.replayBefore.audio.sourceCreates + 1 ||
            x.replayAfter.audio.sourceStops !== x.replayBefore.audio.sourceStops + 1 ||
            x.replayAfter.generation <= x.replayBefore.generation
        )
            errors.push('replay one source');
        if (
            x.seekResetAfter.audio.cues.some((c) => c.generation !== x.seekResetAfter.generation) ||
            x.seekResetAfter.audio.sourceCreates !== x.seekResetBefore.audio.sourceCreates + 3 ||
            x.seekResetAfter.audio.startedSources.slice(0, -1).some((v) => !v.stopped && !v.ended)
        )
            errors.push('Seek Reset Replay retirement');
        if (
            !row.receivedEvents.some((e) => e.type === 'play' && e.isTrusted) ||
            !row.receivedEvents.some((e) => e.type === 'mute' && e.isTrusted)
        )
            errors.push('trusted audio controls');
        if (row.load !== 'idle' && row.load !== 'cpu-6ms-per-40ms') errors.push('load identity');
        if (row.load !== 'idle' && row.stress?.samples?.length < 100) errors.push('stress trace');
        if (row.sampleTrace.length < 12 || row.sampleTrace.some((s) => !finite(s.contextTime) || !finite(s.audioTime)))
            errors.push('raw time trace');
        checkRelease(row.release, errors);
    } catch (e) {
        errors.push(e.message);
    }
    return { pass: !errors.length, errors };
}
function checkScroll(row) {
    const errors = [];
    try {
        if (![480, 1000].includes(row.height) || row.states.length !== 7) errors.push('scroll coverage');
        for (const s of row.states) {
            const v = s.scroll;
            const end = v.documentHeight - v.viewportHeight,
                want = end === 0 ? 1 : Math.max(0, Math.min(1, v.scrollY / end));
            let section = 0;
            for (let i = 0; i < v.offsets.length; i++)
                if (v.scrollY + v.viewportHeight / 2 >= v.offsets[i]) section = i;
            if (want === 1) section = v.offsets.length - 1;
            if (
                v.offsets.length !== 4 ||
                Math.abs(v.progress - want) > 1e-6 ||
                v.section !== section ||
                !s.events.some((e) => e.type === 'scroll' && e.isTrusted)
            )
                errors.push('actual section offsets');
        }
        if (
            row.states[4].scroll.progress !== 1 ||
            row.states[4].scroll.section !== 3 ||
            !(row.states[5].scroll.progress < 1)
        )
            errors.push('end/reverse');
        checkRelease(row.release, errors);
    } catch (e) {
        errors.push(e.message);
    }
    return { pass: !errors.length, errors };
}
function requestedEngines(value = 'all') {
    if (value === 'all') return ENGINES.slice();
    if (ENGINES.includes(value)) return [value];
    throw Error('browser must be all, chromium, firefox or webkit');
}
function checkReport(report, options = {}) {
    const errors = [];
    const selected = options.selected === true;
    try {
        const requested = report.requestedEngines;
        if (
            !Array.isArray(requested) ||
            !requested.length ||
            new Set(requested).size !== requested.length ||
            requested.some((engine) => !ENGINES.includes(engine))
        )
            throw Error('invalid requested browser matrix');
        const engines = selected ? requested : ENGINES;
        if (!selected && JSON.stringify(requested) !== JSON.stringify(ENGINES))
            errors.push('full browser matrix not selected');
        if (
            report.schemaVersion !== 'ier-timeline/2' ||
            report.sourceStatus !== 'recreated' ||
            report.referenceComparison?.result !== 'NOT_RUN' ||
            report.completed !== false ||
            report.subset !== true
        )
            errors.push('scope/source');
        if (
            report.fingerprints?.length !== INPUTS.length ||
            INPUTS.some((p) => {
                const f = report.fingerprints.find((f) => f.path === p),
                    actual = fingerprint(p);
                return !f || f.sha256 !== actual.sha256 || f.bytes !== actual.bytes;
            })
        )
            errors.push('identity drift');
        for (const engine of engines) {
            for (const clock of ['NATIVE_PACER', 'STEP_CLOCK']) {
                const rows = report.assembly.filter((r) => r.engine === engine && r.clock === clock);
                if (rows.length !== 1) errors.push(engine + ' assembly coverage');
                else for (const e of checkAssembly(rows[0]).errors) errors.push(engine + '/' + clock + ': ' + e);
            }
            for (const load of ['idle', 'cpu-6ms-per-40ms']) {
                const rows = report.audio.filter((r) => r.engine === engine && r.load === load);
                if (rows.length !== 1) errors.push(engine + ' audio coverage');
                else for (const e of checkAudio(rows[0]).errors) errors.push(engine + '/' + load + ': ' + e);
            }
            for (const height of [480, 1000]) {
                const rows = report.scroll.filter((r) => r.engine === engine && r.height === height);
                if (rows.length !== 1) errors.push(engine + ' scroll coverage');
                else for (const e of checkScroll(rows[0]).errors) errors.push(engine + '/scroll' + height + ': ' + e);
            }
        }
        if (
            report.assembly.length !== engines.length * 2 ||
            report.audio.length !== engines.length * 2 ||
            report.scroll.length !== engines.length * 2
        )
            errors.push('row count');
        for (const r of [...report.assembly, ...report.audio, ...report.scroll])
            if (!ENGINES.includes(r.engine) || !r.version || r.pageErrors.length || r.consoleErrors.length)
                errors.push(r.engine + ' browser errors/version');
    } catch (e) {
        errors.push(e.message);
    }
    return {
        scopePassed: !selected && !errors.length,
        ...(selected ? { selectedScopePassed: !errors.length } : {}),
        errors,
    };
}
async function trustedClick(page, selector) {
    await page.bringToFront();
    const hit = await page.locator(selector).evaluate((el) => {
        const r = el.getBoundingClientRect(),
            x = r.left + r.width / 2,
            y = r.top + r.height / 2,
            t = document.elementFromPoint(x, y);
        return { x, y, valid: r.width > 0 && !el.disabled && t?.closest('button') === el };
    });
    if (!hit.valid) throw Error('not visible button ' + selector);
    await page.mouse.click(hit.x, hit.y);
}
async function main() {
    const arg = (n) => process.argv.find((v) => v.startsWith('--' + n + '='))?.slice(n.length + 3),
        verify = arg('verify');
    if (verify) {
        const report = JSON.parse(fs.readFileSync(verify)),
            selection = requestedEngines(arg('browser')),
            selected = arg('browser') && arg('browser') !== 'all';
        if (selected && JSON.stringify(selection) !== JSON.stringify(report.requestedEngines))
            throw Error('verification browser selection does not match report');
        const v = checkReport(report, { selected: !!selected });
        console.log(JSON.stringify(v, null, 2));
        process.exitCode = (selected ? v.selectedScopePassed : v.scopePassed) ? 0 : 1;
        return;
    }
    const engines = requestedEngines(arg('browser'));
    const out = arg('out');
    if (!out || fs.existsSync(out)) throw Error('explicit new --out required');
    const artifacts = path.resolve(out.replace(/\.json$/, '') + '-artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    const report = {
        schemaVersion: 'ier-timeline/2',
        requestedEngines: engines,
        candidate: process.env.SDK_CANDIDATE_HEAD || 'working-tree',
        runtimeHead: process.env.SDK_RUNTIME_HEAD || process.env.SDK_CANDIDATE_HEAD || 'working-tree',
        crossCandidate:
            !!process.env.SDK_RUNTIME_HEAD && process.env.SDK_RUNTIME_HEAD !== process.env.SDK_CANDIDATE_HEAD,
        sourceStatus: 'recreated',
        referenceComparison: {
            result: 'NOT_RUN',
            reason: 'This collector uses the 18-group teaching fixture and 16.2-second original cue; original project/reference acceptance is tracked separately in the SDK ledger',
        },
        subset: true,
        completed: false,
        executionChannel: 'Lead',
        startedAt: new Date().toISOString(),
        command: process.argv.join(' '),
        cwd: ROOT,
        fingerprints: INPUTS.map(fingerprint),
        assembly: [],
        audio: [],
        scroll: [],
        limitations: [
            '18 teaching groups, not 1188 parts or 155 stages; local 499-second endpoint only',
            'AudioContext node activation and screenshot observation are separate; no physical display or audible output claim',
            'Mute sample tap post-gain analyser before destination; fixed RMS tolerance 0.0005',
            'Stress is local CPU busy work (6ms requested per 40ms), not a product budget or target-device certification',
            'No MediaRecorder recording claim; real time trace plus PNG provided',
        ],
    };
    const server = await require('./competitive-example-server.cjs').startExampleServer(ROOT),
        pw = require('playwright');
    try {
        for (const engine of engines) {
            const browser = await pw[engine].launch({
                ...require('./browser-engines.cjs').launchOptions(engine),
                headless: true,
            });
            try {
                async function open(row, query = '', height = 900) {
                    const context = await browser.newContext({
                            viewport: { width: 1050, height },
                            deviceScaleFactor: 1,
                        }),
                        page = await context.newPage();
                    row.version = browser.version();
                    row.viewport = { width: 1050, height };
                    row.pageErrors = [];
                    row.consoleErrors = [];
                    page.on('pageerror', (e) => row.pageErrors.push(String(e)));
                    page.on('console', (m) => {
                        if (m.type() === 'error') row.consoleErrors.push(m.text());
                    });
                    await page.goto(server.origin + '/examples/interactive-timeline/' + query, {
                        waitUntil: 'domcontentloaded',
                    });
                    await page.waitForFunction(() => window.__timeline, null, { polling: 20, timeout: 20000 });
                    return { page, context };
                }
                async function release(page) {
                    return page.evaluate(async () => {
                        const a = window.__timeline.release(),
                            b = window.__timeline.release(),
                            receipt = await a,
                            before = window.__timeline.snapshot();
                        await new Promise((r) => setTimeout(r, 120));
                        const after = window.__timeline.snapshot();
                        let postReleaseError = '';
                        try {
                            await window.__timeline.step(0.1);
                        } catch (e) {
                            postReleaseError = e.message;
                        }
                        return {
                            samePromise: a === b,
                            receipt,
                            after,
                            quiet: before.sequence === after.sequence && before.frames === after.frames,
                            controlsDisabled: [...document.querySelectorAll('button,input')].every((e) => e.disabled),
                            postReleaseError,
                        };
                    });
                }
                async function capture(page, row, name, detail) {
                    if (row.clock === 'STEP_CLOCK') await page.evaluate(() => window.__timeline.step(0));
                    await page.waitForTimeout(60);
                    const startedAt = new Date().toISOString(),
                        snapshot = await page.evaluate(() => window.__timeline.snapshot()),
                        p = path.join(artifacts, `${engine}-${row.clock || row.load}-${name}.png`);
                    await page.screenshot({ path: p });
                    const after = await page.evaluate(() => window.__timeline.snapshot()),
                        b = fs.readFileSync(p),
                        state = {
                            name,
                            ...detail,
                            snapshot,
                            png: { path: path.relative(ROOT, p).replace(/\\/g, '/'), sha256: hash(b), bytes: b.length },
                            observation: {
                                startedAt,
                                endedAt: new Date().toISOString(),
                                audioBefore: snapshot.audio.time,
                                audioAfter: after.audio.time,
                            },
                        };
                    row.states.push(state);
                    console.log(engine, row.clock || row.load, name, JSON.stringify(checkState(row, state)));
                    return state;
                }
                for (const clock of ['NATIVE_PACER', 'STEP_CLOCK']) {
                    const row = { engine, clock, states: [], observations: {} };
                    report.assembly.push(row);
                    let context;
                    try {
                        const opened = await open(row, clock === 'STEP_CLOCK' ? '?test=1' : '');
                        context = opened.context;
                        const page = opened.page,
                            snap = () => page.evaluate(() => window.__timeline.snapshot()),
                            advance = async (count = 40) => {
                                if (clock === 'STEP_CLOCK')
                                    await page.evaluate(async (n) => {
                                        for (let i = 0; i < n; i++) await window.__timeline.step(1 / 60);
                                    }, count);
                                else await page.waitForTimeout((count / 60) * 1000);
                            };
                        await advance(2);
                        await capture(page, row, 'initial', {
                            kind: 'assembly',
                            expectedStage: 0,
                            expectConverged: true,
                        });
                        await trustedClick(page, '#target1');
                        await capture(page, row, 'intermediate', {
                            kind: 'assembly',
                            expectedStage: 1,
                            expectConverged: false,
                        });
                        await advance();
                        await capture(page, row, 'target1', {
                            kind: 'assembly',
                            expectedStage: 1,
                            expectConverged: true,
                        });
                        await trustedClick(page, '#pause');
                        row.observations.pauseBefore = await snap();
                        await advance(15);
                        row.observations.pauseAfter = await snap();
                        await capture(page, row, 'paused', {
                            kind: 'assembly',
                            expectedStage: 1,
                            expectConverged: true,
                        });
                        await page.locator('#speed').focus();
                        await page.keyboard.press('End');
                        await advance(2);
                        row.observations.speedAfter = await snap();
                        await capture(page, row, 'speed-feedback', {
                            kind: 'assembly',
                            expectedStage: 1,
                            expectConverged: true,
                        });
                        await trustedClick(page, '#resume');
                        await advance(10);
                        row.observations.resumeAfter = await snap();
                        await capture(page, row, 'resumed', {
                            kind: 'assembly',
                            expectedStage: 1,
                            expectConverged: true,
                        });
                        await trustedClick(page, '#reset');
                        row.observations.reset = await snap();
                        await capture(page, row, 'reset', {
                            kind: 'assembly',
                            expectedStage: 0,
                            expectConverged: true,
                        });
                        await trustedClick(page, '#target2');
                        await advance();
                        await trustedClick(page, '#back');
                        await advance();
                        await capture(page, row, 'back', { kind: 'assembly', expectedStage: 1, expectConverged: true });
                        await trustedClick(page, '#replay');
                        await advance();
                        await capture(page, row, 'replay', {
                            kind: 'assembly',
                            expectedStage: 1,
                            expectConverged: true,
                        });
                        await page.evaluate(() => {
                            window.__late = window.__timeline.lateTarget(0, 120);
                        });
                        for (const id of ['#target0', '#target1', '#target2']) await trustedClick(page, id);
                        await advance();
                        row.observations.late = await page.evaluate(() => window.__late);
                        row.observations.afterLate = await snap();
                        await capture(page, row, 'last-target', {
                            kind: 'assembly',
                            expectedStage: 2,
                            expectConverged: true,
                        });
                        row.observations.cancels = {};
                        for (const name of ['mode', 'resize']) {
                            const box = await page.locator('#range').boundingBox();
                            await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
                            await page.mouse.down();
                            const held = await snap();
                            if (name === 'mode') {
                                await page.locator('#audio-mode').focus();
                                await page.keyboard.press('Enter');
                            } else {
                                await page.setViewportSize({ width: 1040, height: 900 });
                                await page.waitForFunction(
                                    (g) => window.__timeline.snapshot().generation > g,
                                    held.generation,
                                    { polling: 20 },
                                );
                            }
                            const retired = await snap();
                            await page.mouse.up();
                            await page.waitForTimeout(30);
                            const late = await snap();
                            await trustedClick(page, '#assembly');
                            await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
                            const fresh = await snap();
                            row.observations.cancels[name] = { held, retired, late, fresh };
                        }
                        await page.setViewportSize({ width: 1050, height: 900 });
                        await page.waitForTimeout(80);
                        await trustedClick(page, '#pause');
                        await page.locator('#range').focus();
                        await page.keyboard.press('End');
                        if (clock === 'STEP_CLOCK') await advance(1);
                        row.observations.end = await snap();
                        await capture(page, row, 'end', { kind: 'assembly', expectedStage: 2, expectConverged: true });
                        row.observations.stepBefore = await snap();
                        await advance(1);
                        row.observations.stepAfter = await snap();
                        row.receivedEvents = (await snap()).events;
                        row.release = await release(page);
                    } catch (e) {
                        row.pageErrors.push(String(e.stack || e));
                    } finally {
                        await context?.close();
                    }
                    console.log('assembly', engine, clock, JSON.stringify(checkAssembly(row)));
                }
                for (const height of [480, 1000]) {
                    const row = { engine, height, states: [] };
                    report.scroll.push(row);
                    let context;
                    try {
                        const opened = await open(row, '', height);
                        context = opened.context;
                        const page = opened.page;
                        await page.locator('#scroll-mode').check();
                        for (const point of [0, 1, 2, 3, 'end', 2, 0]) {
                            await page.evaluate((p) => {
                                const sections = [...document.querySelectorAll('section')];
                                const y =
                                    p === 'end'
                                        ? document.documentElement.scrollHeight - innerHeight
                                        : Math.max(
                                              1,
                                              sections[p].getBoundingClientRect().top + scrollY - innerHeight / 2 + 1,
                                          );
                                window.scrollTo(0, y);
                            }, point);
                            await page.waitForTimeout(100);
                            row.states.push(await page.evaluate(() => window.__timeline.snapshot()));
                        }
                        row.release = await release(page);
                    } catch (e) {
                        row.pageErrors.push(String(e.stack || e));
                    } finally {
                        await context?.close();
                    }
                    console.log('scroll', engine, height, JSON.stringify(checkScroll(row)));
                }
                for (const load of ['idle', 'cpu-6ms-per-40ms']) {
                    const row = { engine, load, states: [], controls: {}, sampleTrace: [] };
                    report.audio.push(row);
                    let context;
                    try {
                        const opened = await open(row);
                        context = opened.context;
                        const page = opened.page,
                            snap = () => page.evaluate(() => window.__timeline.snapshot());
                        const capability = await page.evaluate(() => ({
                            AudioContext: typeof AudioContext,
                            webkitAudioContext: typeof window.webkitAudioContext,
                            MediaRecorder: typeof MediaRecorder,
                        }));
                        row.capability = capability;
                        if (capability.AudioContext === 'undefined' && capability.webkitAudioContext === 'undefined') {
                            row.notRun = {
                                status: 'NOT_RUN',
                                reason: 'This installed WebKit browser exposes neither AudioContext nor webkitAudioContext; no HTMLAudio clock substitution',
                                capability,
                            };
                            row.failureSnapshot = await snap();
                            row.release = await release(page);
                            continue;
                        }
                        await page.waitForFunction(() => window.__timeline.snapshot().audio.ready, null, {
                            polling: 20,
                        });
                        if (load !== 'idle')
                            await page.evaluate(() => {
                                window.__stressSamples = [];
                                window.__stress = setInterval(() => {
                                    const t = performance.now();
                                    while (performance.now() - t < 6) {}
                                    window.__stressSamples.push({ start: t, duration: performance.now() - t });
                                }, 40);
                            });
                        await trustedClick(page, '#play');
                        await page.waitForTimeout(70);
                        const bs = await snap(),
                            bp = path.join(artifacts, engine + '-' + load + '-audio-baseline.png');
                        await page.screenshot({ path: bp });
                        const bb = fs.readFileSync(bp);
                        row.audioBaseline = {
                            snapshot: bs,
                            png: {
                                path: path.relative(ROOT, bp).replace(/\\/g, '/'),
                                sha256: hash(bb),
                                bytes: bb.length,
                            },
                        };
                        for (let i = 0; i < 12; i++) {
                            await page.waitForFunction(
                                (id) => window.__timeline.snapshot().audio.cues.some((c) => c.cueId === id),
                                i,
                                { polling: 20, timeout: 20000 },
                            );
                            const s = await snap();
                            row.sampleTrace.push({
                                cueId: i,
                                contextTime: s.audio.currentTime,
                                audioTime: s.audio.time,
                                frame: s.frames,
                            });
                            await capture(page, row, 'cue-' + i, { kind: 'cue', cueId: i });
                        }
                        const x = row.controls;
                        await trustedClick(page, '#pause');
                        await page.waitForTimeout(100);
                        x.pauseSettled = await snap();
                        await page.waitForTimeout(200);
                        x.pauseAfter = await snap();
                        await trustedClick(page, '#resume');
                        await page.waitForTimeout(240);
                        x.resumeEarlyAfter = await snap();
                        await page.waitForFunction(
                            (t) => window.__timeline.snapshot().audio.currentTime > t + 0.12,
                            x.pauseAfter.audio.currentTime,
                            { polling: 20, timeout: 3000 },
                        );
                        x.resumeAfter = await snap();
                        x.muteBefore = await snap();
                        await trustedClick(page, '#mute');
                        await page.waitForTimeout(240);
                        x.muteAfter = await snap();
                        await trustedClick(page, '#mute');
                        x.replayBefore = await snap();
                        await trustedClick(page, '#replay');
                        await page.waitForTimeout(240);
                        x.replayAfter = await snap();
                        x.seekResetBefore = await snap();
                        for (const key of ['End', 'Home']) {
                            await page.locator('#range').focus();
                            await page.keyboard.press(key);
                        }
                        await trustedClick(page, '#reset');
                        await trustedClick(page, '#replay');
                        await page.waitForTimeout(650);
                        x.seekResetAfter = await snap();
                        row.completion = { contract: 'natural-and-explicit/1', beforeNatural: await snap() };
                        await page.waitForFunction(
                            (n) => window.__timeline.snapshot().audio.endedCurrent === n + 1,
                            row.completion.beforeNatural.audio.endedCurrent,
                            { polling: 20, timeout: 20000 },
                        );
                        row.completion.naturalEnd = await snap();
                        await trustedClick(page, '#replay');
                        await page.waitForTimeout(150);
                        row.completion.beforeStop = await snap();
                        await trustedClick(page, '#reset');
                        await page.waitForTimeout(100);
                        row.completion.afterStop = await snap();
                        row.receivedEvents = x.seekResetAfter.events;
                        row.recording = {
                            result: 'NOT_RUN',
                            supported: x.seekResetAfter.audio.recordingSupported,
                            reason: 'No MediaRecorder export performed; trace and PNG are substitute observation artifacts',
                        };
                        if (load !== 'idle')
                            row.stress = await page.evaluate(() => {
                                clearInterval(window.__stress);
                                return { samples: window.__stressSamples };
                            });
                        row.release = await release(page);
                    } catch (e) {
                        row.pageErrors.push(String(e.stack || e));
                        try {
                            row.failureSnapshot = await context.pages()[0].evaluate(() => window.__timeline.snapshot());
                        } catch {}
                    } finally {
                        await context?.close();
                    }
                    console.log('audio', engine, load, JSON.stringify(checkAudio(row)));
                }
            } finally {
                await browser.close();
            }
        }
    } finally {
        await server.close();
    }
    report.endedAt = new Date().toISOString();
    report.validation = checkReport(report);
    report.scopePassed = report.validation.scopePassed;
    report.selectedValidation = checkReport(report, { selected: true });
    report.selectedScopePassed = report.selectedValidation.selectedScopePassed;
    report.exitCode = report.selectedScopePassed ? 0 : 1;
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ fullMatrix: report.validation, selectedMatrix: report.selectedValidation }, null, 2));
    process.exitCode = report.exitCode;
}
module.exports = {
    expected,
    poseError,
    countPatch,
    checkState,
    checkAssembly,
    checkAudio,
    checkAudioCompletion,
    checkScroll,
    checkReport,
    requestedEngines,
    INPUTS,
};
if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
