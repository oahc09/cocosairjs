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
 * Cocos Air — 内容自适应组件（AIR 原创，上游 cocos4 无同名文件）。
 *
 * 补上游缺位的 Unity `ContentSizeFitter` 用法：按节点自身内容的固有尺寸回写
 * `UITransform` 内容尺寸。上游 `Layout` 的 `ResizeMode.CONTAINER` 只会缩放挂了 Layout
 * 的容器本身，叶子节点（Label/Sprite）与无 Layout 的容器拿不到自适应。
 *
 * 设计约束：
 * - 只写 `UITransform` 内容尺寸，因此天然复用上游 `Layout` 对子节点
 *   `NodeEventType.SIZE_CHANGED` 的监听，不需要改上游文件。
 * - 写入前做等值比较，稳定后不再产生事件，因此可以每帧跑（见 {@link autoFit}）。
 * - 内置测量源只有一个固有尺寸，min 与 preferred 相同；需要区分两级时用
 *   {@link AirContentSizeFitter.measure} 自定义。
 * - 本构建的 `Label` 没有 `virtualSize`，因此 Label 测量读回的就是 Label 自己写入
 *   `UITransform` 的尺寸：`NONE`/`RESIZE_HEIGHT` 等自动撑开的模式能拿到文本尺寸，
 *   `SHRINK`/`CLAMP` 只能拿到手设盒子（等价于不动）。需要文本自然尺寸时用
 *   {@link AirContentSizeFitter.measure}，或等字符级文本能力落地。
 */

import { ccclass, requireComponent } from 'cc.decorator';
import { Component } from '../cocos/scene-graph/component';
import { NodeEventType } from '../cocos/scene-graph/node-event';
import { UITransform } from '../cocos/2d/framework/ui-transform';
import { Sprite } from '../cocos/2d/components/sprite';
import { Label } from '../cocos/2d/components/label';
import type { Node } from '../cocos/scene-graph/node';

/** @en Which size the fitter may write on one axis. @zh 单轴自适应模式。 */
export type AirFitMode =
    /** @en Keep the authored size. @zh 保持手设尺寸。 */
    | 'off'
    /** @en Shrink to the minimum content size. @zh 收缩到内容最小尺寸。 */
    | 'min'
    /** @en Grow to the preferred content size. @zh 扩展到内容首选尺寸。 */
    | 'preferred';

const FIT_MODES: AirFitMode[] = ['off', 'min', 'preferred'];

/** @en Intrinsic sizes returned by a measurer. @zh 测量器返回的固有尺寸。 */
export interface AirFitMeasure {
    minWidth?: number;
    minHeight?: number;
    preferredWidth?: number;
    preferredHeight?: number;
}

/** @en Custom measurer hook; return null to fall back to the built-in sources. @zh 自定义测量钩子，返回 null 回落内置测量。 */
export type AirFitMeasureFn = (fitter: AirContentSizeFitter) => AirFitMeasure | null;

function fail (message: string): never {
    throw Object.assign(new Error(`AIR_E_FIT: ${message}`), { code: 'AIR_E_FIT' });
}

function single (width: number, height: number): AirFitMeasure {
    return { minWidth: width, minHeight: height, preferredWidth: width, preferredHeight: height };
}

/** Measure the node's own content component; falls back to the children bounding box. */
function measureBuiltin (node: Node, affectedByScale: boolean): AirFitMeasure | null {
    const label = node.getComponent(Label);
    if (label && label.enabled) {
        // The ttf/bmfont assembler writes the laid-out size back to UITransform
        // (2d/assembler/label/*Utils.ts). Non-forced keeps the pass cheap when nothing changed.
        label.updateRenderData();
        const uiTransform = node.getComponent(UITransform);
        if (!uiTransform) return null;
        return single(uiTransform.width, uiTransform.height);
    }

    const sprite = node.getComponent(Sprite);
    if (sprite && sprite.enabled) {
        const frame = sprite.spriteFrame;
        if (!frame) return null;
        // TRIMMED reads the packed rect, RAW the source size; CUSTOM keeps the authored size
        // and therefore contributes nothing.
        if (sprite.sizeMode === Sprite.SizeMode.TRIMMED) return single(frame.rect.width, frame.rect.height);
        if (sprite.sizeMode === Sprite.SizeMode.RAW) return single(frame.originalSize.width, frame.originalSize.height);
        return null;
    }

    return measureChildren(node, affectedByScale);
}

