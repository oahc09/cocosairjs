/**
 * Cocos AIR bundle 入口（ccbuild feature unit: `air`）。
 * 由 ccbuild 合并进单一 `cocosair` 模块（build/cocosair.module.js）。
 */

export * from './base';
export * from './3d';
export * from './animation';
export * from './skeletal-animation';
export * from './primitive';
export * from './tween';
export * from './profiler';
export * from './video';
export * from './webview';
export * from './2d';
export * from './graphics';
export * from './mask';
export * from './sorting';
export * from './physics-2d-framework';
export * from './particle-2d';
export * from './tiled-map';
export * from './ui';
export * from './spine';
export * from './dragon-bones';
export * from './intersection-2d';
export * from './sorting-2d';
export * from './geometry-renderer';
// 物理后端：官方 selector 是「后注册者胜出」（register 覆盖 selector.id）。
// 按决策 D7，默认发行 = 2D box2d（@cocos/box2d 纯 JS 端口，可真实模拟）+ 3D 框架面
// （PhysicsSystem / RigidBody / Collider ...）经 ./physics-framework 并入聚合出口（D5）。
// r46（owner 批复 #8(a) = D12）：3D 默认集同时编入 builtin 与 cannon 两个后端，
// `createAirApp({ physics: 'builtin' | 'cannon' })` 在 game.init 前确定性重注册（src/air/physics-backend.ts），
// 默认仍为 builtin。box2d-wasm / ammo / physx / 2D builtin 的后端代码与 feature unit 均已回归，
// 走 AIR_FEATURES 变体构建验证。
export * from './physics-2d-box2d';
export * from './physics-framework';
export * from './physics-builtin';
export * from './physics-cannon';
export * from './custom-pipeline-post-process';
export * from './audio';

export * from '../air';

export * from './worker';
export * from './worker-pool';
export * from './webassembly';
