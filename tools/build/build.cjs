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
 * 引擎根目录为 src/（与上游相对布局一致）；feature 集见 docs/reference/web-features.md。
 */
const { join, dirname, resolve, relative, isAbsolute } = require('path');
const fs = require('fs');
const { ensureDir, moveSync, existsSync } = require('fs-extra');
const { buildEngine } = require('@cocos/ccbuild');
const { withIncrementalCache, acquireBuildLock } = require('./incremental.cjs');
const { withESMHelpers } = require('./esm-helpers.cjs');

const ROOT = join(__dirname, '..', '..');
const ENGINE = join(ROOT, 'src');

const AIR_FEATURES = [
    'air', // bundle 入口: src/exports/air.ts（含 base/3d/animation/... 与 createAirApp）
    'base', 'gfx-webgl2', 'gfx-empty', '3d', 'animation', 'skeletal-animation',
    'primitive', 'tween', 'custom-pipeline', 'legacy-pipeline',
    // V1.2 批次 A 回归组
    'profiler', 'video', 'webview',
    // V1.2 批次 B1（2d 基座）/ 批次 D-1（physics-2d framework）
    // physics-2d-builtin 不入默认集（见下方 V1.2 D-3 注释），仅走 AIR_FEATURES 变体构建。
    '2d', 'physics-2d-framework',
    // V1.2 批次 B2/B3/B4 与 C1/C2（骨骼动画与 2D 组件集）
    'particle-2d', 'tiled-map', 'ui', 'spine-3.8', 'spine-4.2', 'dragon-bones',
    // V1.2 批次 D-3 / G-1（决策 D7：3D 默认后端 = builtin，2D 默认 = box2d 纯 JS 端口）。
    // 同族其它后端（ammo / physx / box2d-wasm / 2D builtin）不入默认 bundle，
    // 物理选择器一个图中只允许一个后端，其余走 AIR_FEATURES 变体构建验证。
    // r46（owner 批复 #8(a) = D12）：physics-cannon 编入默认集以支持交付期切换
    // createAirApp 的 physics 选项（builtin 或 cannon）——双后端同 bundle + 初始化前确定性 register，
    // 默认仍为 builtin。产物字节变更已按计划书 §12 全量重采证据。
    'physics-2d-box2d', 'physics-builtin', 'physics-cannon',
    // V1.2 批次 H
    'custom-pipeline-post-process',
];

// 常量组合构建验证（计划书 GG/GE 口径）：AIR_FEATURES=air,base,... 覆盖默认集合，
// 与 tools/analyze/dep-graph.cjs 的同名环境变量语义一致。
const FEATURES = (process.env.AIR_FEATURES || '').split(',').map((s) => s.trim()).filter(Boolean);
// 变体构建（feature 集被覆盖，或产物被 AIR_OUT_DIR 重定向到仓库外）既不共享默认集合的
// 增量缓存，也不写 build/ 的发布附属产物，避免污染共用工作树里的默认 bundle。
const OUT = process.env.AIR_OUT_DIR ? resolve(process.env.AIR_OUT_DIR) : join(ROOT, 'build');
const VARIANT = FEATURES.length > 0 || OUT !== join(ROOT, 'build');

// r43 实测：ccbuild 对**未在引擎 cc.config.json 里声明**的 feature 名是静默忽略的——
// 变体构建 EXIT=0、产物与默认逐字节相同，等于什么都没开（变体取证会整批失效）。
// 故在构建前先按声明面校验，未声明即失败退出，逼使用者先登记 feature unit。
const EFFECTIVE = FEATURES.length ? FEATURES : AIR_FEATURES;
const DECLARED = new Set(Object.keys(require(join(ENGINE, 'cc.config.json')).features || {}));
const UNDECLARED = EFFECTIVE.filter((f) => !DECLARED.has(f));
if (UNDECLARED.length) {
    console.error(`[build] FAILED: feature 未在 ${relative(ROOT, join(ENGINE, 'cc.config.json'))} 声明（ccbuild 会静默忽略，产物与默认逐字节相同）: ${UNDECLARED.join(', ')}`);
    console.error(`[build] 当前已声明 ${DECLARED.size} 个 feature unit；请先按官方原文登记，再构建该变体。`);
    process.exit(1);
}

const args = process.argv.slice(2);
const min = args.includes('--min');
const formatIdx = args.indexOf('--format');
const moduleFormat = formatIdx >= 0 ? args[formatIdx + 1] : 'esm';

