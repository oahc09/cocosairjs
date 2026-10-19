'use strict';
const fs = require('fs'),
    { checkAssembly, checkAudio, checkScroll, checkReport } = require('./interactive-timeline-browser.cjs');
function audit(report) {
    const baseline = checkReport(report, { selected: true }),
        tests = [];
    if (!baseline.selectedScopePassed) throw Error('positive selected browser matrix required');
    for (const [kind, checker, row, mutations] of [
        [
            'assembly',
            checkAssembly,
            report.assembly[0],
            {
                labelOnly: (r) =>
                    (r.states.find((s) => s.name === 'target1').snapshot.poses = r.states[0].snapshot.poses),
                missingPart: (r) => r.states[0].snapshot.poses.pop(),
                draw: (r) => (r.states[0].snapshot.submitted = 0),
                pose: (r) => (r.observations.pauseAfter.poses[0].position[0] += 1),
                late: (r) => (r.observations.late.accepted = true),
                range: (r) => (r.observations.end.rangeValue = 498),
                retired: (r) => r.observations.cancels.mode.late.dragCommits++,
                refs: (r) => (r.release.receipt.refs[0].after = 9),
                trusted: (r) => r.receivedEvents.forEach((e) => (e.isTrusted = false)),
                nanFrame: (r) => (r.states[0].snapshot.frames = NaN),
                png: (r) => (r.states[0].png.sha256 = '0'.repeat(64)),
                camera: (r) => (r.states[0].snapshot.camera.z = 999),
            },
        ],
        [
            'audio',
            checkAudio,
            report.audio.find((r) => !r.notRun),
            {
                naturalEnd: (r) =>
                    (r.completion.naturalEnd.audio.endedCurrent = r.completion.beforeNatural.audio.endedCurrent),
                stopAsEOS: (r) => r.completion.naturalEnd.audio.sourceStops++,
                eosAsStop: (r) => r.completion.afterStop.audio.endedCurrent++,
                missingCompletion: (r) => delete r.completion,
                cueRemoved: (r) => r.states.pop(),
                activation: (r) => (r.states[0].snapshot.audio.cues[0].nodeActivationTime = 0),
                observer: (r) => (r.states[0].observation.audioAfter = NaN),
                png: (r) => (r.states[0].png.sha256 = '0'.repeat(64)),
                origin: (r) => r.controls.resumeAfter.audio.origin++,
                mute: (r) => (r.controls.muteAfter.audio.rms = 0.2),
                nanClock: (r) => (r.controls.resumeAfter.audio.currentTime = NaN),
                clock: (r) => (r.controls.muteAfter.audio.time = r.controls.muteBefore.audio.time),
                retired: (r) => (r.controls.seekResetAfter.audio.startedSources[0].stopped = false),
                release: (r) => (r.release.receipt.refs[0].after = 1),
                staleCue: (r) => (r.controls.seekResetAfter.audio.cues[0].generation = 0),
            },
        ],
        [
            'scroll',
            checkScroll,
            report.scroll[0],
            {
                offset: (r) => (r.states[0].scroll.offsets = []),
                end: (r) => (r.states[4].scroll.progress = 0.5),
                release: (r) => (r.release.quiet = false),
            },
        ],
    ]) {
        if (!checker(row).pass) throw Error('positive ' + kind + ' baseline required');
        for (const [name, mutate] of Object.entries(mutations)) {
            const c = structuredClone(row);
            mutate(c);
            tests.push({ kind, name, rejected: !checker(c).pass });
        }
    }
    for (const [name, mutate] of Object.entries({
        missingEngine: (r) => r.assembly.pop(),
        missingRequested: (r) => delete r.requestedEngines,
        duplicateRequested: (r) => r.requestedEngines.push(r.requestedEngines[0]),
        unknownRequested: (r) => (r.requestedEngines = ['unknown']),
        duplicate: (r) => (r.audio[0] = r.audio[1]),
        identity: (r) => (r.fingerprints[0].sha256 = '0'.repeat(64)),
        pageError: (r) => r.assembly[0].pageErrors.push('actual error'),
        reference: (r) => (r.referenceComparison.result = 'PASS'),
    })) {
        const c = structuredClone(report);
        mutate(c);
        tests.push({ kind: 'report', name, rejected: !checkReport(c, { selected: true }).selectedScopePassed });
    }
    const full = checkReport(report);
    if (report.requestedEngines.length < 3)
        tests.push({ kind: 'report', name: 'partialIsNotFullMatrix', rejected: !full.scopePassed });
    return {
        schemaVersion: 'ier-timeline-audit/2',
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
            failed: r.tests.filter((t) => !t.rejected),
        }),
    );
    process.exitCode = r.ok ? 0 : 1;
}
