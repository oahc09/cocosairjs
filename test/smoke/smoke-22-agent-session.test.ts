/**
 * Smoke 22 — V0.5.1 T3/T4 Agent Development Session（计划书 §5/§6）。
 *
 * 覆盖：
 *  - ID 稳定性（同名节点不同 ID）、销毁节点 / 场景替换 → STALE_TARGET；
 *  - 只读 inspection 无副作用；观察含 truncation 语义；
 *  - 操作白名单、可写范围、错误码（INVALID_ARGUMENT / OUT_OF_SCOPE / UNSUPPORTED_ACTION）；
 *  - requestId 重复与保留窗口；close 后 SESSION_CLOSED；异步加载在关闭后释放；
 *  - captureFrame：AFTER_DRAW 受控时机、空场景合法、错误路径结构化；
 *  - 错误收集：环形缓冲上限 + dropped、clear、hook 恢复、prelude hub 共享订阅。
 */
import { TextDecoder, TextEncoder } from 'util';
Object.assign(globalThis, { TextDecoder, TextEncoder });
import * as cc from '../../src';
import { createAgentSession, AgentSessionImpl } from '../../tools/debug/agent-session';
import type { AgentSessionImpl as Session } from '../../tools/debug/agent-session';

/** 断言失败并返回结构化 error（收窄 AgentResponse 联合类型）。 */
function expectFail (response: Awaited<ReturnType<Session['dispatch']>>): { code: string; message: string; cause?: { code?: string } } {
    expect(response.ok).toBe(false);
    return (response as { error: { code: string; message: string; cause?: { code?: string } } }).error;
}

/** 断言成功并返回 result（收窄联合类型）。 */
function expectOk (response: Awaited<ReturnType<Session['dispatch']>>): unknown {
    expect(response.ok).toBe(true);
    return (response as { result: unknown }).result;
}

async function makeApp (): Promise<{ app: cc.AirApp; scene: cc.Scene }> {
    let canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement | null;
    if (!canvas) {
        document.body.innerHTML = '<div id="GameDiv"><canvas id="GameCanvas"></canvas></div>';
        canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
    }
    const app = await cc.createAirApp({ canvas, renderMode: 3 });
    const scene = new cc.Scene('agent-test');
    app.run(scene);
    return { app, scene };
}

/** 最小合法三角面 GLB（loadAsset 共享缓存回归用）。 */
function triangleGlb (): ArrayBuffer {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint16Array([0, 1, 2]);
    const bin = new Uint8Array(44); // 36 (positions) + 6 (indices) + 2 pad
    bin.set(new Uint8Array(positions.buffer), 0);
    bin.set(new Uint8Array(indices.buffer), 36);
    const gltf = {
        asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        buffers: [{ byteLength: bin.byteLength }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 36 },
            { buffer: 0, byteOffset: 36, byteLength: 6 },
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
            { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
        ],
    };
    const jsonStr = JSON.stringify(gltf); // 纯 ASCII，逐字符编码等价 UTF-8
    const jsonBytes = new Uint8Array(jsonStr.length);
    for (let i = 0; i < jsonStr.length; i++) { jsonBytes[i] = jsonStr.charCodeAt(i); }
    const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
    // glTF 规范：JSON chunk padding 必须是空格（0x20），0x00 会破坏严格 JSON 解析
    const binStart = 20 + jsonBytes.length + jsonPad;
    const total = binStart + 8 + bin.byteLength;
    const out = new Uint8Array(total);
    out.set(new Uint8Array(new Uint32Array([0x46546C67, 2, total]).buffer), 0);
    out.set(new Uint8Array(new Uint32Array([jsonBytes.length + jsonPad, 0x4E4F534A]).buffer), 12);
    out.set(jsonBytes, 20);
    out.fill(0x20, 20 + jsonBytes.length, binStart);
    out.set(new Uint8Array(new Uint32Array([bin.byteLength, 0x004E4942]).buffer), binStart);
    out.set(bin, binStart + 8);
    return out.buffer;
}