(async function exec () {
    const release = await acquireBuildLock(ROOT);
    try {
    // 唯一临时目录：避免 emptyDir 对上一次产物做批量删除（本机 safe-delete shim 会拦截）。
    // 旧 tmp 目录清理失败时静默忽略（build/ 已 gitignore），不阻塞构建。
    const tmpOut = join(OUT, `.tmp-${min ? 'min' : 'dev'}-${Date.now()}`);
    await ensureDir(tmpOut);

    console.log(`[build] cocosair moduleFormat=${moduleFormat} min=${min}`);
    const started = Date.now();
    const build = () => withESMHelpers(ROOT, () => buildEngine({
        engine: ENGINE,
        moduleFormat,
        mode: 'BUILD',
        platform: 'HTML5',
        out: tmpOut,
        compress: min,
        // Web consumers commonly deploy with CSP script-src without unsafe-eval.
        // The upstream SUPPORT_JIT path constructs Function(...) during module
        // evaluation; select its existing non-JIT scheduler for the Web bundle.
        flags: { SUPPORT_JIT: false },
        // V0.2 Task 10（L11）：dev 构建必须附带 source map，浏览器异常可定位 src/**/*.ts。
        sourceMap: true,
        features: FEATURES.length ? FEATURES : AIR_FEATURES,
        // Air 面向现代浏览器（ESM 产物）。不设 targets 时 ccbuild 的降级变换
        // 会把 `for (let ...)` 闭包转换为 _loop 函数，与 rollup scope 提升组合
        // 会产生 `_i is not defined` 的上游变换 bug（program-lib 布局合并路径）。
        targets: { chrome: '66' },
    }));
    if (!min && moduleFormat === 'esm' && !VARIANT) await withIncrementalCache(ROOT, build);
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
            moveSync(p, join(OUT, bundleName), { overwrite: true });
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
                return relative(OUT, resolve(dirname(p), source)).replace(/\\/g, '/');
            });
            fs.writeFileSync(join(OUT, bundleName + '.map'), JSON.stringify(map));
            // bundle 内 sourceMappingURL 指向 cc.js.map，需改写为最终产物名
            const bundlePath = join(OUT, bundleName);
            const code = fs.readFileSync(bundlePath, 'utf8');
            const patched = code.replace(/\/\/# sourceMappingURL=.*?(\s*)$/, `//# sourceMappingURL=${bundleName}.map$1`);
            if (patched !== code) { fs.writeFileSync(bundlePath, patched); }
            console.log('[build] output: ' + relative(ROOT, join(OUT, bundleName + '.map')) + ' (source map)');
            break;
        }
    }
    console.log('[build] output: ' + relative(ROOT, join(OUT, bundleName)) + (VARIANT ? '  [variant]' : ''));
    if (moduleFormat === 'esm') {
        await require('./bootstrap-entry.cjs').buildBootstrapEntry(OUT);
        console.log('[build] output: ' + relative(ROOT, join(OUT, 'bootstrap.js')) + ' (engine-free safe entry)');
    }
    if (!VARIANT) {
    // R1（v051 review）：根 package.json 是 type:commonjs（构建工具链需要），
    // 而 build/ 产物是 ESM。随包在 build/ 内发出 {"type":"module"}，
    // Node 按最近 package.json 解析模块格式，tarball 才能真实 import。
    fs.writeFileSync(join(OUT, 'package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n');
    console.log('[build] output: ' + relative(ROOT, join(OUT, 'package.json')) + ' (type: module)');
    // gltf-decoders 内是 CommonJS .js（draco3d 等）：最近 package.json 必须翻回 commonjs
    fs.mkdirSync(join(OUT, 'gltf-decoders'), { recursive: true });
    fs.writeFileSync(join(OUT, 'gltf-decoders', 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
    console.log('[build] output: ' + relative(ROOT, OUT) + '/gltf-decoders/package.json (type: commonjs)');
    }
    // F-83: 成功路径末尾回收中间目录（每次构建泄漏 9-11 MB 孤儿 map）；
    // 失败路径（上方 exit(1)）故意保留 tmpOut 以便诊断，且 build/.tmp-rollup-cache 是另一套持久缓存，不在此域内。
    try {
        fs.rmSync(tmpOut, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        console.log('[build] cleaned: ' + relative(ROOT, tmpOut));
    } catch (e) {
        console.warn('[build] WARNING tmp dir left behind: ' + relative(ROOT, tmpOut) + ' (' + e.message + ')');
    }
    } finally { release(); }
})().catch((e) => {
    console.error('[build] FAILED:', e && e.message ? e.message : e);
    process.exit(1);
});
