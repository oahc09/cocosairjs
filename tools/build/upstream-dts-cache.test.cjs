const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withIncrementalCache } = require('./incremental.cjs');

test('changing only the shared default feature file invalidates the runtime cache', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'air-features-cache-test-'));
    const rollup = require(require.resolve('rollup', { paths: [path.dirname(require.resolve('@cocos/ccbuild'))] }));
    const original = rollup.rollup;
    try {
        fs.mkdirSync(path.join(root, 'tools/build'), { recursive: true });
        const featureFile = path.join(root, 'tools/build/default-features.cjs');
        fs.writeFileSync(featureFile, "exports.DEFAULT_FEATURES = ['air'];\n");
        fs.writeFileSync(path.join(root, 'entry.js'), 'export const fixture = 1;\n');
        const build = async () => {
            const bundle = await rollup.rollup({ input: path.join(root, 'entry.js'), plugins: [] });
            await bundle.generate({ format: 'esm' });
            await bundle.close();
        };
        const cold = await withIncrementalCache(root, build);
        assert.equal(cold.reason, 'cold');
        const warm = await withIncrementalCache(root, build);
        assert.equal(warm.reason, 'hit');
        assert.equal(warm.reused, true);
        fs.writeFileSync(featureFile, "exports.DEFAULT_FEATURES = ['air', 'gfx-webgl2'];\n");
        const changed = await withIncrementalCache(root, build);
        assert.equal(changed.reason, 'key-mismatch');
        assert.equal(changed.reused, false);
        assert.equal(rollup.rollup, original, 'process-local bridge must restore the tool');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
