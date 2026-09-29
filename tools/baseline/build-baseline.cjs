/**
 * Phase 0.3 — 原始 cocos4 Web baseline 复现脚本（Air 验收 L0）。
 *
 * 说明：
 * - 上游默认 `npm run build:dev` 不传 features = 全量 feature 集，其中
 *   gfx-webgpu / physics-physx / physics-ammo / physics-2d-box2d-wasm / spine-* /
 *   meshopt 需要下载 native/external（本快照缺失，见 docs/UPSTREAM.md）。
 * - 本脚本使用同一构建器 @cocos/ccbuild + 同一 cc.config.json，仅显式传入
 *   排除上述 feature 后的 Web feature 集，不修改任何上游文件。
 */
const { join } = require('path');
const { buildEngine } = require('@cocos/ccbuild');

const EXCLUDE_NEEDING_NATIVE_EXTERNAL = [
    'gfx-webgpu',
    'physics-physx',
    'physics-ammo',
    'physics-2d-box2d-wasm',
    'spine-3.8',
    'spine-4.2',
    'meshopt',
];

(async () => {
    const engine = process.cwd();
    const cfg = require(join(engine, 'cc.config.json'));
    const features = Object.keys(cfg.features).filter(
        (f) => !EXCLUDE_NEEDING_NATIVE_EXTERNAL.includes(f),
    );
    console.log(`[baseline] features (${features.length}):`, features.join(', '));
    const outDir = join(engine, 'bin', 'dev', 'cc-baseline');
    await buildEngine({
        engine,
        moduleFormat: 'system',
        mode: 'BUILD',
        platform: 'HTML5',
        out: outDir,
        compress: false,
        sourceMap: false,
        features,
        split: true,
    });
    console.log('[baseline] BUILD OK ->', outDir);
})().catch((e) => {
    console.error('[baseline] BUILD FAILED:', e && e.message ? e.message : e);
    process.exit(1);
});
