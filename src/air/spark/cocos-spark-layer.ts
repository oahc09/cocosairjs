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
 * Cocos Air — Spark 高斯泼溅场景图层（SPK-08，源自 spark-cocosairjs/src/CocosSparkLayer.js）。
 *
 * 把冻结的 Spark 泼溅（`SparkRenderer` / `SplatMesh`）挂到真实的 `cc.Node` 与真实的原生
 * `cc.Camera` 组件上，接入既有 app：在选定原生相机的主 framebuffer 或 RenderTexture 之后绘制，
 * 复用既有原生 color/depth 附件。未验证的后处理相机合成显式抛错（深度可能无法保留）。
 *
 * 所有权边界：门面只拥有并释放它新建的 gfx 资源（`renderer.ownsApp = false`），绝不销毁用户的 app；
 * `dispose` 临时把 `renderer.app` 换成空对象以兼容无条件释放 app 的旧渲染器版本。
 * 相机钩子只接受 `after-render | camera-end` 两种，其余显式抛错；`camera-end` 下 WebGL2 PRIMARY
 * 命令即时执行，故每次绘制后恢复原生命令缓冲的 tracked PSO/IA/descriptor，避免后续相机复用未变的原生材质。
 *
 * 本层为 AIR 原创集成层，不进 `cocosair` 根导出面（SPK-05a 硬约束 1）。three 形状符号
 * （`Scene`/`Camera`/`Vector4`）取自本地适配层，Spark 运行时值取自冻结 vendor，绝不写裸 `three` specifier。
 */
import { CocosRenderer } from './cocos-renderer';
import { Camera, Scene } from './spark-api-adapter';
import { Vector4 } from './spark-math';
import { SparkRenderer, SplatMesh } from './generated/spark-runtime';

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface SplatBinding {
    node: any;
    visible: boolean;
}

interface SparkTarget {
    isCocosRenderTarget: true;
    _cocosFramebuffer: any;
    width: number;
    height: number;
    depthBuffer: boolean;
    stencilBuffer: boolean;
    texture: { colorSpace: string };
    viewport: Vector4;
    scissor: Vector4;
    scissorTest: boolean;
}

interface CocosSparkLayerOptions {
    cc: any;
    app: any;
    camera: any;
    canvas?: any;
    sparkOptions?: Record<string, unknown>;
    autoRender?: boolean;
    renderHook?: 'after-render' | 'camera-end' | string;
}

const overlaps = (a: Rect, b: Rect): boolean =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// @air-element none:CocosSparkLayer —— 引擎无 Spark 泼溅场景图层；AIR 自持，把 SplatMesh 绑定到真实 cc.Node/cc.Camera 并复用原生 framebuffer，仅做集成编排不重写上游算法
export class CocosSparkLayer {
    cc: any;
    app: any;
    nativeCamera: any;
    scene: Scene;
    camera: Camera;
    bindings: Map<SplatMesh, SplatBinding>;
    autoRender: boolean;
    renderHook: string;
    renderer: CocosRenderer;
    spark: SparkRenderer;
    renderTarget: SparkTarget | null = null;
    _disposed = false;
    _onRender: () => void;
    _onCameraRender: (native: any) => void;

    constructor({
        cc,
        app,
        camera,
        canvas = app?.canvas,
        sparkOptions = {},
        autoRender = true,
        renderHook = 'after-render',
    }: CocosSparkLayerOptions) {
        if (!cc?.director?.root?.device) throw new Error('CocosSparkLayer requires an initialized CocosAirJS app');
        if (!camera?.node || !camera?.camera)
            throw new Error('camera must be an initialized native cc.Camera component');
        if (!canvas) throw new Error('CocosSparkLayer requires the existing app canvas');
        this.cc = cc;
        this.app = app;
        this.nativeCamera = camera;
        this.scene = new Scene();
        this.camera = new Camera();
        this.camera.matrixAutoUpdate = false;
        this.camera.matrixWorldAutoUpdate = false;
        this.bindings = new Map();
        this.autoRender = autoRender;
        this.renderHook = renderHook;
        this._disposed = false;
        if (!['after-render', 'camera-end'].includes(renderHook as string)) {
            throw new Error('CocosSparkLayer: renderHook must be after-render or camera-end');
        }
        this._validateTarget();
        this.renderer = new CocosRenderer(cc, app, canvas);
        this.renderer.autoClear = false;
        (this.renderer as any).ownsApp = false;
        this.spark = new SparkRenderer({ renderer: this.renderer, ...sparkOptions });
        this.scene.add(this.spark as any);
        this._onRender = () => this.render();
        this._onCameraRender = (native: any) => {
            if (native !== this.nativeCamera.camera) return;
            try {
                this.render();
            } finally {
                (this.renderer.device.commandBuffer as unknown as { bindStates(): void }).bindStates();
            }
        };
        if (autoRender) {
            if (renderHook === 'camera-end') {
                cc.director.root.pipelineEvent.on(cc.PipelineEventType.RENDER_CAMERA_END, this._onCameraRender);
            } else {
                cc.director.on(cc.Director.EVENT_AFTER_RENDER, this._onRender);
            }
        }
        this.sync();
    }

