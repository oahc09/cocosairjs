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
 * Cocos Air — 2D 像素级整数缩放与吸附（AIR 原创，上游 cocos4 无同名文件）。
 *
 * 对应 Unity 侧两处能力（移植依据见复刻工程 `_re/scenes/level1.geometry.json`：7 个画布里
 * 4 个 `pixelPerfect`、2 个 `PixelPerfectCamera`、28 个 `PixelPerfectHorizontalLayoutGroup`）：
 * - `UnityEngine.U2D.PixelPerfectCamera`：把相机缩放到整数倍，并让画面落在设备像素网格上；
 * - `Canvas.pixelPerfect` 与项目自定义的 `SnapChildrenToPixels()`：把 UI 子树的位置
 *   （可选尺寸）对齐到像素网格。
 *
 * 语义约定（行为等价，不是逐位移植 Unity 私有算法）：
 * - 网格锚在帧缓冲左下角：设备像素 = `(ui - origin) * scale`，`origin` 是映射到像素 0 的 UI
 *   坐标。取整发生在设备像素空间，所以窗口宽高为奇数、视口带 letterbox 偏移时也不会错位。
 * - 逐层参与：组件挂在哪个 Canvas/相机上就只管那一层，没挂的画布保持上游的非整数缩放，
 *   这正好对上 level1 里 `pixelPerfect` 混合的分层结构。
 * - 时机用 `DirectorEvent.BEFORE_DRAW`。上游顺序是 `lateUpdatePhase` → `AFTER_UPDATE`
 *   （`Layout.updateLayout` 挂在这里，`src/cocos/ui/layout.ts:738`）→ `BEFORE_DRAW` →
 *   `uiRendererManager.updateAllDirtyRenderers()`（`src/cocos/game/director.ts:806-819`），
 *   吸附因此发生在布局之后、渲染数据构建之前；2D 批次再乘一次节点世界矩阵
 *   （`src/cocos/2d/renderer/batcher-2d.ts:1167-1172`），本帧生效，不会滞后一帧。
 * - {@link AirPixelPerfect.snapSizes} 默认关闭：`Label` 是在我们之后的渲染数据阶段回写
 *   `UITransform` 尺寸的，文本盒子开尺寸吸附会逐帧抖一帧。需要边缘严格对齐的精灵层再显式
 *   打开，并接受与上游 `Layout`/`Widget` 互相回写。
 * - 嵌套：外层组件跳过被另一个启用组件认领的子树，因此内层要晚于外层注册监听（同一
 *   `BEFORE_DRAW` 事件里按注册顺序执行），否则外层对父节点的亚像素纠正会让内层错位。
 *   在同一帧内先建外层再建内层即满足该顺序。
 * - 输入坐标系（副作用，实测于复刻页）：本组件把 UI 相机 `orthoHeight` 钉成帧缓冲像素的一半，
 *   世界单位随之等于设备像素；而 `event.getUILocation()` 仍按 `view` 的设计分辨率换算，两者相差
 *   `设计高 / 帧缓冲高` 倍（1920x1080 设计 + 1000x700 帧缓冲 ⇒ 1.543 倍）。因此吸附生效时，照上游
 *   惯例用 `getUILocation()` + `convertToNodeSpaceAR` 的悬停/点击会整体偏移；要走的是
 *   `event.getLocation()` → `Camera.screenToWorld` → 节点局部坐标这条链，也就是上游
 *   `UITransform.hitTest` 自己在用的那条（`src/cocos/2d/framework/ui-transform.ts:477`）。
 */

import { ccclass } from 'cc.decorator';
import { screen } from '../cocos/core/platform/screen';
import { UITransform } from '../cocos/2d/framework/ui-transform';
import { Canvas } from '../cocos/2d/framework/canvas';
import { Camera } from '../cocos/misc/camera-component';
import { Component } from '../cocos/scene-graph/component';
import type { Node } from '../cocos/scene-graph/node';
import { DirectorEvent, director } from '../cocos/game/director';

/** @en Rounding used when picking the automatic integer scale. @zh 自动推导整数倍率时的舍入方式。 */
export type AirPixelRounding =
    /** @en Round to nearest: fills the screen better. @zh 四舍五入：更铺得满。 */
    | 'nearest'
    /** @en Floor: never scale past 1:1 upward. @zh 向下取整：宁可多留边也不放大过头。 */
    | 'down';

