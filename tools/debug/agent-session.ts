/**
 * Cocos AIR — Agent Development Session（V0.5.1 T3/T4，计划书 §5/§6）。
 *
 * 开发期专用：显式 attach、显式可写范围的观察/操作/截图/错误收集工具。
 * 本模块【不属于】默认 cocosair Runtime 导出：只在 dev 页面显式 import('/__debug/...') 时加载，
 * 且 'cocosair' 一律留给页面 importmap 解析到 /build/cocosair.module.js ——
 * session 与页面共享同一引擎实例（dev server 打包时 external，jest 经 moduleNameMapper 映射）。
 *
 * 合同要点（冻结）：
 *  - ID 在 session 内稳定（对象键），同名节点不同 ID；节点销毁或场景替换后 STALE_TARGET；
 *  - 观察只读：不增加资产引用、不创建 MaterialInstance、不执行 custom resolver；
 *  - 资产报告复用 tools/verify/runtime-assets.js（含 unchecked，未知状态不写成 PASS）；
 *  - 单条请求 requestId/action/targetId/params → Promise<{ requestId, ok, result|error }>；
 *  - 错误码：INVALID_ARGUMENT / STALE_TARGET / OUT_OF_SCOPE / UNSUPPORTED_ACTION /
 *    LOAD_FAILED / SESSION_CLOSED（captureFrame 另有 CAPTURE_FAILED）；
 *  - requestId 在执行中与保留窗口内重复 → INVALID_ARGUMENT（不要盲目重试 create/add）；
 *  - 同步变更串行执行；无事务/回滚承诺；
 *  - close() 清理 session 自有节点/实例/资产与监听器；对已有节点的显式编辑不撤销；
 *  - captureFrame 在 AFTER_DRAW 受控时机读 canvas；默认不改播放状态；
 *  - 错误收集为有容量上限的环形缓冲，暴露丢弃计数与清理接口；
 *    优先订阅 air-prelude 的分发 hub，不存在时才安装自有 hook，detach 恢复。
 */

import * as cc from 'cocosair';
import type { AirApp } from 'cocosair';
import { inspectRuntimeAssets } from '../../tools/verify/runtime-assets';
import { inspectSkinning } from './skinning-inspector';
import { inspectRenderVisibility } from './render-visibility';

/** 观察请求/操作的统一错误码（计划书 §6.2 最小集合 + capture 专用码）。 */
export type AgentErrorCode =
    | 'INVALID_ARGUMENT'
    | 'STALE_TARGET'
    | 'OUT_OF_SCOPE'
    | 'UNSUPPORTED_ACTION'
    | 'LOAD_FAILED'
    | 'SESSION_CLOSED'
    | 'CAPTURE_FAILED';

export class AgentSessionError extends Error {
    constructor (public readonly code: AgentErrorCode, message: string, public readonly cause?: unknown) {
        super(message);
        this.name = 'AgentSessionError';
    }
}

/** 请求/结果合同（JSON 可序列化）。 */
export interface AgentRequest {
    requestId: string;
    action: string;
    targetId?: string;
    params?: Record<string, unknown>;
}
export interface AgentErrorPayload {
    code: AgentErrorCode;
    message: string;
    /** glTF 等稳定错误码保留在 cause 中，不统一抹平成 LOAD_FAILED。 */
    cause?: { code?: string; message?: string };
}
export type AgentResponse = {
    requestId: string;
    ok: true;
    result: unknown;
} | {
    requestId: string;
    ok: false;
    error: AgentErrorPayload;
};

/** 场景观察结果（§5 观察数据合同：区分组件数、节点数、唯一资源数）。 */
export interface SceneSummary {
    sceneId: string;
    name: string;
    nodeCount: number;
    componentCount: number;
    componentsByType: Record<string, number>;
    cameraCount: number;
    lightCount: number;
    rendererCount: number;
    uniqueAssetCount: { total: number; byKind: Record<string, number> };
    /** 场景树的平铺列表（含 scene 根），超出上限截断并置 truncated。 */
    nodes: { id: string; name: string; parentId: string | null }[];
    truncated: boolean;
}

export interface NodeSummary {
    id: string;
    name: string;
    parentId: string | null;
    childrenIds: string[];
    active: boolean;
    activeSelf: boolean;
    layer: number;
    components: { id: string; type: string; enabled: boolean }[];
    local: { position: number[]; rotationEuler: number[]; scale: number[] };
    world: { position: number[] };
    /** Optional UI/renderer observations; absent components are represented by null. */
    visual: {
        ui: { size: number[]; anchor: number[] } | null;
        label: { text: string; overflow: number; fontSize: number } | null;
        sprite: { frameId: string | null; frameName: string | null; rect: number[] | null;
            textureId: string | null; textureValid: boolean | null;
            frameLabel: string | null; textureLabel: string | null } | null;
        mesh: { meshId: string | null; materialIds: (string | null)[];
            skinning: ReturnType<typeof inspectSkinning> | null;
            visibility: ReturnType<typeof inspectRenderVisibility> } | null;
    };
}

export interface AssetReport {
    ok: boolean;
    counts: Record<string, number>;
    resources: unknown[];
    references: unknown[];
    diagnostics: unknown[];
    unchecked: unknown[];
    truncated: boolean;
}

