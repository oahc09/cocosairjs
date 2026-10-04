/**
 * Cocos AIR 开发手册 — Input and Events（输入与事件）
 * 配套文章：docs/manual/input-and-events.md
 *
 * 全局 input 单例与节点事件两层入口的对照实测（2D Canvas 页面）：
 *  - 全局：input.on(TOUCH_START/KEY_DOWN/KEY_UP/MOUSE_WHEEL)——window/canvas 级；
 *  - 节点：parent/child 两层 UITransform 节点监听 Node.EventType.TOUCH_START——命中测试 + 父子冒泡；
 *  - 传播：child 里 event.propagationStopped = true 后 parent 不再收到；
 *  - 吞掉：节点命中并处理后事件被"吞"，同一交互全局 input 不再收到（preventSwallow 只在
 *          UI 处理器之间放行，实测不放行到全局——见 pointer-event-dispatcher.ts）；
 *  - 退订：node.off / input.off 之后回调不再触发；
 *  - 销毁：child.destroy() 帧末销毁完成后再点击，child 不再收到（节点监听随销毁清理）。
 * 序列由合成 DOM 事件自驱动（与真人点击/按键走同一条引擎输入管线，headless 可复跑），
 * 共 11 条断言经 __manualProbe() 读回。注意 Canvas 会把 UI 相机同步到画布中心，
 * 因此点击页面坐标必须在 Widget 对齐后按 convertToWorldSpaceAR 现算。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    Widget,
    UITransform,
    Layers,
    Color,
    Vec3,
    Component,
    Label,
    Sprite,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    view,
    ResolutionPolicy,
    input,
    Input,
    KeyCode,
} from 'cocosair';

const canvasEl = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas: canvasEl });

// 设计分辨率 = 当前窗口 CSS 尺寸，EXACT_FIT → 1 UI point = 1 CSS px，点击映射为恒等。
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

const scene = new Scene('input-events');

const UI_LAYER = Layers.Enum.UI_3D;

// Canvas（含 UITransform + Widget 全对齐，尺寸自动跟随视口）
function makeUINode(name: string, parent: Node | null, width: number, height: number, x = 0, y = 0): Node {
    const node = new Node(name);
    node.layer = UI_LAYER;
    const transform = node.addComponent(UITransform);
    transform.width = width;
    transform.height = height;
    node.setPosition(new Vec3(x, y, 0));
    if (parent) parent.addChild(node);
    return node;
}

const canvasNode = makeUINode('Canvas', null, 480, 360);
const canvas = canvasNode.addComponent(Canvas);
const canvasWidget = canvasNode.addComponent(Widget);
canvasWidget.isAlignLeft = canvasWidget.isAlignRight = true;
canvasWidget.isAlignTop = canvasWidget.isAlignBottom = true;
canvasWidget.left = canvasWidget.right = canvasWidget.top = canvasWidget.bottom = 0;
canvasWidget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
scene.addChild(canvasNode);

// UI 相机：visibility 必须含 Layers.Enum.UI_3D（Canvas 会把它同步到画布中心与 orthoHeight）
const cameraNode = makeUINode('UICamera', canvasNode, 1, 1);
const uiCamera = cameraNode.addComponent(Camera);
uiCamera.projection = Camera.ProjectionType.ORTHO;
uiCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
uiCamera.clearColor = new Color(24, 30, 44, 255);
uiCamera.visibility = UI_LAYER;
uiCamera.near = 1;
uiCamera.far = 2000;
canvas.cameraComponent = uiCamera;

// 零第三方资源：运行时 canvas → ImageAsset → Texture2D → SpriteFrame
function makeSpriteFrame(cssColor: string, w: number, h: number): SpriteFrame {
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = cssColor;
    ctx.fillRect(0, 0, w, h);
    const tex = new Texture2D();
    tex.image = new ImageAsset(cvs);
    const sf = new SpriteFrame();
    sf.texture = tex;
    return sf;
}

function addSprite(node: Node, cssColor: string, w: number, h: number): Sprite {
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM; // 必须在赋 spriteFrame 之前，否则节点被裁到纹理尺寸
    sprite.spriteFrame = makeSpriteFrame(cssColor, w, h);
    return sprite;
}

function addLabel(node: Node, text: string, fontSize: number, color: Color): Label {
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.25);
    label.color = color || Color.WHITE;
    label.overflow = Label.Overflow.NONE;
    return label;
}

// ---- 父子两层节点：命中测试从 child 命中，冒泡到 parent ----
const panelNode = makeUINode('Panel', canvasNode, 200, 120, 140, 110);
addSprite(panelNode, '#3a5f8a', 200, 120);
const childNode = makeUINode('Child', panelNode, 100, 60, 0, 0);
addSprite(childNode, '#d6943e', 100, 60);
const captionNode = makeUINode('Caption', panelNode, 170, 20, 0, -78);
addLabel(captionNode, 'click the box (bubble)', 13, new Color(230, 238, 247, 255));

// 脉冲标记：scale 持续振荡，保证任意 400ms 双帧不同（frame-diff 兜底）
const pulseNode = makeUINode('Pulse', canvasNode, 24, 24, -180, 150);
addSprite(pulseNode, '#7dd87d', 24, 24);
class Pulse extends Component {
    private _t = 0;
    update(dt: number): void {
        this._t += dt;
        const s = 1 + 0.5 * Math.sin(this._t * 6);
        this.node.setScale(new Vec3(s, s, 1));
    }
}
pulseNode.addComponent(Pulse);

// ---- 两层事件入口的观测状态 ----
const stats = {
    globalTouch: 0,
    globalKey: 0,
    keyUp: 0,
    wheel: 0,
    childTouch: 0,
    childEnd: 0,
    parentTouch: 0,
    lastKeyCode: 0,
    lastScrollY: 0,
    lastUIX: -1,
    lastUIY: -1,
};
const order: string[] = [];
let childStops = false;

input.on(Input.EventType.TOUCH_START, (event: any) => {
    stats.globalTouch++;
    const ui = event.getUILocation();
    stats.lastUIX = ui.x;
    stats.lastUIY = ui.y;
});

function onParentTouch(): void {
    stats.parentTouch++;
    order.push('parent');
}
function onChildTouch(event: any): void {
    stats.childTouch++;
    order.push('child');
    if (childStops) {
        event.propagationStopped = true;
    } // 阻断冒泡：parent 不再收到
}
panelNode.on(Node.EventType.TOUCH_START, onParentTouch);
childNode.on(Node.EventType.TOUCH_START, onChildTouch);
childNode.on(Node.EventType.TOUCH_END, () => {
    stats.childEnd++;
});

input.on(Input.EventType.KEY_DOWN, (event: any) => {
    stats.globalKey++;
    stats.lastKeyCode = event.keyCode;
});
input.on(Input.EventType.KEY_UP, () => {
    stats.keyUp++;
});
input.on(Input.EventType.MOUSE_WHEEL, (event: any) => {
    stats.wheel++;
    stats.lastScrollY = event.getScrollY();
});

// ---- 合成 DOM 事件：与真人点击/按键走同一条引擎输入管线 ----
// 引擎在 #GameCanvas 上监听 mousedown/touchstart/wheel/keydown（pal/input/web/*），
// mousedown 还会被 _simulateEventTouch 模拟成 TOUCH_START 派发给 UI 节点。
function syntheticClick(clientX: number, clientY: number): void {
    canvasEl.dispatchEvent(new MouseEvent('mousedown', { clientX, clientY, button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX, clientY, button: 0, bubbles: true }));
}
function syntheticKey(code: string): void {
    canvasEl.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    canvasEl.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
}
function syntheticWheel(deltaY: number): void {
    canvasEl.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
}

// 页面坐标换算必须在 Widget 对齐后现算：convertToWorldSpaceAR 以可视区左下为原点，
// 页面坐标 = (world.x, innerHeight - world.y)；对齐前读数是错的。
function pageFor(node: Node): { x: number; y: number } {
    const t = node.getComponent(UITransform) as UITransform;
    const p = t.convertToWorldSpaceAR(new Vec3(0, 0, 0), new Vec3());
    return { x: Math.round(p.x), y: Math.round(window.innerHeight - p.y) };
}
function clickChild(): void {
    const pg = pageFor(childNode);
    syntheticClick(pg.x, pg.y);
}
function clickEmpty(): void {
    // 画布左下角，避开所有 UI 节点
    syntheticClick(60, Math.round(window.innerHeight) - 60);
}

// ---- 序列驱动 ----
type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
const expect = (name: string, pass: boolean, detail: string): void => {
    checks.push({ name, pass, detail });
};

let phase = 'p1-bubble';
let done = false;
let driverError = '';
let driverTicks = 0;
let globalAtOff = -1;

const info = document.querySelector('#info') as HTMLElement;
function showInfo(): void {
    info.textContent = [
        `input-events: ${phase}${done ? ' (done)' : ''}`,
        `global=${stats.globalTouch}  child=${stats.childTouch}  parent=${stats.parentTouch}  order=${order.join('->')}`,
        `lastUI=(${stats.lastUIX.toFixed(1)}, ${stats.lastUIY.toFixed(1)})  childStops=${childStops}`,
        `keyboard: keyDown=${stats.globalKey} keyUp=${stats.keyUp} code=${stats.lastKeyCode} (KEY_W=${KeyCode.KEY_W})`,
        `wheel: ${stats.wheel}  scrollY=${stats.lastScrollY}`,
        `checks: ${checks.filter((c) => c.pass).length}/${checks.length} pass`,
    ].join('\n');
}

class SeqDriver extends Component {
    private _t = 0;

    update(dt: number): void {
        this._t += dt;
        if (this._t < 0.9) return;
        this._t = 0;
        driverTicks++;
        try {
            this.drive();
        } catch (e) {
            driverError = `tick${driverTicks}: ${String((e && (e as Error).message) || e).slice(0, 200)}`;
            console.error('[input-events] driver error', e);
        }
        showInfo();
    }

    private drive(): void {
        switch (driverTicks) {
            case 1: {
                // P1 点击 child（Web 输入立即派发；下一拍断言等待相关场景更新）
                clickChild();
                break;
            }
            case 2: {
                // P1 断言：child→parent 冒泡各一次；事件被 UI 层吞掉，全局不触发
                expect(
                    'p1-bubble-once',
                    stats.childTouch === 1 && stats.parentTouch === 1,
                    `child=${stats.childTouch} parent=${stats.parentTouch}`,
                );
                expect('p1-bubble-order', order.join(',') === 'child,parent', `order=${order.join(',')}`);
                expect('p1-swallowed', stats.globalTouch === 0, `global=${stats.globalTouch}（节点命中后全局不收到）`);
                phase = 'p2-stop-propagation';
                childStops = true;
                clickChild();
                break;
            }
            case 3: {
                // P2 断言 + P3 退订 parent
                expect(
                    'p2-stopped',
                    stats.childTouch === 2 && stats.parentTouch === 1,
                    `child=${stats.childTouch} parent=${stats.parentTouch}`,
                );
                phase = 'p3-unsubscribe';
                childStops = false;
                panelNode.off(Node.EventType.TOUCH_START, onParentTouch);
                clickChild();
                break;
            }
            case 4: {
                // P3 断言 + P4 再点一次 child：验证 START/END 配对（claim 语义）
                expect(
                    'p3-off-works',
                    stats.childTouch === 3 && stats.parentTouch === 1,
                    `child=${stats.childTouch} parent=${stats.parentTouch}`,
                );
                phase = 'p4-start-end-pair';
                clickChild();
                break;
            }
            case 5: {
                // P4 断言 + P5 空白区点击
                expect(
                    'p4-start-end-pair',
                    stats.childTouch === 4 && stats.childEnd === 4,
                    `start=${stats.childTouch} end=${stats.childEnd}`,
                );
                phase = 'p5-empty-click';
                clickEmpty();
                break;
            }
            case 6: {
                // P5 断言（空白点击直达全局、UI 坐标 = 引擎换算）+ P6 销毁 child
                expect(
                    'p5-empty-to-global',
                    stats.globalTouch === 1 &&
                        stats.childTouch === 4 &&
                        Math.abs(stats.lastUIX - 60) < 1 &&
                        Math.abs(stats.lastUIY - 60) < 1,
                    `global=${stats.globalTouch} child=${stats.childTouch} ui=(${stats.lastUIX.toFixed(1)}, ${stats.lastUIY.toFixed(1)}) want (60, 60)`,
                );
                phase = 'p6-destroy-child';
                const pg = pageFor(childNode); // 销毁前先取点击坐标（销毁后节点不可再用）
                childNode.destroy();
                this.scheduleOnce(() => {
                    syntheticClick(pg.x, pg.y);
                }, 0.1);
                break;
            }
            case 7: {
                // P6 断言 + P7 键盘
                expect(
                    'p6-destroyed-no-callback',
                    stats.childTouch === 4 && stats.parentTouch === 1,
                    `child=${stats.childTouch} parent=${stats.parentTouch}`,
                );
                phase = 'p7-keyboard';
                syntheticKey('KeyW');
                break;
            }
            case 8: {
                // P7 断言 + P8 滚轮
                expect(
                    'p7-key-once',
                    stats.globalKey === 1 && stats.keyUp === 1 && stats.lastKeyCode === KeyCode.KEY_W,
                    `keyDown=${stats.globalKey} keyUp=${stats.keyUp} code=${stats.lastKeyCode} KEY_W=${KeyCode.KEY_W}`,
                );
                phase = 'p8-wheel';
                syntheticWheel(-100);
                break;
            }
            case 9: {
                // P8 断言 + P9 全局退订
                expect(
                    'p8-wheel-once',
                    stats.wheel === 1 && stats.lastScrollY > 0,
                    `wheel=${stats.wheel} scrollY=${stats.lastScrollY} (deltaY=-100, 反号)`,
                );
                phase = 'p9-global-off';
                globalAtOff = stats.globalTouch;
                input.off(Input.EventType.TOUCH_START);
                clickEmpty();
                break;
            }
            case 10: {
                // P9 断言 → 终局
                expect(
                    'p9-global-off-works',
                    stats.globalTouch === globalAtOff,
                    `global=${stats.globalTouch} frozenAt=${globalAtOff}`,
                );
                done = true;
                break;
            }
            default:
                break;
        }
    }
}

const driverNode = makeUINode('SeqDriver', canvasNode, 1, 1);
driverNode.addComponent(SeqDriver);
showInfo();

window.__airApp = app;
window.__manualProbe = () => ({
    ready: done,
    ok: done && checks.length > 0 && checks.every((c) => c.pass),
    name: 'input-events',
    phase,
    driverError,
    order: [...order],
    checks: [...checks],
});
app.run(scene);

console.log('[manual/input-events] running on cocosair');
