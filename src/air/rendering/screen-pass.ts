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
 * Cocos AIR — 相机全屏后处理 pass（AIR 原创，上游无同名文件）。
 *
 * 走的是 Code First 已经可达的机器：`AirRenderTarget` 接管源相机的输出，一个只看见Quad 图层
 * 的输出相机把 `AirRenderTarget` 的颜色纹理铺回屏幕（`examples/shader-emboss` 已在浏览器验证
 * 过这套组合）。上游的 `pipeline/post-process/*` 自定义管线在 Code First 下仍然装不起来
 * （见 `docs/notes/post-process-notes.md` §2、§5），所以这里是功能等价的独立实现，
 * 不要当成原生 post-process 管线。
 *
 * 采样是 1:1 的：RT 尺寸取源相机视口覆盖的设备像素，Quad 用恒等 clip 坐标铺满输出相机视口，
 * 所以屏幕像素和 RT texel 一一对应，`nearest` 滤波下效果可以逐像素预测。
 */
import { Material } from '../../cocos/asset/assets/material';
import type { Asset } from '../../cocos/asset/assets/asset';
import { EffectAsset } from '../../cocos/asset/assets/effect-asset';
import { Camera } from '../../cocos/misc/camera-component';
import { Color, Vec4 } from '../../cocos/core/math';
import { Node } from '../../cocos/scene-graph';
import { MeshRenderer } from '../../cocos/3d/framework/mesh-renderer';
import { Mesh } from '../../cocos/3d/assets/mesh';
import { createMesh } from '../../cocos/3d/misc';
import { screen } from '../../cocos/core/platform/screen';
import { AirRenderTarget, AirTargetColorFormat, createAirRenderTarget } from './render-target';

/**
 * @en Default node layer for the full-screen quad. Bits 20-31 are engine-preserved
 *  (`src/cocos/scene-graph/layers.ts:33-45`), and 1 << 25 is UI_2D, which every UI camera can see.
 * @zh 全屏 quad 的默认图层。20~31 位是引擎保留位（`src/cocos/scene-graph/layers.ts:33-45`），
 *  而 `1 << 25` 是 UI_2D，会被所有 UI 相机看到，所以这里取一个用户位。
 */
export const AIR_SCREEN_PASS_LAYER = 1 << 19;

/** @en A `vec4` constant, given as a Vec4, a Color or four finite numbers. @zh vec4 常量：Vec4、Color 或四个有限数。 */
export type AirScreenConstant = Vec4 | Color | readonly number[];

function toConstant (key: string, value: AirScreenConstant): Vec4 | Color {
    if (value instanceof Vec4 || value instanceof Color) return value;
    if (!Array.isArray(value) || value.length !== 4 || !value.every((component) => Number.isFinite(component)))
        fail('AIR_E_SCREEN_PASS_CONSTANT', `${key} must be a Vec4, a Color or four finite numbers`);
    return new Vec4(value[0], value[1], value[2], value[3]);
}