/**
 * @en Everything the pixel grid needs to know about one orthographic camera, expressed as plain
 *  numbers so the math stays testable without a running app.
 * @zh 推导像素网格所需的正交相机状态，全部用裸数值表达，便于不启动 app 直接单测。
 */
export interface AirPixelViewport {
    /** @en Framebuffer size in device pixels. @zh 帧缓冲尺寸（设备像素）。 */
    windowWidth: number;
    windowHeight: number;
    /** @en Normalized viewport rect (`Camera.rect`). @zh 归一化视口（`Camera.rect`）。 */
    viewportX: number;
    viewportY: number;
    viewportWidth: number;
    viewportHeight: number;
    /** @en Camera node world position, in UI units. @zh 相机节点世界坐标（UI 单位）。 */
    cameraX: number;
    cameraY: number;
    /** @en Orthographic half height, in UI units. @zh 正交半高（UI 单位）。 */
    orthoHeight: number;
    /**
     * @en Orthographic half width in UI units; `0` means "derive from the viewport aspect",
     *  which is what the upstream camera does.
     * @zh 正交半宽（UI 单位）；`0` 表示按上游规则由视口宽高比推导。
     */
    orthoWidth: number;
}

/** @en Options that steer automatic ratio resolution. @zh 自动倍率求解选项。 */
export interface AirPixelRatioOptions {
    /** @en Exact ratio to use; `0` keeps the automatic guess. @zh 指定倍率，`0` 为自动推导。 */
    pixelRatio?: number;
    /**
     * @en Reference height in UI units (Unity `refResolutionY` stand-in). `0` uses the
     *  currently visible height.
     * @zh 参考高度（UI 单位，Unity `refResolutionY` 的对应物）。`0` 用当前可见高度。
     */
    referenceHeight?: number;
    /** @en How to round the automatic ratio. @zh 自动倍率的舍入方式。 */
    rounding?: AirPixelRounding;
}

/** @en Axis-aligned rect in UI units, position being the anchor point. @zh UI 单位下的矩形，位置为锚点。 */
export interface AirPixelRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

function fail (message: string): never {
    throw Object.assign(new Error(`AIR_E_PIXEL: ${message}`), { code: 'AIR_E_PIXEL' });
}

/** @en Half width actually in effect (`0` falls back to the aspect, like the upstream camera). */
function effectiveOrthoWidth (vp: AirPixelViewport): number {
    if (vp.orthoWidth > 0) return vp.orthoWidth;
    const aspect = (vp.viewportWidth * vp.windowWidth) / (vp.viewportHeight * vp.windowHeight);
    return vp.orthoHeight * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1);
}

/** @en Device pixels covered by the camera viewport, with its bottom-left corner. */
function viewportPixels (vp: AirPixelViewport): { x: number; y: number; width: number; height: number } {
    return {
        x: vp.viewportX * vp.windowWidth,
        y: vp.viewportY * vp.windowHeight,
        width: vp.viewportWidth * vp.windowWidth,
        height: vp.viewportHeight * vp.windowHeight,
    };
}

/**
 * @en Resolve the integer device-pixels-per-UI-unit ratio a camera should render at. Floored at 1:
 *  when the buffer is smaller than the reference area, show less of it rather than scaling below
 *  1:1.
 * @zh 求出相机应当使用的"设备像素 / UI 单位"整数倍率。下限为 1：缓冲比参考区域还小时，
 *  宁可少显示一块，也不做小于 1:1 的整数缩放。
 */
export function resolveAirPixelRatio (vp: AirPixelViewport, options: AirPixelRatioOptions = {}): number {
    const forced = options.pixelRatio ?? 0;
    if (forced > 0) return Math.max(1, Math.round(forced));
    const px = viewportPixels(vp);
    const reference = options.referenceHeight && options.referenceHeight > 0
        ? options.referenceHeight
        : vp.orthoHeight * 2;
    if (!(px.height > 0) || !(reference > 0)) return 1;
    const rough = px.height / reference;
    const rounded = options.rounding === 'down' ? Math.floor(rough) : Math.round(rough);
    return Math.max(1, rounded);
}

