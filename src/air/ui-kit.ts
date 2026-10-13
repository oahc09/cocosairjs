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
 * Cocos Air — 可选 2D Code First 辅助包（W09，Code First 与 Web 可靠性任务清单）。
 *
 * 最小工具集：createUICanvas / spriteNode / labelNode / AssetBank。全部复用原生
 * Node/UITransform/Sprite/Label/Camera/Canvas，不创建平行 Scene/Node 抽象；
 * createAirApp 不承载业务布局。调用层可选择不用这些 helper；为维持现有
 * 公共 API 兼容，本模块仍由默认入口导出，尚未独立拆包。
 *
 * 本文件为 Air 原创（上游 cocos4 无同名文件）。
 */

import { Node } from '../cocos/scene-graph/node';
import { UITransform } from '../cocos/2d/framework/ui-transform';
import { Canvas } from '../cocos/2d/framework/canvas';
import { Camera } from '../cocos/misc/camera-component';
import { Widget } from '../cocos/ui/widget';
import { Sprite } from '../cocos/2d/components/sprite';
import { Label } from '../cocos/2d/components/label';
import { Color } from '../cocos/core/math';
import { Layers } from '../cocos/scene-graph/layers';
import { Scene } from '../cocos/scene-graph/scene';

/** @en Options for [[createUICanvas]]. @zh createUICanvas 选项。 */
export interface UICanvasOptions {
    /** 设计宽高（默认 1280×720）。 */
    designWidth?: number;
    designHeight?: number;
    /** UI 可见层（默认 Layers.Enum.UI_2D）。 */
    layer?: number;
}

/**
 * @en Assemble a fullscreen UI Canvas (Canvas + Widget + ortho UI camera) under the scene.
 * @zh 在场景内组装全屏 UI Canvas（Canvas + Widget 全对齐 + 正交 UI 相机）。
 * 返回 canvas 根节点；相机挂在其子节点上并已链接 `canvasComponent.cameraComponent`。
 */
export function createUICanvas (scene: Scene, name = 'UICanvas', options: UICanvasOptions = {}): Node {
    const layer = options.layer ?? Layers.Enum.UI_2D;
    const w = options.designWidth ?? 1280;
    const h = options.designHeight ?? 720;

    const node = new Node(name);
    node.layer = layer;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(w, h);
    ut.setAnchorPoint(0.5, 0.5);
    const canvas = node.addComponent(Canvas) as Canvas;
    const widget = node.addComponent(Widget);
    widget.isAlignLeft = widget.isAlignRight = widget.isAlignTop = widget.isAlignBottom = true;
    widget.left = widget.right = widget.top = widget.bottom = 0;
    widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
    scene.addChild(node);

    const cameraNode = new Node(name + '/Camera');
    cameraNode.layer = layer;
    cameraNode.addComponent(UITransform).setContentSize(1, 1);
    const camera = cameraNode.addComponent(Camera) as Camera;
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(24, 30, 44, 255);
    camera.visibility = layer;
    camera.near = 1;
    camera.far = 2000;
    node.addChild(cameraNode);
    canvas.cameraComponent = camera;
    return node;
}

/** @en Options for [[spriteNode]]. @zh spriteNode 选项。 */
export interface SpriteNodeOptions {
    size?: [number, number];
    position?: [number, number];
    color?: Color;
    layer?: number;
}

/**
 * @en Create a UI child node with UITransform + Sprite (CUSTOM size mode).
 * @zh 创建带 UITransform + Sprite 的 UI 子节点（CUSTOM 尺寸模式；设 spriteFrame 后即渲染）。
 */
export function spriteNode (parent: Node, name = 'Sprite', options: SpriteNodeOptions = {}): Node {
    const node = new Node(name);
    node.layer = options.layer ?? Layers.Enum.UI_2D;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(options.size?.[0] ?? 100, options.size?.[1] ?? 100);
    ut.setAnchorPoint(0.5, 0.5);
    const sprite = node.addComponent(Sprite) as Sprite;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    if (options.color) { sprite.color = options.color.clone(); }
    if (options.position) { node.setPosition(options.position[0], options.position[1], 0); }
    parent.addChild(node);
    return node;
}

/** @en Options for [[labelNode]]. @zh labelNode 选项。 */
export interface LabelNodeOptions {
    fontSize?: number;
    position?: [number, number];
    color?: Color;
    overflow?: number;
    /** SHRINK/CLAMP wrapping; omitted keeps the native Label default. */
    enableWrapText?: boolean;
    boxSize?: [number, number];
    layer?: number;
}

/**
 * @en Create a UI child node with UITransform + Label（examples 同款默认排版）。
 * @zh 创建带 UITransform + Label 的 UI 子节点。
 */
export function labelNode (parent: Node, text: string, name = 'Label', options: LabelNodeOptions = {}): Node {
    if (options.enableWrapText !== undefined && typeof options.enableWrapText !== 'boolean') {
        throw Object.assign(new Error('[AIR_E_LABEL_WRAP] enableWrapText must be boolean'), { code: 'AIR_E_LABEL_WRAP' });
    }
    const node = new Node(name);
    node.layer = options.layer ?? Layers.Enum.UI_2D;
    const fontSize = options.fontSize ?? 28;
    const ut = node.addComponent(UITransform);
    ut.setContentSize(options.boxSize?.[0] ?? 0, options.boxSize?.[1] ?? 0);
    ut.setAnchorPoint(0.5, 0.5);
    const label = node.addComponent(Label) as Label;
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.25);
    label.color = options.color ?? Color.WHITE.clone();
    if (options.overflow !== undefined) { label.overflow = options.overflow; }
    if (options.enableWrapText !== undefined) { label.enableWrapText = options.enableWrapText; }
    if (options.position) { node.setPosition(options.position[0], options.position[1], 0); }
    parent.addChild(node);
    return node;
}

/**
 * @en Reference-counted raw-remote asset bank over `assetManager.loadRemote`.
 * @zh 基于 assetManager.loadRemote 的引用计数原始远程资产库。
 *
 * PG-06/PG-32 起实现移至 [src/air/assets/asset-bank.ts](./assets/asset-bank.ts)（独立加载
 * 辅助模块），此处按原公共名重导出保持兼容：原有 `new AssetBank()` / `load(url, onProgress?)`
 * / `refCount(url)` / `release(url)` / `size` 语义不变；新增 { ext?, signal?, onProgress? }
 * 选项、releaseAll 与 AIR_E_* 稳定错误，详见 docs/manual/asset-bank-loading.md。
 */
export { AssetBank } from './assets/asset-bank';
export type { AssetBankLoadOptions, AssetProgressFn, AirAssetError, AirAssetErrorCode } from './assets/asset-bank';
