/* W04 画布绑定与焦点合同探针（tools/debug/probes 隔离，不登记 files.json，不进 Gallery/coverage）。
 *
 * 模式（query ?mode=classic|anyid|decoy）：
 *   classic — 模板 #GameCanvas（import 前存在）：鼠标/键盘/焦点合同控制组；
 *   anyid   — 自定义 id 画布，动态 import 前设置 globalThis.__CC_CANVAS__：
 *             输入三源与 screen-adapter 绑到该元素（元素引用优先于 id 查询）；
 *   decoy   — 页面含另一个 #GameCanvas 元素 + 传入自定义 id 画布：createAirApp 必须显式抛错。
 *
 * 断言面（事实由运行器驱动真实交互后经 __bindingResults 注入）：
 * EventMouse 坐标换算（DPR=1 全屏画布：clientX/Y → 左下原点像素）、键盘事件焦点门控
 * （聚焦收到/失焦不收）、焦点可读（activeElement）可恢复（再点击复焦）、tabIndex 默认 0、
 * 真实触摸（hasTouch 上下文 tap → TOUCH_START）。
 *
 * 运行：NODE_PATH=<playwright> node tools/verify/canvas-binding.cjs
 * 证据：docs/evidence/w04-canvas-binding.json
 */
const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'classic';

const probe = { id: 'canvas-binding-probe', mode, ready: false, ok: true, checks: [], samples: {}, info: {} };
window.__bindingProbe = probe;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, pass, detail) {
    probe.checks.push({ name, pass: !!pass, detail: detail === undefined ? undefined : String(detail) });
    if (!pass) {
        probe.ok = false;
    }
}

if (mode === 'classic') {
    const frame = document.createElement('div');
    frame.id = 'GameDiv';
    const container = document.createElement('div');
    container.id = 'Cocos3dGameContainer';
    const canvas = document.createElement('canvas');
    canvas.id = 'GameCanvas';
    container.appendChild(canvas);
    frame.appendChild(container);
    document.body.appendChild(frame);
} else if (mode === 'anyid') {
    const canvas = document.createElement('canvas');
    canvas.id = 'my-game';
    document.body.appendChild(canvas);
    // 关键时序：引擎 import 前设置画布覆盖（PAL 输入源与 screen-adapter 在模块求值期消费）
    globalThis.__CC_CANVAS__ = canvas;
} else if (mode === 'decoy') {
    const decoy = document.createElement('canvas');
    decoy.id = 'GameCanvas';
    document.body.appendChild(decoy);
    const canvas = document.createElement('canvas');
    canvas.id = 'real-canvas';
    document.body.appendChild(canvas);
} else if (mode === 'unbound') {
    const canvas = document.createElement('canvas');
    canvas.id = 'unbound-canvas';
    document.body.appendChild(canvas);
}