    _validateTarget(): void {
        const component = this.nativeCamera,
            native = component.camera,
            root = this.cc.director.root;
        if (component.usePostProcess || native.usePostProcess) {
            throw new Error(
                'CocosSparkLayer: postprocessed camera composition is unsupported because the final framebuffer may not retain matching depth',
            );
        }
        if (component.targetTexture) {
            if (native.window !== component.targetTexture.window) {
                throw new Error('CocosSparkLayer: camera targetTexture window is not current');
            }
            if (!native.window?.framebuffer?.depthStencilTexture) {
                throw new Error('CocosSparkLayer: targetTexture requires a retained native depth attachment');
            }
        } else if (native.window !== root.mainWindow) {
            throw new Error('CocosSparkLayer: camera window must be the app main window or its targetTexture window');
        }
        if (native.surfaceTransform && native.surfaceTransform !== this.cc.gfx.SurfaceTransform.IDENTITY) {
            throw new Error('CocosSparkLayer: rotated swapchain composition has not been verified');
        }
        if (this.renderHook === 'camera-end' && !(root.pipeline instanceof this.cc.RenderPipeline)) {
            throw new Error(
                'CocosSparkLayer: camera-end composition requires the verified native WebGL2 RenderPipeline',
            );
        }
        if (this.autoRender && this.renderHook === 'after-render') {
            const cameras = native.window.cameras || [],
                own = cameras.indexOf(native);
            for (let index = 0; index < cameras.length; index++) {
                const other = cameras[index];
                if (
                    other !== native &&
                    other.enabled &&
                    (other.priority > native.priority || (other.priority === native.priority && index > own)) &&
                    overlaps(native.viewport, other.viewport)
                ) {
                    throw new Error(
                        'CocosSparkLayer: autoRender requires the selected camera to be the last overlapping camera in its render window; use an explicit pipeline hook with autoRender:false',
                    );
                }
            }
        }
    }

    add({ node, visible = true, ...options }: { node: any; visible?: boolean; [key: string]: any }): SplatMesh {
        if (this._disposed) throw new Error('CocosSparkLayer is disposed');
        if (!node?.worldMatrix) throw new Error('add requires a native cc.Node');
        const mesh = new SplatMesh(options);
        (mesh as any).matrixAutoUpdate = false;
        this.scene.add(mesh as any);
        this.bindings.set(mesh, { node, visible });
        this.sync();
        return mesh;
    }

    setVisible(mesh: SplatMesh, visible: boolean): void {
        const binding = this.bindings.get(mesh);
        if (!binding) throw new Error('Splat mesh is not bound to this layer');
        binding.visible = !!visible;
        this.sync();
    }

    remove(mesh: SplatMesh, { dispose = true }: { dispose?: boolean } = {}): void {
        this.bindings.delete(mesh);
        this.scene.remove(mesh as any);
        if (dispose) (mesh as any).dispose();
    }

    _matrix(native: any, dest: any): any {
        this.cc.Mat4.toArray(dest.elements, native);
        return dest;
    }