/** Smallest content size whose rect — placed by this node's own anchor — encloses every active child. */
function measureChildren (node: Node, affectedByScale: boolean): AirFitMeasure | null {
    const uiTransform = node.getComponent(UITransform);
    if (!uiTransform) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;
    for (const child of node.children) {
        if (!child.active) continue;
        const childTransform = child.getComponent(UITransform);
        if (!childTransform) continue;
        const scaleX = affectedByScale ? Math.abs(child.scale.x) : 1;
        const scaleY = affectedByScale ? Math.abs(child.scale.y) : 1;
        const width = childTransform.width * scaleX;
        const height = childTransform.height * scaleY;
        // Child positions are relative to this node's anchor point, so the rect spans
        // [-anchor * size, (1 - anchor) * size] on each axis.
        const left = child.position.x - childTransform.anchorX * width;
        const bottom = child.position.y - childTransform.anchorY * height;
        if (left < minX) minX = left;
        if (left + width > maxX) maxX = left + width;
        if (bottom < minY) minY = bottom;
        if (bottom + height > maxY) maxY = bottom + height;
        count++;
    }
    if (count === 0) return null;
    return single(
        encloseSize(minX, maxX, uiTransform.anchorX),
        encloseSize(minY, maxY, uiTransform.anchorY),
    );
}

/** Inverse of the anchor split: the minimum size whose [-a*S, (1-a)*S] interval covers both bounds. */
function encloseSize (min: number, max: number, anchor: number): number {
    const negative = anchor > 0 ? -min / anchor : 0;
    const positive = anchor < 1 ? max / (1 - anchor) : 0;
    const size = Math.max(negative, positive);
    return Number.isFinite(size) && size > 0 ? size : 0;
}

/**
 * @en Resizes the node's UITransform to the intrinsic size of its content.
 * @zh 按节点内容的固有尺寸回写 `UITransform` 内容尺寸。
 *
 * @example
 * ```ts
 * const fitter = node.addComponent(AirContentSizeFitter);
 * fitter.horizontalFit = 'preferred';
 * fitter.verticalFit = 'preferred';
 * ```
 */
@ccclass('AirContentSizeFitter')
@requireComponent(UITransform)
export class AirContentSizeFitter extends Component {
    /** @en Recompute in `update` while dirty. Set false to drive {@link fitNow} yourself. @zh 置 true 时每帧按脏标记重算；关闭后由 fitNow 手动驱动。 */
    autoFit = true;

    protected _horizontalFit: AirFitMode = 'off';
    protected _verticalFit: AirFitMode = 'off';
    protected _measure: AirFitMeasureFn | null = null;
    protected _affectedByScale = false;
    protected _dirty = false;

    /** @en Horizontal fit mode. @zh 水平轴自适应模式。 */
    get horizontalFit (): AirFitMode {
        return this._horizontalFit;
    }

    set horizontalFit (value: AirFitMode) {
        this._assertFitMode('horizontalFit', value);
        if (this._horizontalFit === value) return;
        this._horizontalFit = value;
        this._dirty = true;
    }

    /** @en Vertical fit mode. @zh 垂直轴自适应模式。 */
    get verticalFit (): AirFitMode {
        return this._verticalFit;
    }

    set verticalFit (value: AirFitMode) {
        this._assertFitMode('verticalFit', value);
        if (this._verticalFit === value) return;
        this._verticalFit = value;
        this._dirty = true;
    }

    /** @en Optional custom measurer; wins over the built-in sources. @zh 可选自定义测量器，优先于内置测量源。 */
    get measure (): AirFitMeasureFn | null {
        return this._measure;
    }

    set measure (value: AirFitMeasureFn | null) {
        if (value !== null && typeof value !== 'function') fail('measure must be a function or null');
        this._measure = value;
        this._dirty = true;
    }

    /** @en Whether child scale counts toward the children bounding box, like `Layout.affectedByScale`. @zh 子节点缩放是否计入包围盒测量，语义同 `Layout.affectedByScale`。 */
    get affectedByScale (): boolean {
        return this._affectedByScale;
    }

    set affectedByScale (value: boolean) {
        if (this._affectedByScale === value) return;
        this._affectedByScale = value;
        this._dirty = true;
    }