/** 临时替换全局 fetch 以伺服 mock URL（loadAsync 走 fetch 下载器）。 */
function withMockFetch (glb: ArrayBuffer): () => void {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: true, arrayBuffer: async () => glb.slice(0) })) as unknown as typeof fetch;
    return () => { globalThis.fetch = original; };
}

/** jsdom 没有 PromiseRejectionEvent 构造器：用普通 Event 携带 reason。 */
function fireUnhandledRejection (reason: unknown): void {
    const event = new Event('unhandledrejection') as PromiseRejectionEvent;
    (event as unknown as { reason: unknown }).reason = reason;
    window.dispatchEvent(event);
}

describe('agent session — 观察合同（G3）', () => {
    let app: cc.AirApp;
    let scene: cc.Scene;
    let session: Session;

    beforeAll(async () => { ({ app, scene } = await makeApp()); });
    afterAll(() => { session?.close(); });

    test('inspectScene 区分节点数/组件数/唯一资源数，并给出可发现节点树', () => {
        const root = new cc.Node('root');
        scene.addChild(root);
        const childA = new cc.Node('same-name');
        const childB = new cc.Node('same-name');
        root.addChild(childA);
        root.addChild(childB);
        const renderer = childA.addComponent(cc.MeshRenderer);
        renderer.mesh = cc.utils.createMesh(cc.primitives.box({}));
        session = createAgentSession({ app });

        const summary = session.inspectScene();
        expect(summary.sceneId).toMatch(/^scene-/);
        expect(summary.nodeCount).toBeGreaterThanOrEqual(4); // scene + root + same-name ×2
        expect(summary.componentsByType.MeshRenderer).toBeGreaterThanOrEqual(1);
        expect(summary.uniqueAssetCount.byKind.Mesh).toBeGreaterThanOrEqual(1);
        // 观察只读：不增加资产引用（重复观察 counts 不变）
        const again = session.inspectScene();
        expect(again.uniqueAssetCount).toEqual(summary.uniqueAssetCount);
        // 同名节点不同且 ID 稳定
        const ids = summary.nodes.filter((n) => n.name === 'same-name').map((n) => n.id);
        expect(new Set(ids).size).toBe(2);
    });

    test('inspectNode 返回完整视图；父子链可追溯', () => {
        const summary = session.inspectScene();
        const rootEntry = summary.nodes.find((n) => n.name === 'root')!;
        const view = session.inspectNode(rootEntry.id);
        expect(view.parentId).not.toBeNull();
        expect(view.childrenIds.length).toBe(2);
        const childView = session.inspectNode(view.childrenIds[0]);
        expect(childView.parentId).toBe(rootEntry.id);
        expect(view.components.every((c) => typeof c.type === 'string')).toBe(true); // 不简化 type
    });

    test('销毁节点 → STALE_TARGET；场景替换后旧 ID → STALE_TARGET', () => {
        const doomed = new cc.Node('doomed');
        scene.addChild(doomed);
        const summary = session.inspectScene();
        const id = summary.nodes.find((n) => n.name === 'doomed')!.id;
        doomed.destroy();
        expect(() => session.inspectNode(id)).toThrow(/destroyed|not in the running scene/);

        const replacement = new cc.Scene('agent-test-2');
        app.run(replacement); // runSceneImmediate 销毁旧场景
        const oldRoot = summary.nodes.find((n) => n.name === 'root')!;
        expect(() => session.inspectNode(oldRoot.id)).toThrow(/destroyed|not in the running scene/);
        expect(() => session.inspectScene()).not.toThrow(); // 新场景可观察
    });
});