export interface FrameCapture {
    /** PNG data URL（浏览器侧）。 */
    png: string;
    width: number;
    height: number;
    sceneId: string;
    frameIndex: number;
    sampledAt: string;
}

export interface RuntimeErrorMessage {
    seq: number;
    time: string;
    category: 'window-error' | 'unhandled-rejection' | 'shader' | 'link' | 'session-load' | 'engine-warning' | 'engine-error';
    message: string;
    source?: string;
    requestId?: string;
}

export interface AgentSessionOptions {
    app: AirApp;
    /** 显式可写范围：列出的 Scene 内可执行写操作；缺省 = 只观察（写操作 OUT_OF_SCOPE）。 */
    writableScenes?: cc.Scene[];
    /** 错误环形缓冲上限（默认 200）。 */
    errorBufferLimit?: number;
    /** requestId 保留窗口条数（默认 256，FIFO）。 */
    requestIdWindow?: number;
    /** captureFrame 超时毫秒（默认 5000）。 */
    captureTimeoutMs?: number;
}

const OPERATION_ACTIONS = new Set(['createNode', 'addComponent', 'setTransform', 'loadAsset', 'instantiateAsset']);
/** addComponent 白名单：不按任意字符串动态 import（§6.2）。 */
const COMPONENT_WHITELIST: Record<string, new () => cc.Component> = {
    MeshRenderer: cc.MeshRenderer as unknown as new () => cc.Component,
    Camera: cc.Camera as unknown as new () => cc.Component,
    DirectionalLight: cc.DirectionalLight as unknown as new () => cc.Component,
    PointLight: cc.PointLight as unknown as new () => cc.Component,
    SphereLight: cc.SphereLight as unknown as new () => cc.Component,
    SpotLight: cc.SpotLight as unknown as new () => cc.Component,
    Animation: cc.Animation as unknown as new () => cc.Component,
};

const DEFAULT_ERROR_LIMIT = 200;
const DEFAULT_REQUEST_WINDOW = 256;
const DEFAULT_CAPTURE_TIMEOUT = 5000;
/** 观察结果的行数上限：超出截断并置 truncated（§5）。 */
const INSPECT_ROWS_LIMIT = 500;
const REQUEST_RETENTION_MS = 60_000;

// ---------------------------------------------------------------------------
// 错误收集：hub（air-prelude 分发）优先，否则自有 hook；ref-count 安装/恢复。
// ---------------------------------------------------------------------------

/** air-prelude.js 的分发契约（若页面已注入 prelude 则共享，绝不二次包裹 WebGL）。 */
interface AirErrorHub {
    subscribe (listener: (entry: { category: string; message: string; source?: string }) => void): () => void;
}

declare global {
    interface Window {
        __airErrorHub?: AirErrorHub;
    }
}

interface HookOwnership {
    subscribers: Set<() => void>;
    /** capture 标志必须与安装时一致，否则 removeEventListener 不生效（泄漏为重复条目）。 */
    ownedListeners: { target: EventTarget; type: string; fn: EventListener; capture: boolean }[];
    ownedContextWrap: { original: typeof HTMLCanvasElement.prototype.getContext } | null;
}

const collectors = new WeakMap<HTMLCanvasElement, Collector>();

class Collector {
    private readonly entries: RuntimeErrorMessage[] = [];
    private readonly owners = new Set<AgentSessionImpl>();
    private hook: HookOwnership | null = null;
    private seq = 0;
    private dropped = 0;

    constructor (private readonly limit: number) {}

    static for (app: AirApp, limit: number): Collector {
        const key = app.canvas;
        let collector = collectors.get(key);
        if (!collector) {
            collector = new Collector(limit);
            collectors.set(key, collector);
        }
        return collector;
    }

