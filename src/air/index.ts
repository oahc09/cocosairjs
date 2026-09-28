/**
 * Cocos AIR — Agent-first Interactive Runtime.
 *
 * src/air/ 只保存 Cocos AIR 新增的 Code First 入口与少量 DX 工具，
 * 不修改引擎抽象（见计划书 §4.4）。
 */

export * from './app';
export * from './bootstrap';
export * from './physics-backend';
export * from './context-health';
export * from './step-clock';
export * from './ui-kit';
export * from './scene-stack';
export * from './audio-service';
export * from './utils';
export * from './assets/gltf';
export * from './rendering/transmission-capture';
