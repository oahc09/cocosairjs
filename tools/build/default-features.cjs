/* Single default main-runtime feature set shared by JS and declaration builds. */
const DEFAULT_FEATURES = Object.freeze([
    'air', // bundle 入口: src/exports/air.ts（含 base/3d/animation/... 与 createAirApp）
    'base',
    'worker',
    'worker-pool',
    'webassembly',
    'gfx-webgl2',
    'gfx-webgpu',
    'gfx-empty',
    '3d',
    'animation',
    'skeletal-animation',
    'primitive',
    'tween',
    'custom-pipeline',
    'legacy-pipeline',
    // V1.2 批次 A 回归组
    'profiler',
    'video',
    'webview',
    // V1.2 批次 B1（2d 基座）/ 批次 D-1（physics-2d framework）
    // physics-2d-builtin 不入默认集（见下方 V1.2 D-3 注释），仅走 AIR_FEATURES 变体构建。
    '2d',
    'physics-2d-framework',
    // V1.2 批次 B2/B3/B4 与 C1/C2（骨骼动画与 2D 组件集）
    'particle-2d',
    'tiled-map',
    'ui',
    'spine-3.8',
    'spine-4.2',
    'dragon-bones',
    // V1.2 批次 D-3 / G-1（决策 D7：3D 默认后端 = builtin，2D 默认 = box2d 纯 JS 端口）。
    // 同族其它后端（ammo / physx / box2d-wasm / 2D builtin）不入默认 bundle，
    // 物理选择器一个图中只允许一个后端，其余走 AIR_FEATURES 变体构建验证。
    // r46（owner 批复 #8(a) = D12）：physics-cannon 编入默认集以支持交付期切换
    // createAirApp 的 physics 选项（builtin 或 cannon）——双后端同 bundle + 初始化前确定性 register，
    // 默认仍为 builtin。产物字节变更已按计划书 §12 全量重采证据。
    'physics-2d-box2d',
    'physics-builtin',
    'physics-cannon',
    // V1.2 批次 H
    'custom-pipeline-post-process',
]);

module.exports = { DEFAULT_FEATURES };