/**
 * @en Orthographic half sizes that make the camera cover `pixelRatio` device pixels per UI unit
 *  across its viewport.
 * @zh 让相机在其视口内达到"每 UI 单位 `pixelRatio` 个设备像素"的正交半宽高。
 */
export function airPixelOrtho (vp: AirPixelViewport, pixelRatio: number): { orthoHeight: number; orthoWidth: number } {
    if (!(pixelRatio > 0)) return fail(`pixelRatio must be positive, got ${pixelRatio}`);
    const px = viewportPixels(vp);
    return { orthoHeight: px.height / (2 * pixelRatio), orthoWidth: px.width / (2 * pixelRatio) };
}

/**
 * @en Device-pixel grid for one camera viewport. The scales are read back from the camera state,
 *  so the grid always describes the mapping that is really about to render — integer or not;
 *  `roundX/roundY` snap a UI coordinate onto the nearest pixel boundary either way.
 * @zh 单个相机视口对应的设备像素网格。缩放值直接读自相机状态，因此它表示本帧真正生效的映射，
 *  是否为整数都能用 `roundX/roundY` 吸附到最近的像素边界。
 */
export class AirPixelGrid {
    /** @en Device pixels per UI unit on X. @zh X 轴设备像素 / UI 单位。 */
    readonly scaleX: number;
    /** @en Device pixels per UI unit on Y. @zh Y 轴设备像素 / UI 单位。 */
    readonly scaleY: number;
    /** @en UI coordinate mapping to framebuffer column 0. @zh 映射到帧缓冲第 0 列的 UI 坐标。 */
    readonly originX: number;
    /** @en UI coordinate mapping to framebuffer row 0. @zh 映射到帧缓冲第 0 行的 UI 坐标。 */
    readonly originY: number;

    constructor (vp: AirPixelViewport) {
        const px = viewportPixels(vp);
        const halfWidth = effectiveOrthoWidth(vp);
        if (!(px.width > 0) || !(px.height > 0) || !(vp.orthoHeight > 0) || !(halfWidth > 0)) {
            fail('degenerate camera viewport: need positive viewport pixels and orthographic size');
        }
        this.scaleX = px.width / (2 * halfWidth);
        this.scaleY = px.height / (2 * vp.orthoHeight);
        // The camera sits at the centre of its viewport, so pixel (x + width / 2) is cameraX.
        this.originX = vp.cameraX - (px.x + px.width / 2) / this.scaleX;
        this.originY = vp.cameraY - (px.y + px.height / 2) / this.scaleY;
    }

    /** @en Device pixel column for a UI x. @zh UI x 对应的设备像素列。 */
    toPixelX (uiX: number): number {
        return (uiX - this.originX) * this.scaleX;
    }

    /** @en Device pixel row for a UI y. @zh UI y 对应的设备像素行。 */
    toPixelY (uiY: number): number {
        return (uiY - this.originY) * this.scaleY;
    }

    /** @en UI x of the pixel boundary nearest `uiX`. @zh 距 `uiX` 最近的像素边界对应 UI x。 */
    roundX (uiX: number): number {
        return this.originX + Math.round(this.toPixelX(uiX)) / this.scaleX;
    }

    /** @en UI y of the pixel boundary nearest `uiY`. @zh 距 `uiY` 最近的像素边界对应 UI y。 */
    roundY (uiY: number): number {
        return this.originY + Math.round(this.toPixelY(uiY)) / this.scaleY;
    }

    /**
     * @en Snap both edges of a rect onto pixel boundaries while keeping the anchor over the same
     *  corner. An axis narrower than half a pixel keeps its authored extent instead of collapsing.
     * @zh 把矩形两条边都吸附到像素边界，锚点仍指向同一角；不足半像素的轴保留原尺寸，避免塌成 0。
     */
    snapRect (
        centerX: number,
        centerY: number,
        width: number,
        height: number,
        anchorX: number,
        anchorY: number,
        out: AirPixelRect = { x: 0, y: 0, width: 0, height: 0 },
    ): AirPixelRect {
        const leftEdge = centerX - width * anchorX;
        const bottomEdge = centerY - height * anchorY;
        // `+ 0.5` keeps a sub-pixel box from rounding to a zero-width span on both edges.
        const left = Math.round(this.toPixelX(leftEdge));
        const right = Math.max(left + 1, Math.round(this.toPixelX(leftEdge + width)));
        const bottom = Math.round(this.toPixelY(bottomEdge));
        const top = Math.max(bottom + 1, Math.round(this.toPixelY(bottomEdge + height)));
        out.width = (right - left) / this.scaleX;
        out.height = (top - bottom) / this.scaleY;
        out.x = this.originX + left / this.scaleX + out.width * anchorX;
        out.y = this.originY + bottom / this.scaleY + out.height * anchorY;
        return out;
    }
}

