/**
 * collector-dodge — 经典游戏：俯视角收集与躲避（G2 · manual-mini-game 的 Gallery 升级重构）。
 *
 * 覆盖重点（计划书 G2 表）：输入、组件生命周期、碰撞/动画、UI、音频、对象复用与场景重置。
 * 碰撞如实标注：XZ 平面平方距离判定（勾股免开方，manual-mini-game 同款近似）——
 * **不是物理后端碰撞**；AIR 的组件级 2D/3D 物理见 physics-interaction（cannon）。
 *
 * 架构纪律（G3 范式）：CollectorGame 纯逻辑（种子币位/巡逻敌人/固定步长/状态机，零引擎依赖）；
 * 节点层只做同步（逻辑坐标 → node.setPosition）与表现（tween 重生脉冲、金币自旋、DOM HUD）。
 *
 * 确定性自动演示（手动步进）：
 * - G1 种子确定性：两次 reset 的金币序列逐位一致；
 * - G2 自动寻币 → 胜局：导航共享键盘同一移动入口，score≥100（10 币）→ WON；
 *   对象复用对账：10 次吃币全部由 5 节点池轮转（poolRespawns=10，无节点增长）；
 * - G3 暂停/恢复：paused 期间 60 步玩家位置逐位冻结，恢复后位移；
 * - G4 负局：贴身敌人巡逻线 → 无敌帧轮转 3 次命中 → hp=0 → OVER；
 * - G5 重开/场景重置：分数/hp/币位全复位，场景节点总数不变（对象复用与场景重置断言）。
 * 交互：WASD/方向键移动、P 暂停、R 重开、点击 = 冲刺（0.6s 双倍速）；真实按键立即夺回控制权。
 * 音效：tone.wav（loadRemote 回调式，audio-basic 实证链）→ 手势内 play()；clip 时长断言。
 *
 * 断言失败：pcheck → throw → pageerror → no-runtime-error 红。
 */