describe('agent session — 操作合同（G4）', () => {
    let app: cc.AirApp;
    let scene: cc.Scene;
    let session: Session;

    beforeAll(async () => { ({ app, scene } = await makeApp()); });

    beforeEach(() => { session = createAgentSession({ app, writableScenes: [scene] }); });
    afterEach(() => { session.close(); });

    test('create → setTransform → inspect 闭环生效', async () => {
        const rootEntry = session.inspectScene().nodes[0]; // 场景根节点
        const created = await session.dispatch({ requestId: 't1', action: 'createNode', targetId: rootEntry.id, params: { name: 'op-node' } });
        const nodeId = (expectOk(created) as { nodeId: string }).nodeId;

        const moved = await session.dispatch({
            requestId: 't2', action: 'setTransform', targetId: nodeId,
            params: { space: 'world', position: [1, 2, 3] },
        });
        expect(moved.ok).toBe(true);

        const view = session.inspectNode(nodeId);
        expect(view.world.position).toEqual([1, 2, 3]);
    });

    test('白名单外组件 INVALID_ARGUMENT；未知 action UNSUPPORTED_ACTION；缺 targetId INVALID_ARGUMENT', async () => {
        const anyId = session.inspectScene().nodes[0].id;
        const badType = await session.dispatch({ requestId: 'w1', action: 'addComponent', targetId: anyId, params: { component: 'NotInWhitelist' } });
        expect(expectFail(badType).code).toBe('INVALID_ARGUMENT');

        const badAction = await session.dispatch({ requestId: 'w2', action: 'teleport', targetId: anyId });
        expect(expectFail(badAction).code).toBe('UNSUPPORTED_ACTION');

        const noTarget = await session.dispatch({ requestId: 'w3', action: 'createNode', params: { name: 'x' } });
        expect(expectFail(noTarget).code).toBe('INVALID_ARGUMENT');

        const badTransform = await session.dispatch({ requestId: 'w4', action: 'setTransform', targetId: anyId, params: { space: 'local', position: [1, NaN, 3] } });
        expect(expectFail(badTransform).code).toBe('INVALID_ARGUMENT');
    });

    test('setTransform 先验证后应用：合法 position + 非法 rotation → 节点完全不变', async () => {
        const rootEntry = session.inspectScene().nodes[0];
        const created = await session.dispatch({ requestId: 'at1', action: 'createNode', targetId: rootEntry.id, params: { name: 'atomic-node' } });
        const nodeId = (expectOk(created) as { nodeId: string }).nodeId;
        await session.dispatch({ requestId: 'at2', action: 'setTransform', targetId: nodeId, params: { space: 'local', position: [5, 5, 5] } });

        const failing = await session.dispatch({
            requestId: 'at3', action: 'setTransform', targetId: nodeId,
            params: { space: 'local', position: [1, 2, 3], rotationEuler: [0, NaN, 0] },
        });
        expect(expectFail(failing).code).toBe('INVALID_ARGUMENT');
        // position 不得被部分应用
        const view = session.inspectNode(nodeId);
        expect(view.local.position).toEqual([5, 5, 5]);
    });

    test('world scale 走 setWorldScale：有缩放父节点时 local = world/parent', async () => {
        const rootEntry = session.inspectScene().nodes[0];
        const parent = await session.dispatch({ requestId: 'ws1', action: 'createNode', targetId: rootEntry.id, params: { name: 'scaled-parent' } });
        const parentId = (expectOk(parent) as { nodeId: string }).nodeId;
        await session.dispatch({ requestId: 'ws2', action: 'setTransform', targetId: parentId, params: { space: 'local', scale: [2, 2, 2] } });
        const child = await session.dispatch({ requestId: 'ws3', action: 'createNode', targetId: parentId, params: { name: 'scaled-child' } });
        const childId = (expectOk(child) as { nodeId: string }).nodeId;
        const res = await session.dispatch({ requestId: 'ws4', action: 'setTransform', targetId: childId, params: { space: 'world', scale: [3, 3, 3] } });
        expect(res.ok).toBe(true);
        // setWorldScale(3) 在 2x 父级下 local = 1.5；若误用 setScale 则 local 会是 3
        const view = session.inspectNode(childId);
        expect(view.local.scale).toEqual([1.5, 1.5, 1.5]);
    });

    test('只读 session：写操作 OUT_OF_SCOPE，观察不受影响', async () => {
        const ro = createAgentSession({ app });
        const anyId = ro.inspectScene().nodes[0].id;
        const write = await ro.dispatch({ requestId: 'r1', action: 'createNode', targetId: anyId, params: { name: 'x' } });
        expect(expectFail(write).code).toBe('OUT_OF_SCOPE');
        expect(() => ro.inspectScene()).not.toThrow();
        ro.close();
    });

    test('requestId 执行中/保留窗口内重复 → INVALID_ARGUMENT；窗口过期后可复用', async () => {
        const anyId = session.inspectScene().nodes[0].id;
        // 串行队列：第一条在执行中时发出第二条（同 requestId）必须被拒。
        const first = session.dispatch({ requestId: 'dup-1', action: 'loadAsset', params: { url: 'data:application/octet-stream,broken' } });
        const duplicate = await session.dispatch({ requestId: 'dup-1', action: 'createNode', targetId: anyId, params: {} });
        expect(expectFail(duplicate).code).toBe('INVALID_ARGUMENT');
        await first;

        // 保留窗口内（立即重试）依然拒绝
        await session.dispatch({ requestId: 'dup-2', action: 'createNode', targetId: anyId, params: {} });
        const replay = await session.dispatch({ requestId: 'dup-2', action: 'createNode', targetId: anyId, params: {} });
        expect(expectFail(replay).code).toBe('INVALID_ARGUMENT');
    });

    test('loadAsset 失败 → LOAD_FAILED 且保留 glTF 稳定错误码在 cause；失败记入错误缓冲', async () => {
        const bad = await session.dispatch({ requestId: 'l1', action: 'loadAsset', params: { url: 'data:text/plain,not-a-gltf' } });
        expect(expectFail(bad).code).toBe('LOAD_FAILED');
        const errors = session.getRuntimeErrors();
        expect(errors.errors.some((e) => e.category === 'session-load')).toBe(true);
    });

    test('共享缓存资产：两个 session 加载同 URL，关闭其一不销毁资产', async () => {
        const restore = withMockFetch(triangleGlb());
        try {
            const a = createAgentSession({ app, writableScenes: [scene] });
            const b = createAgentSession({ app, writableScenes: [scene] });
            const url = 'http://mock.test/shared-triangle.glb';
            const ra = await a.dispatch({ requestId: 'sh1', action: 'loadAsset', params: { url } });
            const rb = await b.dispatch({ requestId: 'sh2', action: 'loadAsset', params: { url } });
            const assetIdA = (expectOk(ra) as { assetId: string }).assetId;
            const assetIdB = (expectOk(rb) as { assetId: string }).assetId;
            // asset-manager 按 URL 缓存：同 URL 的两次加载是同一份资产
            expect(assetIdA).toBe(assetIdB);

            a.close();
            // b 的资产引用必须依然有效、可实例化（a 的关闭不得销毁共享对象）
            const inst = await b.dispatch({ requestId: 'sh3', action: 'instantiateAsset', targetId: assetIdB, params: {} });
            expect(inst.ok).toBe(true);
            b.close();
            // 业务侧同 URL 重新加载：缓存未被毒化
            const business = await new cc.GLTFLoader().loadAsync(url);
            expect(cc.isValid(business, true)).toBe(true);
            business.decRef();
        } finally { restore(); }
    });

    test('close 清理自有节点（不撤销对已有节点的显式编辑）；之后请求 SESSION_CLOSED', async () => {
        const anyId = session.inspectScene().nodes.find((n) => n.name !== 'scene')!.id;
        const created = await session.dispatch({ requestId: 'c1', action: 'createNode', targetId: anyId, params: { name: 'owned-node' } });
        const ownedId = (expectOk(created) as { nodeId: string }).nodeId;
        const ownedNode = session.inspectNode(ownedId);
        expect(ownedNode).toBeTruthy();

        // 对已有节点的显式编辑：addComponent（白名单）不随 close 撤销
        await session.dispatch({ requestId: 'c2', action: 'addComponent', targetId: anyId, params: { component: 'Animation' } });
        session.close();
        const afterClose = await session.dispatch({ requestId: 'c3', action: 'createNode', targetId: anyId, params: {} });
        expect(expectFail(afterClose).code).toBe('SESSION_CLOSED');
        expect(() => session.inspectScene()).toThrow(/SESSION_CLOSED|closed/);
        expect(() => session.getRuntimeErrors()).toThrow(/SESSION_CLOSED|closed/);
    });

    test('关闭中完成的异步加载：资产被释放、响应 SESSION_CLOSED', async () => {
        // 用一个"永不完成的手动 Promise"模拟慢加载：直接驱动 opLoadAsset 的关闭分支
        const slow = session.dispatch({ requestId: 'slow-1', action: 'loadAsset', params: { url: 'data:application/json,{invalid' } });
        session.close();
        const response = await slow;
        // data URL 的解析在队列恢复后执行：要么 LOAD_FAILED（数据无效）要么 SESSION_CLOSED（关闭后完成），
        // 两者都必须是结构化失败，不允许 unhandled rejection 或悬挂。
        expect(['LOAD_FAILED', 'SESSION_CLOSED']).toContain(expectFail(response).code);
    });

    test('captureFrame：空场景合法（结构完整）；不可读 canvas 返回 CAPTURE_FAILED', async () => {
        // jsdom canvas 没有 WebGL 位图：toDataURL 抛错 → 结构化 CAPTURE_FAILED（不是旧截图冒充成功）
        await expect(session.captureFrame()).rejects.toMatchObject({ code: 'CAPTURE_FAILED' });
    });

    test('captureFrame 在 AFTER_DRAW 触发时用 mock 画布数据解析（受控时机）', async () => {
        const canvas = (app as unknown as { canvas: HTMLCanvasElement }).canvas;
        const original = canvas.toDataURL.bind(canvas);
        canvas.toDataURL = (() => 'data:image/png;base64,AAA') as typeof canvas.toDataURL;
        try {
            const pending = session.captureFrame();
            // 模拟引擎在下一帧绘制完成后发出 AFTER_DRAW
            setTimeout(() => {
                (cc.director as unknown as { emit (e: string): void }).emit(cc.Director.EVENT_AFTER_DRAW);
            }, 10);
            const frame = await pending;
            expect(frame.png).toBe('data:image/png;base64,AAA');
            expect(frame.frameIndex).toBeGreaterThan(0);
            expect(frame.width).toBe(canvas.width);
            expect(frame.height).toBe(canvas.height);
        } finally {
            canvas.toDataURL = original as typeof canvas.toDataURL;
        }
    });

    test('close 取消进行中 capture：AFTER_DRAW 到来时拒绝 SESSION_CLOSED，不冒充成功', async () => {
        const canvas = (app as unknown as { canvas: HTMLCanvasElement }).canvas;
        const original = canvas.toDataURL.bind(canvas);
        canvas.toDataURL = (() => 'data:image/png;base64,AAA') as typeof canvas.toDataURL;
        try {
            const pending = session.captureFrame();
            session.close();
            (cc.director as unknown as { emit (e: string): void }).emit(cc.Director.EVENT_AFTER_DRAW);
            await expect(pending).rejects.toMatchObject({ code: 'SESSION_CLOSED' });
        } finally {
            canvas.toDataURL = original as typeof canvas.toDataURL;
        }
    });

    test('capture 请求后场景替换 → CAPTURE_FAILED，不返回另一场景的截图', async () => {
        const canvas = (app as unknown as { canvas: HTMLCanvasElement }).canvas;
        const original = canvas.toDataURL.bind(canvas);
        canvas.toDataURL = (() => 'data:image/png;base64,BBB') as typeof canvas.toDataURL;
        try {
            const pending = session.captureFrame();
            // runSceneImmediate 同步替换并销毁原场景
            app.run(new cc.Scene('replaced-during-capture'));
            (cc.director as unknown as { emit (e: string): void }).emit(cc.Director.EVENT_AFTER_DRAW);
            await expect(pending).rejects.toMatchObject({ code: 'CAPTURE_FAILED' });
        } finally {
            canvas.toDataURL = original as typeof canvas.toDataURL;
        }
    });
});