/** @en Reads the camera state the grid needs; `null` while the window or viewport is degenerate. */
function readViewport (camera: Camera): AirPixelViewport | null {
    const win = screen.windowSize;
    const rect = camera.rect;
    if (!(win.width > 0) || !(win.height > 0) || !(rect.width > 0) || !(rect.height > 0)) return null;
    const world = camera.node.worldPosition;
    return {
        windowWidth: win.width,
        windowHeight: win.height,
        viewportX: rect.x,
        viewportY: rect.y,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
        cameraX: world.x,
        cameraY: world.y,
        orthoHeight: camera.orthoHeight,
        orthoWidth: camera.orthoWidth,
    };
}

/** Sub-pixel churn guard: below this we consider the value already on the grid. */
const EPSILON_PX = 1e-3;

/**
 * @en Put one 2D/UI layer onto the device-pixel grid and, unless disabled, lock its camera to an
 *  integer scale. Attach it to the layers that must be pixel perfect and leave the ones that must
 *  keep fractional scaling alone.
 * @zh 把一层 2D/UI 内容放到设备像素网格上，并（默认）把它的相机锁到整数缩放。
 *  需要像素完美的层挂本组件，需要保持非整数缩放的层不挂即可。
 *
 * @en Unity counterpart: `PixelPerfectCamera` on the camera side, `Canvas.pixelPerfect` and
 *  `PixelPerfectHorizontalLayoutGroup` on the transform side.
 * @zh Unity 对应物：相机侧 `PixelPerfectCamera`，变换侧 `Canvas.pixelPerfect` 与
 *  `PixelPerfectHorizontalLayoutGroup`。
 */
@ccclass('AirPixelPerfect')
export class AirPixelPerfect extends Component {
    /**
     * @en Keep the camera at an integer device-pixels-per-UI-unit ratio.
     * @zh 是否把相机锁定为"每 UI 单位整数个设备像素"。
     */
    snapCamera = true;

    /**
     * @en Snap node world positions in this subtree onto pixel boundaries.
     * @zh 是否把本子树节点的世界坐标吸附到像素边界。
     */
    snapPosition = true;

    /**
     * @en Snap `UITransform` content sizes too, so both edges land on pixel boundaries. Off by
     *  default: `Label` writes its laid-out size during the render-data pass that follows our snap.
     * @zh 是否同时吸附 `UITransform` 尺寸，让两条边都落在像素边界上。默认关闭：`Label` 的排版尺寸
     *  是在我们之后的渲染数据阶段回写的。与 {@link snapPosition} 同时开启才是"两条边都对齐"，
     *  单独开启只按锚点伸缩尺寸。
     */
    snapSizes = false;

    /** @en Exact integer ratio; `0` resolves it automatically. @zh 指定整数倍率，`0` 为自动推导。 */
    pixelRatioOverride = 0;

    /** @en Reference height in UI units; `0` uses the currently visible height. @zh 参考高度（UI 单位），`0` 用当前可见高度。 */
    referenceHeight = 0;

    /** @en Rounding for the automatic ratio. @zh 自动倍率的舍入方式。 */
    rounding: AirPixelRounding = 'nearest';

    /** @en Camera to drive; otherwise take this node's `Canvas` camera or its own `Camera`. @zh 要驱动的相机；留空则取本节点 `Canvas` 的相机或本节点自身的 `Camera`。 */
    camera: Camera | null = null;

    /** @en Snap once per `BEFORE_DRAW`. @zh 是否每帧 `BEFORE_DRAW` 吸附一次。 */
    autoSnap = true;

