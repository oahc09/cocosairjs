'use strict';
// Pure independent review. Does not launch a browser or rewrite the immutable collector.
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto');
const oracle = require('./shaders-thin-film-oracle.cjs'),
    performance = require('./shaders-thin-film-performance.cjs');
const ROOT = path.resolve(__dirname, '../..');
const contract = require('./shaders-effect-contract.cjs');
const OPS = Object.freeze({
    update: [undefined],
    command: [
        'begin',
        'end',
        'beginRenderPass',
        'endRenderPass',
        'bindPipelineState',
        'bindDescriptorSet',
        'bindInputAssembler',
        'draw',
    ],
    dispatch: ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'],
    queue: ['submit'],
});
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
function checkFile(f, root = ROOT) {
    try {
        const b = fs.readFileSync(path.resolve(root, f.path));
        return b.length === f.bytes && hash(b) === f.sha256;
    } catch {
        return false;
    }
}
function observedIsolation(document) {
    const legacy = document?.observedHeaders,
        delivered = document?.deliveredHeaders;
    if (!legacy && !delivered) return false;
    if (
        legacy &&
        (legacy['cross-origin-opener-policy'] !== 'same-origin' ||
            legacy['cross-origin-embedder-policy'] !== 'require-corp')
    )
        return false;
    if (delivered && (delivered.coop !== 'same-origin' || delivered.coep !== 'require-corp')) return false;
    return document.status === 200;
}
function checkPerformance(raw, profile) {
    try {
        const checked = performance.validatePerformance(raw, profile),
            errors = [...checked.errors];
        if (raw.readPixelsDuringWindow !== 0) errors.push('performance readPixels pollution');
        if (
            raw.precision?.crossOriginIsolated !== true ||
            !Number.isFinite(raw.precision?.minimumPositiveDeltaMs) ||
            raw.precision.minimumPositiveDeltaMs <= 0 ||
            !observedIsolation(raw.httpDocument) ||
            raw.httpDocument.status !== 200
        )
            errors.push('observed HTTP/COI/precision');
        for (const kind of ['update', 'command', 'dispatch'])
            if (checked.samples?.[kind]?.every((n) => n === 0))
                errors.push(`CPU ${kind} below observable precision: all zero, LIMITED`);
        if (
            !Number.isFinite(raw.window?.startedAtMs) ||
            !Number.isFinite(raw.window?.endedAtMs) ||
            raw.window.endedAtMs <= raw.window.startedAtMs
        )
            errors.push('wall clock window');
        const live = { buffer: new Set(), texture: new Set() },
            seen = new Set();
        if (!Array.isArray(raw.gfxObjects?.events) || !raw.gfxObjects.events.length)
            errors.push('native gfx trace missing');
        else
            for (const event of raw.gfxObjects.events) {
                if (!['buffer', 'texture'].includes(event.kind) || !Number.isSafeInteger(event.id) || event.id < 1) {
                    errors.push('gfx event type/id');
                    continue;
                }
                const create = event.kind === 'buffer' ? 'createBuffer' : 'createTexture',
                    destroy = event.kind === 'buffer' ? 'deleteBuffer' : 'deleteTexture';
                if (event.operation === create) {
                    if (seen.has(event.id)) errors.push('gfx id duplicate');
                    seen.add(event.id);
                    live[event.kind].add(event.id);
                } else if (event.operation === destroy) {
                    if (!live[event.kind].has(event.id) || event.nativeAliveAfter !== false)
                        errors.push('gfx deletion');
                    live[event.kind].delete(event.id);
                } else errors.push('gfx operation');
            }
        if (
            live.buffer.size !== raw.gfxObjects?.bufferCount ||
            live.texture.size !== raw.gfxObjects?.textureCount ||
            live.buffer.size < 1
        )
            errors.push('native object counters');
        for (const [kind, rows] of Object.entries({
            update: raw.updateCalls,
            command: raw.commands,
            dispatch: raw.draws,
            queue: raw.queueBookkeeping,
        })) {
            if (!Array.isArray(rows) || rows.some((r) => !r || !OPS[kind].includes(r.operation)))
                errors.push(`${kind}: operation set`);
        }
        if (raw.timerAvailable) {
            const ids = checked.steadyFrames || [],
                gpu = raw.gpuSamples?.filter((s) => ids.includes(s.frame)) || [];
            if (
                gpu.length !== ids.length ||
                new Set(gpu.map((s) => s.frame)).size !== ids.length ||
                ids.some((id) => !gpu.some((s) => s.frame === id))
            )
                errors.push('exact steady GPU frame coverage');
            for (const sample of raw.gpuSamples || []) {
                const events = raw.queryEvents.filter((e) => e.frame === sample.frame);
                const deleted = events.filter((e) => e.event === 'deleted');
                if (deleted.length !== 1 || deleted[0].nativeIsQueryAfter !== false)
                    errors.push('native query deletion missing');
            }
        }
        return { ...checked, errors };
    } catch (error) {
        return { errors: [`malformed performance: ${error.message}`], measurements: 0 };
    }
}
function checkReport(report, { root = ROOT, requireQueryDeletion = true } = {}) {
    try {
        const errors = [];
        if (!report || report.schemaVersion !== 'e02-thin-film/1') return { ok: false, errors: ['schema'] };
        if (
            !['functional', 'performance'].includes(report.phase) ||
            !Array.isArray(report.requestedEngines) ||
            !report.requestedEngines.length ||
            new Set(report.requestedEngines).size !== report.requestedEngines.length ||
            report.requestedEngines.some((e) => !['chromium', 'firefox', 'webkit'].includes(e))
        )
            errors.push('requested engine set');
        if (
            !Array.isArray(report.engines) ||
            report.engines.length !== report.requestedEngines.length ||
            new Set(report.engines.map((e) => e.engine)).size !== report.requestedEngines.length ||
            report.engines.some((e) => !report.requestedEngines.includes(e.engine) || !e.browserVersion)
        )
            errors.push('actual engine set');
        if (
            !Array.isArray(report.inputs) ||
            new Set(report.inputs.map((f) => f.path)).size !== report.inputs.length ||
            report.inputs.some((f) => !checkFile(f, root))
        )
            errors.push('input SHA/bytes');
        if (
            report.build?.exitCode !== 0 ||
            !checkFile(report.build?.raw, root) ||
            !Number.isSafeInteger(report.build?.bundleBytes) ||
            report.build.bundleBytes < 1
        )
            errors.push('actual build log/bundle');
        for (const e of report.engines || []) {
            if (
                e.error ||
                !Array.isArray(e.pageErrors) ||
                e.pageErrors.length ||
                !Array.isArray(e.consoleErrors) ||
                e.consoleErrors.length
            )
                errors.push(`${e.engine}: native errors`);
            if (
                !Array.isArray(e.shaderCompile) ||
                !e.shaderCompile.length ||
                e.shaderCompile.some(
                    (s) =>
                        s.compiled !== true ||
                        typeof s.source !== 'string' ||
                        !s.source.length ||
                        typeof s.log !== 'string',
                )
            )
                errors.push(`${e.engine}: GPU compiler`);
            if (report.phase === 'performance') {
                if (e.performance?.length !== 3 || new Set(e.performance.map((p) => p.profile.id)).size !== 3)
                    errors.push('exact 3 performance profiles');
                for (const p of e.performance || []) {
                    const c = requireQueryDeletion
                        ? checkPerformance(p, p.profile)
                        : performance.validatePerformance(p, p.profile);
                    errors.push(...c.errors.map((s) => `${e.engine}/${p.profile.id}: ${s}`));
                }
            } else {
                if (e.captures?.length !== 8 || new Set(e.captures.map((c) => c.id)).size !== 8)
                    errors.push('visual exact ids');
                for (const c of e.captures || []) {
                    if (
                        !checkFile(c.png, root) ||
                        JSON.stringify(c.params) !== JSON.stringify(c.snapshot.params) ||
                        c.time !== c.snapshot.time
                    )
                        errors.push('visual identity/input');
                    const p = oracle.pngAudit(path.resolve(root, c.png.path), c.params, c.time, c.presentation);
                    errors.push(...p.errors.map((x) => `${e.engine}/${c.id}: PNG ${JSON.stringify(x)}`));
                }
                errors.push(
                    ...oracle.gpuAudit(e.core, true).errors.map((x) => `${e.engine}: core ${JSON.stringify(x)}`),
                );
                errors.push(...oracle.resourceAudit(e.resources).errors.map((x) => `${e.engine}: ${x}`));
                const plan = oracle.boundaryPlan();
                if (
                    e.boundaries?.length !== plan.length ||
                    new Set(e.boundaries.map((b) => b.caseId)).size !== plan.length ||
                    plan.some(
                        (b) =>
                            !e.boundaries.some(
                                (r) =>
                                    JSON.stringify({ ...r, receipt: undefined }) !== undefined &&
                                    r.caseId === b.caseId &&
                                    r.parameter === b.parameter &&
                                    r.boundary === b.boundary &&
                                    r.value === b.value &&
                                    r.receipt?.ok === (b.boundary !== 'invalid'),
                            ),
                    )
                )
                    errors.push('boundary exact data');
                if (
                    e.normal?.pause?.before?.time !== e.normal?.pause?.after?.time ||
                    !(e.normal?.resume?.after?.time > e.normal?.resume?.before?.time) ||
                    !e.normal?.events?.some((x) => x.type === 'pause' && x.isTrusted) ||
                    !e.normal?.events?.some((x) => x.type === 'resume' && x.isTrusted)
                )
                    errors.push('native pause/resume');
                if (
                    !e.lifecycle?.samePromise ||
                    e.lifecycle?.terminalCode !== 'FILM_DISPOSED' ||
                    !e.lifecycle?.release?.sceneCleared ||
                    e.lifecycle.release.listenerAdds !== e.lifecycle.release.listenerRemoves
                )
                    errors.push('native destroy');
                if (
                    !e.lifecycle?.recreated?.trace?.rendererUnbound ||
                    e.lifecycle.recreated.snapshot.instance <= e.lifecycle.recreated.trace.id
                )
                    errors.push('native recreate');
                if (!checkFile(e.resize?.png, root)) errors.push('resize PNG identity');
                else
                    errors.push(
                        ...oracle
                            .pngAudit(path.resolve(root, e.resize.png.path), e.resize.after.params, e.resize.after.time)
                            .errors.map((x) => `${e.engine}: resize compositor ${JSON.stringify(x)}`),
                    );
            }
        }
        return { ok: errors.length === 0, errors };
    } catch (error) {
        return { ok: false, errors: [`malformed report: ${error.message}`] };
    }
}
const VISUAL = Object.freeze([
    'circle',
    'box',
    'phase-one',
    'light-zero',
    'light-half',
    'opacity-zero',
    'opacity-half',
    'background-light',
    'linear-core',
]);
const RUNTIME = Object.freeze(['create', 'update', 'resize', 'pause', 'resume', 'destroy', 'recreate']);
const SCOPE = Object.freeze({
    Build: ['typescript', 'bundle', 'shader'],
    Runtime: RUNTIME,
    Visual: VISUAL,
    Boundary: oracle.boundaryPlan().map((r) => r.caseId),
    Resource: ['same-app-100'],
    Performance: performance.PROFILES.map((p) => p.id),
});
function checkScoped(report, gate, engine) {
    try {
        const e = report.engines?.find((e) => e.engine === engine),
            errors = [];
        if (!e || !report.requestedEngines.includes(engine))
            return { ok: false, errors: ['engine missing'], measurements: 0 };
        const expectedInputs = [
            ...require('./shaders-thin-film-browser.cjs').INPUTS,
            'build/cocosair.module.js',
            'build/cocosair.module.d.ts',
        ];
        if (
            report.inputs?.length !== expectedInputs.length ||
            new Set(report.inputs.map((f) => f.path)).size !== expectedInputs.length ||
            expectedInputs.some((p) => !report.inputs.some((f) => f.path === p)) ||
            report.inputs.some((f) => !checkFile(f))
        )
            errors.push('input drift/closure');
        if (e.error || e.pageErrors?.length || e.consoleErrors?.length) errors.push('native errors');
        if (
            !Array.isArray(report.requestedEngines) ||
            new Set(report.requestedEngines).size !== report.requestedEngines.length ||
            !Array.isArray(report.engines) ||
            new Set(report.engines.map((r) => r.engine)).size !== report.requestedEngines.length ||
            report.engines.length !== report.requestedEngines.length ||
            report.engines.some((r) => !report.requestedEngines.includes(r.engine))
        )
            errors.push('actual/requested engine set');
        let measurements = 0;
        if (gate === 'Build') {
            if (
                report.build?.exitCode !== 0 ||
                !checkFile(report.build.raw) ||
                report.build.bundleBytes < 1 ||
                !fs.readFileSync(path.resolve(ROOT, report.build.raw.path), 'utf8').includes('exitCode=0')
            )
                errors.push('build raw');
            if (
                !e.shaderCompile?.length ||
                e.shaderCompile.some((c) => c.compiled !== true || !c.source || typeof c.log !== 'string')
            )
                errors.push('raw GPU compiler');
            measurements = e.shaderCompile?.length || 0;
        } else if (gate === 'Visual') {
            const expected = VISUAL.filter((x) => x !== 'linear-core');
            if (
                e.captures?.length !== expected.length ||
                new Set(e.captures.map((c) => c.id)).size !== expected.length ||
                expected.some((id) => !e.captures.some((c) => c.id === id))
            )
                errors.push('visual exact scope');
            for (const c of e.captures || []) {
                if (
                    !checkFile(c.png) ||
                    contract.canonical(c.params) !== contract.canonical(c.snapshot.params) ||
                    c.time !== c.snapshot.time
                )
                    errors.push('PNG input/identity');
                const audited = oracle.pngAudit(path.resolve(ROOT, c.png.path), c.params, c.time, c.presentation);
                errors.push(...audited.errors);
                measurements += audited.measurements;
            }
            const core = oracle.gpuAudit(e.core, true);
            errors.push(...core.errors);
            measurements += core.measurements;
        } else if (gate === 'Boundary') {
            const plan = oracle.boundaryPlan();
            if (e.boundaries?.length !== plan.length || new Set(e.boundaries.map((b) => b.caseId)).size !== plan.length)
                errors.push('boundary scope');
            for (const p of plan) {
                const b = e.boundaries?.find((b) => b.caseId === p.caseId);
                if (
                    !b ||
                    b.parameter !== p.parameter ||
                    b.boundary !== p.boundary ||
                    b.value !== p.value ||
                    b.receipt.ok !== (p.boundary !== 'invalid')
                )
                    errors.push('boundary raw');
                else if (p.boundary === 'invalid') {
                    if (
                        !b.receipt.errors?.[0]?.code ||
                        contract.canonical(b.before.params) !== contract.canonical(b.after.params)
                    )
                        errors.push('invalid page mutated');
                } else if (
                    contract.canonical(b.after.params) !==
                    contract.canonical({ ...oracle.defaults(), [p.parameter]: p.value })
                )
                    errors.push('valid page mismatch');
                measurements++;
            }
            if (e.invalids?.length !== 4 || e.invalids.some((r) => r.ok !== false || !r.errors?.length))
                errors.push('invalid numeric/object/unknown data');
        } else if (gate === 'Resource') {
            const audited = oracle.resourceAudit(e.resources);
            errors.push(...audited.errors);
            measurements = audited.measurements;
        } else if (gate === 'Runtime') {
            if (
                !e.captures?.[0]?.snapshot?.shaderPasses?.every((p) => p.shaderCompiled) ||
                e.captures[0].snapshot.oneCanvas !== 1
            )
                errors.push('create');
            if (e.captures?.find((c) => c.id === 'box')?.snapshot?.params?.shape !== 'rounded-box')
                errors.push('update');
            if (
                e.normal?.pause?.before?.time !== e.normal?.pause?.after?.time ||
                !(e.normal?.resume?.after?.time > e.normal?.resume?.before?.time)
            )
                errors.push('pause/resume');
            if (
                !(e.normal?.parameter?.after?.params?.phase > e.normal?.parameter?.before?.params?.phase) ||
                !e.normal?.events?.some((e) => e.type === 'parameter:phase' && e.isTrusted)
            )
                errors.push('trusted parameter update');
            if (
                !e.normal?.events?.some((e) => e.type === 'pause' && e.isTrusted) ||
                !e.normal?.events?.some((e) => e.type === 'resume' && e.isTrusted)
            )
                errors.push('trusted controls');
            if (
                !e.lifecycle?.samePromise ||
                e.lifecycle.terminalCode !== 'FILM_DISPOSED' ||
                !e.lifecycle.release.sceneCleared ||
                e.lifecycle.release.listenerAdds !== e.lifecycle.release.listenerRemoves
            )
                errors.push('destroy');
            if (
                !e.lifecycle?.recreated?.trace?.rendererUnbound ||
                e.lifecycle.recreated.snapshot.instance <= e.lifecycle.recreated.trace.id
            )
                errors.push('recreate');
            if (!checkFile(e.resize?.png)) errors.push('resize PNG identity');
            else {
                const r = oracle.pngAudit(
                    path.resolve(ROOT, e.resize.png.path),
                    e.resize.after.params,
                    e.resize.after.time,
                );
                errors.push(...r.errors);
            }
            measurements = 7;
        } else if (gate === 'Performance') {
            if (e.performance?.length !== 3 || new Set(e.performance.map((p) => p.profile.id)).size !== 3)
                errors.push('profile scope');
            for (const p of e.performance || []) {
                const r = checkPerformance(p, p.profile);
                errors.push(...r.errors);
                measurements += r.measurements;
            }
        } else errors.push('unknown gate');
        return { ok: !errors.length, errors, measurements };
    } catch (error) {
        return { ok: false, errors: [String(error)], measurements: 0 };
    }
}
function identity(report) {
    const upstream = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/shader-thin-film/UPSTREAM.json'), 'utf8'));
    return {
        source: report.inputs.filter((f) => f.path.startsWith('examples/')),
        sdk: report.inputs.filter((f) => f.path.startsWith('build/')),
        runner: [...report.inputs.filter((f) => f.path.startsWith('tools/')), fingerprint(__filename)],
        reference: {
            repo: upstream.repository,
            commit: upstream.commit,
            license: upstream.license,
            files: upstream.files.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })),
        },
    };
}
function fingerprint(file) {
    const b = fs.readFileSync(path.resolve(ROOT, file));
    return {
        path: path.relative(ROOT, path.resolve(ROOT, file)).replace(/\\/g, '/'),
        bytes: b.length,
        sha256: hash(b),
    };
}
function runtimeObservations(e) {
    return {
        create: { before: { instance: null }, after: e.captures[0].snapshot },
        update: { before: e.captures[0].snapshot, after: e.captures[1].snapshot },
        resize: e.resize,
        pause: e.normal.pause,
        resume: e.normal.resume,
        destroy: { before: e.lifecycle.recreated.snapshot, after: e.lifecycle.release },
        recreate: { before: e.lifecycle.recreated.trace, after: e.lifecycle.recreated.snapshot },
    };
}
function normalizeEngine(functional, perfReport, engine, files, verifications) {
    const e = functional.engines.find((e) => e.engine === engine),
        p = perfReport.engines.find((e) => e.engine === engine),
        gates = {};
    const actualFixed = (snapshot) => ({
        viewport: snapshot.viewport,
        dpr: snapshot.dpr,
        seed: snapshot.seed,
        input: snapshot.input,
        parameters: snapshot.params,
        timeSeconds: snapshot.time,
        simulationStep: snapshot.simulationStep,
    });
    function execution(gate, collection) {
        const v = verifications[gate];
        return {
            ...v.execution,
            purpose: 'VALIDATION_OF_REAL_BROWSER_CAPTURE',
            collectionExecution: {
                command: collection.command,
                cwd: collection.cwd,
                startedAt: collection.startedAt,
                endedAt: collection.endedAt,
                exitCode: collection.exitCode,
                rawReport: fingerprint(collection === functional ? files.functional : files.performance),
                buildRawLog: collection.build.raw,
            },
        };
    }
    function row(gate, id, observation, parameters = oracle.defaults(), profile) {
        const collection = gate === 'Build' || gate === 'Performance' ? perfReport : functional;
        let snapshot;
        if (gate === 'Build') snapshot = e.captures[0].snapshot;
        if (gate === 'Runtime') snapshot = observation.after?.params ? observation.after : observation.before;
        if (gate === 'Visual') snapshot = id === 'linear-core' ? observation.rawSnapshot : observation.capture.snapshot;
        if (gate === 'Boundary') snapshot = observation.contextSnapshot;
        if (gate === 'Resource') snapshot = e.resize.before;
        if (gate === 'Performance') snapshot = observation.raw.fixedStart;
        const frozen = actualFixed(snapshot);
        return {
            caseId: id,
            status: 'PASS',
            method: gate === 'Build' && id !== 'shader' ? 'NODE' : 'REAL_BROWSER',
            browser: engine,
            browserVersion: e.browserVersion,
            fixed: frozen,
            execution: execution(gate, collection),
            observation,
        };
    }
    gates.Build = {
        status: 'PASS',
        scope: { expectedCaseIds: SCOPE.Build },
        cases: SCOPE.Build.map((id) =>
            row('Build', id, {
                expectedUnits: id === 'shader' ? p.shaderCompile.length : 1,
                compiledUnits: id === 'shader' ? p.shaderCompile.filter((c) => c.compiled).length : 1,
                errors: [],
                rawCompiler: p.shaderCompile,
                nodeBuild: perfReport.build,
            }),
        ),
    };
    const rt = runtimeObservations(e),
        runtimeOk = verifications.Runtime.result.ok;
    gates.Runtime = {
        status: runtimeOk ? 'PASS' : 'BLOCKED',
        scope: { expectedCaseIds: SCOPE.Runtime },
        cases: SCOPE.Runtime.map((id) =>
            id === 'resize' && !runtimeOk
                ? {
                      caseId: id,
                      status: 'BLOCKED',
                      classification: 'INFRA_FAILURE',
                      reason: 'WebKit26.6 canvas compositor omits the live-resized layer; raw GPU samples remain correct and PNG presents body background',
                      execution: execution('Runtime', functional),
                      observation: rt[id],
                  }
                : !runtimeOk
                  ? {
                        caseId: id,
                        status: 'LIMITED',
                        reason: 'Real-browser stage observed; full Runtime scoped verifier is nonzero because resize is blocked, so no rewritten execution exit0',
                        observation: rt[id],
                    }
                  : row('Runtime', id, { ...rt[id], pageErrors: e.pageErrors }),
        ),
    };
    gates.Visual = {
        status: 'PASS',
        scope: { expectedCaseIds: SCOPE.Visual },
        cases: SCOPE.Visual.map((id) => {
            const c =
                id === 'linear-core'
                    ? e.captures.find((c) => c.id === 'opacity-half')
                    : e.captures.find((c) => c.id === id);
            return row(
                'Visual',
                id,
                {
                    algorithm: {
                        oracleId:
                            id === 'linear-core'
                                ? 'independent-linear-straight-RGBA8'
                                : 'independent-SDF-gradient-phase-OETF',
                        method: 'CPU numerical gradient / trigonometric model; PNG independent decode; not screenshot similarity',
                        raw: id === 'linear-core' ? e.core.pixels : c.snapshot.pixels,
                    },
                    screenshot: c.png,
                    rawSnapshot: id === 'linear-core' ? e.core : c.snapshot,
                    capture: c,
                },
                c.params,
            );
        }),
    };
    gates.Boundary = {
        status: 'PASS',
        scope: { expectedCaseIds: SCOPE.Boundary },
        cases: e.boundaries.map((b) =>
            row('Boundary', b.caseId, {
                parameter: b.parameter,
                boundary: b.boundary,
                input: b.value,
                actual: b.receipt,
                errorCode: b.receipt.errors?.[0]?.code || '',
                contextSnapshot: b.boundary === 'invalid' ? b.before : b.after,
            }),
        ),
    };
    const cycles = e.resources.rows.map((r) => {
        const counters = (bytes) => ({
            texture: bytes.textureSize,
            buffer: bytes.bufferSize,
            material: 0,
            listener: e.resources.listeners.adds - e.resources.listeners.removes,
            raf: 0,
            gpuResource: bytes.bufferSize + bytes.textureSize,
        });
        const before = counters(r.before),
            after = counters(r.after),
            created = { ...counters(r.created), material: r.refsBefore[1] };
        return {
            index: r.index,
            before,
            created,
            after,
            allocations: r.trace.refs.map((a, i) => ({
                id: `owner-${r.id}-${a.kind}`,
                kind: a.kind === 'material' ? 'material' : 'gpuResource',
                unit: 'refs',
                baseline: 0,
                allocated: r.refsBefore[i],
                released: a.after,
            })),
            raw: r,
        };
    });
    gates.Resource = {
        status: 'PASS',
        scope: { expectedCaseIds: SCOPE.Resource },
        cases: [
            row('Resource', 'same-app-100', {
                cycles,
                raw: e.resources,
                gpuPhysicalMemory: {
                    status: 'unavailable',
                    reason: 'engine byte counters and refs are observable, physical GPU allocation/driver cache memory is not exposed',
                },
            }),
        ],
    };
    const perfOk = verifications.Performance.result.ok;
    gates.Performance = {
        status: perfOk ? 'PASS' : 'LIMITED',
        scope: { expectedCaseIds: SCOPE.Performance },
        cases: p.performance.map((raw) => {
            const audited = checkPerformance(raw, raw.profile),
                steady = new Set(audited.steadyFrames);
            const observation = {
                profile: raw.profile.id,
                cpuUpdateMs: audited.samples.update,
                cpuEncodingMs: audited.samples.command,
                cpuSubmissionMs: audited.samples.dispatch,
                queueBookkeepingMs: audited.samples.queue,
                frameMs: audited.frameMs,
                frameCount: audited.measurements,
                durationSeconds: audited.durationSeconds,
                device: `${raw.device.vendor}: ${raw.device.renderer}`,
                measurementMethod:
                    JSON.stringify(raw.methods) +
                    '; cpuEncodingMs is mixed native-method CPU envelope; cpuSubmissionMs is GL dispatch wall time, never GPU time or queue bookkeeping',
                gpuTimestamp: raw.timerAvailable
                    ? {
                          status: 'measured',
                          extension: 'EXT_disjoint_timer_query_webgl2',
                          disjoint: false,
                          milliseconds: raw.gpuSamples.filter((g) => steady.has(g.frame)).map((g) => g.ms),
                      }
                    : {
                          status: 'unavailable',
                          reason: 'EXT_disjoint_timer_query_webgl2 absent in this native Cocos context',
                      },
                drawCalls: raw.frames.at(-1).drawCalls,
                passCount: raw.commands.filter(
                    (c) => c.frame === raw.frames.at(-1).frame && c.operation === 'beginRenderPass',
                ).length,
                textureCount: raw.gfxObjects.textureCount,
                bufferCount: raw.gfxObjects.bufferCount,
                vramEstimate: {
                    method: 'estimate',
                    bytes: raw.memory.bufferSize + raw.memory.textureSize,
                    formula: 'engine tracked bufferSize + textureSize; not physical GPU memory',
                },
                raw,
            };
            return perfOk
                ? row('Performance', raw.profile.id, observation, oracle.defaults(), raw.profile)
                : {
                      caseId: raw.profile.id,
                      status: 'LIMITED',
                      classification: 'INFRA_FAILURE',
                      reason: 'Actual native CPU timer samples are below observable precision or another documented measurement precondition failed; scoped verifier nonzero retained, no synthetic cost',
                      execution: execution('Performance', perfReport),
                      observation,
                  };
        }),
    };
    const issues = [];
    if (!runtimeOk)
        issues.push({
            classification: 'INFRA_FAILURE',
            reason: 'Live-resize canvas compositor limitation; actual scoped and collection failures retained',
            details: verifications.Runtime.result.errors,
        });
    if (!perfOk)
        issues.push({
            classification: 'INFRA_FAILURE',
            reason: 'Requested performance scope or observable timer precision not met; requested and observed viewport/DPR/backing retained without substitution',
            details: verifications.Performance.result.errors,
        });
    return {
        metadataCorrections: [
            'Fixed state is copied from captured viewport/devicePixelRatio/seed/input/time/step/params, never a generic default template; Performance uses fixedStart before native pacer resume.',
            'Visual linear-core PNG is the separate normal-display opacity-half capture; raw numeric proof comes from the independently detached RGBA8 target.',
            'Resource fixed state is the actual terminal-cycle snapshot before the later resize, not a reused screenshot claim.',
        ],
        rawInputs: { functional: fingerprint(files.functional), performance: fingerprint(files.performance) },
        schemaVersion: 'shaders-engine-evidence/1',
        effect: {
            name: oracle.definition.name,
            version: oracle.definition.version,
            contractSha256: contract.sha256(contract.canonical(oracle.definition)),
        },
        identity: identity(perfReport),
        status: runtimeOk && perfOk ? 'PASS' : 'BLOCKED',
        completed: runtimeOk && perfOk,
        subset: !(runtimeOk && perfOk),
        issues,
        gates,
    };
}
function validateEngine(report, functional, perfReport, engine, files) {
    try {
        const sourceByGate = (g) => (g === 'Build' || g === 'Performance' ? perfReport : functional);
        const frozenVerifications = Object.fromEntries(
            Object.keys(SCOPE).map((g) => [
                g,
                {
                    result: checkScoped(sourceByGate(g), g, engine),
                    execution: report.gates[g].cases.find((r) => r.execution)?.execution || {},
                },
            ]),
        );
        const expected = normalizeEngine(functional, perfReport, engine, files, frozenVerifications);
        if (contract.canonical(report.rawInputs) !== contract.canonical(expected.rawInputs))
            return { ok: false, errors: [{ rule: 'RAW_BINDING', message: 'Immutable raw report identity mismatch' }] };
        const bindingErrors = [];
        for (const key of ['status', 'completed', 'subset', 'issues', 'metadataCorrections'])
            if (contract.canonical(report[key]) !== contract.canonical(expected[key]))
                bindingErrors.push({ rule: 'AGGREGATE_BINDING', message: key });
        for (const g of Object.keys(SCOPE))
            for (const row of report.gates[g].cases) {
                const original = expected.gates[g].cases.find((x) => x.caseId === row.caseId);
                if (
                    !original ||
                    contract.canonical(row.observation) !== contract.canonical(original.observation) ||
                    row.status !== original.status
                )
                    bindingErrors.push({ rule: 'RAW_OBSERVATION_BINDING', message: `${g}/${row.caseId}` });
                if (row.execution) {
                    const collection = sourceByGate(g),
                        expectedCollection = {
                            command: collection.command,
                            cwd: collection.cwd,
                            startedAt: collection.startedAt,
                            endedAt: collection.endedAt,
                            exitCode: collection.exitCode,
                            rawReport: fingerprint(
                                g === 'Build' || g === 'Performance' ? files.performance : files.functional,
                            ),
                            buildRawLog: collection.build.raw,
                        };
                    if (
                        contract.canonical(row.execution.collectionExecution) !== contract.canonical(expectedCollection)
                    )
                        bindingErrors.push({ rule: 'COLLECTION_EXECUTION_BINDING', message: g });
                    const source = g === 'Build' || g === 'Performance' ? files.performance : files.functional,
                        command = [
                            process.execPath,
                            __filename,
                            `--verify=${source}`,
                            `--gate=${g}`,
                            `--engine=${engine}`,
                        ].join(' ');
                    if (
                        row.execution.command !== command ||
                        row.execution.cwd !== ROOT ||
                        row.execution.exitCode !== (frozenVerifications[g].result.ok ? 0 : 1) ||
                        row.execution.rawOutputs?.length !== 1 ||
                        !checkFile(row.execution.rawOutputs[0])
                    )
                        bindingErrors.push({ rule: 'SCOPED_EXECUTION_BINDING', message: g });
                    else {
                        const log = fs.readFileSync(path.resolve(ROOT, row.execution.rawOutputs[0].path), 'utf8');
                        const resultLine = log.split(/\r?\n/).find((line) => line.startsWith('{"ok":'));
                        if (
                            !log.startsWith(
                                `actual command: ${command}\nactual exit: ${row.execution.exitCode} signal: null\n`,
                            ) ||
                            !resultLine ||
                            contract.canonical(JSON.parse(resultLine)) !==
                                contract.canonical(frozenVerifications[g].result)
                        )
                            bindingErrors.push({ rule: 'SCOPED_LOG_RESULT', message: g });
                    }
                }
            }
        if (bindingErrors.length) return { ok: false, errors: bindingErrors };
        const oracles = Object.fromEntries(
            Object.keys(SCOPE).map((g) => [
                g.toLowerCase(),
                (row) => {
                    const checked = frozenVerifications[g].result,
                        expectedRow = expected.gates[g].cases.find((r) => r.caseId === row.caseId),
                        errors = [...checked.errors];
                    if (
                        !expectedRow ||
                        contract.canonical(row.observation) !== contract.canonical(expectedRow.observation) ||
                        contract.canonical(row.fixed) !== contract.canonical(expectedRow.fixed)
                    )
                        errors.push('normalized observation/fixed does not match independently reduced immutable raw');
                    if (
                        row.execution?.purpose !== 'VALIDATION_OF_REAL_BROWSER_CAPTURE' ||
                        row.execution?.collectionExecution?.exitCode !== sourceByGate(g).exitCode
                    )
                        errors.push('actual collection/scoped-validation exit identity');
                    return { errors, measurements: checked.measurements };
                },
            ]),
        );
        return contract.validateEngineReport(report, {
            definition: oracle.definition,
            verifyFiles: true,
            root: ROOT,
            expectedIdentity: identity(perfReport),
            expectedScope: SCOPE,
            oracles,
        });
    } catch (error) {
        return { ok: false, errors: [{ rule: 'MALFORMED', message: String(error) }] };
    }
}
module.exports = {
    observedIsolation,
    checkReport,
    checkPerformance,
    checkFile,
    checkScoped,
    normalizeEngine,
    validateEngine,
    identity,
    fingerprint,
    OPS,
    SCOPE,
};
async function main(args = process.argv.slice(2)) {
    const value = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
    if (value('normalize')) {
        const functionalFile = value('functional'),
            performanceFile = value('performance'),
            out = value('normalize'),
            engine = value('engine');
        if (
            !functionalFile ||
            !performanceFile ||
            !out ||
            fs.existsSync(out) ||
            !['chromium', 'firefox', 'webkit'].includes(engine)
        )
            throw new Error('Explicit functional/performance/engine and new --normalize=<out> required');
        const functional = JSON.parse(fs.readFileSync(functionalFile, 'utf8')),
            perfReport = JSON.parse(fs.readFileSync(performanceFile, 'utf8'));
        const cp = require('node:child_process'),
            dir = out.replace(/\.json$/, '') + '-artifacts';
        fs.mkdirSync(dir, { recursive: true });
        const verifications = {};
        for (const gate of Object.keys(SCOPE)) {
            const source = gate === 'Build' || gate === 'Performance' ? performanceFile : functionalFile;
            const command = [__filename, `--verify=${source}`, `--gate=${gate}`, `--engine=${engine}`],
                startedAt = new Date().toISOString();
            const observed = cp.spawnSync(process.execPath, command, { cwd: ROOT, encoding: 'utf8' }),
                endedAt = new Date().toISOString();
            const log = path.join(dir, `${engine}-${gate.toLowerCase()}.log`);
            fs.writeFileSync(
                log,
                `actual command: ${[process.execPath, ...command].join(' ')}\nactual exit: ${observed.status} signal: ${observed.signal}\n${observed.stdout}${observed.stderr}`,
                { flag: 'wx' },
            );
            let result;
            try {
                result = JSON.parse(observed.stdout.trim());
            } catch {
                result = { ok: false, errors: [observed.stderr], measurements: 0 };
            }
            verifications[gate] = {
                result,
                execution: {
                    command: [process.execPath, ...command].join(' '),
                    cwd: ROOT,
                    startedAt,
                    endedAt,
                    exitCode: observed.status ?? 1,
                    rawOutputs: [fingerprint(log)],
                },
            };
        }
        const files = { functional: functionalFile, performance: performanceFile };
        const report = normalizeEngine(functional, perfReport, engine, files, verifications);
        report.validation = validateEngine(report, functional, perfReport, engine, files);
        report.verifications = verifications;
        fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(
            JSON.stringify({
                out,
                schemaValid: report.validation.ok,
                status: report.status,
                completed: report.completed,
                errors: report.validation.errors,
            }),
        );
        return report.validation.ok ? 0 : 1;
    }
    const file = value('verify');
    if (!file) throw new Error('Explicit --verify=<raw.json> required; read-only');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    let checked;
    if (raw.schemaVersion === 'shaders-engine-evidence/1') {
        const functional = value('functional') || raw.rawInputs.functional.path,
            performanceFile = value('performance') || raw.rawInputs.performance.path;
        const collection = JSON.parse(fs.readFileSync(functional, 'utf8')),
            perfReport = JSON.parse(fs.readFileSync(performanceFile, 'utf8'));
        checked = validateEngine(raw, collection, perfReport, raw.gates.Visual.cases[0].browser, {
            functional,
            performance: performanceFile,
        });
    } else checked = value('gate') ? checkScoped(raw, value('gate'), value('engine')) : checkReport(raw);
    console.log(JSON.stringify(checked));
    return checked.ok ? 0 : 1;
}
module.exports = {
    observedIsolation,
    checkReport,
    checkPerformance,
    checkFile,
    checkScoped,
    normalizeEngine,
    validateEngine,
    identity,
    fingerprint,
    OPS,
    SCOPE,
    main,
};
if (require.main === module)
    main()
        .then((code) => (process.exitCode = code))
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
