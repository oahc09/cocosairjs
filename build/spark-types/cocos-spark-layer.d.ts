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
    texture: {
        colorSpace: string;
    };
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
export declare class CocosSparkLayer {
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
    renderTarget: SparkTarget | null;
    _disposed: boolean;
    _onRender: () => void;
    _onCameraRender: (native: any) => void;
    constructor({ cc, app, camera, canvas, sparkOptions, autoRender, renderHook, }: CocosSparkLayerOptions);
    _validateTarget(): void;
    add({ node, visible, ...options }: {
        node: any;
        visible?: boolean;
        [key: string]: any;
    }): SplatMesh;
    setVisible(mesh: SplatMesh, visible: boolean): void;
    remove(mesh: SplatMesh, { dispose }?: {
        dispose?: boolean;
    }): void;
    _matrix(native: any, dest: any): any;
    sync(): this;
    _syncRenderTarget(window: any, width: number, height: number): void;
    render(): boolean;
    dispose(): void;
}
export {};
