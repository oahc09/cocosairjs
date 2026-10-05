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
export { createSessionScope } from './session-scope';
export type { AirSessionScope, AirSessionToken, AirSessionChange, AirCleanupReceipt } from './session-scope';
export type { AirDiagnostics, AirDiagnosticMessage, AirDiagnosticMode } from './diagnostics';
export * from './step-clock';
export * from './action-state';
export * from './action-input';
export * from './ui-kit';
export * from './ui-mesh';
export * from './scene-stack';
export * from './audio-service';
export * from './utils';
export * from './primitive-geometry';
export { Billboard } from '../cocos/particle/billboard';
export * from './assets/gltf';
export * from './assets/bmfont';
export * from './assets/atlas/atlas-parser';
export * from './assets/atlas/atlas-factory';
export * from './assets/atlas/atlas-loader';
export * from './rendering/transmission-capture';
export { createAirUnlitFogEffect } from './effects/unlit-fog';
export * from './rendering/render-target';
export * from './rendering/color-contract';
export * from './rendering/material-diagnostics';