import {
    createAirApp, Scene, Node, MeshRenderer, Camera, Component, DirectionalLight, Layers, Vec3, Color,
    Material, Mesh, utils, primitives, tween, input, Input, KeyCode, isValid,
    assetManager, AudioSource, AudioClip,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const probe = {
    id: 'collector-dodge',
    ready: false,
    ok: false,
    clickPhaseDone: false,
    checks: [] as { name: string; ok: boolean; detail: string }[],
    state: {} as Record<string, unknown>,
};
(window as any).__trialProbe = probe;

function pcheck(name: string, ok: boolean, detail: string): void {
    probe.checks.push({ name, ok: !!ok, detail });
    if (!ok) {
        throw new Error('[collector-dodge] assertion failed: ' + name + ' — ' + detail);
    }
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 纯逻辑核心
// ---------------------------------------------------------------------------

const ARENA = 5;          // 可动半宽
const PLAYER_R = 0.55;
const COIN_R = 0.35;
const ENEMY_R = 0.5;
const FIXED_DT = 1 / 60;
const INVULN_STEPS = 90;
const WIN_SCORE = 100;
const COIN_COUNT = 5;

interface CoinSlot { x: number; z: number; }
interface EnemyDef { ax: number; az: number; bx: number; bz: number; }

const ENEMY_ROUTES: EnemyDef[] = [
    { ax: -4, az: -3, bx: 4, bz: -3 },
    { ax: -4, az: 2.5, bx: 4, bz: 2.5 },
    { ax: 0, az: -4.5, bx: 0, bz: -1.5 },
];

class CollectorGame {
    px = 0;
    pz = 0;
    hp = 3;
    score = 0;
    coinsEaten = 0;
    poolRespawns = 0;
    hitsByEnemy = 0;
    invuln = 0;
    dashTimer = 0;
    steps = 0;
    state: 'playing' | 'paused' | 'won' | 'over' = 'playing';
    seed = 20260925;
    private rngState = 20260925;
    private rngPlan: CoinSlot[] = [];   // 种子币位序列（G1 确定性断言对象）
    private rngIdx = 0;
    coins: CoinSlot[] = [];
    enemies: { x: number; z: number; route: EnemyDef; phase: number }[] = [];
    cmd = { x: 0, z: 0 };
    navEnabled = false;
    contactEnabled = true; // 演示钩子：G2 纯收集演示关闭接触伤害（伤害路径由 G4 独立断言）
    onChange: (() => void) | null = null;

    private rng(): number {
        this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
        return this.rngState / 4294967296;
    }

    private nextCoinSlot(): CoinSlot {
        if (this.rngIdx < this.rngPlan.length) {
            return this.rngPlan[this.rngIdx++];
        }
        // 计划耗尽（演示不会到这，交互模式兜底）：现场抽取并避开玩家
        let x = 0;
        let z = 0;
        do {
            x = (this.rng() * 2 - 1) * (ARENA - 0.5);
            z = (this.rng() * 2 - 1) * (ARENA - 0.5);
        } while ((x - this.px) ** 2 + (z - this.pz) ** 2 < 4);
        return { x, z };
    }

    reset(seed = 20260925, planLength = 40): void {
        this.seed = seed;
        this.rngState = seed >>> 0;
        this.rngPlan = [];
        for (let i = 0; i < planLength; i++) {
            this.rngPlan.push({
                x: Math.round((this.rng() * 2 - 1) * (ARENA - 0.5) * 100) / 100,
                z: Math.round((this.rng() * 2 - 1) * (ARENA - 0.5) * 100) / 100,
            });
        }
        this.rngIdx = 0;
        this.px = 0;
        this.pz = 0;
        this.hp = 3;
        this.score = 0;
        this.coinsEaten = 0;
        this.poolRespawns = 0;
        this.hitsByEnemy = 0;
        this.invuln = 0;
        this.dashTimer = 0;
        this.steps = 0;
        this.state = 'playing';
        this.cmd = { x: 0, z: 0 };
        this.navEnabled = false;
        this.contactEnabled = true;
        this.coins = [];
        for (let i = 0; i < COIN_COUNT; i++) {
            this.coins.push(this.nextCoinSlot());
        }
        this.enemies = ENEMY_ROUTES.map((route) => ({ x: route.ax, z: route.az, route, phase: 0 }));
        this.emit();
    }

    coinPlanSnapshot(): string {
        return this.rngPlan.slice(0, 12).map((c) => c.x + ',' + c.z).join('|');
    }

    dash(): void {
        this.dashTimer = 36; // 0.6s
    }

    step(): void {
        if (this.state !== 'playing') {
            return;
        }
        this.steps++;
        // 移动入口统一：键盘 cmd / 自动导航 nav（共享同一积分路径）
        let mx = this.cmd.x;
        let mz = this.cmd.z;
        if (this.navEnabled) {
            let best = -1;
            let bestD = Infinity;
            for (let i = 0; i < this.coins.length; i++) {
                const d = (this.coins[i].x - this.px) ** 2 + (this.coins[i].z - this.pz) ** 2;
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
            if (best >= 0) {
                const dx = this.coins[best].x - this.px;
                const dz = this.coins[best].z - this.pz;
                const len = Math.sqrt(dx * dx + dz * dz) || 1;
                mx = dx / len;
                mz = dz / len;
            }
        }
        const speed = 5 * (this.dashTimer > 0 ? 2 : 1);
        if (this.dashTimer > 0) {
            this.dashTimer--;
        }
        this.px = Math.max(-ARENA, Math.min(ARENA, this.px + mx * speed * FIXED_DT));
        this.pz = Math.max(-ARENA, Math.min(ARENA, this.pz + mz * speed * FIXED_DT));

        // 敌人巡逻（相位推进 = 确定性位置）
        for (const e of this.enemies) {
            e.phase += (2 / Math.hypot(e.route.bx - e.route.ax, e.route.bz - e.route.az)) * FIXED_DT;
            const t = 0.5 - 0.5 * Math.cos(e.phase * Math.PI); // 平滑往返 [0,1]
            e.x = e.route.ax + (e.route.bx - e.route.ax) * t;
            e.z = e.route.az + (e.route.bz - e.route.az) * t;
        }

        // 拾取（平方距离，免开方——非物理后端，如实标注）
        const pickR = PLAYER_R + COIN_R;
        for (let i = 0; i < this.coins.length; i++) {
            const c = this.coins[i];
            if ((c.x - this.px) ** 2 + (c.z - this.pz) ** 2 < pickR * pickR) {
                this.score += 10;
                this.coinsEaten++;
                this.poolRespawns++; // 对象复用：槽位原地重生，不建节点
                this.coins[i] = this.nextCoinSlot();
                this.onCoinEaten();
            }
        }

        // 敌人接触（无敌帧轮转；contactEnabled=false 时跳过——演示钩子如实标注）
        const hitR = PLAYER_R + ENEMY_R;
        for (const e of this.contactEnabled ? this.enemies : []) {
            if ((e.x - this.px) ** 2 + (e.z - this.pz) ** 2 < hitR * hitR) {
                if (this.invuln > 0) {
                    continue;
                }
                this.hp--;
                this.hitsByEnemy++;
                this.invuln = INVULN_STEPS;
                if (this.hp <= 0) {
                    this.hp = 0;
                    this.state = 'over';
                }
                break;
            }
        }
        if (this.invuln > 0) {
            this.invuln--;
        }
        if (this.score >= WIN_SCORE && this.state === 'playing') {
            this.state = 'won';
        }
        this.emit();
    }

    onCoinEaten: () => void = () => { /* 表现层挂钩（音频/tween），由 main 注入 */ };

    runSteps(n: number): void {
        for (let i = 0; i < n && this.state === 'playing'; i++) {
            this.step();
        }
    }

    togglePause(): void {
        if (this.state === 'playing') {
            this.state = 'paused';
        } else if (this.state === 'paused') {
            this.state = 'playing';
        }
        this.emit();
    }

    private emit(): void {
        if (this.onChange) {
            this.onChange();
        }
    }
}

// ---------------------------------------------------------------------------
// 表现层（真实 3D 节点 + tween 重生脉冲 + DOM HUD）
// ---------------------------------------------------------------------------

let scene: Scene;
let game: CollectorGame;
let playerNode: Node | null = null;
let coinNodes: Node[] = [];
let enemyNodes: Node[] = [];
let coinsRoot: Node | null = null;
let enemiesRoot: Node | null = null;
let playerMat: Material | null = null;
let coinMat: Material | null = null;
let enemyMat: Material | null = null;
let playerMesh: Mesh | null = null;
let coinMesh: Mesh | null = null;
let enemyMesh: Mesh | null = null;
let audioSrc: AudioSource | null = null;
let coinClip: AudioClip | null = null;
let audioPlayAttempts = 0;
let audioPlayErrors = 0;

function stdMaterial(r: number, g: number, b: number, roughness: number): Material {
    const mat = new Material();
    mat.initialize({ effectName: 'builtin-standard' });
    mat.setProperty('mainColor', new Color(r, g, b, 255));
    mat.setProperty('roughness', roughness);
    return mat;
}

function buildActors(): void {
    playerMat = stdMaterial(80, 200, 110, 0.4);
    coinMat = stdMaterial(240, 200, 70, 0.25);
    enemyMat = stdMaterial(220, 80, 70, 0.5);
    playerMesh = utils.createMesh(primitives.sphere(PLAYER_R));
    coinMesh = utils.createMesh(primitives.cylinder(COIN_R, COIN_R, 0.12));
    enemyMesh = utils.createMesh(primitives.box({ width: ENEMY_R * 2, height: 0.9, length: ENEMY_R * 2 }));

    playerNode = new Node('Player');
    playerNode.layer = Layers.Enum.DEFAULT;
    scene.addChild(playerNode);
    const pr = playerNode.addComponent(MeshRenderer);
    pr.mesh = playerMesh;
    pr.setSharedMaterial(playerMat, 0);

    coinsRoot = new Node('Coins');
    coinsRoot.setPosition(new Vec3(0, 0, 0));
    scene.addChild(coinsRoot);
    coinNodes = [];
    for (let i = 0; i < COIN_COUNT; i++) {
        const n = new Node('Coin' + i);
        n.layer = Layers.Enum.DEFAULT;
        coinsRoot.addChild(n);
        const r = n.addComponent(MeshRenderer);
        r.mesh = coinMesh;
        r.setSharedMaterial(coinMat, 0);
        coinNodes.push(n);
    }
    enemiesRoot = new Node('Enemies');
    enemiesRoot.setPosition(new Vec3(0, 0, 0));
    scene.addChild(enemiesRoot);
    enemyNodes = [];
    for (let i = 0; i < ENEMY_ROUTES.length; i++) {
        const n = new Node('Enemy' + i);
        n.layer = Layers.Enum.DEFAULT;
        enemiesRoot.addChild(n);
        const r = n.addComponent(MeshRenderer);
        r.mesh = enemyMesh;
        r.setSharedMaterial(enemyMat, 0);
        enemyNodes.push(n);
    }
}

function destroyActors(): void {
    if (playerNode) { playerNode.destroy(); playerNode = null; }
    for (const n of coinNodes) { n.destroy(); }
    coinNodes = [];
    for (const n of enemyNodes) { n.destroy(); }
    enemyNodes = [];
    if (coinsRoot) { coinsRoot.destroy(); coinsRoot = null; }
    if (enemiesRoot) { enemiesRoot.destroy(); enemiesRoot = null; }
    if (playerMat) { playerMat.destroy(); playerMat = null; }
    if (coinMat) { coinMat.destroy(); coinMat = null; }
    if (enemyMat) { enemyMat.destroy(); enemyMat = null; }
    if (playerMesh) { playerMesh.destroy(); playerMesh = null; }
    if (coinMesh) { coinMesh.destroy(); coinMesh = null; }
    if (enemyMesh) { enemyMesh.destroy(); enemyMesh = null; }
}

function syncNodes(dt: number): void {
    if (playerNode) {
        playerNode.setPosition(new Vec3(game.px, PLAYER_R, game.pz));
        // 无敌帧闪烁（可见反馈）
        playerNode.active = !(game.invuln > 0 && Math.floor(game.steps / 5) % 2 === 0);
    }
    for (let i = 0; i < coinNodes.length; i++) {
        const n = coinNodes[i];
        if (!n) { continue; }
        const c = game.coins[i];
        if (!c) { continue; } // reset 前的帧：逻辑数组尚空
        n.setPosition(new Vec3(c.x, 0.5, c.z));
        n.setRotationFromEuler(90, n.eulerAngles.y + dt * 180, 0); // 立着自旋
    }
    for (let i = 0; i < enemyNodes.length; i++) {
        const e = game.enemies[i];
        if (!e) { continue; }
        enemyNodes[i].setPosition(new Vec3(e.x, 0.45, e.z));
    }
}

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace;z-index:10;white-space:pre';
document.body.appendChild(panel);
function renderPanel(): void {
    panel.textContent = [
        `collector-dodge · ${game.state.toUpperCase()} · score ${game.score}/${WIN_SCORE} · hp ${game.hp}`,
        `coins ${game.coinsEaten} · respawns ${game.poolRespawns}（${COIN_COUNT} 节点池） · hits ${game.hitsByEnemy} · dash ${game.dashTimer}`,
        'WASD/方向键移动 · P 暂停 · R 重开 · 点击冲刺 · 距离判定（非物理后端）',
    ].join('\n');
}

class GameDriver extends Component {
    acc = 0;
    realtime = false;
    update(dt: number): void {
        if (this.realtime) {
            if (game.state === 'playing') {
                this.acc += dt;
                let guard = 0;
                while (this.acc >= FIXED_DT && guard < 8) {
                    this.acc -= FIXED_DT;
                    game.step();
                    guard++;
                }
            }
        }
        syncNodes(dt);
        renderPanel();
    }
}

let driver: GameDriver;

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    scene = new Scene('collector-dodge');

    const dirNode = new Node('DirLight');
    dirNode.setPosition(new Vec3(0, 8, 0));
    dirNode.setRotationFromEuler(-40, 25, 0);
    scene.addChild(dirNode);
    const dir = dirNode.addComponent(DirectionalLight);
    dir.illuminance = 14;

    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(new Vec3(0, 10.5, 12.5));
    cameraNode.lookAt(new Vec3(0, 0, 0));
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.PERSPECTIVE;
    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 100;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(16, 20, 28, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    camera.priority = 0;

    const groundNode = new Node('Ground');
    groundNode.layer = Layers.Enum.DEFAULT;
    groundNode.setPosition(new Vec3(0, 0, 0));
    scene.addChild(groundNode);
    const gr = groundNode.addComponent(MeshRenderer);
    gr.mesh = utils.createMesh(primitives.plane({ width: 12, length: 12, widthSegments: 1, lengthSegments: 1 }));
    const groundMat = stdMaterial(46, 62, 48, 0.9);
    gr.setSharedMaterial(groundMat, 0);

    game = new CollectorGame();
    game.reset(); // 先建逻辑状态再进渲染循环（syncNodes 不做未初始化帧的防御性空转）
    buildActors();
    // 吃币表现：tween 重生脉冲 + 手势后音频（try/catch 如实记录拒绝）
    game.onCoinEaten = () => {
        // 找到刚重生的槽位（poolRespawns 计数指向的槽）——所有槽统一脉冲一次成本更低且可见
        for (const n of coinNodes) {
            if (n && isValid(n)) {
                tween(n).to(0.12, { scale: new Vec3(0.2, 0.2, 0.2) }).delay(0.02).to(0.15, { scale: new Vec3(1, 1, 1) }).start();
            }
        }
        if (coinClip && audioSrc) {
            audioPlayAttempts++;
            try {
                audioSrc.stop();
                audioSrc.play();
            } catch (e) {
                audioPlayErrors++;
            }
        }
    };

    const driverNode = new Node('Driver');
    driverNode.setPosition(new Vec3(0, 0, 0));
    scene.addChild(driverNode);
    driver = driverNode.addComponent(GameDriver);
    const audioNode = new Node('Audio');
    audioNode.setPosition(new Vec3(0, 0, 0));
    scene.addChild(audioNode);
    audioSrc = audioNode.addComponent(AudioSource);

    app.run(scene);
    await sleep(400);

    // ---- 音频加载 ----
    try {
        coinClip = await new Promise<AudioClip>((resolve, reject) => {
            (assetManager as any).loadRemote('./assets/tone.wav', (err: unknown, clip: AudioClip) => {
                if (err) { reject(err as Error); } else { resolve(clip); }
            });
        });
        if (audioSrc && coinClip) {
            audioSrc.clip = coinClip;
            audioSrc.playOnAwake = false;
        }
        pcheck('audio-clip-loaded', !!coinClip && coinClip.getDuration() > 0, 'duration=' + (coinClip ? coinClip.getDuration() : -1));
    } catch (e) {
        pcheck('audio-clip-loaded', false, 'loadRemote 失败: ' + String((e as Error).message || e));
    }

    const nodeCount = (): number => {
        let n = 0;
        scene.walk(() => { n++; });
        return n;
    };
    const nodesAtStart = nodeCount();

    // ---- G1 种子确定性 ----
    game.reset();
    const plan1 = game.coinPlanSnapshot();
    game.reset();
    pcheck('g1-seed-determinism', game.coinPlanSnapshot() === plan1, 'plan 快照两次 reset 一致');

    // ---- G2 自动寻币 → 胜局（导航与键盘共享移动入口；接触伤害关闭=演示钩子，伤害由 G4 独立断言） ----
    game.contactEnabled = false;
    game.navEnabled = true;
    game.runSteps(20000);
    game.navEnabled = false;
    game.contactEnabled = true;
    pcheck('g2-auto-nav-win', (game.state as string) === 'won' && game.score >= WIN_SCORE && game.coinsEaten >= 10,
        'state=' + game.state + ' score=' + game.score + ' eaten=' + game.coinsEaten);
    pcheck('g2-pool-reuse-accounting', game.poolRespawns === game.coinsEaten && coinNodes.length === COIN_COUNT && nodeCount() === nodesAtStart,
        'respawns=' + game.poolRespawns + ' eaten=' + game.coinsEaten + ' nodes=' + nodeCount() + '/' + nodesAtStart);

    // ---- G3 暂停冻结 / 恢复 ----
    game.reset();
    game.navEnabled = true;
    game.runSteps(60);
    game.navEnabled = false;
    const frozenX = game.px;
    const frozenZ = game.pz;
    game.togglePause();
    game.runSteps(60);
    pcheck('g3-pause-freezes-position', game.px === frozenX && game.pz === frozenZ && (game.state as string) === 'paused',
        'px ' + frozenX.toFixed(3) + '→' + game.px.toFixed(3) + ' state=' + game.state);
    game.togglePause();
    game.navEnabled = true;
    game.runSteps(60);
    game.navEnabled = false;
    pcheck('g3-resume-advances', game.px !== frozenX || game.pz !== frozenZ,
        'px=' + game.px.toFixed(3) + ' pz=' + game.pz.toFixed(3));

    // ---- G4 负局（贴身敌人巡逻线，无敌帧轮转至 hp=0） ----
    game.reset();
    const e0 = game.enemies[0];
    let guard = 0;
    while ((game.state as string) === 'playing' && guard < 3000) {
        game.px = e0.x;
        game.pz = e0.z + 0.3; // 脚本特权：保持贴身（接触伤害 + 无敌帧轮转）
        game.step();
        guard++;
    }
    pcheck('g4-death-by-enemy', (game.state as string) === 'over' && game.hp === 0 && game.hitsByEnemy === 3,
        'state=' + game.state + ' hp=' + game.hp + ' hits=' + game.hitsByEnemy + ' steps=' + guard);

    // ---- G5 重开 / 场景重置 ----
    game.reset();
    pcheck('g5-restart-scene-reset',
        game.score === 0 && game.hp === 3 && game.coinsEaten === 0 && game.state === 'playing'
        && game.coinPlanSnapshot() === plan1 && nodeCount() === nodesAtStart
        && game.px === 0 && game.pz === 0,
        'score=' + game.score + ' hp=' + game.hp + ' nodes=' + nodeCount() + ' planSame=' + (game.coinPlanSnapshot() === plan1));
    driver.realtime = true;

    // ---- 交互 ----
    const setCmd = (event: any, down: boolean): void => {
        const code = event.keyCode;
        if (code === KeyCode.KEY_W || code === KeyCode.ARROW_UP) { game.cmd.z = down ? -1 : (game.cmd.z === -1 ? 0 : game.cmd.z); }
        if (code === KeyCode.KEY_S || code === KeyCode.ARROW_DOWN) { game.cmd.z = down ? 1 : (game.cmd.z === 1 ? 0 : game.cmd.z); }
        if (code === KeyCode.KEY_A || code === KeyCode.ARROW_LEFT) { game.cmd.x = down ? -1 : (game.cmd.x === -1 ? 0 : game.cmd.x); }
        if (code === KeyCode.KEY_D || code === KeyCode.ARROW_RIGHT) { game.cmd.x = down ? 1 : (game.cmd.x === 1 ? 0 : game.cmd.x); }
        if (down) {
            game.navEnabled = false; // 真实按键立即夺回控制权（manual-mini-game 同款语义）
        }
    };
    const onKeyDown = (event: any): void => {
        setCmd(event, true);
        const code = event.keyCode;
        if (code === KeyCode.KEY_P) { game.togglePause(); }
        else if (code === KeyCode.KEY_R) { game.reset(); driver.realtime = true; }
    };
    const onKeyUp = (event: any): void => { setCmd(event, false); };
    const onClick = (): void => {
        game.dash();
        if (coinClip && audioSrc) {
            audioPlayAttempts++; // 手势内播放（自动播放策略合法时机）
            try {
                audioSrc.stop();
                audioSrc.play();
                probe.state.audioState = String((audioSrc as any).state);
            } catch (e) {
                audioPlayErrors++;
            }
        }
        if (!probe.clickPhaseDone) {
            probe.clickPhaseDone = true;
            pcheck('click-dash-armed', game.dashTimer > 0, 'dashTimer=' + game.dashTimer);
        }
    };
    input.on(Input.EventType.KEY_DOWN, onKeyDown);
    input.on(Input.EventType.KEY_UP, onKeyUp);
    input.on(Input.EventType.TOUCH_START, onClick);

    // ---- §25 Lifecycle 合同 ----
    installAssetLifecycle({
        label: 'collector-dodge',
        hold: () => {
            const held: { name: string; ref: object }[] = [];
            if (playerMat) { held.push({ name: 'Material(player)', ref: playerMat }); }
            if (coinMat) { held.push({ name: 'Material(coin)', ref: coinMat }); }
            if (enemyMat) { held.push({ name: 'Material(enemy)', ref: enemyMat }); }
            if (playerMesh) { held.push({ name: 'Mesh(player)', ref: playerMesh }); }
            if (coinMesh) { held.push({ name: 'Mesh(coin)', ref: coinMesh }); }
            if (enemyMesh) { held.push({ name: 'Mesh(enemy)', ref: enemyMesh }); }
            if (coinClip && isValid(coinClip)) { held.push({ name: 'AudioClip(tone)', ref: coinClip }); }
            return held;
        },
        release: () => {
            input.off(Input.EventType.KEY_DOWN, onKeyDown);
            input.off(Input.EventType.KEY_UP, onKeyUp);
            input.off(Input.EventType.TOUCH_START, onClick);
            driver.realtime = false;
            game.state = 'paused';
            if (audioSrc) { audioSrc.stop(); audioSrc.clip = null; }
            if (coinClip) { assetManager.releaseAsset(coinClip); coinClip = null; } // audio-basic 实证口径
            destroyActors();
        },
        reacquire: async () => {
            await sleep(300);
            buildActors(); // 同一构建路径（材质/网格/池节点全量重建）
            try {
                coinClip = await new Promise<AudioClip>((resolve, reject) => {
                    (assetManager as any).loadRemote('./assets/tone.wav', (err: unknown, clip: AudioClip) => {
                        if (err) { reject(err as Error); } else { resolve(clip); }
                    });
                });
                if (audioSrc && coinClip) { audioSrc.clip = coinClip; audioSrc.playOnAwake = false; }
            } catch (e) { /* 重载失败如实走泄漏核对 */ }
            game.reset();
            driver.realtime = true;
            input.on(Input.EventType.KEY_DOWN, onKeyDown);
            input.on(Input.EventType.KEY_UP, onKeyUp);
            input.on(Input.EventType.TOUCH_START, onClick);
            return [
                { name: 'Material(player)', ref: playerMat as object },
                { name: 'Material(coin)', ref: coinMat as object },
                { name: 'Mesh(player)', ref: playerMesh as object },
                { name: 'Mesh(coin)', ref: coinMesh as object },
            ];
        },
    });

    renderPanel();
    probe.state.game = {
        state: game.state,
        score: game.score,
        hp: game.hp,
        coinsEaten: game.coinsEaten,
        poolRespawns: game.poolRespawns,
        hitsByEnemy: game.hitsByEnemy,
        audioPlayAttempts,
        audioPlayErrors,
        nodes: nodeCount(),
    };
    probe.ready = true;
    probe.ok = probe.checks.every((c) => c.ok);
}

main().catch((e) => {
    probe.ready = true;
    probe.ok = false;
    probe.state.fatal = String((e && e.message) || e);
    throw e;
});
