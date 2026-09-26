/**
 * Cocos AIR 开发手册 — Component Lifecycle（组件生命周期）
 * 配套文章：docs/manual/component-lifecycle.md
 *
 * 从 onLoad 到 onDestroy 的连续实测：每 1.2s 推进一个相位（时间驱动，headless 可复跑）——
 *  P0 建节点（active=false）→ 构造即 addComponent，onLoad 未触发；
 *  P1 激活 → onLoad → onEnable → start 依序各一次，update 开始计帧；
 *  P2 停用 → 只补 onDisable，update 冻结（下一相位读数不变）；
 *  P3 复活 → 只补 onEnable（onLoad / start 不重放），update 恢复；
 *  P4 销毁 → destroy() 当帧 isValid 仍真、事件仍达；帧末 isValid 翻假、onDestroy 恰一次，
 *            且销毁会隐含补最后一次 onDisable（实测顺序：… → onDisable → onDestroy）；
 *  P5 重建 → 新组件全新计数，旧监听在 onDestroy 里 off，总线再发射旧组件不再收到。
 * 观测状态全部记在模块层 ledger（不读被销毁对象的实例属性——销毁后属性不可依赖）。
 * 另有一颗永不冻结的自旋方块兜底 frame-diff（被试冻结期画面仍有动画证据）。
 * 行为断言经 window.__manualProbe() 暴露：{ ready, ok, checks } —— 验证器轮询到 ready 后判 PASS。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Component,
    Layers,
    Vec3,
    Color,
    utils,
    primitives,
    EventTarget,
    isValid,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('component-lifecycle');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(4.2, 3.4, 7.2));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 共享材质与几何（重建复用，销毁节点不牵动共享资产） ----
const cubeMesh = utils.createMesh(primitives.box({ width: 1.0, height: 1.0, length: 1.0 }));
function makeCubeMaterial(color: Color): Material {
    const m = new Material();
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', color);
    return m;
}

// ---- 事件总线：onLoad 订阅 / onDestroy 退订，用"发射后谁收到"证明清理 ----
const bus = new EventTarget();

type Counts = { onLoad: number; onEnable: number; start: number; update: number; onDisable: number; onDestroy: number };
const freshCounts = (): Counts => ({ onLoad: 0, onEnable: 0, start: 0, update: 0, onDisable: 0, onDestroy: 0 });
// 观测 ledger 挂在模块层：被销毁组件的实例属性不可依赖，计数必须放在组件外
const ledger: Record<string, Counts> = {};
const ledgerFor = (gen: string): Counts => (ledger[gen] = ledger[gen] || freshCounts());
const pings: Record<string, number> = {};
const order: string[] = [];

class LifecycleSubject extends Component {
    gen = 'g0';

    private _onPing = (): void => {
        pings[this.gen] = (pings[this.gen] || 0) + 1;
    };

    onLoad(): void {
        ledgerFor(this.gen).onLoad++;
        order.push(`${this.gen}:onLoad`);
        bus.on('ping', this._onPing, this);
    }

    onEnable(): void {
        ledgerFor(this.gen).onEnable++;
        order.push(`${this.gen}:onEnable`);
    }

    start(): void {
        ledgerFor(this.gen).start++;
        order.push(`${this.gen}:start`);
    }

    update(dt: number): void {
        ledgerFor(this.gen).update++;
        // 被试方块：只在 update 活着时自旋——停用即冻结，是"update 停止"的视觉面
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 60, 0);
    }

    onDisable(): void {
        ledgerFor(this.gen).onDisable++;
        order.push(`${this.gen}:onDisable`);
    }

    onDestroy(): void {
        ledgerFor(this.gen).onDestroy++;
        order.push(`${this.gen}:onDestroy`);
        bus.off('ping', this._onPing, this);
    }
}

let spawned = 0;
function makeSubject(gen: string, color: Color, x: number): { node: Node; subject: LifecycleSubject } {
    const node = new Node(`Subject-${gen}-${spawned++}`);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, 0.5, 0));
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = cubeMesh;
    renderer.material = makeCubeMaterial(color);
    const subject = node.addComponent(LifecycleSubject);
    subject.gen = gen;
    ledgerFor(gen); // 计数条目随组件创建（未激活时各回调计数为 0，相位断言可安全读）
    node.active = false; // 先置未激活再入场景：激活前 onLoad 不应触发
    scene.addChild(node);
    return { node, subject };
}

// ---- 兜底动画：永不冻结的自旋方块（验证器 frame-diff 在任何时刻都有动画证据） ----
class AlwaysSpin extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(dt * 30, this.node.eulerAngles.y + dt * 45, 0);
    }
}
const spinner = new Node('Spinner');
spinner.layer = Layers.Enum.DEFAULT;
spinner.setPosition(new Vec3(-2.6, 2.6, -1.5));
const spinnerRenderer = spinner.addComponent(MeshRenderer);
spinnerRenderer.mesh = utils.createMesh(primitives.sphere({ radius: 0.35 }));
spinnerRenderer.material = makeCubeMaterial(new Color(120, 150, 220, 255));
spinner.addComponent(AlwaysSpin);
scene.addChild(spinner);

// ---- 相位驱动 ----
type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
const expect = (name: string, pass: boolean, detail: string): void => {
    checks.push({ name, pass, detail });
};

let phase = 'p0-build';
let done = false;
let driverError = '';
let g1: { node: Node; subject: LifecycleSubject } | null = null;
let g2: { node: Node; subject: LifecycleSubject } | null = null;
let frozenUpdate = -1;
let pingsAtDestroy = -1;

const info = document.querySelector('#info') as HTMLElement;
function showInfo(): void {
    const c1 = ledger.g1 ? JSON.stringify(ledger.g1) : '-';
    const c2 = ledger.g2 ? JSON.stringify(ledger.g2) : '-';
    const v1 = g1 && g1.node.isValid;
    info.textContent = [
        `lifecycle: ${phase}${done ? ' (done)' : ''}`,
        `order: ${order.join(' → ')}`,
        `g1 counts: ${c1}  node.isValid=${v1}`,
        `g2 counts: ${c2}`,
        `pings: ${JSON.stringify(pings)}`,
        `checks: ${checks.filter((c) => c.pass).length}/${checks.length} pass`,
    ].join('\n');
}

class PhaseDriver extends Component {
    private _t = 0;
    private _tick = 0;

    update(dt: number): void {
        this._t += dt;
        if (this._t < 1.2) return;
        this._t = 0;
        this._tick++;
        try {
            this.drive();
        } catch (e) {
            driverError = `tick${this._tick}: ${String((e && (e as Error).message) || e).slice(0, 200)}`;
            console.error('[component-lifecycle] driver error', e);
        }
        showInfo();
    }

    private drive(): void {
        switch (this._tick) {
            case 1: {
                // P0 建好未激活
                g1 = makeSubject('g1', new Color(95, 205, 120, 255), 0);
                expect(
                    'p0-onload-deferred',
                    ledger.g1.onLoad === 0,
                    `inactive node onLoad=${ledger.g1.onLoad} (want 0)`,
                );
                break;
            }
            case 2: {
                // P1 激活
                phase = 'p1-activate';
                g1!.node.active = true;
                break;
            }
            case 3: {
                // 激活后的回调序
                const c = ledger.g1;
                const idx = (k: string) => order.indexOf(`g1:${k}`);
                expect(
                    'p1-order',
                    idx('onLoad') >= 0 && idx('onLoad') < idx('onEnable') && idx('onEnable') < idx('start'),
                    `order=${order.join(',')}`,
                );
                expect(
                    'p1-once',
                    c.onLoad === 1 && c.onEnable === 1 && c.start === 1,
                    `onLoad=${c.onLoad} onEnable=${c.onEnable} start=${c.start}`,
                );
                expect('p1-update-running', c.update > 0, `update=${c.update}`);
                // P2 停用；0.05s 后（同帧串扰排尽）冻结读数
                g1!.node.active = false;
                this.scheduleOnce(() => {
                    frozenUpdate = ledger.g1.update;
                }, 0.05);
                break;
            }
            case 4: {
                // P2 停用观察
                phase = 'p2-disable';
                const c = ledger.g1;
                expect(
                    'p2-update-frozen',
                    frozenUpdate >= 0 && c.update === frozenUpdate,
                    `update=${c.update} frozenAt=${frozenUpdate}`,
                );
                expect(
                    'p2-ondisable-only',
                    c.onDisable === 1 && c.onLoad === 1 && c.start === 1,
                    `onDisable=${c.onDisable} onLoad=${c.onLoad} start=${c.start}`,
                );
                // P3 复活
                g1!.node.active = true;
                break;
            }
            case 5: {
                // P3 复活观察
                phase = 'p3-reenable';
                const c = ledger.g1;
                expect(
                    'p3-onenable-again',
                    c.onEnable === 2 && c.onLoad === 1 && c.start === 1,
                    `onEnable=${c.onEnable} onLoad=${c.onLoad} start=${c.start}`,
                );
                expect('p3-update-resumed', c.update > frozenUpdate, `update=${c.update} > ${frozenUpdate}`);
                // P4 发射两次 ping，然后销毁
                bus.emit('ping');
                pingsAtDestroy = pings.g1 || 0;
                g1!.node.destroy();
                expect(
                    'p4-destroy-deferred',
                    g1!.node.isValid === true,
                    `isValid same-frame after destroy()=${g1!.node.isValid}`,
                );
                bus.emit('ping'); // 同帧再发射：尚未帧末，监听仍在
                break;
            }
            case 6: {
                // P4 帧末已过：验证销毁与退订
                phase = 'p4-destroyed';
                const c = ledger.g1;
                expect(
                    'p4-valid-flipped',
                    g1!.node.isValid === false && isValid(g1!.node) === false,
                    `isValid=${g1!.node.isValid} isValid()=${isValid(g1!.node)}`,
                );
                expect(
                    'p4-ondestroy-once',
                    c.onDestroy === 1 && c.onDisable === 2,
                    `onDestroy=${c.onDestroy} onDisable=${c.onDisable}（销毁隐含补最后一次 onDisable）`,
                );
                bus.emit('ping'); // 旧监听已在 onDestroy 里 off，不应再收到
                expect(
                    'p4-listener-cleaned',
                    pingsAtDestroy >= 0 && (pings.g1 || 0) === pingsAtDestroy + 1,
                    `pings g1: atDestroy=${pingsAtDestroy} now=${pings.g1 || 0}`,
                );
                // P5 重建
                g2 = makeSubject('g2', new Color(214, 148, 62, 255), 2.2);
                g2.node.active = true;
                break;
            }
            case 7: {
                // P5 重建观察 → 终局
                phase = 'p5-rebuilt';
                const c2 = ledger.g2;
                expect(
                    'p5-fresh-callbacks',
                    c2.onLoad === 1 && c2.onEnable === 1 && c2.start === 1 && c2.update > 0,
                    `g2 onLoad=${c2.onLoad} onEnable=${c2.onEnable} start=${c2.start} update=${c2.update}`,
                );
                bus.emit('ping');
                expect(
                    'p5-ping-routing',
                    (pings.g2 || 0) === 1 && (pings.g1 || 0) === pingsAtDestroy + 1,
                    `pings g2=${pings.g2 || 0} g1=${pings.g1 || 0}`,
                );
                done = true;
                break;
            }
            default:
                break;
        }
    }
}

cameraNode.addComponent(PhaseDriver);
showInfo();

window.__airApp = app;
window.__manualProbe = () => ({
    ready: done,
    ok: done && checks.length > 0 && checks.every((c) => c.pass),
    name: 'component-lifecycle',
    phase,
    driverError,
    order: [...order],
    checks: [...checks],
});
app.run(scene);

console.log('[manual/component-lifecycle] running on cocosair');
