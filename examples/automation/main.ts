/**
 * automation — 开发期观察/操作工具闭环（V0.5.1 T2 + T3/T4，计划书 §4.1/§6 门禁 G4）。
 *
 * 显式 import('/__debug/agent-session.js') 加载 agent development session（默认包不含），
 * 执行一次完整闭环并在页面/控制台输出结果：
 *
 *   attach → inspectScene（发现已有节点）→ createNode → setTransform → inspectNode
 *          → addComponent → captureFrame（新帧差异验证）→ 非法请求错误码 → close 清理
 *
 * 仅 dev server 下可用（依赖 /__debug/ 路由与页面 importmap）；无外部模型、无 AI 服务调用。
 *
 * 启动：npm run dev -- --example automation → http://127.0.0.1:7454/automation/
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Layers,
    utils,
    primitives,
    builtinResMgr,
} from 'cocosair';
import { setupCamera, setupDirectionalLight } from '../shared/scene-kit.js';

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('automation-demo');
setupCamera(scene, { position: [0, 2, 6], rotationEuler: [-15, 0, 0] });
setupDirectionalLight(scene, { rotationEuler: [-45, -30, 0] });

// 一个已存在的立方体：session 对"已有节点"只能按授权（可写范围）操作
const cube = new Node('existing-cube');
cube.layer = Layers.Enum.DEFAULT;
scene.addChild(cube);
const renderer = cube.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
renderer.material = builtinResMgr.get('builtin-standard-material');

app.run(scene);

// ---- 页面日志区（画布之外的普通 DOM）----
const logEl = document.createElement('pre');
logEl.style.cssText = 'position:fixed;left:12px;top:12px;right:12px;bottom:55%;margin:0;z-index:10;'
    + 'overflow:auto;background:rgba(10,10,24,.88);color:#9fe3a0;font:12px/1.5 monospace;'
    + 'padding:10px;border-radius:8px;white-space:pre-wrap';
logEl.textContent = '[automation] waiting for agent session…';
document.body.appendChild(logEl);
const log = (line: string, ok?: boolean): void => {
    logEl.textContent += `\n${ok === undefined ? '' : ok ? 'PASS ' : 'FAIL '}${line}`;
    logEl.scrollTop = logEl.scrollHeight;
    console.log(`[automation] ${line}`);
};

let sessionModule: { createAgentSession: (o: unknown) => AgentSessionLike };
try {
    sessionModule = await import('/__debug/agent-session.js');
} catch (error) {
    log(`agent session 不可用（需要 dev server：npm run dev）：${(error as Error).message}`, false);
    throw error;
}

interface AgentSessionLike {
    id: string;
    inspectScene (): { sceneId: string; nodeCount: number; componentCount: number; uniqueAssetCount: { total: number; byKind: Record<string, number> }; nodes: { id: string; name: string; parentId: string | null }[] };
    inspectNode (id: string): { id: string; local: { position: number[]; scale: number[] }; components: { type: string }[] };
    captureFrame (): Promise<{ png: string; width: number; height: number; frameIndex: number }>;
    getRuntimeErrors (): { errors: unknown[]; dropped: number };
    dispatch (req: { requestId: string; action: string; targetId?: string; params?: object }): Promise<{ requestId: string; ok: boolean; result?: { nodeId?: string; applied?: string[]; type?: string }; error?: { code: string; message: string } }>;
    close (): void;
}

const { createAgentSession } = sessionModule;
const results = { pass: 0, fail: 0 };
const check = (name: string, ok: boolean, detail?: string): void => {
    results[ok ? 'pass' : 'fail']++;
    log(`${name}${detail ? ` — ${detail}` : ''}`, ok);
};

// ---- 显式 attach：本 scene 可写 ----
const session: AgentSessionLike = createAgentSession({ app, writableScenes: [scene] });
log(`session attached: ${session.id}`);

try {
    // ---- 观察：inspectScene（区分节点数/组件数/唯一资源数），发现已有节点 ID ----
    const summary = session.inspectScene();
    log(`inspectScene: nodes=${summary.nodeCount} components=${summary.componentCount} assets=${summary.uniqueAssetCount.total} (${JSON.stringify(summary.uniqueAssetCount.byKind)})`);
    const cubeEntry = summary.nodes.find((n) => n.name === 'existing-cube');
    check('inspectScene 发现 existing-cube', !!cubeEntry, cubeEntry?.id);

    // ---- 操作：createNode（父节点 = 已有立方体，在其可写范围内）----
    const created = await session.dispatch({ requestId: 'a1', action: 'createNode', targetId: cubeEntry?.id, params: { name: 'agent-cube' } });
    check('createNode', created.ok, created.result?.nodeId);
    const createdId = created.result?.nodeId as string;

    const transform = await session.dispatch({
        requestId: 'a2', action: 'setTransform', targetId: createdId,
        params: { space: 'local', position: [1, 1, 0], rotationEuler: [0, 45, 0], scale: [1.5, 1.5, 1.5] },
    });
    check('setTransform local', transform.ok, transform.result?.applied?.join(','));

    const nodeView = session.inspectNode(createdId);
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-4;
    check('inspectNode 回读 position/scale',
        near(nodeView.local.position[0], 1) && near(nodeView.local.scale[0], 1.5),
        JSON.stringify(nodeView.local));
    check('ID 稳定（同名节点也各自独立）', nodeView.id === createdId);

    const addMesh = await session.dispatch({ requestId: 'a3', action: 'addComponent', targetId: createdId, params: { component: 'MeshRenderer' } });
    check('addComponent 白名单内', addMesh.ok, addMesh.result?.type);

    // ---- 非法请求：无副作用、错误码准确 ----
    const badType = await session.dispatch({ requestId: 'a4', action: 'addComponent', targetId: createdId, params: { component: 'NotInWhitelist' } });
    check('白名单外组件 → INVALID_ARGUMENT', !badType.ok && badType.error?.code === 'INVALID_ARGUMENT', badType.error?.code);

    const dup = await session.dispatch({ requestId: 'a2', action: 'setTransform', targetId: createdId, params: { space: 'local', position: [0, 0, 0] } });
    check('保留窗口内重复 requestId → INVALID_ARGUMENT', !dup.ok && dup.error?.code === 'INVALID_ARGUMENT', dup.error?.code);

    const stale = await session.dispatch({ requestId: 'a5', action: 'setTransform', targetId: 'node-404', params: { space: 'local', position: [0, 0, 0] } });
    check('未知 targetId → STALE_TARGET', !stale.ok && stale.error?.code === 'STALE_TARGET', stale.error?.code);

    // ID 是 session 内稳定的：只读 session 必须先观察拿到【自己的】ID，才能发起写探测
    const readonlySession = createAgentSession({ app });
    const roCube = readonlySession.inspectScene().nodes.find((n) => n.name === 'existing-cube');
    const ro = await readonlySession.dispatch({ requestId: 'r1', action: 'createNode', targetId: roCube?.id, params: { name: 'x' } });
    check('只读 session 写操作 → OUT_OF_SCOPE', !ro.ok && ro.error?.code === 'OUT_OF_SCOPE', ro.error?.code);
    readonlySession.close();

    // ---- captureFrame：AFTER_DRAW 受控时机 + 新帧差异验证 ----
    const before = await session.captureFrame();
    check('captureFrame 返回 PNG', before.png.startsWith('data:image/png') && before.width > 0 && before.height > 0,
        `${before.width}x${before.height} frame#${before.frameIndex}`);
    // 已知可见变化：旋转有网格的 existing-cube（对已有节点的显式编辑），再截一张对照
    const cubeId = cubeEntry?.id as string;
    await session.dispatch({ requestId: 'a6', action: 'setTransform', targetId: cubeId, params: { space: 'local', rotationEuler: [0, 60, 0] } });
    const after = await session.captureFrame();
    check('操作后截图不同（新帧，非旧截图冒充）', after.png !== before.png && after.frameIndex === before.frameIndex + 1,
        `frame#${before.frameIndex} → #${after.frameIndex}`);

    // ---- 错误收集 ----
    const errors = session.getRuntimeErrors();
    check('getRuntimeErrors 结构', Array.isArray(errors.errors) && typeof errors.dropped === 'number',
        `${errors.errors.length} entries, dropped=${errors.dropped}`);

    log(`闭环完成：${results.pass} pass / ${results.fail} fail`);
} catch (error) {
    log(`闭环异常：${(error as Error).message}`, false);
} finally {
    // ---- close：清理自有节点/实例/资产与监听器；之后所有请求 SESSION_CLOSED ----
    session.close();
    const afterClose = await session.dispatch({ requestId: 'a9', action: 'createNode', targetId: 'node-1', params: {} });
    check('close 后请求 → SESSION_CLOSED', !afterClose.ok && afterClose.error?.code === 'SESSION_CLOSED', afterClose.error?.code);
    log('session closed（自有节点已清理）');
}
