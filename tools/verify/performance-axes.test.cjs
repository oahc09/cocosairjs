const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const { createGpuTimerCollector, gpuMedianForPhase } = require('./performance-axes.cjs');

function fixture(options = {}) {
    const timer = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
    const queries = [];
    let active = null;
    let disjoint = false;
    const gl = {
        QUERY_RESULT_AVAILABLE: 3,
        QUERY_RESULT: 4,
        getExtension(name) {
            assert.equal(name, 'EXT_disjoint_timer_query_webgl2');
            return options.unsupported ? null : timer;
        },
        createQuery() {
            if (options.allocationFailure) return null;
            const query = { available: false, nanoseconds: 0, deleted: false, resultReads: 0 };
            queries.push(query);
            return query;
        },
        beginQuery(target, query) {
            assert.equal(target, timer.TIME_ELAPSED_EXT);
            assert.equal(active, null, 'only one elapsed-time query may be active');
            active = query;
        },
        endQuery(target) {
            assert.equal(target, timer.TIME_ELAPSED_EXT);
            assert.ok(active, 'endQuery must match beginQuery');
            active = null;
        },
        deleteQuery(query) {
            assert.notEqual(active, query, 'end active queries before deleting them');
            assert.equal(query.deleted, false, 'each query must be deleted once');
            query.deleted = true;
        },
        getQueryParameter(query, parameter) {
            assert.equal(query.deleted, false, 'deleted queries must never be polled again');
            if (parameter === gl.QUERY_RESULT_AVAILABLE) return query.available;
            assert.equal(parameter, gl.QUERY_RESULT);
            assert.equal(query.available, true, 'unresolved queries must not be read');
            query.resultReads++;
            return query.nanoseconds;
        },
        getParameter(parameter) {
            assert.equal(parameter, timer.GPU_DISJOINT_EXT);
            return disjoint;
        },
    };
    const collector = createGpuTimerCollector(gl);
    return {
        gl,
        queries,
        collector,
        setDisjoint(value) {
            disjoint = value;
        },
        submit(phase, frame) {
            collector.begin(phase, frame);
            collector.end();
            return queries.at(-1);
        },
        resolve(query, ms) {
            query.available = true;
            query.nanoseconds = ms * 1e6;
        },
    };
}

test('late and out-of-order queries retain submission phase and frame', () => {
    const f = fixture();
    const first = f.submit(1, 1);
    const second = f.submit(15, 2);
    f.resolve(second, 15);
    f.collector.poll();
    f.resolve(first, 1);
    f.collector.poll();
    assert.deepEqual(f.collector.snapshot(), [
        { phase: 15, frame: 2, ms: 15 },
        { phase: 1, frame: 1, ms: 1 },
    ]);
    assert.equal(gpuMedianForPhase(f.collector.snapshot(), 1, 0, 1), 1);
    assert.equal(gpuMedianForPhase(f.collector.snapshot(), 15, 1, 2), 15);
    assert.equal(f.collector.pendingCount, 0);
    assert.ok(f.queries.every((query) => query.deleted));
});

test('disjoint discards ready and unresolved pending queries before recovery', () => {
    const f = fixture();
    const unresolved = f.submit(1, 1);
    const ready = f.submit(1, 2);
    f.resolve(ready, 99);
    f.setDisjoint(true);
    f.collector.poll();
    assert.equal(f.collector.pendingCount, 0);
    assert.ok(f.queries.every((query) => query.deleted && query.resultReads === 0));
    f.resolve(unresolved, 100);
    f.setDisjoint(false);
    f.collector.poll();
    assert.deepEqual(f.collector.snapshot(), []);
    const fresh = f.submit(15, 3);
    f.resolve(fresh, 2);
    f.collector.poll();
    assert.deepEqual(f.collector.snapshot(), [{ phase: 15, frame: 3, ms: 2 }]);
});

test('disjoint during a draw discards both that draw and earlier pending queries', () => {
    const f = fixture();
    f.submit(1, 1);
    f.collector.begin(1, 2);
    f.setDisjoint(true);
    f.collector.end();
    assert.ok(f.queries.every((query) => query.deleted));
    assert.equal(f.collector.pendingCount, 0);
    f.setDisjoint(false);
    f.collector.poll();
    assert.deepEqual(f.collector.snapshot(), []);
});

