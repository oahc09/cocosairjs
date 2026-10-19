'use strict';
const fs = require('fs'),
    path = require('path'),
    crypto = require('crypto'),
    { PNG } = require('pngjs');
const ROOT = path.resolve(__dirname, '../..'),
    { IDS } = require('../examples/interactive-kit.cjs');
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const KIT_INPUTS = [
    'tools/verify/interactive-kit-consumer.cjs',
    'tools/verify/interactive-kit-evidence.cjs',
    'tools/examples/interactive-kit.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/interactive-kit-audit.cjs',
    'package.json',
];
function verifyFile(f) {
    if (!f || typeof f.path !== 'string') throw Error('file path missing');
    const b = fs.readFileSync(path.resolve(ROOT, f.path));
    if (f.bytes !== b.length || f.sha256 !== hash(b)) throw Error('file identity ' + f.path);
    return b;
}
function visiblePixels(bytes, rect) {
    const p = PNG.sync.read(bytes);
    if (
        !rect ||
        !['left', 'top', 'width', 'height'].every((k) => Number.isFinite(rect[k])) ||
        rect.width <= 0 ||
        rect.height <= 0
    )
        throw Error('invalid canvas rect');
    let count = 0;
    for (let y = Math.max(0, Math.ceil(rect.top)); y < Math.min(p.height, rect.top + rect.height); y++)
        for (let x = Math.max(0, Math.ceil(rect.left)); x < Math.min(p.width, rect.left + rect.width); x++) {
            const i = (y * p.width + x) * 4,
                c = [p.data[i], p.data[i + 1], p.data[i + 2]];
            if (Math.max(...c) > 110 && Math.max(...c) - Math.min(...c) > 65) count++;
        }
    return count;
}
function checkRow(row) {
    const errors = [],
        fail = (m) => errors.push(m);
    try {
        if (
            !IDS.includes(row.id) ||
            !['chromium', 'firefox', 'webkit'].includes(row.engine) ||
            typeof row.version !== 'string' ||
            !row.version
        )
            fail('row identity');
        if (row.pageErrors?.length !== 0 || row.consoleErrors?.length !== 0) fail('browser errors');
        if (row.buildRequests?.length !== 0 || row.fallbackRequests?.length !== 0 || row.runtimeRequested !== true)
            fail('package isolation');
        if (row.states?.length !== 4 || row.states.map((s) => s.phase).join(',') !== 'initial,input,reset,resize')
            throw Error('four ordered states required');
        for (const state of row.states) {
            if (visiblePixels(verifyFile(state.png), state.canvasRect) < 50) fail('PNG target missing ' + state.phase);
            if (!Number.isFinite(Date.parse(state.observationTimestamp))) fail('capture time');
        }
        const [a, b, c] = row.states.map((s) => s.snapshot),
            release = row.release;
        if (row.id === 'interactive-multipass') {
            if (
                !b.submittedFrame?.afterDraw ||
                b.clock?.totalFrames <= a.clock?.totalFrames ||
                c.modelState?.retiredSinceStart <= a.modelState?.retiredSinceStart ||
                c.modelState?.ownedRefCount !== a.modelState?.ownedRefCount
            )
                fail('multipass native/reset state');
            if (
                release?.released !== true ||
                !['pause', 'resume', 'reset', 'release'].every((type) =>
                    row.userEvents?.some((e) => e.type === type && e.isTrusted === true),
                )
            )
                fail('multipass trusted/terminal state');
        } else {
            const receipt = release?.receipt;
            if (
                release?.samePromise !== true ||
                !Array.isArray(receipt?.refs) ||
                !receipt.refs.length ||
                receipt.refs.some((x) => x.before !== 1 || x.after !== 0)
            )
                fail('owned references/idempotent release');
            if (
                row.id === 'interactive-geometry' &&
                (b.modelState?.session <= a.modelState?.session ||
                    c.modelState?.session <= b.modelState?.session ||
                    !receipt?.renderersUnbound ||
                    !receipt?.nodesRemoved)
            )
                fail('geometry reset/terminal');
            if (
                row.id === 'interactive-input' &&
                (b.activations !== a.activations + 1 ||
                    b.visibleUpdates !== a.visibleUpdates + 1 ||
                    b.actor?.x === a.actor?.x ||
                    c.generation <= b.generation ||
                    !receipt?.disposed ||
                    !receipt?.inputDetached)
            )
                fail('input model/reset/terminal');
            if (
                row.id === 'interactive-container' &&
                (!a.camera ||
                    a.frames < 4 ||
                    a.appliedNavigationGeneration !== a.navigationGeneration ||
                    b.parentClass !== 'narrow' ||
                    c.parentClass !== 'wide' ||
                    !receipt?.disposed ||
                    !receipt?.observerDisconnected)
            )
                fail('container ready/layout/terminal');
            if (
                row.id === 'interactive-timeline' &&
                (b.stage !== 1 ||
                    b.status !== 'converged' ||
                    b.poses?.length !== 18 ||
                    c.stage !== 0 ||
                    c.generation <= b.generation ||
                    !receipt?.domAborted ||
                    receipt?.scopeReceipt?.status !== 'released')
            )
                fail('timeline motion/reset/terminal');
        }
    } catch (e) {
        fail(String(e.message || e));
    }
    return { pass: errors.length === 0, errors };
}
function selectedEngines(value = 'all') {
    const engines = ['chromium', 'firefox', 'webkit'];
    if (value === 'all') return engines;
    if (engines.includes(value)) return [value];
    throw Error('browser must be all, chromium, firefox or webkit');
}
function checkInstalledIdentity(report) {
    const errors = [];
    try {
        const runtime = verifyFile({
            ...report.defaultsBefore?.['build/npm/cocosair.module.js'],
            path: 'build/npm/cocosair.module.js',
        });
        if (report.installedRuntime?.sha256 !== hash(runtime) || report.installedRuntime?.bytes !== runtime.length)
            errors.push('installed runtime identity');
        const development = fs.readFileSync(path.join(ROOT, 'build/cocosair.module.js'), 'utf8');
        const release = development.replace(/(?:\r?\n)?\/\/# sourceMappingURL=[^\r\n]*(?:\r?\n)?$/, '\n');
        if (release === development || hash(Buffer.from(release)) !== hash(runtime))
            errors.push('release/development source-map boundary');
        const packageBytes = fs.readFileSync(path.join(ROOT, 'package.json'));
        if (
            report.installedPackage?.sha256 !== hash(packageBytes) ||
            report.installedPackage?.bytes !== packageBytes.length
        )
            errors.push('installed package manifest identity');
        const pkg = JSON.parse(packageBytes);
        if (
            report.packageEntry?.requested !== 'cocosair.js' ||
            report.packageEntry?.resolved !== 'build/npm/cocosair.module.js' ||
            report.packageEntry?.exportTarget !== pkg.exports['.'].import
        )
            errors.push('installed package export resolution');
        if (!Array.isArray(report.installedRuntimeMaps) || report.installedRuntimeMaps.length)
            errors.push('npm runtime must omit source maps');
        const t = report.typecheck,
            expected =
                Number(t?.version?.split('.')[0]) < 5 ? 'build/cocosair.legacy.d.ts' : 'build/cocosair.module.d.ts';
        if (
            t?.exitCode !== 0 ||
            t.installedDeclarationsOnly !== true ||
            t.declaration?.path !== expected ||
            !/^\d+\.\d+\./.test(t.version)
        )
            errors.push('installed declaration routing');
        else verifyFile(t.declaration);
    } catch (e) {
        errors.push(String(e.message || e));
    }
    return { pass: errors.length === 0, errors };
}
function checkReport(report, options = {}) {
    const errors = [],
        selected = options.selected === true;
    try {
        const engines = report.engines;
        if (report.schemaVersion !== 'ier-installed-kit/2' || report.subset !== true || report.completed !== false)
            errors.push('scope contract');
        if (
            !Array.isArray(engines) ||
            !engines.length ||
            new Set(engines).size !== engines.length ||
            engines.some((e) => !selectedEngines().includes(e))
        )
            throw Error('invalid requested browser matrix');
        if (!selected && (engines.length !== 3 || selectedEngines().some((e) => !engines.includes(e))))
            errors.push('full browser matrix not selected');
        const required = engines.flatMap((e) => IDS.map((id) => e + '/' + id));
        if (
            report.rows?.length !== required.length ||
            new Set(report.rows.map((r) => r.engine + '/' + r.id)).size !== required.length ||
            required.some((k) => !report.rows.some((r) => r.engine + '/' + r.id === k))
        )
            errors.push('exact selected entry coverage');
        for (const r of report.rows || [])
            errors.push(...checkRow(r).errors.map((e) => r.engine + '/' + r.id + ': ' + e));
        for (const f of [...(report.fingerprints || []), ...(report.chunks || []), report.tarball]) verifyFile(f);
        if (
            report.fingerprints?.length !== KIT_INPUTS.length ||
            new Set(report.fingerprints?.map((f) => f.path)).size !== KIT_INPUTS.length ||
            KIT_INPUTS.some((p) => !report.fingerprints?.some((f) => f.path === p)) ||
            !report.chunks?.length ||
            !report.sourceFiles?.length
        )
            errors.push('input identities missing');
        const manifest = JSON.parse(require('../examples/interactive-kit.cjs').contents().get('manifest.json'));
        if (
            report.sourceFiles?.length !== manifest.sources.length ||
            new Set(report.sourceFiles?.map((s) => s.path)).size !== manifest.sources.length
        )
            errors.push('complete source-copy identity');
        for (const expected of manifest.sources) {
            const s = report.sourceFiles?.find((s) => s.path === expected.path);
            if (
                !s ||
                s.kitPath !== expected.kitPath ||
                s.sha256 !== expected.sha256 ||
                s.bytes !== expected.bytes ||
                s.actual?.sha256 !== expected.sha256 ||
                s.actual?.bytes !== expected.bytes
            )
                errors.push('installed source-copy drift ' + expected.path);
            else verifyFile({ ...s, path: s.path });
        }
        errors.push(...checkInstalledIdentity(report).errors);
        for (const [p, before] of Object.entries(report.defaultsBefore || {})) {
            verifyFile({ ...before, path: p });
            if (JSON.stringify(before) !== JSON.stringify(report.defaultsAfter?.[p]))
                errors.push('default changed ' + p);
        }
        if (Object.keys(report.defaultsBefore || {}).length !== 3 || report.error) errors.push('execution incomplete');
    } catch (e) {
        errors.push(String(e.message || e));
    }
    return {
        scopePassed: !selected && errors.length === 0,
        ...(selected ? { selectedScopePassed: errors.length === 0 } : {}),
        errors,
    };
}
module.exports = {
    checkRow,
    checkReport,
    visiblePixels,
    verifyFile,
    selectedEngines,
    checkInstalledIdentity,
    KIT_INPUTS,
};
