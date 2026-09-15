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
const { join, dirname, resolve, relative, isAbsolute } = require('path');
const fs = require('fs');
const { ensureDir, moveSync, existsSync } = require('fs-extra');
const { buildEngine } = require('@cocos/ccbuild');
const { withIncrementalCache, acquireBuildLock } = require('./incremental.cjs');

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
    const release = await acquireBuildLock(ROOT);
    try {
    // 唯一临时目录：避免 emptyDir 对上一次产物做批量删除（本机 safe-delete shim 会拦截）。
    // 旧 tmp 目录清理失败时静默忽略（build/ 已 gitignore），不阻塞构建。
    const tmpOut = join(ROOT, 'build', `.tmp-${min ? 'min' : 'dev'}-${Date.now()}`);
    await ensureDir(tmpOut);

    console.log(`[build] cocosair moduleFormat=${moduleFormat} min=${min}`);
    const started = Date.now();
    const build = () => buildEngine({
        engine: ENGINE,
        moduleFormat,
        mode: 'BUILD',
        platform: 'HTML5',
        out: tmpOut,
        compress: min,
        // V0.2 Task 10（L11）：dev 构建必须附带 source map，浏览器异常可定位 src/**/*.ts。
        sourceMap: true,
        features: AIR_FEATURES,
        // Air 面向现代浏览器（ESM 产物）。不设 targets 时 ccbuild 的降级变换
        // 会把 `for (let ...)` 闭包转换为 _loop 函数，与 rollup scope 提升组合
        // 会产生 `_i is not defined` 的上游变换 bug（program-lib 布局合并路径）。
        targets: { chrome: '66' },
    });
    if (!min && moduleFormat === 'esm') await withIncrementalCache(ROOT, build);
    else await build();
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
    // V0.2 Task 10（L11）：source map 与 bundle 同名搬运（cc.js.map → cocosair.module.js.map）
    const mapCandidates = candidates.map((c) => c + '.map');
    for (const m of mapCandidates) {
        const p = join(tmpOut, m);
        if (existsSync(p)) {
            const map = JSON.parse(fs.readFileSync(p, 'utf8'));
            map.file = bundleName;
            map.sources = map.sources.map((source) => {
                if (isAbsolute(source) || /^[a-z]+:/i.test(source)) return source;
                return relative(join(ROOT, 'build'), resolve(dirname(p), source)).replace(/\\/g, '/');
            });
            fs.writeFileSync(join(ROOT, 'build', bundleName + '.map'), JSON.stringify(map));
            // bundle 内 sourceMappingURL 指向 cc.js.map，需改写为最终产物名
            const bundlePath = join(ROOT, 'build', bundleName);
            const code = fs.readFileSync(bundlePath, 'utf8');
            const patched = code.replace(/\/\/# sourceMappingURL=.*?(\s*)$/, `//# sourceMappingURL=${bundleName}.map$1`);
            if (patched !== code) { fs.writeFileSync(bundlePath, patched); }
            console.log('[build] output: build/' + bundleName + '.map (source map)');
            break;
        }
    }
    console.log('[build] output: build/' + bundleName);
    // R1（v051 review）：根 package.json 是 type:commonjs（构建工具链需要），
    // 而 build/ 产物是 ESM。随包在 build/ 内发出 {"type":"module"}，
    // Node 按最近 package.json 解析模块格式，tarball 才能真实 import。
    fs.writeFileSync(join(ROOT, 'build', 'package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n');
    console.log('[build] output: build/package.json (type: module)');
    // gltf-decoders 内是 CommonJS .js（draco3d 等）：最近 package.json 必须翻回 commonjs
    fs.mkdirSync(join(ROOT, 'build', 'gltf-decoders'), { recursive: true });
    fs.writeFileSync(join(ROOT, 'build', 'gltf-decoders', 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
    console.log('[build] output: build/gltf-decoders/package.json (type: commonjs)');
    } finally { release(); }
})().catch((e) => {
    console.error('[build] FAILED:', e && e.message ? e.message : e);
    process.exit(1);
});
