/**
 * Phase 4 — 派生 Air 引擎构建配置 src/cc.config.json。
 * 保留上游 constants / moduleOverrides / optimizeDecorators / treeShake 原样（行为一致），
 * 仅裁剪 features 至 Air V0.1 集合并移除 editor include。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const upstream = require(path.join(ROOT, 'cc.config.json'));

const AIR_FEATURES = [
    'base', 'gfx-webgl', 'gfx-webgl2', 'gfx-empty', '3d', 'animation', 'skeletal-animation',
    'primitive', 'tween', 'custom-pipeline', 'legacy-pipeline',
];

const features = {};
for (const name of AIR_FEATURES) {
    if (!upstream.features[name]) throw new Error(`Unknown feature: ${name}`);
    features[name] = upstream.features[name];
}
// Air 自身的 bundle 入口 feature（src/exports/air.ts）
features.air = { modules: ['air'] };

const airConfig = {
    $schema: './cc.config.schema.json',
    features,
    moduleOverrides: upstream.moduleOverrides,
    includes: [
        './exports/**/*.{ts,js,json}',
        './cocos/**/*.{ts,js,json}',
        './pal/**/*.{ts,js,json}',
    ],
    constants: upstream.constants,
    optimizeDecorators: upstream.optimizeDecorators,
    treeShake: upstream.treeShake,
};

const out = path.join(ROOT, 'src', 'cc.config.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(airConfig, null, 4) + '\n');
console.log(`[make-air-config] wrote ${out} (features: ${AIR_FEATURES.join(', ')})`);