export interface AirScreenPassOptions {
    /** @en Camera whose output is post-processed. @zh 被后处理的源相机。 */
    camera: Camera;
    /** @en Effect from `createAirScreenEffect`; the pass holds a reference to it. @zh `createAirScreenEffect` 产出的 effect，本 pass 持有一份引用。 */
    effect: EffectAsset;
    /** @en Name of the sampler2D that receives the source colour. @zh 接收源颜色的 sampler2D 名称。 */
    sampler: string;
    /** @en Initial `vec4` constants, applied through the same path as `setConstant`. @zh 初始 vec4 常量，走与 `setConstant` 相同的写入路径。 */
    constants?: Readonly<Record<string, AirScreenConstant>>;
    /** @en Quad layer; must stay invisible to every other camera. @zh quad 图层，必须对其他相机不可见。 */
    layer?: number;
    /** @en Output camera priority; defaults to the source camera priority plus one. @zh 输出相机优先级，默认源相机优先级 +1。 */
    priority?: number;
    /** @en Render-target resolution scale relative to the viewport in device pixels. @zh 相对视口设备像素的 RT 分辨率倍率。 */
    resolutionScale?: number;
    /** @en RT filtering; `nearest` keeps the 1:1 pixel mapping exact. @zh RT 滤波方式，`nearest` 保持 1:1 像素对应。 */
    filter?: 'nearest' | 'linear';
    /** @en RT colour format. @zh RT 颜色格式。 */
    colorFormat?: AirTargetColorFormat;
    /** @en RT depth attachment; keep the default when the source camera renders 3D. @zh RT 深度附件，源相机渲染 3D 时保持默认。 */
    depthFormat?: 'none' | 'depth24-stencil8';
    /**
     * @en Multisample count for the render target. The window framebuffer is usually multisampled,
     *  so a target with `1` sample re-rasterises every edge without that smoothing; match the
     *  window's count when the pass must reproduce the direct path pixel for pixel. A driver that
     *  refuses the request settles on the closest supported count instead of throwing — read
     *  `info.samples` for what the target actually got.
     * @zh RT 的采样数。屏幕帧缓冲默认是多重采样的，`1` 会让所有边在重画时丢掉这层平滑；
     *  要求 pass 与直连路径逐像素一致时，把这里设成窗口实际的采样数。驱动不接受请求值时会自动
     *  降到最近的支持档位而不是抛错，实际拿到多少看 `info.samples`。
     */
    samples?: 1 | 2 | 4 | 8;
    /** @en Clear colour of the screen window behind the quad. @zh quad 之后屏幕窗口的清屏色。 */
    clearColor?: Color;
    /**
     * @en Called with the render-target size whenever it changes, including once at creation.
     *  Effects that need the viewport aspect push their constant from here.
     * @zh RT 尺寸变化时回调（创建时也会调用一次）。需要视口宽高比的效果从这里写回自己的常量。
     */
    onResize?: (width: number, height: number) => void;
    /** @en Prefix for the owned nodes. @zh 自建节点的名字前缀。 */
    name?: string;
}

export interface AirScreenPassInfo {
    readonly width: number;
    readonly height: number;
    /** @en Multisample count the render target actually got, which can be below the request. @zh RT 实际拿到的采样数，可能低于请求值。 */
    readonly samples: number;
    readonly layer: number;
    readonly priority: number;
    readonly enabled: boolean;
    readonly disposed: boolean;
}

function fail (code: string, message: string): never {
    const error = new Error(`[${code}] ${message}`);
    Object.assign(error, { code });
    throw error;
}

/** @en Device pixels covered by a camera viewport; the render target is sized to this. */
function viewportPixels (camera: Camera): { width: number; height: number } {
    const win = screen.windowSize;
    const rect = camera.rect;
    return {
        width: Math.max(1, Math.round(win.width * rect.width)),
        height: Math.max(1, Math.round(win.height * rect.height)),
    };
}

/**
 * @en Route one camera's output through a full-screen effect and draw the result with an owned
 *  higher-priority camera.
 * @zh 把源相机的输出接到全屏效果上，由本 pass 自持的高优先级相机把结果画回屏幕。
 */