    protected onEnable (): void {
        this._dirty = true;
        this._bindChildren();
    }

    protected onDisable (): void {
        this._unbindChildren();
    }

    protected update (): void {
        if (this.autoFit && this._dirty) this.fitNow();
    }

    /** @en Mark the fitter dirty; the next `update` (or {@link fitNow}) recomputes. Call this after you change the measured content. @zh 置脏；内容变化后调用，下一次 update 或 fitNow 时重算。 */
    markDirty (): void {
        this._dirty = true;
    }

    /**
     * @en Measure and apply immediately. Returns true when the content size changed.
     * @zh 立即测量并回写尺寸；内容尺寸发生变化时返回 true。
     */
    fitNow (): boolean {
        this._dirty = false;
        if (this._horizontalFit === 'off' && this._verticalFit === 'off') return false;
        const uiTransform = this.node.getComponent(UITransform);
        if (!uiTransform) return false;

        const custom = this._measure ? this._measure(this) : null;
        const source = custom ?? measureBuiltin(this.node, this._affectedByScale);
        if (!source) return false;

        const width = this._axisSize(source, 'Width', this._horizontalFit);
        const height = this._axisSize(source, 'Height', this._verticalFit);
        let resized = false;
        if (width !== null && Math.abs(uiTransform.width - width) > 1e-4) {
            uiTransform.width = width;
            resized = true;
        }
        if (height !== null && Math.abs(uiTransform.height - height) > 1e-4) {
            uiTransform.height = height;
            resized = true;
        }
        return resized;
    }

    protected _axisSize (source: AirFitMeasure, axis: 'Width' | 'Height', mode: AirFitMode): number | null {
        if (mode === 'off') return null;
        const min = source[`min${axis}` as keyof AirFitMeasure] as number | undefined;
        const preferred = source[`preferred${axis}` as keyof AirFitMeasure] as number | undefined;
        const value = mode === 'min' ? (min ?? preferred) : (preferred ?? min);
        if (value === undefined || !Number.isFinite(value) || value < 0) return null;
        return value;
    }

    protected _assertFitMode (field: string, value: AirFitMode): void {
        if (FIT_MODES.indexOf(value) < 0) fail(`${field} must be one of ${FIT_MODES.join(', ')}`);
    }

    /**
     * Content that lays itself out lazily (a Label's assembler pass, a Layout relayout) reports back
     * through these node events, so the fitter has to be woken up rather than only measured on demand.
     * Binding set mirrors upstream `Layout._addChildrenEventListeners`.
     */
    protected _bindChildren (): void {
        this.node.on(NodeEventType.CHILD_ADDED, this._onChildAdded, this);
        this.node.on(NodeEventType.CHILD_REMOVED, this._onChildRemoved, this);
        const children = this.node.children;
        for (let i = 0; i < children.length; ++i) this._addChildListeners(children[i]);
    }

    protected _unbindChildren (): void {
        this.node.off(NodeEventType.CHILD_ADDED, this._onChildAdded, this);
        this.node.off(NodeEventType.CHILD_REMOVED, this._onChildRemoved, this);
        const children = this.node.children;
        for (let i = 0; i < children.length; ++i) this._removeChildListeners(children[i]);
    }

    protected _addChildListeners (child: Node): void {
        child.on(NodeEventType.SIZE_CHANGED, this.markDirty, this);
        child.on(NodeEventType.ANCHOR_CHANGED, this.markDirty, this);
        child.on(NodeEventType.TRANSFORM_CHANGED, this.markDirty, this);
        child.on(NodeEventType.ACTIVE_IN_HIERARCHY_CHANGED, this.markDirty, this);
    }

    protected _removeChildListeners (child: Node): void {
        child.off(NodeEventType.SIZE_CHANGED, this.markDirty, this);
        child.off(NodeEventType.ANCHOR_CHANGED, this.markDirty, this);
        child.off(NodeEventType.TRANSFORM_CHANGED, this.markDirty, this);
        child.off(NodeEventType.ACTIVE_IN_HIERARCHY_CHANGED, this.markDirty, this);
    }

    protected _onChildAdded (child: Node): void {
        this._addChildListeners(child);
        this._dirty = true;
    }

    protected _onChildRemoved (child: Node): void {
        this._removeChildListeners(child);
        this._dirty = true;
    }
}
