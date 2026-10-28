/** CPU rejection tests only. Fixtures are fabricated policy inputs, never browser/native evidence. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { options } = require('./browser-lifecycle.cjs');
const policy = require('./lifecycle-evidence.cjs');
const clone = (value) => JSON.parse(JSON.stringify(value));
const receipt = () => ({
    status: 'released',
    pending: [],
    failures: [],
    physicsSceneRelease: { backend: 'box3d', status: 'RESTORED' },
});
function run(generation) {
    return {
        generation,
        status: 'RUNNING',
        requests: [],
        geometry: [],
        score: [],
        clocks: [1, 2, 3].map((tickIndex) => ({
            tickIndex,
            actualNativeFixedDt: Math.fround(1 / 60),
            actualSolverSubSteps: 4,
        })),
        frames: [1, 2, 3].map((tick) => ({
            generation,
            tick,
            actors: [...Array.from({ length: 10 }, (_, i) => 'pin-' + (i + 1)), 'ball', 'kinematic platform'].map(
                (name) => ({
                    id: `g${generation}:${name}`,
                    motion: {
                        enabled: true,
                        massPending: false,
                        position: { x: 0, y: 1, z: 0 },
                        linearVelocity: { x: 0, y: 0, z: -1 },
                    },
                }),
            ),
        })),
    };
}
const pair = (generation) => [
    ...['scene-and-unmounted-flush', 'owned-assets-flush'].map((phase) => ({
        kind: 'releaseScene',
        generation,
        phase,
        receipt: receipt(),
    })),
    { kind: 'owned-asset-state', generation, remainingValid: 0, destroyErrors: [] },
];
const snapshots = () => {
    const before = { runs: [run(1)], log: [] },
        after = clone(before);
    after.runs.push(run(2));
    after.log.push(...pair(1));
    return { before, after };
};
test('collector rejects missing identity, nonloopback URL and duplicate arguments', () => {
    const good = [
        '--url=http://127.0.0.1:7473/gallery.html',
        '--out=output/new',
        '--expect-runtime-sha256=' + 'a'.repeat(64),
        '--expect-build=236',
    ];
    assert.equal(options(good).build, 236);
    assert.throws(() => options(good.slice(0, -1)));
    assert.throws(() => options([...good, '--expect-build=237']));
    assert.throws(() => options(good.map((arg) => arg.replace('127.0.0.1', 'example.com'))));
});
test('policy requires a real new generation plus two clean public releases and asset invalidation', () => {
    const { before, after } = snapshots();
    assert.match(policy.rebuilt(before, after).nativeCounts, /NOT_RUN/);
    for (const mutate of [
        (s) => {
            s.runs.pop();
        },
        (s) => {
            s.runs[1].generation = 1;
        },
        (s) => {
            s.log.splice(1, 1);
        },
        (s) => {
            s.log.reverse();
        },
        (s) => {
            s.log[0].receipt.pending.push('native');
        },
        (s) => {
            s.log[1].receipt.failures.push({ message: 'destroy' });
        },
        (s) => {
            s.log[1].receipt.physicsSceneRelease.status = 'SKIPPED_NONEMPTY';
        },
        (s) => {
            s.log[2].remainingValid = 1;
        },
        (s) => {
            s.log[2].destroyErrors.push('failed');
        },
        (s) => {
            delete s.log[0].receipt.physicsSceneRelease;
        },
    ]) {
        const invalid = clone(after);
        mutate(invalid);
        assert.throws(() => policy.rebuilt(before, invalid));
    }
});
test('stale history, actor reuse, missing frames and wrong native clocks cannot qualify', () => {
    const { before, after } = snapshots();
    for (const mutate of [
        (s) => {
            s.runs[0].requests.push({ status: 'late-write' });
        },
        (s) => {
            s.runs[0].frames.push(clone(s.runs[0].frames[0]));
        },
        (s) => {
            s.runs[1].frames = [];
        },
        (s) => {
            s.runs[1].frames[0].actors[0].id = 'g1:pin-1';
        },
        (s) => {
            s.runs[1].frames[0].actors.pop();
        },
        (s) => {
            s.runs[1].frames[0].actors[0].motion.massPending = true;
        },
        (s) => {
            s.runs[1].frames[0].actors[0].motion.linearVelocity.z = NaN;
        },
        (s) => {
            s.runs[1].clocks[1].tickIndex = 1;
        },
        (s) => {
            s.runs[1].clocks[0].actualNativeFixedDt = 1 / 60;
        },
    ]) {
        const invalid = clone(after);
        mutate(invalid);
        assert.throws(() => policy.rebuilt(before, invalid));
    }
});
test('identity and fault logs fail closed', () => {
    const data = {
        schema: 'ex02-compound-bowling-v1',
        build: 236,
        identity: { runtimeSha256: 'x' },
        runs: [],
        log: [],
    };
    policy.exportShape(data, data.identity, 236);
    assert.throws(() => policy.exportShape(data, { runtimeSha256: 'other' }, 236));
    assert.throws(() => policy.exportShape(data, data.identity, 235));
    for (const kind of ['fault', 'cleanup-fault', 'release-stop-fault', 'close-failed']) {
        assert.throws(() => policy.exportShape({ ...data, log: [{ kind }] }, data.identity, 236));
    }
});
test('terminal requires admitted reset race, four releases, one close and same-module counter baseline', () => {
    const before = { runs: [run(1)], log: [] },
        after = clone(before);
    const snapshot = {
        schema: 'air-box3d-module-release-snapshot-v1',
        schemaVersion: 1,
        core: { worlds: 0, trackedRequestedBytes: 0 },
        bridge: {
            worlds: 0,
            allocations: 0,
            bytes: 0,
            debugShapeHandles: 0,
            temporaryNodes: 0,
            temporaryBytes: 0,
            wireBuffers: 0,
            wireCapacityRecords: 0,
            wireLengthRecords: 0,
            capturedWorlds: 0,
        },
        mesh: { resources: 0, leases: 0, references: 0, borrowNodes: 0, resourceStorageBytes: 0 },
    };
    after.log.push(...pair(1), ...pair(1), {
        kind: 'close',
        generation: 1,
        receipt: {
            ...receipt(),
            physicsPreparation: {
                status: 'closed',
                cleanupErrors: [],
                acquired: [{ cleanup: 'released', retained: [] }],
                moduleRelease: {
                    status: 'VERIFIED',
                    verified: true,
                    errors: [],
                    baseline: snapshot,
                    terminal: clone(snapshot),
                },
            },
        },
    });
    const race = { transitionPending: true, closeAdmitted: true };
    policy.terminal(before, after, race);
    assert.throws(() => policy.terminal(before, after, { ...race, transitionPending: false }));
    for (const mutate of [
        (s) => {
            s.runs.push(run(2));
        },
        (s) => {
            s.log.splice(0, 1);
        },
        (s) => {
            s.log.at(-1).receipt.physicsPreparation.moduleRelease.verified = false;
        },
        (s) => {
            s.log.at(-1).receipt.physicsPreparation.moduleRelease.terminal.core.worlds = 1;
        },
        (s) => {
            s.log.at(-1).receipt.physicsPreparation.moduleRelease.terminal = {};
            s.log.at(-1).receipt.physicsPreparation.moduleRelease.baseline = {};
        },
        (s) => {
            s.log.at(-1).receipt.physicsPreparation.moduleRelease.baseline = null;
        },
        (s) => {
            s.log.at(-1).receipt.physicsPreparation.acquired[0].retained.push('world');
        },
    ]) {
        const invalid = clone(after);
        mutate(invalid);
        assert.throws(() => policy.terminal(before, invalid, race));
    }
});

test('twenty resets require 21 distinct observed generations; click counts cannot substitute', () => {
    const series = [{ runs: [run(1)], log: [] }];
    for (let index = 1; index <= 20; index++) {
        const next = clone(series.at(-1));
        next.log.push(...pair(index));
        next.runs.push(run(index + 1));
        series.push(next);
    }
    assert.equal(policy.reset20(series).length, 20);
    assert.throws(() => policy.reset20(series.slice(0, -1)));
    const fake = [...series];
    fake[10] = clone(fake[9]);
    assert.throws(() => policy.reset20(fake));
});
