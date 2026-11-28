import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeCompletedGpuPasses } from '../debug/gpu-pass-timer.mjs';

const row = (start, end) => ({
    beginTimestampNs: String(10000000000000000n + BigInt(start) * 1000000n),
    endTimestampNs: String(10000000000000000n + BigInt(end) * 1000000n),
    ms: end - start,
});

test('pass union excludes gaps and counts overlapping or nested ranges once', () => {
    const rows = [row(9, 10), row(2, 6), row(0, 4), row(2, 2)];
    assert.deepEqual(summarizeCompletedGpuPasses(rows), {
        gpuPassSumMs: 9,
        gpuPassUnionMs: 7,
        gpuElapsedSpanMs: 10,
    });
    assert.deepEqual(summarizeCompletedGpuPasses([...rows, row(3, 4)]), {
        gpuPassSumMs: 10,
        gpuPassUnionMs: 7,
        gpuElapsedSpanMs: 10,
    });
    assert.equal(summarizeCompletedGpuPasses([row(2, 2)]).gpuPassUnionMs, 0);
});