    sync(): this {
        if (this._disposed) throw new Error('CocosSparkLayer is disposed');
        this._validateTarget();
        const component = this.nativeCamera,
            native = component.camera;
        native.update(true);
        this._matrix(native.matView, (this.camera as any).matrixWorldInverse);
        (this.camera as any).matrixWorld.copy((this.camera as any).matrixWorldInverse).invert();
        (this.camera as any).matrix.copy((this.camera as any).matrixWorld);
        (this.camera as any).matrixWorld.decompose(
            (this.camera as any).position,
            (this.camera as any).quaternion,
            (this.camera as any).scale,
        );
        this._matrix(native.matProj, (this.camera as any).projectionMatrix);
        this._matrix(native.matProjInv, (this.camera as any).projectionMatrixInverse);
        (this.camera as any).near = native.nearClip;
        (this.camera as any).far = native.farClip;
        (this.camera as any).isPerspectiveCamera = component.projection === this.cc.Camera.ProjectionType.PERSPECTIVE;
        (this.camera as any).isOrthographicCamera = !(this.camera as any).isPerspectiveCamera;
        (this.camera as any).aspect = native.aspect;
        (this.camera as any).zoom = 1;
        const projection = (this.camera as any).projectionMatrix.elements;
        (this.camera as any).fov = (2 * Math.atan(1 / Math.abs(projection[5])) * 180) / Math.PI;
        if ((this.camera as any).isOrthographicCamera) {
            (this.camera as any).left = (-1 - projection[12]) / projection[0];
            (this.camera as any).right = (1 - projection[12]) / projection[0];
            (this.camera as any).bottom = (-1 - projection[13]) / projection[5];
            (this.camera as any).top = (1 - projection[13]) / projection[5];
        }
        (this.camera as any).layers.mask = 1;
        for (const [mesh, binding] of this.bindings) {
            const { node, visible } = binding;
            if (this.cc.isValid && !this.cc.isValid(node)) {
                (mesh as any).visible = false;
                continue;
            }
            this._matrix(node.worldMatrix, (mesh as any).matrix);
            (mesh as any).matrixWorldNeedsUpdate = true;
            (mesh as any).visible =
                visible && node.activeInHierarchy && (native.visibility & node.layer) === node.layer;
            (mesh as any).layers.mask = 1;
        }
        this.scene.updateMatrixWorld(true);
        const width = native.window.width,
            height = native.window.height,
            view = native.viewport;
        (this.renderer as any)._width = width;
        (this.renderer as any)._height = height;
        (this.renderer as any)._pixelRatio = 1;
        (this.renderer as any)._viewport = {
            x: view.x * width,
            y: view.y * height,
            width: view.width * width,
            height: view.height * height,
        };
        (this.renderer as any)._scissor = { ...(this.renderer as any)._viewport };
        (this.renderer as any)._scissorTest = true;
        this._syncRenderTarget(native.window, width, height);
        return this;
    }

    _syncRenderTarget(window: any, width: number, height: number): void {
        const framebuffer = this.nativeCamera.targetTexture ? window.framebuffer : null;
        let target = this.renderTarget;
        if (
            target &&
            (target._cocosFramebuffer !== framebuffer || target.width !== width || target.height !== height)
        ) {
            if (this.renderer.getRenderTarget() === target) this.renderer.setRenderTarget(null);
            this.renderer.releaseRenderTarget(target);
            this.renderTarget = target = null;
        }
        if (framebuffer && !target) {
            target = this.renderTarget = {
                isCocosRenderTarget: true,
                _cocosFramebuffer: framebuffer,
                width,
                height,
                depthBuffer: true,
                stencilBuffer: false,
                texture: { colorSpace: 'srgb-linear' },
                viewport: new Vector4(),
                scissor: new Vector4(),
                scissorTest: true,
            };
        }
        if (target) {
            const v = (this.renderer as any)._viewport;
            target.viewport.set(v.x, v.y, v.width, v.height);
            target.scissor.copy(target.viewport);
        }
    }

    render(): boolean {
        this.sync();
        const component = this.nativeCamera;
        if (component.enabledInHierarchy === false || !component.node.activeInHierarchy || !component.camera.enabled) {
            return false;
        }
        this.renderer.setRenderTarget(this.renderTarget ?? null);
        this.renderer.render(this.scene as any, this.camera as any);
        return true;
    }

    dispose(): void {
        if (this._disposed) return;
        this.cc.director.off(this.cc.Director.EVENT_AFTER_RENDER, this._onRender);
        this.cc.director.root.pipelineEvent.off(this.cc.PipelineEventType.RENDER_CAMERA_END, this._onCameraRender);
        for (const mesh of [...this.bindings.keys()]) this.remove(mesh);
        this.spark.dispose();
        if (this.renderTarget) {
            this.renderer.releaseRenderTarget(this.renderTarget);
            this.renderTarget = null;
        }
        const app = this.renderer.app;
        (this.renderer as any).app = {};
        try {
            this.renderer.dispose();
        } finally {
            (this.renderer as any).app = app;
            this._disposed = true;
        }
    }
}