    attach (session: AgentSessionImpl, app: AirApp): void {
        this.owners.add(session);
        if (this.owners.size > 1 && this.hook) { return; } // 已安装（attach 幂等）
        const ownership: HookOwnership = { subscribers: new Set(), ownedListeners: [], ownedContextWrap: null };
        const push = (category: RuntimeErrorMessage['category'], message: string, source?: string, requestId?: string): void => {
            this.emit({ seq: ++this.seq, time: new Date().toISOString(), category, message, source, requestId });
        };
        // AIR's native diagnostic channel is independent of window errors/shader hooks.
        // Older custom app handles can omit it; no second console wrapper is installed.
        const diagnostics = app.diagnostics;
        if (diagnostics) {
            const collect = (entry: Readonly<import('cocosair').AirDiagnosticMessage>): void => {
                push(entry.severity === 'warning' ? 'engine-warning' : 'engine-error', entry.message,
                    entry.id === null ? undefined : `cocos:${entry.id}`);
            };
            for (const entry of diagnostics.snapshot()) { collect(entry); }
            ownership.subscribers.add(diagnostics.onMessage(collect));
        }
        // 共享 air-prelude hub：只订阅/分发——同一事件绝不能被 hub 与自有监听各记一次
        //（合同：不各自包裹同一 WebGL 函数、不重复安装 window 监听）。
        if (window.__airErrorHub) {
            const unsubscribe = window.__airErrorHub.subscribe((entry) => {
                const known = entry.category as RuntimeErrorMessage['category'];
                const category = known === 'shader' || known === 'link' || known === 'unhandled-rejection' ? known : 'window-error';
                push(category, entry.message, entry.source);
            });
            ownership.subscribers.add(unsubscribe);
        } else {
            // 无 hub 才安装自有 window 监听与 getContext 包裹（shader/link 观察）；detach 恢复原函数。
            const onError = ((event: ErrorEvent) => {
                const isResource = event.target && (event.target as HTMLElement).tagName;
                const target = event.target as HTMLElement & { error?: { code?: number }; src?: string };
                const mediaError = target?.error?.code ?? (target?.parentElement as HTMLMediaElement | null)?.error?.code ?? null;
                push('window-error', isResource
                    ? `RESOURCE: ${target.src || target.tagName} [tag=${target.tagName}, mediaCode=${mediaError}, connected=${target.isConnected}]`
                    : String(event.error && (event.error as Error).stack || event.message).slice(0, 600));
            }) as EventListener;
            const onRejection = ((event: PromiseRejectionEvent) => {
                push('unhandled-rejection', String(event.reason && ((event.reason as Error).stack || event.reason) || event.reason).slice(0, 600));
            }) as EventListener;
            window.addEventListener('error', onError, true);
            window.addEventListener('unhandledrejection', onRejection);
            ownership.ownedListeners.push({ target: window, type: 'error', fn: onError, capture: true });
            ownership.ownedListeners.push({ target: window, type: 'unhandledrejection', fn: onRejection, capture: false });
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
                const gl = original.apply(this, [type, ...rest] as Parameters<typeof original>) as (WebGLRenderingContext & { __agentObserved?: boolean }) | null;
                if (!gl || typeof type !== 'string' || type.indexOf('webgl') !== 0 || gl.__agentObserved) { return gl; }
                gl.__agentObserved = true;
                const check = (queryName: 'getShaderParameter' | 'getProgramParameter', statusName: 'COMPILE_STATUS' | 'LINK_STATUS',
                    logName: 'getShaderInfoLog' | 'getProgramInfoLog', category: 'shader' | 'link') => {
                    const query = gl[queryName] as (o: WebGLShader | WebGLProgram, p: number) => boolean;
                    (gl as unknown as Record<string, unknown>)[queryName] = (object: WebGLShader | WebGLProgram, parameter: number) => {
                        const okResult = query.call(gl, object, parameter);
                        if (parameter === gl[statusName] && !okResult) {
                            push(category, String((gl as WebGLRenderingContext)[logName](object)).slice(0, 600));
                        }
                        return okResult;
                    };
                };
                check('getShaderParameter', 'COMPILE_STATUS', 'getShaderInfoLog', 'shader');
                check('getProgramParameter', 'LINK_STATUS', 'getProgramInfoLog', 'link');
                return gl;
            } as typeof HTMLCanvasElement.prototype.getContext;
            ownership.ownedContextWrap = { original };
        }
        this.hook = ownership;
    }

    detach (session: AgentSessionImpl): void {
        this.owners.delete(session);
        if (this.owners.size > 0 || !this.hook) { return; } // 其他 session 仍在使用
        const { ownedListeners, ownedContextWrap, subscribers } = this.hook;
        for (const unsub of subscribers) { unsub(); }
        for (const { target, type, fn, capture } of ownedListeners) { target.removeEventListener(type, fn, capture); }
        if (ownedContextWrap) { HTMLCanvasElement.prototype.getContext = ownedContextWrap.original; }
        this.hook = null;
    }

    /** 唤醒等待中的 session（getRuntimeErrors 是拉取式，这里仅统一入口）。 */
    private emit (entry: RuntimeErrorMessage): void {
        this.entries.push(entry);
        while (this.entries.length > this.limit) {
            this.entries.shift();
            this.dropped++;
        }
    }

    /** session 自己的加载失败也进入缓冲（category session-load）。 */
    noteSessionLoad (message: string, requestId?: string): void {
        this.emit({ seq: ++this.seq, time: new Date().toISOString(), category: 'session-load', message, requestId });
    }

    list ({ since, limit }: { since?: number; limit?: number }): { errors: RuntimeErrorMessage[]; dropped: number } {
        let source = this.entries;
        if (since !== undefined) {
            source = this.entries.filter((e) => e.seq > since);
        }
        const capped = limit !== undefined ? source.slice(-limit) : source.slice();
        return { errors: capped, dropped: this.dropped };
    }

    clear (): void {
        this.entries.length = 0;
        this.dropped = 0;
    }
}

// ---------------------------------------------------------------------------
// AgentSession
// ---------------------------------------------------------------------------

const sceneIds = new WeakMap<cc.Scene, string>();
let sceneIdCounter = 0;

interface RequestRecord { status: 'running' | 'done'; settledAt: number }

export class AgentSessionImpl {
    readonly id: string;
    private closed = false;
    private idCounter = 0;
    private readonly nodeIds = new Map<cc.Node, string>();
    private readonly nodesById = new Map<string, cc.Node>();
    private readonly componentIds = new Map<cc.Component, string>();
    private readonly assetIds = new Map<cc.Asset, string>();
    private readonly assetsById = new Map<string, cc.Asset>();
    private readonly assetLabels = new Map<cc.Asset, string>();
    private readonly ownedNodes = new Set<cc.Node>();
    private readonly ownedInstances: { id: string; assetId: string; instance: { dispose (): void; root: cc.Node } }[] = [];
    private readonly ownedAssets = new Set<cc.Asset>();
    private readonly requestLog = new Map<string, RequestRecord>();
    private queue: Promise<unknown> = Promise.resolve();
    private captureSeq = 0;
    /** 进行中的 captureFrame：close 时取消监听/定时器并拒绝（§6.3 生命周期）。 */
    private readonly pendingCaptures = new Set<{ cancel (): void; reject (error: AgentSessionError): void }>();
    private readonly collector: Collector;

