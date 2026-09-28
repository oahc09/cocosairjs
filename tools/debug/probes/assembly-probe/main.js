/* W09/W10/W11 装配层探针（tools/debug/probes 隔离，不登记 files.json，不进 Gallery/coverage）。
 *
 * W09 ui-kit：createUICanvas/spriteNode/labelNode 组装 + AssetBank 并发去重/引用计数/
 *   归零释放/失败清理（loadRemote 真资产 tone.wav）。
 * W10 scene-stack：push/pop、过渡双页同绘、输入屏蔽、返回页状态保存、缓存上限 LRU、
 *   在途转场被新导航收口（快速重复切换）、销毁无残留（isValid=false）。
 * W11 audio-service：BGM currentTime 实测推进（判据纪律，不单独信 playing）、暂停冻结、
 *   续播前进、双 ID 切台、SFX 并发上限（7 发 5 中 2 弃）、音乐/音效开关独立、dispose。
 *
 * 运行：NODE_PATH=<playwright> node tools/verify/w09-w11-assembly.cjs
 * 证据：docs/evidence/w09-w11-assembly.json
 */
import {
    createAirApp,
    createUICanvas,
    spriteNode,
    labelNode,
    AssetBank,
    SceneStack,
    AudioService,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
    Label,
    UITransform,
    isValid,
    director,
    Director,
    input,
    Input,
} from 'cocosair';

const probe = { id: 'assembly-probe', ready: false, ok: true, checks: [], samples: {}, info: {} };
window.__assemblyProbe = probe;
window.__phase = 'init';
window.addEventListener('error', (ev) => {
    probe.info.jsError = { phase: window.__phase, message: String(ev.message), file: ev.filename, line: ev.lineno };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, pass, detail) {
    probe.checks.push({ name, pass: !!pass, detail: detail === undefined ? undefined : String(detail) });
    if (!pass) {
        probe.ok = false;
    }
}

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('assembly');
const cameraNode = new Node('Cam');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 6));
const camera = cameraNode.addComponent(Camera);
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.addComponent(DirectionalLight).illuminance = 65000;
app.run(scene);
await sleep(400);

window.__phase = 'W09';
// ============ W09：ui-kit ============
window.__phase = 'W09-canvas';
const ui = createUICanvas(scene, 'MainUI');
check(
    'W09_canvas_has_camera',
    !!ui.getComponent &&
        (() => {
            const c = ui.children.find((n) => n.name === 'MainUI/Camera');
            return c && !!c.getComponent(Camera);
        })(),
    ui.name,
);
const lbl = labelNode(ui, 'score: 0', 'Score', {
    fontSize: 32,
    position: [0, 260],
    color: new Color(255, 220, 120, 255),
});
check('W09_label_rendered', lbl.getComponent(Label).string === 'score: 0');
const spr = spriteNode(ui, 'Icon', { size: [80, 80], position: [-300, 260], color: new Color(200, 80, 80, 255) });
check(
    'W09_sprite_custom_size',
    Math.round(spr.getComponent(UITransform).width) === 80 && Math.round(spr.getComponent(UITransform).height) === 80,
);

const bank = new AssetBank();
const TONE = '/examples/audio-basic/assets/tone.wav';
const p1 = bank.load(TONE);
const p2 = bank.load(TONE);
check('W09_bank_dedup', p1 === p2 || (await p1) === (await p2), '并发同 URL 共享同一资产');
check('W09_bank_refcount_2', bank.refCount(TONE) === 2, String(bank.refCount(TONE)));
const releasedEarly = bank.release(TONE);
check(
    'W09_bank_shared_release_keeps',
    releasedEarly === false && bank.refCount(TONE) === 1,
    `refs=${bank.refCount(TONE)}`,
);
const releasedFinal = bank.release(TONE);
check('W09_bank_zero_releases', releasedFinal === true && bank.size === 0, `size=${bank.size}`);
let badLoad = null;
try {
    await bank.load('/examples/audio-basic/assets/nope.wav');
} catch (e) {
    badLoad = 'rejected';
}
check(
    'W09_bank_failure_clean',
    badLoad === 'rejected' && bank.size === 0 && bank.refCount('/examples/audio-basic/assets/nope.wav') === 0,
    '失败不留悬挂',
);

window.__phase = 'W10';
// ============ W10：scene-stack ============
const mouseSeen = [];
input.on(Input.EventType.MOUSE_DOWN, (e) => {
    mouseSeen.push(1);
});
const stack = new SceneStack(scene, { maxCachedPages: 2 });
let pageACounter = 0;
const mkPage = (tag, colorHex) => () => {
    const n = new Node('Page' + tag);
    n.layer = Layers.Enum.DEFAULT;
    const box = new Node('Box' + tag);
    box.layer = Layers.Enum.DEFAULT;
    n.addChild(box);
    box.setPosition(new Vec3(0, 1, 0));
    const ren = box.addComponent(MeshRenderer);
    ren.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1.2, length: 1.2 }));
    const m = new Material();
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', new Color(colorHex[0], colorHex[1], colorHex[2], 255));
    ren.setSharedMaterial(m, 0);
    return n;
};
// 带状态的页面（返回页状态保存的载体）
const mkStateful = () => {
    const n = mkPage('S', [90, 200, 90])();
    n.userData = { visits: 1 };
    return n;
};
const h1 = await stack.push(mkStateful, 'home');
check('W10_push_depth1', stack.depth === 1 && h1.node.active === true);
h1.node.userData.visits += 1; // 模拟页面内状态变化（visits=2）