    private _grid: AirPixelGrid | null = null;
    private _rectBuffer: AirPixelRect = { x: 0, y: 0, width: 0, height: 0 };
    private _cameraAnchor: Node | null = null;
    private _canvasAnchor: Node | null = null;

    /** @en Device pixels per UI unit currently applied to this layer; `0` before the first snap. */
    get pixelRatio (): number {
        return this._grid ? this._grid.scaleY : 0;
    }

    /** @en Current grid; `null` until the first successful snap. @zh 当前网格；首次吸附成功前为 `null`。 */
    get grid (): AirPixelGrid | null {
        return this._grid;
    }

    protected onEnable (): void {
        director.on(DirectorEvent.BEFORE_DRAW, this._onBeforeDraw, this);
    }

    protected onDisable (): void {
        director.off(DirectorEvent.BEFORE_DRAW, this._onBeforeDraw, this);
        this._grid = null;
        this._cameraAnchor = null;
        this._canvasAnchor = null;
    }

    private _onBeforeDraw (): void {
        if (this.autoSnap) this.snapNow();
    }

    /**
     * @en Snap once, right now — for code that moves content later than `BEFORE_DRAW` (a tween
     *  completion, a manual `Layout.updateLayout()`).
     * @zh 立即吸附一次：供比 `BEFORE_DRAW` 更晚改动内容的代码使用（补间收尾、手动
     *  `Layout.updateLayout()`）。
     * @return Whether anything changed. @returns 是否有实际改动。
     */
    snapNow (): boolean {
        const camera = this._resolveCamera();
        if (!camera || !camera.enabled) return false;
        const vp = readViewport(camera);
        if (!vp) return false;

        let changed = false;
        if (this.snapCamera) {
            const ratio = resolveAirPixelRatio(vp, {
                pixelRatio: this.pixelRatioOverride,
                referenceHeight: this.referenceHeight,
                rounding: this.rounding,
            });
            const ortho = airPixelOrtho(vp, ratio);
            if (Math.abs(ortho.orthoHeight - vp.orthoHeight) * ratio > EPSILON_PX) {
                camera.orthoHeight = ortho.orthoHeight;
                vp.orthoHeight = ortho.orthoHeight;
                changed = true;
            }
            if (Math.abs(ortho.orthoWidth - effectiveOrthoWidth(vp)) * ratio > EPSILON_PX) {
                camera.orthoWidth = ortho.orthoWidth;
                vp.orthoWidth = ortho.orthoWidth;
                changed = true;
            }
        }

        try {
            this._grid = new AirPixelGrid(vp);
        } catch {
            this._grid = null;
            return changed;
        }
        this._cameraAnchor = camera.node;
        this._canvasAnchor = this._resolveCanvasAnchor(camera);
        if (!this.snapPosition && !this.snapSizes) return changed;
        return this._snapNode(this.node) || changed;
    }

    /**
     * @en The grid the current camera viewport implies, without snapping or changing the camera.
     *  Lets a probe build its expectations in the same coordinate frame it is going to measure.
     * @zh 按当前相机视口算出网格，不吸附、不改相机。让验收探针能用与测量同一套坐标系来摆期望值。
     * @return `null` when there is no usable camera or the viewport is degenerate.
     */
    peekGrid (): AirPixelGrid | null {
        const camera = this._resolveCamera();
        if (!camera || !camera.enabled) return null;
        const vp = readViewport(camera);
        if (!vp) return null;
        try {
            return new AirPixelGrid(vp);
        } catch {
            return null;
        }
    }

    /**
     * @en Snap a world coordinate onto the grid, keeping z — the `RoundToPixel` counterpart.
     *  Identity while no grid exists.
     * @zh 把世界坐标吸附到网格，z 原样保留；对应 Unity 的 `RoundToPixel`。网格未建立时原样返回。
     */
    roundToPixel (x: number, y: number, z = 0): { x: number; y: number; z: number } {
        const grid = this._grid;
        if (!grid) return { x, y, z };
        return { x: grid.roundX(x), y: grid.roundY(y), z };
    }