    constructor (private readonly options: AgentSessionOptions) {
        this.id = `agent-session-${++AgentSessionImpl.counter}`;
        this.collector = Collector.for(options.app, options.errorBufferLimit ?? DEFAULT_ERROR_LIMIT);
        this.collector.attach(this, options.app);
    }

    /** Business-supplied names for assets such as atlas frames; never inferred from a texture UUID. */
    registerAssetLabel (asset: cc.Asset, label: string): void {
        this.requireOpen();
        if (!cc.isValid(asset, true) || !label) { throw new AgentSessionError('INVALID_ARGUMENT', 'a live asset and nonempty label are required'); }
        this.assetLabels.set(asset, label);
    }

    private static counter = 0;

    /** 显式可写范围；未列出 = 只读观察。 */
    private isWritable (node: cc.Node): boolean {
        const writable = this.options.writableScenes ?? [];
        for (const scene of writable) {
            let cursor: cc.Node | null = node;
            while (cursor) {
                if (cursor === scene) { return true; }
                cursor = cursor.parent;
            }
        }
        return false;
    }

    private requireOpen (): void {
        if (this.closed) { throw new AgentSessionError('SESSION_CLOSED', `session ${this.id} is closed`); }
    }

    /** 当前运行场景；未运行/已替换由可达性检查兜底。 */
    private currentScene (): cc.Scene {
        const scene = this.options.app.getScene();
        if (!scene) { throw new AgentSessionError('STALE_TARGET', 'no running scene'); }
        return scene;
    }

    private reachable (node: cc.Node): boolean {
        let cursor: cc.Node | null = node;
        const scene = this.currentScene();
        while (cursor) {
            if (cursor === scene) { return true; }
            cursor = cursor.parent;
        }
        return false;
    }

    // ---- ID 注册（session 内稳定；对象键，同名不同 ID）----

    private nodeId (node: cc.Node): string {
        let id = this.nodeIds.get(node);
        if (!id) {
            id = `node-${++this.idCounter}`;
            this.nodeIds.set(node, id);
            this.nodesById.set(id, node);
        }
        return id;
    }

    private componentId (component: cc.Component): string {
        let id = this.componentIds.get(component);
        if (!id) { id = `comp-${++this.idCounter}`; this.componentIds.set(component, id); }
        return id;
    }

    private assetId (asset: cc.Asset): string {
        let id = this.assetIds.get(asset);
        if (!id) {
            id = `asset-${++this.idCounter}`;
            this.assetIds.set(asset, id);
            this.assetsById.set(id, asset);
        }
        return id;
    }

    /** 按 ID 取有效且仍在当前场景树中的节点；否则 STALE_TARGET（并回收 ID）。 */
    private nodeById (targetId: string | undefined): cc.Node {
        if (!targetId) { throw new AgentSessionError('INVALID_ARGUMENT', 'targetId is required'); }
        const node = this.nodesById.get(targetId);
        if (!node || !cc.isValid(node, true)) {
            this.nodesById.delete(targetId);
            if (node) { this.nodeIds.delete(node); }
            throw new AgentSessionError('STALE_TARGET', `unknown or destroyed target: ${targetId}`);
        }
        if (!this.reachable(node)) {
            throw new AgentSessionError('STALE_TARGET', `target ${targetId} is not in the running scene (scene replaced?)`);
        }
        return node;
    }

    private static number3 (value: unknown, field: string): [number, number, number] {
        if (!Array.isArray(value) || value.length !== 3 || value.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
            throw new AgentSessionError('INVALID_ARGUMENT', `${field} must be [x, y, z] finite numbers`);
        }
        return value as [number, number, number];
    }

    // ---- 观察（§5）----

    inspectScene (): SceneSummary {
        this.requireOpen();
        const scene = this.currentScene();
        let sceneId = sceneIds.get(scene);
        if (!sceneId) {
            sceneId = `scene-${++sceneIdCounter}`;
            sceneIds.set(scene, sceneId);
        }
        const componentsByType: Record<string, number> = {};
        let nodeCount = 0;
        let componentCount = 0;
        let cameraCount = 0;
        let lightCount = 0;
        let rendererCount = 0;
        const nodes: SceneSummary['nodes'] = [];
        let truncated = false;
        const visit = (node: cc.Node, parentId: string | null): void => {
            nodeCount++;
            for (const component of node.components) {
                componentCount++;
                const type = component.constructor.name;
                componentsByType[type] = (componentsByType[type] || 0) + 1;
                if (component instanceof cc.Camera) { cameraCount++; }
                if (component instanceof cc.DirectionalLight || component instanceof cc.SphereLight
                    || component instanceof cc.SpotLight || component instanceof cc.PointLight) { lightCount++; }
                if (component instanceof cc.MeshRenderer || component instanceof cc.SkinnedMeshRenderer) { rendererCount++; }
            }
            const id = this.nodeId(node);
            if (nodes.length < INSPECT_ROWS_LIMIT) {
                nodes.push({ id, name: node.name, parentId });
            } else {
                truncated = true;
            }
            for (const child of node.children) { visit(child, id); }
        };
        visit(scene, null);
        const report = inspectRuntimeAssets(scene, cc);
        const byKind = report.counts as Record<string, number>;
        const total = Object.values(byKind).reduce((sum: number, n: number) => sum + n, 0);
        return {
            sceneId,
            name: scene.name || '',
            nodeCount,
            componentCount,
            componentsByType,
            cameraCount,
            lightCount,
            rendererCount,
            uniqueAssetCount: { total, byKind },
            nodes,
            truncated: truncated || report.resources.length > INSPECT_ROWS_LIMIT,
        };
    }

