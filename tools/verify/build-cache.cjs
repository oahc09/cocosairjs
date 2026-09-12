/* Isolated behavioral regression for the native Rollup cache bridge, including
 * source edits, dependency edits, config invalidation and failure recovery. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { withIncrementalCache } = require('../build/incremental.cjs');
const rollup = require(require.resolve('rollup', { paths: [path.dirname(require.resolve('@cocos/ccbuild'))] }));
const root = path.resolve(__dirname, '../../build', `.tmp-cache-test-${Date.now()}`);
fs.mkdirSync(root, { recursive: true });
const dep = path.join(root, 'dep.js');
const entry = path.join(root, 'entry.js');
fs.writeFileSync(dep, 'export const n = 1;');
fs.writeFileSync(entry, "export { n } from './dep.js';");
const original = rollup.rollup;
async function build () {
    let code;
    const stats = await withIncrementalCache(root, async () => {
        const bundle = await rollup.rollup({ input: entry, plugins: [] });
        code = (await bundle.generate({ format: 'esm' })).output[0].code;
        await bundle.close();
    });
    assert.strictEqual(rollup.rollup, original);
    return { stats, code };
}
(async () => {
    const cold = await build(), warm = await build();
    assert(cold.stats.transformed === 2 && warm.stats.transformed === 0);
    fs.writeFileSync(dep, 'export const n = 2;');
    const changed = await build(); assert(changed.stats.transformed === 1); assert(changed.code.includes('n = 2'));
    fs.writeFileSync(dep, 'export const n = ;');
    await assert.rejects(build()); assert.strictEqual(rollup.rollup, original);
    fs.writeFileSync(dep, 'export const n = 3;');
    const recovered = await build(); assert(!recovered.stats.reused); assert(recovered.code.includes('n = 3'));
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    const config = await build(); assert(!config.stats.reused);
    console.log(JSON.stringify({ ok: true, cold: cold.stats, warm: warm.stats, changed: changed.stats, recovered: recovered.stats, config: config.stats }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