export function createAirScreenPass (options: AirScreenPassOptions): AirScreenPass {
    if (!options || typeof options !== 'object') fail('AIR_E_SCREEN_PASS_OPTIONS', 'provide pass options');
    const source = options.camera;
    if (!source || !(source instanceof Camera)) fail('AIR_E_SCREEN_PASS_CAMERA', 'camera must be a Camera component');
    if (!source.isValid) fail('AIR_E_SCREEN_PASS_CAMERA', 'source camera is invalid');
    const scene = source.node.scene;
    if (!scene) fail('AIR_E_SCREEN_PASS_CAMERA', 'source camera must already be in a scene');
    const effect = options.effect;
    if (!(effect instanceof EffectAsset) || !effect.isValid || !effect.shaders.length) fail('AIR_E_SCREEN_PASS_EFFECT', 'effect must be a live EffectAsset from createAirScreenEffect');
    const layer = options.layer ?? AIR_SCREEN_PASS_LAYER;
    if (!Number.isInteger(layer) || layer <= 0 || (layer & (layer - 1)) !== 0) fail('AIR_E_SCREEN_PASS_LAYER', 'layer must be exactly one bit; bits 0-19 are the user range');
    if ((source.visibility & layer) !== 0) fail('AIR_E_SCREEN_PASS_LAYER', `the source camera already sees layer ${layer}; the quad would be fed back into itself`);
    const shader = effect.shaders[0];
    if (!shader.samplerTextures.some((declared) => declared.name === options.sampler)) fail('AIR_E_SCREEN_PASS_SAMPLER', `${String(options.sampler)} is not a sampler of ${effect.name}`);
    const constants = options.constants ?? {};
    const declared = new Set<string>();
    for (const block of shader.blocks) for (const member of block.members) declared.add(member.name);
    for (const key of Object.keys(constants)) if (!declared.has(key)) fail('AIR_E_SCREEN_PASS_CONSTANT', `${key} is not a constant of ${effect.name}`);
    const name = options.name ?? 'air-screen-pass';

    // Anything below can throw (a non-WebGL2 device, a shader that fails to compile, a driver
    // that refuses the texture). Release every resource created so far instead of leaking a
    // registered effect or GPU memory on failure.
    const release = (asset: Asset): void => {
        asset.decRef(false);
        if (asset.refCount === 0) asset.destroy();
    };
    effect.addRef();
    let target: AirRenderTarget | null = null;
    let quadNode: Node | null = null;
    let outputNode: Node | null = null;
    let material: Material | null = null;
    let mesh: Mesh | null = null;
    let unbindSampler: (() => void) | null = null;
    let output: Camera | null = null;
    let renderer: MeshRenderer | null = null;
    // Sequenced release, same order the browser-proven child-target retire path uses: sampler
    // unbind, then owned resources. The camera detach runs before this through `unbind()`.
    const teardown = (): void => {
        unbindSampler?.();
        if (material) release(material);
        if (mesh) release(mesh);
        release(effect);
        quadNode?.destroy();
        outputNode?.destroy();
        target?.dispose();
    };
    try {
        target = createAirRenderTarget({
            name: `${name}-source`,
            ...viewportPixels(source),
            scale: options.resolutionScale ?? 1,
            colorFormat: options.colorFormat ?? 'rgba8',
            depthFormat: options.depthFormat ?? 'depth24-stencil8',
            filter: options.filter ?? 'nearest',
            samples: options.samples ?? 1,
            sampleFallback: 'lower',
        });
        quadNode = new Node(`${name}-quad`);
        quadNode.layer = layer;
        scene.addChild(quadNode);
        outputNode = new Node(`${name}-output`);
        outputNode.setPosition(0, 0, 3);
        scene.addChild(outputNode);
        output = outputNode.addComponent(Camera);
        output.projection = Camera.ProjectionType.ORTHO;
        output.orthoHeight = 1;
        output.near = 0.1;
        output.far = 10;
        output.visibility = layer;
        output.priority = options.priority ?? source.priority + 1;
        output.rect.set(source.rect);
        output.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        output.clearColor = options.clearColor ?? new Color(0, 0, 0, 255);

        material = new Material();
        material.initialize({ effectAsset: effect });
        material.addRef();
        mesh = createMesh({
            positions: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0],
            uvs: [0, 0, 1, 0, 0, 1, 1, 1],
            indices: [0, 1, 2, 1, 3, 2],
        }, undefined, { calculateBounds: true });
        mesh.addRef();
        renderer = quadNode.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setSharedMaterial(material, 0);
        unbindSampler = target.bindColor(material, options.sampler);
        for (const [key, value] of Object.entries(constants)) material.setProperty(key, toConstant(key, value));
        for (const pass of material.passes) pass.update();
    } catch (error) {
        teardown();
        throw error;
    }

    // Keeping the viewport in sync is what makes the mapping 1:1 after a canvas resize. The hook
    // runs on RENDER_CAMERA_BEGIN, before the pipeline first reads `camera.window` for this frame
    // (`src/cocos/rendering/render-pipeline.ts:497-504`), so re-targeting here is still in time.
    const passMaterial = material;
    const passTarget = target;
    const passOutput = output!;
    const passRenderer = renderer!;
    let attached = false;
    let detach: (() => void) | null = null;
    let lastWidth = 0;
    let lastHeight = 0;
    const syncViewport = (): void => {
        const px = viewportPixels(source);
        passOutput.rect.set(source.rect);
        passTarget!.resize(px.width, px.height);
        const size = passTarget!.info;
        if (size.width !== lastWidth || size.height !== lastHeight) {
            lastWidth = size.width;
            lastHeight = size.height;
            options.onResize?.(size.width, size.height);
        }
    };
    const bind = (): void => {
        if (attached) return;
        attached = true;
        detach = passTarget!.attachCamera(source, syncViewport);
    };
    const unbind = (): void => {
        if (!attached) return;
        attached = false;
        detach?.();
        detach = null;
    };
    const apply = (): void => {
        for (const pass of passMaterial!.passes) pass.update();
    };
    bind();

    let enabled = true;
    let disposed = false;
    const setEnabled = (value: boolean): void => {
        if (disposed) fail('AIR_E_SCREEN_PASS_DISPOSED', 'pass has been disposed');
        if (typeof value !== 'boolean') fail('AIR_E_SCREEN_PASS_OPTION', 'enabled must be a boolean');
        enabled = value;
        passOutput.enabled = value;
        passRenderer.enabled = value;
        if (value) bind(); else unbind();
    };

    return {
        material: passMaterial!,
        target: passTarget!,
        camera: passOutput,
        quadNode: quadNode!,
        get enabled (): boolean { return enabled; },
        get info (): Readonly<AirScreenPassInfo> {
            return Object.freeze({ width: passTarget!.info.width, height: passTarget!.info.height, samples: passTarget!.info.samples,
                layer, priority: passOutput.priority, enabled, disposed });
        },
        setConstant (key: string, value: AirScreenConstant): void {
            if (disposed) fail('AIR_E_SCREEN_PASS_DISPOSED', 'pass has been disposed');
            if (!declared.has(key)) fail('AIR_E_SCREEN_PASS_CONSTANT', `${key} is not a constant of ${effect.name}`);
            passMaterial!.setProperty(key, toConstant(key, value));
            apply();
        },
        setEnabled,
        syncViewport,
        dispose (): void {
            if (disposed) return;
            disposed = true;
            unbind();
            teardown();
        },
    };
}

export interface AirScreenPass {
    /** @en Material of the full-screen quad; owns the effect's constants and sampler. @zh 全屏 quad 的材质。 */
    readonly material: Material;
    /** @en Render target holding the source camera output. @zh 承载源相机输出的渲染目标。 */
    readonly target: AirRenderTarget;
    /** @en Owned output camera that draws the quad back to the screen. @zh 自持的输出相机。 */
    readonly camera: Camera;
    /** @en Node carrying the quad renderer. @zh 挂载 quad 的节点。 */
    readonly quadNode: Node;
    readonly enabled: boolean;
    readonly info: Readonly<AirScreenPassInfo>;
    setConstant (key: string, value: AirScreenConstant): void;
    setEnabled (enabled: boolean): void;
    /** @en Re-read the viewport; runs automatically before the source camera renders. @zh 主动同步视口；源相机渲染前会自动执行。 */
    syncViewport (): void;
    dispose (): void;
}