    inspectNode (targetId: string): NodeSummary {
        this.requireOpen();
        const node = this.nodeById(targetId);
        const parent = node.parent;
        const euler = node.eulerAngles;
        const world = node.worldPosition;
        const ui = node.getComponent(cc.UITransform);
        const label = node.getComponent(cc.Label);
        const sprite = node.getComponent(cc.Sprite);
        const frame = sprite?.spriteFrame;
        const texture = frame?.texture;
        const renderer = node.getComponent(cc.MeshRenderer);
        const rect = frame?.rect;
        return {
            id: this.nodeId(node),
            name: node.name,
            parentId: parent ? this.nodeId(parent) : null,
            childrenIds: node.children.map((child) => this.nodeId(child)),
            active: node.activeInHierarchy,
            activeSelf: node.active,
            layer: node.layer,
            components: node.components.map((component) => ({
                id: this.componentId(component),
                type: component.constructor.name,
                enabled: component.enabledInHierarchy,
            })),
            local: {
                position: [node.position.x, node.position.y, node.position.z],
                rotationEuler: [euler.x, euler.y, euler.z],
                scale: [node.scale.x, node.scale.y, node.scale.z],
            },
            world: { position: [world.x, world.y, world.z] },
            visual: {
                ui: ui ? { size: [ui.width, ui.height], anchor: [ui.anchorX, ui.anchorY] } : null,
                label: label ? { text: label.string, overflow: label.overflow, fontSize: label.fontSize } : null,
                sprite: sprite ? {
                    frameId: frame ? this.assetId(frame) : null,
                    frameName: frame?.name ?? null,
                    rect: rect ? [rect.x, rect.y, rect.width, rect.height] : null,
                    textureId: texture ? this.assetId(texture) : null,
                    textureValid: texture ? cc.isValid(texture, true) : null,
                    frameLabel: frame ? this.assetLabels.get(frame) ?? null : null,
                    textureLabel: texture ? this.assetLabels.get(texture) ?? null : null,
                } : null,
                mesh: renderer ? {
                    meshId: renderer.mesh ? this.assetId(renderer.mesh) : null,
                    materialIds: renderer.sharedMaterials.map((material) => material ? this.assetId(material) : null),
                    skinning: renderer instanceof cc.SkinnedMeshRenderer ? inspectSkinning(renderer) : null,
                    visibility: inspectRenderVisibility(renderer,this.currentScene().getComponentsInChildren(cc.Camera),
                        (bounds,frustum)=>cc.geometry.intersect.aabbFrustum(bounds,frustum)),
                } : null,
            },
        };
    }

    inspectAsset (): AssetReport {
        this.requireOpen();
        const scene = this.currentScene();
        const sessionCollections: Record<string, Set<unknown>> = { meshes: new Set(), materials: new Set(), textures: new Set(), skeletons: new Set(), animations: new Set() };
        for (const asset of this.assetIds.keys()) {
            const owned = (asset as unknown as { owned?: Record<string, unknown[]> }).owned;
            if (!owned) { continue; }
            const kindMap: [string, keyof typeof sessionCollections][] = [
                ['meshes', 'meshes'], ['materials', 'materials'], ['textures', 'textures'], ['skeletons', 'skeletons'], ['animations', 'animations'],
            ];
            for (const [field, kind] of kindMap) {
                for (const item of owned[field] ?? []) { (sessionCollections[kind] as Set<unknown>).add(item); }
            }
        }
        const report = inspectRuntimeAssets(scene, cc, sessionCollections as never);
        const truncated = report.resources.length > INSPECT_ROWS_LIMIT;
        return {
            ok: report.ok,
            counts: report.counts,
            resources: truncated ? report.resources.slice(0, INSPECT_ROWS_LIMIT) : report.resources,
            references: truncated ? report.references.slice(0, INSPECT_ROWS_LIMIT) : report.references,
            diagnostics: report.diagnostics,
            unchecked: report.unchecked,
            truncated,
        };
    }

    // ---- captureFrame（§6.3）----