test('polling an active disjoint query safely closes and discards it', () => {
    const f = fixture();
    f.collector.begin(1, 1);
    f.setDisjoint(true);
    f.collector.poll();
    f.collector.end();
    assert.ok(f.queries[0].deleted);
    assert.equal(f.collector.pendingCount, 0);
});

test('disjoint before draw skips timing and does not turn prior samples invalid', () => {
    const f = fixture();
    const valid = f.submit(1, 1);
    f.resolve(valid, 3);
    f.collector.poll();
    f.setDisjoint(true);
    f.collector.begin(1, 2);
    f.collector.end();
    assert.equal(f.queries.length, 1);
    assert.deepEqual(f.collector.snapshot(), [{ phase: 1, frame: 1, ms: 3 }]);
});

test('warmup and drain frames submit no samples; unresolved results remain unavailable', () => {
    const f = fixture();
    f.collector.begin(null, 1);
    f.collector.end();
    assert.equal(f.queries.length, 0);
    f.submit(1, 2);
    f.collector.begin(null, 3);
    f.collector.end();
    assert.equal(f.queries.length, 1);
    assert.equal(gpuMedianForPhase(f.collector.snapshot(), 1, 1, 2), null);
    f.collector.dispose();
    assert.equal(f.collector.pendingCount, 0);
    assert.ok(f.queries[0].deleted);
});

test('missing contexts, unsupported timers and query allocation failures remain unavailable', () => {
    for (const collector of [
        createGpuTimerCollector(null),
        fixture({ unsupported: true }).collector,
        fixture({ allocationFailure: true }).collector,
    ]) {
        collector.begin(1, 1);
        collector.end();
        collector.poll();
        collector.dispose();
        assert.equal(collector.pendingCount, 0);
        assert.deepEqual(collector.snapshot(), []);
        assert.equal(gpuMedianForPhase(collector.snapshot(), 1, 0, 1), null);
    }
    assert.equal(createGpuTimerCollector(null).available, false);
    assert.equal(fixture({ unsupported: true }).collector.available, false);
    assert.equal(fixture({ allocationFailure: true }).collector.available, true);
});

test('invalid timings are rejected but a measured zero remains valid', () => {
    const f = fixture();
    for (const ms of [NaN, Infinity, -1, 0, 4]) {
        const query = f.submit(1, f.queries.length + 1);
        f.resolve(query, ms);
        f.collector.poll();
    }
    assert.deepEqual(f.collector.snapshot(), [
        { phase: 1, frame: 4, ms: 0 },
        { phase: 1, frame: 5, ms: 4 },
    ]);
    assert.ok(f.queries.every((query) => query.deleted));
});

test('phase medians enforce the submitted frame window and preserve null for absent evidence', () => {
    const samples = [
        { phase: 1, frame: 1, ms: 99 },
        { phase: 1, frame: 2, ms: 4 },
        { phase: 1, frame: 3, ms: 2 },
        { phase: 1, frame: 4, ms: 3 },
        { phase: 1, frame: 5, ms: 99 },
        { phase: 15, frame: 3, ms: 99 },
    ];
    assert.equal(gpuMedianForPhase(samples, 1, 1, 4), 3);
    assert.equal(gpuMedianForPhase(samples, 15, 3, 4), null);
    assert.equal(gpuMedianForPhase([], 1, 0, 10), null);
});

test('dispose closes active queries, drops pending ones, and does not duplicate deletion', () => {
    const f = fixture();
    f.submit(1, 1);
    f.collector.begin(15, 2);
    f.collector.dispose();
    f.collector.dispose();
    assert.equal(f.collector.pendingCount, 0);
    assert.ok(f.queries.every((query) => query.deleted));
    assert.deepEqual(f.collector.snapshot(), []);
});

test('collector serializes into the browser without Node dependencies or outer closures', () => {
    const f = fixture();
    const collector = vm.runInNewContext(`(${createGpuTimerCollector.toString()})(gl)`, { gl: f.gl });
    collector.begin(15, 42);
    collector.end();
    f.resolve(f.queries[0], 6);
    collector.poll();
    assert.equal(JSON.stringify(collector.snapshot()), JSON.stringify([{ phase: 15, frame: 42, ms: 6 }]));
    const snapshot = collector.snapshot();
    snapshot[0].ms = 999;
    assert.equal(collector.snapshot()[0].ms, 6);
});