    /**
     * @en Resolve the camera to drive: the explicit `camera`, then this node's `Canvas` or own
     *  `Camera`, then walk up the parents the way Unity's `GetComponentInParent` does — so a
     *  nested layer (a snapped layout group inside an already snapped canvas) needs no wiring.
     * @zh 解析要驱动的相机：优先用显式 `camera`，否则取本节点的 `Canvas`/自身 `Camera`，
     *  再按 Unity `GetComponentInParent` 的方式向上找父链——嵌套层（画布内的吸附布局组）无需手动接线。
     */
    private _resolveCamera (): Camera | null {
        if (this.camera) return this.camera;
        let node: Node | null = this.node;
        while (node) {
            const canvas = node.getComponent(Canvas);
            const found = canvas ? canvas.cameraComponent : node.getComponent(Camera);
            if (found) {
                this.camera = found;
                return this.camera;
            }
            node = node.parent;
        }
        return null;
    }

    /**
     * @en The `Canvas` node that drives this camera: `Canvas._onResizeCamera` copies that node's
     *  world position into the camera node, so the canvas node, not the camera node, is the real
     *  anchor. Snapping it would snap the coordinate frame under our own feet.
     * @zh 驱动这台相机的 `Canvas` 节点：`Canvas._onResizeCamera` 把这个节点的世界坐标拷进相机节点，
     *  所以真正的锚点是画布节点而不是相机节点。吸附它等于把脚下坐标系搬走。
     */
    private _resolveCanvasAnchor (camera: Camera): Node | null {
        let node: Node | null = camera.node;
        while (node) {
            const canvas = node.getComponent(Canvas);
            if (canvas && canvas.cameraComponent === camera) return node;
            node = node.parent;
        }
        return null;
    }

    /**
     * @en Pre-order walk: parents first, so each child snaps against its already-snapped parent.
     *  The two anchor nodes — `camera.node` and the `Canvas` node whose position the engine copies
     *  into it — are passed over, but their subtrees are still walked. Both sit at the viewport
     *  centre, which is a half device pixel whenever the frame buffer is an odd size: rounding them
     *  "up" moves the grid they define, so the next frame is off by half a pixel again and the whole
     *  layer crawls forever instead of settling.
     * @zh 前序遍历：父节点先吸，子节点才能对着已吸好的父节点算。两个锚点（`camera.node`，以及位置会被
     *  引擎拷贝给它的那个 `Canvas` 节点）跳过写入，但仍然继续向下遍历。这两个节点恒在视口中心，而帧缓冲
     *  尺寸为奇数时中心本身就是半像素——每帧把它"上取整"会推动网格原点，下一帧又差半像素，
     *  于是整层内容逐帧爬行而不是收敛。
     */
    private _snapNode (node: Node): boolean {
        if (!node.active) return false;
        if (node !== this.node) {
            const nested = node.getComponent(AirPixelPerfect);
            if (nested && nested.enabled) return false;
        }
        if (node === this._cameraAnchor || node === this._canvasAnchor) {
            let kept = false;
            const under = node.children;
            for (let i = 0; i < under.length; i++) {
                if (this._snapNode(under[i])) kept = true;
            }
            return kept;
        }
        const grid = this._grid!;
        const world = node.worldPosition;
        let targetX = world.x;
        let targetY = world.y;
        let changed = false;

        const transform = this.snapSizes ? node.getComponent(UITransform) : null;
        if (transform) {
            const rect = grid.snapRect(
                world.x, world.y, transform.width, transform.height,
                transform.anchorX, transform.anchorY, this._rectBuffer,
            );
            if (Math.abs(rect.width - transform.width) * grid.scaleX > EPSILON_PX) {
                transform.width = rect.width;
                changed = true;
            }
            if (Math.abs(rect.height - transform.height) * grid.scaleY > EPSILON_PX) {
                transform.height = rect.height;
                changed = true;
            }
            targetX = rect.x;
            targetY = rect.y;
        } else if (this.snapPosition) {
            targetX = grid.roundX(world.x);
            targetY = grid.roundY(world.y);
        }

        if (this.snapPosition
            && (Math.abs(targetX - world.x) * grid.scaleX > EPSILON_PX
                || Math.abs(targetY - world.y) * grid.scaleY > EPSILON_PX)) {
            node.setWorldPosition(targetX, targetY, world.z);
            changed = true;
        }

        const children = node.children;
        for (let i = 0; i < children.length; i++) {
            if (this._snapNode(children[i])) changed = true;
        }
        return changed;
    }
}