    captureFrame (): Promise<FrameCapture> {
        this.requireOpen();
        // 请求时的场景快照：绘制回调里场景若已替换，必须报错而不是返回另一场景的画面。
        const sceneAtRequest = this.currentScene();
        const canvas = this.options.app.canvas;
        return new Promise<FrameCapture>((resolve, reject) => {
            const pending = {
                cancel: () => {
                    this.pendingCaptures.delete(pending);
                    cc.director.off(cc.Director.EVENT_AFTER_DRAW, onDraw);
                    clearTimeout(timer);
                },
                reject: (error: AgentSessionError) => {
                    pending.cancel();
                    reject(error);
                },
            };
            const timer = setTimeout(() => {
                pending.reject(new AgentSessionError('CAPTURE_FAILED',
                    `no rendered frame within ${this.options.captureTimeoutMs ?? DEFAULT_CAPTURE_TIMEOUT}ms`));
            }, this.options.captureTimeoutMs ?? DEFAULT_CAPTURE_TIMEOUT);
            const onDraw = (): void => {
                try {
                    if (this.closed) {
                        pending.reject(new AgentSessionError('SESSION_CLOSED', `session ${this.id} is closed`));
                        return;
                    }
                    if (this.currentScene() !== sceneAtRequest) {
                        pending.reject(new AgentSessionError('CAPTURE_FAILED', 'scene replaced between request and draw'));
                        return;
                    }
                    pending.cancel();
                    const sceneId = sceneIds.get(sceneAtRequest) ?? `scene:${sceneAtRequest.name}`;
                    const png = canvas.toDataURL('image/png');
                    if (!png || !png.startsWith('data:image/png')) {
                        throw new Error('canvas produced no PNG data');
                    }
                    resolve({
                        png,
                        width: canvas.width,
                        height: canvas.height,
                        sceneId,
                        frameIndex: ++this.captureSeq,
                        sampledAt: new Date().toISOString(),
                    });
                } catch (error) {
                    pending.cancel();
                    reject(new AgentSessionError('CAPTURE_FAILED',
                        `frame capture failed: ${error instanceof Error ? error.message : String(error)}`));
                }
            };
            this.pendingCaptures.add(pending);
            cc.director.on(cc.Director.EVENT_AFTER_DRAW, onDraw);
        });
    }

    // ---- 错误收集（§6.4）----

    getRuntimeErrors (query?: { since?: number; limit?: number }): { errors: RuntimeErrorMessage[]; dropped: number } {
        this.requireOpen();
        if (query?.since !== undefined && (!Number.isFinite(query.since) || query.since < 0)) {
            throw new AgentSessionError('INVALID_ARGUMENT', 'since must be a non-negative seq number');
        }
        if (query?.limit !== undefined && (!Number.isInteger(query.limit) || query.limit <= 0)) {
            throw new AgentSessionError('INVALID_ARGUMENT', 'limit must be a positive integer');
        }
        return this.collector.list(query ?? {});
    }

    clearRuntimeErrors (): void {
        this.requireOpen();
        this.collector.clear();
    }

    // ---- 操作分发（§6.2）----

    dispatch (request: AgentRequest): Promise<AgentResponse> {
        if (this.closed) {
            return Promise.resolve(this.failure(request, new AgentSessionError('SESSION_CLOSED', `session ${this.id} is closed`)));
        }
        if (!request || typeof request.requestId !== 'string' || !request.requestId
            || typeof request.action !== 'string' || !request.action) {
            return Promise.resolve(this.failure(request, new AgentSessionError('INVALID_ARGUMENT', 'requestId and action are required strings')));
        }
        const existing = this.requestLog.get(request.requestId);
        const now = Date.now();
        if (existing && (existing.status === 'running' || now - existing.settledAt < REQUEST_RETENTION_MS)) {
            return Promise.resolve(this.failure(request, new AgentSessionError('INVALID_ARGUMENT',
                `requestId '${request.requestId}' is ${existing.status === 'running' ? 'already executing' : 'within the retention window'}; do not blind-retry create/addComponent`)));
        }
        // FIFO 清理保留窗口之外的记录
        for (const [key, record] of this.requestLog) {
            if (record.status === 'done' && now - record.settledAt >= REQUEST_RETENTION_MS) { this.requestLog.delete(key); }
        }
        if (this.requestLog.size >= (this.options.requestIdWindow ?? DEFAULT_REQUEST_WINDOW) * 2) {
            const oldest = this.requestLog.keys().next().value;
            if (oldest !== undefined) { this.requestLog.delete(oldest); }
        }
        this.requestLog.set(request.requestId, { status: 'running', settledAt: now });

        // 串行执行；失败不吞掉原始原因。
        const run = this.queue.then(() => this.execute(request));
        this.queue = run.then(() => undefined, () => undefined);
        return run.then(
            (result) => {
                this.markDone(request.requestId);
                return { requestId: request.requestId, ok: true as const, result };
            },
            (error: unknown) => {
                this.markDone(request.requestId);
                if (error instanceof AgentSessionError) { return this.failure(request, error); }
                return {
                    requestId: request.requestId,
                    ok: false as const,
                    error: { code: 'LOAD_FAILED' as const, message: error instanceof Error ? error.message : String(error) },
                };
            },
        );
    }

    private markDone (requestId: string): void {
        const record = this.requestLog.get(requestId);
        if (record) { record.status = 'done'; record.settledAt = Date.now(); }
    }

    private failure (request: Partial<AgentRequest>, error: AgentSessionError): AgentResponse {
        const cause = (error.cause ?? undefined) as unknown;
        return {
            requestId: request?.requestId ?? '',
            ok: false,
            error: {
                code: error.code,
                message: error.message,
                ...(cause && typeof cause === 'object' && 'code' in (cause as object)
                    ? { cause: { code: String((cause as { code: unknown }).code), message: String((cause as { message?: unknown }).message ?? '') } }
                    : {}),
            },
        };
    }

