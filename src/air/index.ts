/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
/**
 * Cocos AIR — Agent-first Interactive Runtime.
 *
 * src/air/ 只保存 Cocos AIR 新增的 Code First 入口与少量 DX 工具，
 * 不修改引擎抽象（见计划书 §4.4）。
 */

export * from './app';
export * from './bootstrap';
export * from './html-source';
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
export * from './ui-content-size-fitter';
export * from './ui-pixel-perfect';
export * from './dom-overlay';
export * from './texture-sprite';
export * from './graphics-commands';
export * from './graphics-raster';
export * from './ui-blend';
export * from './effects/sprite-mask';
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
export * from './rendering/engine-contracts';