let cc = null;
try {
    cc = await import('/build/cocosair.module.js');
} catch (error) {
    if (mode !== 'unbound') {
        throw error;
    }
    const message = String((error && error.message) || error);
    check('unbound_rejects_explicitly', message.includes('__CC_CANVAS__'), message);
    check('unbound_id_preserved', document.getElementById('unbound-canvas') !== null);
    probe.ready = true;
}
if (cc) {
    const { createAirApp, Scene, Node, Camera, Color, Layers, Vec3, input, Input } = cc;

    if (mode === 'decoy' || mode === 'unbound') {
        let rejected = null;
        try {
            await createAirApp({ canvas: mode === 'decoy' ? '#real-canvas' : '#unbound-canvas' });
        } catch (e) {
            rejected = String((e && e.message) || e);
        }
        probe.samples.decoyRejection = rejected;
        if (mode === 'decoy') {
            check(
                'decoy_rejects_explicitly',
                rejected !== null && rejected.includes('another element with id "GameCanvas"'),
                rejected,
            );
        } else {
            check('unbound_rejects_explicitly', rejected !== null && rejected.includes('__CC_CANVAS__'), rejected);
            check('unbound_id_preserved', document.getElementById('unbound-canvas') !== null);
        }
        probe.ready = true;
    } else {
        const app = await createAirApp({ canvas: mode === 'anyid' ? '#my-game' : '#GameCanvas' });
        const canvas = app.canvas;
        window.__bindingCanvas = canvas;
        probe.info.canvasIdAtCreate = canvas.id;
        check('boot_canvas_id_preserved', canvas.id === (mode === 'anyid' ? 'my-game' : 'GameCanvas'), canvas.id);
        probe.info.tabIndex = canvas.tabIndex;
        check('boot_tabindex_focusable', canvas.tabIndex >= 0, `tabIndex=${canvas.tabIndex}`);

        const scene = new Scene('binding-probe');
        const cameraNode = new Node('Cam');
        scene.addChild(cameraNode);
        cameraNode.setPosition(new Vec3(0, 1.6, 6));
        cameraNode.lookAt(new Vec3(0, 1, 0));
        const camera = cameraNode.addComponent(Camera);
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new Color(30, 40, 60, 255);
        camera.visibility = Layers.Enum.DEFAULT;
        app.run(scene);
        await sleep(500);
        check('boot_scene_running', app.getScene() === scene, app.getScene() && app.getScene().name);
        const gl = canvas.getContext('webgl2');
        const pixel = new Uint8Array(4);
        if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        check(
            'boot_anyid_override_render',
            !!gl && pixel[3] === 255 && pixel[0] >= 25 && pixel[0] <= 35,
            Array.from(pixel),
        );

        probe.mouseEvents = [];
        probe.keyEvents = [];
        probe.touchEvents = [];
        input.on(Input.EventType.MOUSE_DOWN, (e) => {
            probe.mouseEvents.push({ x: Math.round(e.getLocationX()), y: Math.round(e.getLocationY()) });
        });
        input.on(Input.EventType.KEY_DOWN, (e) => {
            probe.keyEvents.push({ keyCode: e.keyCode });
        });
        input.on(Input.EventType.TOUCH_START, () => {
            probe.touchEvents.push(1);
        });

        probe.samples.focusBefore = { activeIsCanvas: document.activeElement === canvas, tabIndex: canvas.tabIndex };
        window.__bindingArmed = true;

        const t0 = Date.now();
        while (!window.__bindingResults && Date.now() - t0 < 30000) {
            await sleep(100);
        }
        if (window.__bindingResults) {
            const r = window.__bindingResults;
            probe.samples.interaction = r;
            if (r.mouseDown) {
                // DPR=1 全屏画布：location = (clientX, viewportH - clientY)（左下原点，PAL mouse-input 换算）
                check(
                    'mouse_location_mapping',
                    r.mouseDown.x === r.expectedMouse.x && r.mouseDown.y === r.expectedMouse.y,
                    JSON.stringify(r.mouseDown) + ' expect ' + JSON.stringify(r.expectedMouse),
                );
            } else {
                check('mouse_event_received', false, 'no MOUSE_DOWN recorded');
            }
            if (r.focusAfterClick) {
                check('focus_on_click', true);
                check(
                    'keyboard_gated_by_focus',
                    r.keyWhileFocused > 0 && r.keyWhileBlurred === 0,
                    `focused=${r.keyWhileFocused} blurred=${r.keyWhileBlurred}`,
                );
                check('focus_restorable', r.focusAfterReclick === true);
            } else {
                check('focus_on_click', false, 'activeElement !== canvas after click');
            }
            if (r.touchTested) {
                check('touch_event_received', r.touchStart === true, 'TOUCH_START recorded: ' + r.touchStart);
            }
        } else {
            check('runner_interaction_timeout', false, 'no __bindingResults within 30s');
        }
        probe.ready = true;
    }
}
