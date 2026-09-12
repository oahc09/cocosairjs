/**
 * Phase 6 — Cocos AIR 构建脚本。
 *
 * 用法: node tools/build/build.cjs [--min] [--format esm|system]
 *
 * 产出（ESM, three.js 风格）:
 *   build/cocosair.module.js       (dev, --format esm)
 *   build/cocosair.module.min.js   (--min)
 *   build/cc.js                    (systemjs 格式，用于 baseline 对比)
 *
 * 引擎根目录为 src/（与上游相对布局一致）；feature 集见 docs/01-web-feature-set.md。
 */
const { join } = require('path');
const { ensureDir, emptyDir, moveSync, existsSync } = require('fs-extra');
const { buildEngine } = require('@cocos/ccbuild');

const ROOT = join(__dirname, '..', '..');
const ENGINE = join(ROOT, 'src');

const AIR_FEATURES = [
    'air', // bundle 入口: src/exports/air.ts（含 base/3d/animation/... 与 createAirApp）
    'base', 'gfx-webgl', 'gfx-webgl2', 'gfx-empty', '3d', 'animation', 'skeletal-animation',
    'primitive', 'tween', 'custom-pipeline', 'legacy-pipeline',
];

const args = process.argv.slice(2);
const min = args.includes('--min');
const formatIdx = args.indexOf('--format');
const moduleFormat = formatIdx >= 0 ? args[formatIdx + 1] : 'esm';

(async function exec () {
    const tmpOut = join(ROOT, 'build', '.tmp-' + (min ? 'min' : 'dev'));
    await ensureDir(tmpOut);
    await emptyDir(tmpOut);

    console.log(`[build] cocosair moduleFormat=${moduleFormat} min=${min}`);
    const started = Date.now();
    await buildEngine({
        engine: ENGINE,
        moduleFormat,
        mode: 'BUILD',
        platform: 'HTML5',
        out: tmpOut,
        compress: min,
        sourceMap: min,
        features: AIR_FEATURES,
        // Air 面向现代浏览器（ESM 产物）。不设 targets 时 ccbuild 的降级变换
        // 会把 `for (let ...)` 闭包转换为 _loop 函数，与 rollup scope 提升组合
        // 会产生 `_i is not defined` 的上游变换 bug（program-lib 布局合并路径）。
        targets: { chrome: '66' },
    });
    console.log(`[build] ccbuild done in ${((Date.now() - started) / 1000).toFixed(1)}s`);

    // 归一化产物名并移动到 build/ 根目录：
    //   ESM  dev: build/cocosair.module.js      min: build/cocosair.module.min.js
    //   SYS  dev: build/cc.js
    const bundleName = min ? 'cocosair.module.min.js'
        : moduleFormat === 'esm' ? 'cocosair.module.js' : 'cc.js';
    const candidates = moduleFormat === 'esm' ? ['cc.mjs', 'cc.js'] : ['cc.js'];
    let moved = false;
    for (const c of candidates) {
        const p = join(tmpOut, c);
        if (existsSync(p)) {
            moveSync(p, join(ROOT, 'build', bundleName), { overwrite: true });
            moved = true;
            break;
        }
    }
    if (!moved) {
        console.error('[build] FAILED: bundle output not found:', candidates.join(', '));
        process.exit(1);
    }
    console.log('[build] output: build/' + bundleName);
})().catch((e) => {
    console.error('[build] FAILED:', e && e.message ? e.message : e);
    process.exit(1);
});