    private async execute (request: AgentRequest): Promise<unknown> {
        this.requireOpen();
        const { action } = request;
        if (!OPERATION_ACTIONS.has(action)) {
            throw new AgentSessionError('UNSUPPORTED_ACTION', `unknown action: ${action}`);
        }
        switch (action) {
            case 'createNode': return this.opCreateNode(request);
            case 'addComponent': return this.opAddComponent(request);
            case 'setTransform': return this.opSetTransform(request);
            case 'loadAsset': return this.opLoadAsset(request);
            case 'instantiateAsset': return this.opInstantiateAsset(request);
            default: throw new AgentSessionError('UNSUPPORTED_ACTION', `unknown action: ${action}`);
        }
    }

    private opCreateNode (request: AgentRequest): { nodeId: string } {
        const params = request.params ?? {};
        const parent = this.nodeById(request.targetId ?? (typeof params.parentId === 'string' ? params.parentId : undefined));
        if (!this.isWritable(parent)) {
            throw new AgentSessionError('OUT_OF_SCOPE', 'parent node is not in the writable scope');
        }
        const name = typeof params.name === 'string' ? params.name : 'agent-node';
        const node = new cc.Node(name);
        parent.addChild(node);
        this.ownedNodes.add(node);
        return { nodeId: this.nodeId(node) };
    }

    private opAddComponent (request: AgentRequest): { componentId: string; type: string } {
        const params = request.params ?? {};
        const node = this.nodeById(request.targetId);
        const typeName = typeof params.component === 'string' ? params.component : '';
        const ctor = COMPONENT_WHITELIST[typeName];
        if (!ctor) {
            throw new AgentSessionError('INVALID_ARGUMENT', `component type '${typeName}' is not in the addComponent whitelist: ${Object.keys(COMPONENT_WHITELIST).join(', ')}`);
        }
        if (!this.isWritable(node)) {
            throw new AgentSessionError('OUT_OF_SCOPE', 'target node is not in the writable scope');
        }
        const component = node.addComponent(ctor);
        return { componentId: this.componentId(component), type: component.constructor.name };
    }

    private opSetTransform (request: AgentRequest): { applied: string[] } {
        const params = request.params ?? {};
        const node = this.nodeById(request.targetId);
        if (!this.isWritable(node)) {
            throw new AgentSessionError('OUT_OF_SCOPE', 'target node is not in the writable scope');
        }
        const space = params.space === 'world' ? 'world' : params.space === 'local' ? 'local' : '';
        if (!space) {
            throw new AgentSessionError('INVALID_ARGUMENT', "params.space must be 'local' or 'world'");
        }
        // 先验证全部参数、再统一应用：任何一步失败都不得留下部分修改（非法请求无副作用）。
        const plan: { kind: 'position' | 'rotationEuler' | 'scale'; value: [number, number, number] }[] = [];
        if (params.position !== undefined) {
            plan.push({ kind: 'position', value: AgentSessionImpl.number3(params.position, 'params.position') });
        }
        if (params.rotationEuler !== undefined) {
            const value = AgentSessionImpl.number3(params.rotationEuler, 'params.rotationEuler');
            if (space === 'world') {
                // world 欧拉角本版仅覆盖父级无旋转的常见情况（限制写入文档）；该检查属于验证，必须
                // 发生在任何应用之前。
                const parentEuler = node.parent ? node.parent.eulerAngles : null;
                if (parentEuler && (parentEuler.x || parentEuler.y || parentEuler.z)) {
                    throw new AgentSessionError('INVALID_ARGUMENT', 'world rotationEuler requires an unrotated parent in this version');
                }
            }
            plan.push({ kind: 'rotationEuler', value });
        }
        if (params.scale !== undefined) {
            const value = AgentSessionImpl.number3(params.scale, 'params.scale');
            if (value.some((v) => v === 0)) {
                throw new AgentSessionError('INVALID_ARGUMENT', 'scale components must be non-zero');
            }
            plan.push({ kind: 'scale', value });
        }
        if (plan.length === 0) {
            throw new AgentSessionError('INVALID_ARGUMENT', 'setTransform requires at least one of position / rotationEuler / scale');
        }
        const applied: string[] = [];
        for (const step of plan) {
            const [x, y, z] = step.value;
            if (step.kind === 'position') {
                if (space === 'local') { node.setPosition(x, y, z); } else { node.setWorldPosition(x, y, z); }
            } else if (step.kind === 'rotationEuler') {
                // world 的父级无旋转约束已在验证期成立：此时 world 欧拉角 == local 欧拉角。
                node.setRotationFromEuler(x, y, z);
            } else {
                if (space === 'local') { node.setScale(x, y, z); } else { node.setWorldScale(x, y, z); }
            }
            applied.push(step.kind);
        }
        return { applied };
    }