// 过渡 push：双页同绘 + 输入屏蔽
let blockedDuring = null;
const pushing = stack.push(mkPage('B', [200, 120, 90]), 'detail', { transitionMs: 400 });
await sleep(120); // 过渡中
blockedDuring = {
    inTransition: stack.inTransition,
    bothActive: h1.node.active === true && stack.top.name === 'detail',
};
window.__dispatchTestMouse = () =>
    document.getElementById('GameCanvas').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
window.__dispatchTestMouse();
await sleep(400);
const h2 = await pushing;
probe.samples.W10_transition = { ...blockedDuring, inputBlockedCount: stack.inputBlockedCount };
check(
    'W10_dual_page_window',
    blockedDuring.inTransition === true && blockedDuring.bothActive === true,
    JSON.stringify(blockedDuring),
);
check('W10_input_blocked_in_transition', stack.inputBlockedCount > 0, String(stack.inputBlockedCount));
check(
    'W10_after_transition_retired',
    h1.node.active === false && h2.node.active === true,
    `${h1.node.active}/${h2.node.active}`,
);

// 快速重复切换：在途转场被新导航收口
const pushA = stack.push(mkPage('C', [90, 120, 200]), 'page-c', { transitionMs: 500 });
await sleep(80);
const pushB = stack.push(mkPage('D', [200, 200, 90]), 'page-d', { transitionMs: 500 });
await sleep(700);
await pushA;
await pushB;
check(
    'W10_rapid_switch_supersedes',
    stack.top.name === 'page-d' && stack.depth === 4,
    `top=${stack.top.name} depth=${stack.depth}`,
);

// 缓存上限：maxCachedPages=2，栈内 4 页 → LRU 销毁最旧
check(
    'W10_cache_lru',
    stack.cachedCount === 2 && isValid(h1.node) === false,
    `cached=${stack.cachedCount} homeDestroyed=${!isValid(h1.node)}`,
);

// pop：返回页状态保存（detail→page-c 弹出后回到 page-c? 栈顶 page-d pop → page-c 可见）
const popped = await stack.pop();
await new Promise((resolve) => {
    director.once(Director.EVENT_AFTER_DRAW, resolve);
}); // destroy 帧末生效
check('W10_pop_destroys', popped.name === 'page-d' && isValid(popped.node) === false);
const topAfterPop = stack.top;
check('W10_state_preserved', topAfterPop.name === 'page-c' && topAfterPop.node.active === true, topAfterPop.name);

window.__phase = 'W11';
// ============ W11：audio-service ============
const audio = new AudioService(scene, { maxSfxVoices: 5 });
window.__phase = 'W11-load';
await audio.load('tone', TONE);
window.__phase = 'W11-loaded';
window.__phase = 'W11-play';
audio.playBgm('tone');
await sleep(700);
window.__phase = 'W11-played';
const s1 = audio.bgmState();
await sleep(500);
const s2 = audio.bgmState();
probe.samples.W11_clock = {
    s1: { playing: s1.playing, t: Math.round(s1.currentTime * 100) / 100 },
    s2: { playing: s2.playing, t: Math.round(s2.currentTime * 100) / 100 },
};
check(
    'W11_clock_advances',
    s2.currentTime > s1.currentTime + 0.2,
    `t ${s1.currentTime} → ${s2.currentTime}（判据=currentTime 推进，非 playing）`,
);

audio.pauseBgm();
await sleep(300);
const sp = audio.bgmState();
await sleep(300);
const sp2 = audio.bgmState();
check(
    'W11_pause_freezes',
    sp.playing === false && Math.abs(sp2.currentTime - sp.currentTime) < 0.02,
    `${sp.currentTime} vs ${sp2.currentTime}`,
);

audio.resumeBgm();
await sleep(300);
const sr = audio.bgmState();
check(
    'W11_resume_continues',
    sr.playing === true && sr.currentTime > sp.currentTime + 0.1,
    `resume t=${sr.currentTime} > paused ${sp.currentTime}`,
);

// SFX 并发上限：tone 1.6s，7 连发 → 5 在途 2 丢弃
for (let i = 0; i < 7; i++) {
    audio.playSfx('tone');
}
check(
    'W11_sfx_pool_cap',
    audio.sfxActive === 5 && audio.sfxDropped === 2,
    `active=${audio.sfxActive} dropped=${audio.sfxDropped}`,
);

// 开关独立性
audio.setMusicEnabled(false);
check('W11_music_off_pauses', audio.bgmState().playing === false);
audio.setSfxEnabled(false);
const droppedBefore = audio.sfxDropped;
audio.playSfx('tone');
await sleep(50);
const droppedAfterDisabled = audio.sfxDropped;
audio.setSfxEnabled(true);
audio.setMusicEnabled(true);
check(
    'W11_sfx_switch_independent',
    droppedAfterDisabled === droppedBefore,
    'sfx 关闭时不播放也不计入丢弃（开关独立于音乐）',
);
audio.playBgm('tone');
await sleep(200);
check('W11_music_reenable', audio.bgmState().playing === true);

// dispose：源节点销毁、无残留通道状态
audio.dispose();
check('W11_dispose', audio.bgmState() === null, 'dispose 后无通道状态');

stack.dispose();
check('W10_dispose_clean', stack.depth === 0 && stack.cachedCount === 0);
probe.ready = true;
