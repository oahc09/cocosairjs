/** Pure rejection policy for real EX02 exports. CPU fixtures never qualify browser/native execution. */
const assert = require('node:assert/strict');
const stable = (run) => JSON.stringify([run.generation, run.frames, run.clocks, run.geometry, run.requests, run.score]);
function cleanReceipt(receipt) {
    assert.equal(receipt?.status, 'released', 'release receipt failed/missing');
    assert.deepEqual(receipt.pending, [], 'pending cleanup');
    assert.deepEqual(receipt.failures, [], 'cleanup failures');
}
function exportShape(data, identity, build) {
    assert.equal(data.schema, 'ex02-compound-bowling-v1');
    assert.equal(data.build, build, 'selected build mismatch');
    assert.deepEqual(data.identity, identity, 'runtime/source identity changed');
    assert.ok(Array.isArray(data.runs) && Array.isArray(data.log));
    for (const row of data.log) {
        assert.ok(!['fault', 'cleanup-fault', 'release-stop-fault', 'close-failed'].includes(row.kind), row.kind);
        if (row.kind === 'diagnostic') assert.notEqual(row.message.severity, 'error');
    }
}
function observed(run) {
    assert.ok(run?.frames.length >= 3, 'missing actual native frames');
    assert.ok(run.clocks.length >= 3, 'missing actual native clocks');
    let tick = -1;
    for (const clock of run.clocks) {
        assert.equal(clock.actualNativeFixedDt, Math.fround(1 / 60));
        assert.equal(clock.actualSolverSubSteps, 4);
        assert.ok(clock.tickIndex > tick, 'native clock did not advance');
        tick = clock.tickIndex;
    }
    for (const frame of run.frames) {
        assert.equal(frame.generation, run.generation);
        assert.equal(frame.actors.length, 12, 'ten pins, ball, platform required');
        const ids = frame.actors.map((a) => a.id);
        assert.equal(new Set(ids).size, 12);
        assert.equal(ids.filter((id) => id.startsWith(`g${run.generation}:pin-`)).length, 10);
        for (const actor of frame.actors) {
            assert.ok(actor.id.startsWith(`g${run.generation}:`), 'stale actor generation');
            assert.equal(actor.motion.enabled, true);
            assert.equal(actor.motion.massPending, false);
            for (const vector of [actor.motion.position, actor.motion.linearVelocity]) {
                assert.ok(
                    vector && ['x', 'y', 'z'].every((key) => Number.isFinite(vector[key])),
                    'invalid native vector',
                );
            }
        }
    }
}
function unchanged(previous, current, includeLast = true) {
    const retired = includeLast ? previous.runs : previous.runs.slice(0, -1);
    for (const run of retired) {
        const found = current.runs.find((item) => item.generation === run.generation);
        assert.ok(found, 'retired generation lost');
        assert.equal(stable(found), stable(run), 'retired generation history mutated');
    }
}
function releasePair(previous, current, generation) {
    assert.deepEqual(current.log.slice(0, previous.log.length), previous.log, 'release history rewritten');
    const rows = current.log.slice(previous.log.length).filter((r) => r.kind === 'releaseScene');
    assert.equal(rows.length, 2, 'exact two-phase release required');
    assert.deepEqual(
        rows.map((r) => r.phase),
        ['scene-and-unmounted-flush', 'owned-assets-flush'],
    );
    for (const row of rows) {
        assert.equal(row.generation, generation);
        cleanReceipt(row.receipt);
        assert.equal(row.receipt.physicsSceneRelease?.backend, 'box3d');
        assert.equal(
            row.receipt.physicsSceneRelease?.status,
            'RESTORED',
            'native empty-world restoration not acknowledged',
        );
    }
    const assets = current.log.slice(previous.log.length).filter((r) => r.kind === 'owned-asset-state');
    assert.equal(assets.length, 1);
    assert.equal(assets[0].generation, generation);
    assert.equal(assets[0].remainingValid, 0);
    assert.deepEqual(assets[0].destroyErrors, []);
    return {
        generation,
        phases: rows.map((r) => r.phase),
        ownedAssetsRemaining: 0,
        nativeCounts: 'NOT_RUN: no per-cycle public counters in export',
    };
}
function rebuilt(previous, current) {
    assert.equal(current.runs.length, previous.runs.length + 1, 'no actual rebuild/new generation');
    const old = previous.runs.at(-1),
        next = current.runs.at(-1);
    assert.equal(next.generation, old.generation + 1);
    unchanged(previous, current);
    observed(next);
    return releasePair(previous, current, old.generation);
}
function moduleSnapshot(snapshot) {
    assert.equal(snapshot?.schema, 'air-box3d-module-release-snapshot-v1');
    assert.equal(snapshot.schemaVersion, 1);
    const groups = {
        core: ['worlds', 'trackedRequestedBytes'],
        bridge: [
            'worlds',
            'allocations',
            'bytes',
            'debugShapeHandles',
            'temporaryNodes',
            'temporaryBytes',
            'wireBuffers',
            'wireCapacityRecords',
            'wireLengthRecords',
            'capturedWorlds',
        ],
        mesh: ['resources', 'leases', 'references', 'borrowNodes', 'resourceStorageBytes'],
    };
    for (const [group, keys] of Object.entries(groups)) {
        assert.deepEqual(
            Object.keys(snapshot[group] || {}).sort(),
            [...keys].sort(),
            'missing/unknown module counters',
        );
        for (const key of keys) {
            const value = snapshot[group][key];
            assert.ok(Number.isSafeInteger(value) && value >= 0, 'invalid native counter');
            if (group !== 'core' || key === 'worlds') assert.equal(value, 0, 'registered native resource retained');
        }
    }
}
function terminal(previous, current, race) {
    assert.equal(race.transitionPending, true, 'Close was not requested during admitted reset');
    assert.equal(race.closeAdmitted, true);
    assert.equal(current.runs.length, previous.runs.length, 'reset mounted after Close admission');
    unchanged(previous, current);
    // Reset release and Close preparation each own a real two-phase release; never omit either.
    const fresh = current.log.slice(previous.log.length);
    const releaseRows = fresh.filter((row) => row.kind === 'releaseScene');
    assert.equal(releaseRows.length, 4);
    for (let index = 0; index < 4; index += 2) {
        assert.deepEqual(
            releaseRows.slice(index, index + 2).map((r) => r.phase),
            ['scene-and-unmounted-flush', 'owned-assets-flush'],
        );
        for (const row of releaseRows.slice(index, index + 2)) {
            assert.equal(row.generation, previous.runs.at(-1).generation);
            cleanReceipt(row.receipt);
            assert.equal(row.receipt.physicsSceneRelease?.status, 'RESTORED');
        }
    }
    const assetRows = fresh.filter((r) => r.kind === 'owned-asset-state');
    assert.equal(assetRows.length, 2);
    for (const row of assetRows) {
        assert.equal(row.remainingValid, 0);
        assert.deepEqual(row.destroyErrors, []);
    }
    const closes = fresh.filter((row) => row.kind === 'close');
    assert.equal(closes.length, 1);
    assert.ok(fresh.indexOf(closes[0]) > fresh.indexOf(releaseRows.at(-1)), 'terminal close precedes preparation');
    cleanReceipt(closes[0].receipt);
    const preparation = closes[0].receipt.physicsPreparation;
    assert.equal(preparation?.status, 'closed');
    assert.deepEqual(preparation.cleanupErrors, []);
    assert.ok(preparation.acquired?.length > 0);
    for (const entry of preparation.acquired) {
        assert.equal(entry.cleanup, 'released');
        assert.deepEqual(entry.retained, []);
    }
    const module = preparation.moduleRelease;
    assert.equal(module?.status, 'VERIFIED');
    assert.equal(module.verified, true);
    assert.deepEqual(module.errors, []);
    assert.ok(module.baseline && module.terminal, 'missing terminal counters');
    moduleSnapshot(module.baseline);
    moduleSnapshot(module.terminal);
    assert.deepEqual(module.terminal, module.baseline, 'module counters did not return to baseline');
    return closes[0].receipt;
}
module.exports = { stable, cleanReceipt, exportShape, observed, unchanged, releasePair, rebuilt, terminal };