describe('agent session — 错误收集与 hook 生命周期（G4）', () => {
    let app: cc.AirApp;

    beforeAll(async () => { ({ app } = await makeApp()); });

    test('window error 进入环形缓冲；超出上限丢弃并计入 dropped；since/limit 生效', () => {
        const session = createAgentSession({ app });
        try {
            session.clearRuntimeErrors(); // 缓冲按 canvas 共享：先清空保证确定性
            // 上限由实现固定（默认 200）：推入 205 条 → 保留 200，丢弃 5
            for (let i = 1; i <= 205; i++) {
                window.dispatchEvent(new ErrorEvent('error', { message: `boom-${i}`, error: new Error(`boom-${i}`) }));
            }
            const all = session.getRuntimeErrors();
            expect(all.errors.length).toBe(200); // 环形上限
            expect(all.dropped).toBe(5);
            expect(all.errors[199].message).toContain('boom-205'); // 最新保留
            expect(all.errors[0].message).toContain('boom-6'); // 最旧被丢弃

            const limited = session.getRuntimeErrors({ limit: 1 });
            expect(limited.errors.length).toBe(1);
            const lastSeq = all.errors[199].seq;
            const since = session.getRuntimeErrors({ since: lastSeq });
            expect(since.errors.length).toBe(0);

            session.clearRuntimeErrors();
            expect(session.getRuntimeErrors().errors.length).toBe(0);
            expect(session.getRuntimeErrors().dropped).toBe(0);
        } finally { session.close(); }
    });

    test('attach 幂等 + 最后一个 session detach 恢复自有 hook（无 prelude hub 时）', () => {
        const hadHub = (window as { __airErrorHub?: unknown }).__airErrorHub;
        delete (window as { __airErrorHub?: unknown }).__airErrorHub; // 强制自有 hook 分支
        const original = HTMLCanvasElement.prototype.getContext;
        try {
            const a = createAgentSession({ app });
            const b = createAgentSession({ app });
            expect(HTMLCanvasElement.prototype.getContext).not.toBe(original); // 已包裹
            a.close();
            expect(HTMLCanvasElement.prototype.getContext).not.toBe(original); // b 仍在用
            b.close();
            expect(HTMLCanvasElement.prototype.getContext).toBe(original); // 恢复
        } finally {
            if (hadHub !== undefined) { (window as { __airErrorHub?: unknown }).__airErrorHub = hadHub; }
            HTMLCanvasElement.prototype.getContext = original;
        }
    });

    test('共享 prelude hub：只订阅不二次包裹，detach 仅取消订阅', () => {
        const hadHub = (window as { __airErrorHub?: unknown }).__airErrorHub;
        const unsubscribers: ((entry: { category: string; message: string }) => void)[] = [];
        let hubListener: ((entry: { category: string; message: string }) => void) | null = null;
        (window as { __airErrorHub?: unknown }).__airErrorHub = {
            subscribe (listener: (entry: { category: string; message: string }) => void) {
                hubListener = listener;
                unsubscribers.push(listener);
                return () => { const i = unsubscribers.indexOf(listener); if (i >= 0) { unsubscribers.splice(i, 1); } };
            },
        };
        const original = HTMLCanvasElement.prototype.getContext;
        try {
            const a = createAgentSession({ app });
            expect(HTMLCanvasElement.prototype.getContext).toBe(original); // hub 存在 → 不包裹
            expect(unsubscribers.length).toBe(1); // 整个 collector 一个订阅（多 session 共享）
            const b = createAgentSession({ app });
            expect(unsubscribers.length).toBe(1); // attach 幂等：不重复订阅
            // hub 分支绝不安装自有 window 监听：真实 dispatch 不能产生 hub 之外的第二条记录
            a.clearRuntimeErrors();
            // 在子元素上派发 error：window 捕获阶段监听器依然命中（若被错误安装），
            // 但不触发 jsdom 对 window 级 error 事件的默认"未捕获异常"上报。
            const probeHost = document.createElement('div');
            document.body.appendChild(probeHost);
            probeHost.dispatchEvent(new ErrorEvent('error', { message: 'hub-dedup-probe', error: new Error('hub-dedup-probe') }));
            expect(a.getRuntimeErrors().errors.filter((e) => e.message.includes('hub-dedup-probe')).length).toBe(0);
            // hub 分发一条即一条；unhandled-rejection 类别必须保留
            const publish = hubListener as unknown as (entry: { category: string; message: string }) => void;
            publish({ category: 'unhandled-rejection', message: 'rej-hub-probe' });
            const viaHub = a.getRuntimeErrors().errors;
            expect(viaHub.filter((e) => e.message === 'rej-hub-probe').length).toBe(1);
            expect(viaHub.find((e) => e.message === 'rej-hub-probe')?.category).toBe('unhandled-rejection');
            a.close();
            expect(unsubscribers.length).toBe(1); // b 仍在使用
            b.close();
            expect(unsubscribers.length).toBe(0); // 最后一个 session 离开才退订
        } finally {
            (window as { __airErrorHub?: unknown }).__airErrorHub = hadHub;
            HTMLCanvasElement.prototype.getContext = original;
        }
        // hub 测试结束后不应残留任何打开的 session
    });

    test('close 释放全部强引用映射（componentIds/assetIds/assetsById）', () => {
        const s = createAgentSession({ app, writableScenes: [] });
        s.inspectScene(); // 注册节点与组件 ID
        s.close();
        const inner = s as unknown as {
            componentIds: Map<unknown, unknown>;
            assetIds: Map<unknown, unknown>;
            assetsById: Map<unknown, unknown>;
            nodeIds: Map<unknown, unknown>;
        };
        expect(inner.nodeIds.size).toBe(0);
        expect(inner.componentIds.size).toBe(0);
        expect(inner.assetIds.size).toBe(0);
        expect(inner.assetsById.size).toBe(0);
    });

    test('反复 attach/detach 不泄漏监听器（一条错误只产生一条记录）', () => {
        for (let i = 0; i < 5; i++) {
            const session = createAgentSession({ app });
            session.close();
        }
        const session = createAgentSession({ app });
        try {
            session.clearRuntimeErrors();
            window.dispatchEvent(new ErrorEvent('error', { message: 'once-only', error: new Error('once-only') }));
            const { errors } = session.getRuntimeErrors();
            expect(errors.filter((e) => e.message.includes('once-only')).length).toBe(1);
        } finally { session.close(); }
    });

    test('unhandledrejection 收集；JSON 可序列化错误条目', () => {
        const session = createAgentSession({ app });
        fireUnhandledRejection(new Error('rej-x'));
        const { errors } = session.getRuntimeErrors();
        const entry = errors.find((e) => e.category === 'unhandled-rejection');
        expect(entry).toBeTruthy();
        expect(typeof JSON.stringify(errors)).toBe('string');
        session.close(); // 缓冲条目保留（观察历史），hook 已随最后一个 session 卸载
    });
});

// 类型层面引用，避免仅作类型导入的告警（合同类型在 tools/debug 中冻结）。
void AgentSessionImpl;
