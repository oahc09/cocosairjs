'use strict';
const fs = require('fs'),
    { checkRow, checkReport } = require('./interactive-kit-evidence.cjs');
function audit(r) {
    const baseline = checkReport(r, { selected: true }),
        tests = [];
    if (!baseline.selectedScopePassed) throw Error('positive selected installed-kit baseline required');
    for (const [id, mutations] of Object.entries({
        'interactive-multipass': {
            reset: (c) => (c.states[2].snapshot.modelState.retiredSinceStart = 0),
            trust: (c) => c.userEvents.forEach((e) => (e.isTrusted = false)),
            terminal: (c) => (c.release.released = false),
        },
        'interactive-geometry': {
            session: (c) => (c.states[2].snapshot.modelState.session = 0),
            refs: (c) => (c.release.receipt.refs[0].after = 1),
        },
        'interactive-input': {
            activation: (c) => (c.states[1].snapshot.activations = 0),
            pose: (c) => (c.states[1].snapshot.actor.x = c.states[0].snapshot.actor.x),
        },
        'interactive-container': {
            notReady: (c) => (c.states[0].snapshot.camera = null),
            layout: (c) => (c.states[1].snapshot.parentClass = 'wide'),
        },
        'interactive-timeline': {
            motion: (c) => (c.states[1].snapshot.stage = 0),
            retire: (c) => (c.states[2].snapshot.generation = 0),
        },
    })) {
        const row = r.rows.find((x) => x.engine === r.engines[0] && x.id === id);
        if (!checkRow(row).pass) throw Error('positive row required ' + id);
        for (const [name, mutate] of Object.entries(mutations)) {
            const c = structuredClone(row);
            mutate(c);
            tests.push({ id, name, rejected: !checkRow(c).pass });
        }
    }
    for (const [name, mutate] of Object.entries({
        png: (c) => (c.states[0].png.sha256 = '0'.repeat(64)),
        errors: (c) => c.pageErrors.push('real failure'),
        fallback: (c) => c.fallbackRequests.push('http://workspace/build'),
        samePromise: (c) => (c.release.samePromise = false),
    })) {
        const c = structuredClone(r.rows.find((x) => x.engine === r.engines[0] && x.id === 'interactive-input'));
        mutate(c);
        tests.push({ id: c.id, name, rejected: !checkRow(c).pass });
    }
    for (const [name, mutate] of Object.entries({
        runtime: (c) => (c.installedRuntime.sha256 = '0'.repeat(64)),
        types: (c) => (c.typecheck.declaration.sha256 = '0'.repeat(64)),
        exports: (c) => (c.packageEntry.exportTarget = './fake.js'),
        map: (c) => (c.installedRuntimeMaps = ['cocosair.module.js.map']),
        package: (c) => (c.installedPackage.sha256 = '0'.repeat(64)),
        missingShared: (c) => (c.sourceFiles = c.sourceFiles.filter((s) => !s.path.includes('/shared/'))),
        sourceDrift: (c) => (c.sourceFiles[0].actual.sha256 = '0'.repeat(64)),
        missingEngine: (c) => (c.engines = []),
        duplicateEngine: (c) => c.engines.push(c.engines[0]),
        unknownEngine: (c) => (c.engines = ['unknown']),
    })) {
        const c = structuredClone(r);
        mutate(c);
        tests.push({ id: 'report', name, rejected: !checkReport(c, { selected: true }).selectedScopePassed });
    }
    if (r.engines.length < 3)
        tests.push({ id: 'report', name: 'selected-not-full', rejected: !checkReport(r).scopePassed });
    return {
        schemaVersion: 'ier-kit-audit/2',
        baseline,
        tests,
        ok: tests.every((t) => t.rejected),
        browserRunsAdded: 0,
    };
}
module.exports = { audit };
if (require.main === module) {
    const arg = (n) => process.argv.find((x) => x.startsWith('--' + n + '='))?.slice(n.length + 3),
        r = audit(JSON.parse(fs.readFileSync(arg('report'))));
    fs.writeFileSync(arg('out'), JSON.stringify(r, null, 2) + '\n', { flag: 'wx' });
    console.log(
        JSON.stringify({
            ok: r.ok,
            rejected: r.tests.filter((t) => t.rejected).length,
            total: r.tests.length,
            baseline: r.baseline,
        }),
    );
    process.exitCode = r.ok ? 0 : 1;
}