    private opLoadAsset (request: AgentRequest): Promise<{ assetId: string; summary: Record<string, unknown> }> {
        const params = request.params ?? {};
        const url = typeof params.url === 'string' ? params.url : '';
        if (!url) {
            return Promise.reject(new AgentSessionError('INVALID_ARGUMENT', 'params.url (string) is required'));
        }
        if (this.closed) { return Promise.reject(new AgentSessionError('SESSION_CLOSED', `session ${this.id} is closed`)); }
        // 走已有公开加载入口；不解析格式、不重新实现 dependency cache / decoder cleanup（§6.2）。
        const loader = new cc.GLTFLoader();
        return loader.loadAsync(url).then((asset) => {
            if (this.closed) {
                // 关闭后完成的加载：本 session 从未持有引用（addRef 尚未发生），
                // 资产归 asset-manager 缓存所有——不得销毁可能被其他消费者共享的对象。
                throw new AgentSessionError('SESSION_CLOSED', `session ${this.id} closed while loading; asset left to its owner`);
            }
            // session 明式持有一份引用：close 只 decRef 自己这份，绝不 destroy 缓存中
            // 可能被其他 session/业务共享的资产（§6.2 "不销毁已有共享资产"）。
            asset.addRef();
            this.ownedAssets.add(asset);
            const summary: Record<string, unknown> = {
                url,
                sceneNames: (asset as unknown as { sceneNames?: readonly string[] }).sceneNames ?? [],
                warnings: (asset as unknown as { warnings?: readonly string[] }).warnings ?? [],
                meshes: (asset as unknown as { meshes?: readonly unknown[] }).meshes?.length ?? 0,
                materials: (asset as unknown as { materials?: readonly unknown[] }).materials?.length ?? 0,
                textures: (asset as unknown as { textures?: readonly unknown[] }).textures?.length ?? 0,
                animations: (asset as unknown as { animations?: readonly unknown[] }).animations?.length ?? 0,
            };
            return { assetId: this.assetId(asset), summary };
        }, (error: unknown) => {
            this.collector.noteSessionLoad(`loadAsset ${url} failed: ${error instanceof Error ? error.message : String(error)}`, request.requestId);
            // glTF 稳定错误码保留在 cause 中，不仅转换成无差别 LOAD_FAILED。
            const code = (error as { code?: string })?.code;
            throw new AgentSessionError('LOAD_FAILED',
                `loadAsset failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
                code ? { code, message: error instanceof Error ? error.message : String(error) } : undefined);
        });
    }

    private opInstantiateAsset (request: AgentRequest): { instanceId: string; nodeId: string; assetId: string } {
        const params = request.params ?? {};
        const assetId = request.targetId ?? (typeof params.assetId === 'string' ? params.assetId : undefined);
        if (!assetId) { throw new AgentSessionError('INVALID_ARGUMENT', 'targetId or params.assetId is required'); }
        const asset = this.assetsById.get(assetId);
        if (!asset || !cc.isValid(asset, true)) {
            throw new AgentSessionError('STALE_TARGET', `unknown or destroyed asset: ${assetId}`);
        }
        const instantiate = (asset as unknown as { instantiate?: (sceneIndex?: number) => { dispose (): void; root: cc.Node } }).instantiate;
        if (typeof instantiate !== 'function') {
            throw new AgentSessionError('UNSUPPORTED_ACTION', `asset ${assetId} has no instantiate capability`);
        }
        let parent: cc.Node | null = null;
        if (typeof params.parentId === 'string') {
            parent = this.nodeById(params.parentId);
            if (!this.isWritable(parent)) {
                throw new AgentSessionError('OUT_OF_SCOPE', 'params.parentId is not in the writable scope');
            }
        }
        const instance = instantiate.call(asset, typeof params.sceneIndex === 'number' ? params.sceneIndex : undefined);
        if (parent) { parent.addChild(instance.root); }
        this.ownedInstances.push({
            id: `instance-${++this.idCounter}`,
            assetId,
            instance,
        });
        const record = this.ownedInstances[this.ownedInstances.length - 1];
        return { instanceId: record.id, nodeId: this.nodeId(instance.root), assetId };
    }

    // ---- 生命周期 ----

    /**
     * 关闭 session：移除监听器与观察 hook，取消进行中的 capture，销毁 session 自有
     * 节点/实例，并只释放自己持有的资产引用（decRef——不销毁可能被共享的资产）；
     * 已有节点的显式编辑不自动撤销。之后所有请求返回 SESSION_CLOSED。
     */
    close (): void {
        if (this.closed) { return; }
        this.closed = true;
        this.collector.detach(this);
        // 进行中的 captureFrame：取消监听与定时器，以 SESSION_CLOSED 拒绝。
        for (const pending of Array.from(this.pendingCaptures)) {
            pending.reject(new AgentSessionError('SESSION_CLOSED', `session ${this.id} is closed`));
        }
        this.pendingCaptures.clear();
        for (const instance of this.ownedInstances) {
            try { instance.instance.dispose(); } catch { /* 引擎已回收 */ }
        }
        this.ownedInstances.length = 0;
        for (const asset of this.ownedAssets) {
            if (cc.isValid(asset, true)) { asset.decRef(); }
        }
        this.ownedAssets.clear();
        for (const node of this.ownedNodes) {
            if (cc.isValid(node, true)) { node.destroy(); }
        }
        this.ownedNodes.clear();
        // 释放全部强引用映射（componentIds/assetIds/assetsById 也持有 Component/Asset）。
        this.nodesById.clear();
        this.nodeIds.clear();
        this.componentIds.clear();
        this.assetIds.clear();
        this.assetsById.clear();
        this.assetLabels.clear();
        this.requestLog.clear();
    }
}

/** 显式 attach 一个 agent development session（默认只观察；可写范围必须显式给出）。 */
export function createAgentSession (options: AgentSessionOptions): AgentSessionImpl {
    return new AgentSessionImpl(options);
}
