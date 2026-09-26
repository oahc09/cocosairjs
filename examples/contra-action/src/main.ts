/**
 * contra-action — 经典游戏：横版动作（G2 · 最小完整循环；原创角色与素材，保留经典玩法结构）。
 *
 * 覆盖重点（计划书 G2 表）：角色控制、相机跟随、动画状态、碰撞层、投射物与对象池、音效/UI；
 * 验证落地/跳跃边界、镜头边界、场景复入。
 *
 * 架构纪律（G3 范式）：ContraGame 纯逻辑（固定步长，零引擎依赖）；ViewRenderer 渲染分离
 * （视口 canvas → Texture2D.uploadData，相机跟随 = scrollX 平移绘制 + 边界钳制）。
 *
 * 确定性自动演示（手动步进，与实时解耦——tank-battle/physics-interaction 同款纪律）：
 * - C1 奔跑 + 相机跟随：scrollX ≈ clamp(px - view/2, 0, levelW - view)（镜头边界断言）；
 * - C2 跳跃/落地边界：起跳 → apex > 起跳点 → 落地 onGround 且 y == 地形高度（逐位）；
 * - C3 射击 + 对象池：击毁巡逻兵 → kills+1、弹丸回池（池计数对账）；
 * - C4 受伤 + 无敌帧：吃一发炮塔弹 → hp-1、无敌帧开启；无敌期内接触敌人 hp 不变；
 *   无敌过期后再次接触 → hp 再减（无敌帧语义双向断言）；
 * - C5 终点 → WON；重开 → 死亡演示（贴身敌人持续接触至 hp=0 → OVER）；
 * - C6 场景复入：app.run(重建的同构场景) → 世代计数全新、旧世代组件销毁闭环。
 * 交互：方向键移动、↑/空格跳跃、点击/Z 射击；音效走 audio-basic 实证链（手势内 play）。
 *
 * 断言失败：pcheck → throw → pageerror → no-runtime-error 红。
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    Component,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
    Texture2D,
    input,
    Input,
    KeyCode,
    isValid,
    assetManager,
    AudioSource,
    AudioClip,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';
import { copyCanvasRows } from '../../shared/canvas-texture.js';

const probe = {
    id: 'contra-action',
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
        throw new Error('[contra-action] assertion failed: ' + name + ' — ' + detail);
    }
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 关卡与纯逻辑核心
// ---------------------------------------------------------------------------

const LEVEL_W = 60; // cells
const VIEW_CELLS = 16;
const FIXED_DT = 1 / 60;
const GRAVITY = 22;
const JUMP_V = 9;
const RUN_SPEED = 5;
const BULLET_SPEED = 16;
const POOL_P = 8;
const POOL_E = 4;
const INVULN_STEPS = 90;

function buildTerrain(): number[] {
    const h = new Array(LEVEL_W).fill(2);
    h[16] = 0;
    h[17] = 0; // 坑 1（跳跃演示）
    h[40] = 0;
    h[41] = 0; // 坑 2
    for (let x = 22; x <= 26; x++) {
        h[x] = 3;
    } // 台地 1（Δ1 可跳上）
    for (let x = 32; x <= 36; x++) {
        h[x] = 3;
    } // 台地 2
    return h;
}

interface Enemy {
    kind: 'walker' | 'turret';
    x: number;
    y: number;
    home: number;
    dir: number;
    alive: boolean;
    cooldown: number;
}

interface Bullet {
    active: boolean;
    x: number;
    y: number;
    dx: number;
}

type PState = 'idle' | 'run' | 'air' | 'hurt' | 'dead';

class ContraGame {
    terrain = buildTerrain();
    px = 2;
    py = 2;
    vx = 0;
    vy = 0;
    facing = 1;
    hp = 3;
    onGround = true;
    invuln = 0;
    fireCd = 0;
    state: PState = 'idle';
    gameState: 'playing' | 'won' | 'over' = 'playing';
    steps = 0;
    scrollX = 0;
    apexY = 0;
    kills = 0;
    shotsFired = 0;
    bulletsSpent = 0;
    hitsTaken = 0;
    invulnSaves = 0;
    deaths = 0;
    flagX = 56;
    cmd = { left: false, right: false, jump: false, fire: false };
    enemies: Enemy[] = [];
    pBullets: Bullet[] = [];
    eBullets: Bullet[] = [];
    onChange: (() => void) | null = null;

    reset(): void {
        this.px = 2;
        this.py = this.groundAt(2);
        this.vx = 0;
        this.vy = 0;
        this.facing = 1;
        this.hp = 3;
        this.onGround = true;
        this.invuln = 0;
        this.fireCd = 0;
        this.state = 'idle';
        this.gameState = 'playing';
        this.steps = 0;
        this.scrollX = 0;
        this.apexY = 0;
        this.kills = 0;
        this.shotsFired = 0;
        this.bulletsSpent = 0;
        this.hitsTaken = 0;
        this.invulnSaves = 0;
        this.cmd = { left: false, right: false, jump: false, fire: false };
        this.enemies = [
            { kind: 'walker', x: 12, y: 2, home: 12, dir: -1, alive: true, cooldown: 0 },
            { kind: 'walker', x: 24, y: 3, home: 24, dir: 1, alive: true, cooldown: 0 },
            { kind: 'walker', x: 34, y: 3, home: 34, dir: -1, alive: true, cooldown: 0 },
            { kind: 'turret', x: 44, y: 2, home: 44, dir: -1, alive: true, cooldown: 60 },
            { kind: 'walker', x: 48, y: 2, home: 48, dir: 1, alive: true, cooldown: 0 },
        ];
        this.pBullets = [];
        for (let i = 0; i < POOL_P; i++) {
            this.pBullets.push({ active: false, x: 0, y: 0, dx: 0 });
        }
        this.eBullets = [];
        for (let i = 0; i < POOL_E; i++) {
            this.eBullets.push({ active: false, x: 0, y: 0, dx: 0 });
        }
        this.emit();
    }

    groundAt(x: number): number {
        const c = Math.max(0, Math.min(LEVEL_W - 1, Math.floor(x)));
        return this.terrain[c];
    }

    step(): void {
        if (this.gameState !== 'playing') {
            return;
        }
        this.steps++;
        const wasAir = !this.onGround;

        // 水平移动
        this.vx = 0;
        if (this.cmd.left) {
            this.vx = -RUN_SPEED;
            this.facing = -1;
        }
        if (this.cmd.right) {
            this.vx = RUN_SPEED;
            this.facing = 1;
        }
        // 跳跃（仅地面起跳——落地/跳跃边界）
        if (this.cmd.jump && this.onGround) {
            this.vy = JUMP_V;
            this.onGround = false;
            this.apexY = this.py;
        }
        // 积分
        this.px += this.vx * FIXED_DT;
        this.px = Math.max(0.5, Math.min(LEVEL_W - 0.5, this.px));
        this.vy -= GRAVITY * FIXED_DT;
        this.py += this.vy * FIXED_DT;
        const g = this.groundAt(this.px);
        if (this.py <= g && this.vy <= 0) {
            // 落地：位置吸附到地形高度（逐位确定性）
            this.py = g;
            this.vy = 0;
            this.onGround = true;
        } else if (this.py > g) {
            this.onGround = false;
        }
        if (g === 0 && this.py <= -1) {
            // 坠坑：扣血 + 复活到坑前
            this.damage();
            if (this.gameState === 'playing') {
                this.px = Math.max(0.5, this.px - 3);
                this.py = this.groundAt(this.px) + 1;
                this.vy = 0;
            }
        }
        if (!this.onGround) {
            this.apexY = Math.max(this.apexY, this.py);
        }

        // 射击（公共入口语义：冷却 + 对象池）
        if (this.fireCd > 0) {
            this.fireCd--;
        }
        if (this.cmd.fire && this.fireCd === 0) {
            this.fire();
        }

        // 动画状态机
        if (this.invuln > 0) {
            this.invuln--;
        }
        if (!this.onGround) {
            this.state = 'air';
        } else if (this.vx !== 0) {
            this.state = 'run';
        } else {
            this.state = 'idle';
        }
        void wasAir;

        // 敌人状态机
        for (const e of this.enemies) {
            if (!e.alive) {
                continue;
            }
            if (e.kind === 'walker') {
                e.x += e.dir * 1.2 * FIXED_DT;
                if (Math.abs(e.x - e.home) > 2) {
                    e.dir = -e.dir;
                }
                e.y = this.groundAt(e.x);
            } else {
                e.y = this.groundAt(e.x);
                if (e.cooldown > 0) {
                    e.cooldown--;
                } else if (Math.abs(e.x - this.px) < 12 && Math.abs(e.y - this.py) < 2) {
                    // 炮塔：朝玩家发射（敌弹池）
                    const b = this.eBullets.find((bb) => !bb.active);
                    if (b) {
                        b.active = true;
                        b.x = e.x;
                        b.y = e.y + 0.5;
                        b.dx = this.px > e.x ? 8 : -8;
                    }
                    e.cooldown = 120;
                }
            }
            // 接触伤害（碰撞层：敌我）
            if (Math.abs(e.x - this.px) < 0.7 && Math.abs(e.y + 0.4 - this.py) < 0.9) {
                this.damage();
            }
        }

        // 玩家弹丸
        for (const b of this.pBullets) {
            if (!b.active) {
                continue;
            }
            b.x += b.dx * BULLET_SPEED * FIXED_DT;
            if (b.x < this.scrollX - 1 || b.x > this.scrollX + VIEW_CELLS + 1 || this.groundAt(b.x) > b.y) {
                b.active = false;
                this.bulletsSpent++;
                continue;
            }
            for (const e of this.enemies) {
                if (e.alive && Math.abs(e.x - b.x) < 0.6 && Math.abs(e.y + 0.4 - b.y) < 0.7) {
                    e.alive = false;
                    b.active = false;
                    this.bulletsSpent++;
                    this.kills++;
                    break;
                }
            }
        }
        // 敌方弹丸
        for (const b of this.eBullets) {
            if (!b.active) {
                continue;
            }
            b.x += b.dx * FIXED_DT;
            if (b.x < 0 || b.x > LEVEL_W || this.groundAt(b.x) > b.y) {
                b.active = false;
                continue;
            }
            if (Math.abs(b.x - this.px) < 0.5 && Math.abs(b.y - (this.py + 0.4)) < 0.6) {
                b.active = false;
                this.damage();
            }
        }

        // 相机跟随 + 边界钳制（镜头边界断言的根据）
        const target = Math.max(0, Math.min(LEVEL_W - VIEW_CELLS, this.px - VIEW_CELLS / 2));
        this.scrollX = target;

        // 终点
        if (this.px >= this.flagX) {
            this.gameState = 'won';
        }
        this.emit();
    }

    fire(): boolean {
        if (this.fireCd > 0) {
            return false;
        }
        const b = this.pBullets.find((bb) => !bb.active);
        if (!b) {
            return false;
        }
        b.active = true;
        b.x = this.px + this.facing * 0.5;
        b.y = this.py + 0.5;
        b.dx = this.facing;
        this.fireCd = 12;
        this.shotsFired++;
        return true;
    }

    damage(): void {
        if (this.invuln > 0) {
            this.invulnSaves++; // 无敌帧免疫（计数证明「无敌期内不掉血」）
            return;
        }
        this.hp--;
        this.hitsTaken++;
        this.invuln = INVULN_STEPS;
        this.state = 'hurt';
        if (this.hp <= 0) {
            this.hp = 0;
            this.state = 'dead';
            this.gameState = 'over';
            this.deaths++;
        }
    }

    runSteps(n: number, cmd?: Partial<{ left: boolean; right: boolean; jump: boolean; fire: boolean }>): void {
        if (cmd) {
            Object.assign(this.cmd, cmd);
        }
        for (let i = 0; i < n && this.gameState === 'playing'; i++) {
            this.step();
        }
    }

    runUntil(
        pred: () => boolean,
        maxSteps: number,
        cmd?: Partial<{ left: boolean; right: boolean; jump: boolean; fire: boolean }>,
    ): boolean {
        if (cmd) {
            Object.assign(this.cmd, cmd);
        }
        for (let i = 0; i < maxSteps && this.gameState === 'playing'; i++) {
            if (pred()) {
                return true;
            }
            this.step();
        }
        return pred();
    }

    clearCmd(): void {
        this.cmd = { left: false, right: false, jump: false, fire: false };
    }

    activeP(): number {
        return this.pBullets.filter((b) => b.active).length;
    }

    private emit(): void {
        if (this.onChange) {
            this.onChange();
        }
    }
}

// ---------------------------------------------------------------------------
// 渲染（视口 canvas：scrollX 平移绘制 + 简单动画帧）
// ---------------------------------------------------------------------------

const PX = 32;
const VIEW_W = VIEW_CELLS * PX; // 512
const VIEW_H = 9 * PX; // 288

class ViewRenderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: Texture2D | null = null;
    pixels: Uint8Array;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = VIEW_W;
        this.canvas.height = VIEW_H;
        this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
        this.pixels = new Uint8Array(VIEW_W * VIEW_H * 4);
    }

    makeTexture(): Texture2D {
        const tex = new Texture2D();
        tex.reset({ width: VIEW_W, height: VIEW_H, format: Texture2D.PixelFormat.RGBA8888 });
        return tex;
    }

    draw(game: ContraGame): void {
        const ctx = this.ctx;
        // 天空
        ctx.fillStyle = '#101826';
        ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        ctx.fillStyle = '#1b2a40';
        for (let i = 0; i < 24; i++) {
            const sx = (((i * 97) % VIEW_W) + VIEW_W - ((game.scrollX * PX * 0.3) % VIEW_W)) % VIEW_W;
            ctx.fillRect(sx, (i * 53) % (VIEW_H * 0.5), 2, 2);
        }
        const wx = (worldX: number): number => (worldX - game.scrollX) * PX;
        const wy = (worldY: number): number => VIEW_H - worldY * PX; // y=世界格高度，画布倒序
        // 地形
        for (let c = Math.floor(game.scrollX); c < Math.min(LEVEL_W, game.scrollX + VIEW_CELLS + 1); c++) {
            const h = game.terrain[c];
            if (h <= 0) {
                continue;
            }
            ctx.fillStyle = '#3d7a3d';
            ctx.fillRect(wx(c), wy(h), PX, PX * 0.35);
            ctx.fillStyle = '#5a4632';
            ctx.fillRect(wx(c), wy(h) + PX * 0.35, PX, h * PX - PX * 0.35);
        }
        // 终点旗
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(wx(game.flagX), wy(2) - PX * 2.4, 3, PX * 2.4);
        ctx.fillStyle = '#e2c34c';
        ctx.fillRect(wx(game.flagX) + 3, wy(2) - PX * 2.4, 18, 12);
        // 敌人
        for (const e of game.enemies) {
            if (!e.alive) {
                continue;
            }
            ctx.fillStyle = e.kind === 'walker' ? '#d1584f' : '#8a63c9';
            ctx.fillRect(wx(e.x) - 10, wy(e.y) - 26, 20, 26);
            ctx.fillStyle = '#2a2a33';
            ctx.fillRect(wx(e.x) - 6, wy(e.y) - 22, 12, 6);
        }
        // 弹丸
        ctx.fillStyle = '#ffe27a';
        for (const b of game.pBullets) {
            if (b.active) {
                ctx.fillRect(wx(b.x) - 3, wy(b.y) - 3, 7, 4);
            }
        }
        ctx.fillStyle = '#ff9d5c';
        for (const b of game.eBullets) {
            if (b.active) {
                ctx.fillRect(wx(b.x) - 3, wy(b.y) - 3, 6, 6);
            }
        }
        // 玩家（无敌帧闪烁；跑步两帧摆动）
        const blink = game.invuln > 0 && Math.floor(game.steps / 4) % 2 === 0;
        if (!blink && game.state !== 'dead') {
            const legSwing = game.state === 'run' ? Math.sin(game.steps * 0.4) * 4 : 0;
            ctx.fillStyle = '#4f86d1';
            ctx.fillRect(wx(game.px) - 8, wy(game.py) - 30, 16, 22);
            ctx.fillStyle = '#38608f';
            ctx.fillRect(wx(game.px) - 7, wy(game.py) - 8, 5 + legSwing, 8);
            ctx.fillRect(wx(game.px) + 2, wy(game.py) - 8, 5 - legSwing, 8);
            ctx.fillStyle = '#d8dee9'; // 枪管
            ctx.fillRect(wx(game.px) + (game.facing > 0 ? 6 : -14), wy(game.py) - 22, 8, 3);
        }
        // HUD（画布内）：hp 心 + kills + state
        for (let i = 0; i < 3; i++) {
            ctx.fillStyle = i < game.hp ? '#e2574c' : '#3a3f4a';
            ctx.fillRect(8 + i * 18, 8, 14, 12);
        }
        ctx.fillStyle = '#9cd';
        ctx.font = '12px monospace';
        ctx.fillText(
            `${game.gameState.toUpperCase()} kills:${game.kills} x:${game.px.toFixed(1)}/${game.flagX}`,
            70,
            18,
        );
        if (this.texture) {
            const img = ctx.getImageData(0, 0, VIEW_W, VIEW_H);
            copyCanvasRows(img, this.pixels);
            this.texture.uploadData(this.pixels);
        }
    }
}

// ---------------------------------------------------------------------------
// 组装 + 演示
// ---------------------------------------------------------------------------

let scene: Scene;
let generation = 0;
let game: ContraGame;
let view: ViewRenderer;
let boardMaterial: Material | null = null;
let boardNode: Node | null = null;
let audioSrc: AudioSource | null = null;
let shotClip: AudioClip | null = null;

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace;z-index:10;white-space:pre';
document.body.appendChild(panel);
function renderPanel(): void {
    panel.textContent = [
        `contra-action · gen${generation} · ${game.gameState.toUpperCase()} · hp ${game.hp} · ${game.state} · kills ${game.kills}`,
        `x ${game.px.toFixed(1)} scroll ${game.scrollX.toFixed(1)} shots ${game.shotsFired} spent ${game.bulletsSpent} invulnSaves ${game.invulnSaves}`,
        '←/→ 移动 · ↑/空格 跳 · 点击/Z 射击 · 到达旗帜获胜',
    ].join('\n');
}

function buildBoard(): void {
    view.texture = view.makeTexture();
    boardMaterial = new Material();
    boardMaterial.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
    boardMaterial.setProperty('mainColor', new Color(255, 255, 255, 255));
    boardMaterial.setProperty('mainTexture', view.texture);
    boardNode = new Node('Board');
    boardNode.layer = Layers.Enum.DEFAULT;
    boardNode.setPosition(new Vec3(0, 0, 0));
    boardNode.setRotationFromEuler(90, 0, 0);
    scene.addChild(boardNode);
    const renderer = boardNode.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(
        primitives.plane({ width: 6.8, length: 3.83, widthSegments: 1, lengthSegments: 1 }),
    );
    renderer.setSharedMaterial(boardMaterial, 0);
}

class ViewDriver extends Component {
    acc = 0;
    realtime = false;
    update(dt: number): void {
        if (this.realtime && game.gameState === 'playing') {
            this.acc += dt;
            let guard = 0;
            while (this.acc >= FIXED_DT && guard < 8) {
                this.acc -= FIXED_DT;
                game.step();
                guard++;
            }
        }
        view.draw(game);
        renderPanel();
    }
}

let driver: ViewDriver;

function buildScene(name: string): Scene {
    const s = new Scene(name);
    generation++;
    const cameraNode = new Node('Main Camera');
    s.addChild(cameraNode);
    cameraNode.setPosition(new Vec3(0, 0, 6));
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 2.3;
    camera.near = 0.1;
    camera.far = 20;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(8, 10, 16, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    camera.priority = 0;
    return s;
}

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;

    game = new ContraGame();
    view = new ViewRenderer();
    game.onChange = () => {
        /* 渲染由 ViewDriver 每帧驱动；逻辑变更仅触发面板 */
    };

    scene = buildScene('contra-action');
    buildBoard();
    const driverNode = new Node('Driver');
    driverNode.setPosition(new Vec3(0, 0, 0));
    scene.addChild(driverNode);
    driver = driverNode.addComponent(ViewDriver);
    const audioNode = new Node('Audio');
    audioNode.setPosition(new Vec3(0, 0, 0));
    scene.addChild(audioNode);
    audioNode.active = false; // 防止 onEnable 在配置前排入自动播放。
    audioSrc = audioNode.addComponent(AudioSource);
    audioSrc.playOnAwake = false;
    audioNode.active = true;

    app.run(scene);
    await sleep(350);

    // ---- 音频（audio-basic 实证链） ----
    try {
        shotClip = await new Promise<AudioClip>((resolve, reject) => {
            (assetManager as any).loadRemote('./assets/tone.wav', (err: unknown, clip: AudioClip) => {
                if (err) {
                    reject(err as Error);
                } else {
                    resolve(clip);
                }
            });
        });
        if (audioSrc && shotClip) {
            audioSrc.clip = shotClip;
            audioSrc.playOnAwake = false;
        }
        pcheck(
            'audio-clip-loaded',
            !!shotClip && shotClip.getDuration() > 0,
            'duration=' + (shotClip ? shotClip.getDuration() : -1),
        );
    } catch (e) {
        pcheck('audio-clip-loaded', false, 'loadRemote 失败: ' + String((e as Error).message || e));
    }

    // ---- 演示开始 ----
    game.reset();

    // C1 奔跑 + 相机跟随/边界
    game.runUntil(() => game.px >= 8, 600, { right: true });
    const scrollErr = Math.abs(game.scrollX - Math.max(0, Math.min(LEVEL_W - VIEW_CELLS, game.px - VIEW_CELLS / 2)));
    pcheck(
        'c1-camera-follows',
        game.px >= 8 && scrollErr < 0.01 && game.state === 'run',
        'px=' +
            game.px.toFixed(2) +
            ' scrollX=' +
            game.scrollX.toFixed(2) +
            ' err=' +
            scrollErr.toFixed(3) +
            ' state=' +
            game.state,
    );
    pcheck('c1-camera-bounds', game.scrollX >= 0 && game.scrollX <= LEVEL_W - VIEW_CELLS, 'scrollX=' + game.scrollX);

    // C3 射击巡逻兵（x=12 的 walker 在路径上）——先于跳跃，按关卡顺序
    game.runUntil(() => game.enemies[0].alive && Math.abs(game.enemies[0].x - game.px) < 5, 600, { right: true });
    game.clearCmd();
    const shotsBefore = game.shotsFired;
    const spentBefore = game.bulletsSpent;
    game.runSteps(2, { fire: true });
    game.clearCmd();
    pcheck(
        'c3-shot-from-pool',
        game.shotsFired === shotsBefore + 1 && game.activeP() === 1,
        'shots=' + game.shotsFired + ' activeP=' + game.activeP(),
    );
    game.runUntil(() => !game.enemies[0].alive, 180, {});
    pcheck(
        'c3-kill-and-recycle',
        game.kills === 1 && !game.enemies[0].alive && game.activeP() === 0 && game.bulletsSpent === spentBefore + 1,
        'kills=' + game.kills + ' activeP=' + game.activeP() + ' spent=' + game.bulletsSpent,
    );

    // C2 跳跃坑（16-17）：跑至 14 起跳 → apex → 落地边界
    game.runUntil(() => game.px >= 14, 600, { right: true });
    const py0 = game.py;
    game.runSteps(4, { right: true, jump: true }); // 起跳（首步触发，后续保持 right）
    game.cmd.jump = false;
    game.runUntil(() => game.onGround && game.px > 17.5, 240, { right: true });
    game.clearCmd();
    pcheck(
        'c2-jump-apex-and-landing',
        game.apexY > py0 + 0.8 && game.onGround && game.py === game.groundAt(game.px) && game.px > 17.5,
        'apex=' +
            game.apexY.toFixed(2) +
            ' py0=' +
            py0.toFixed(2) +
            ' landed y=' +
            game.py +
            ' ground=' +
            game.groundAt(game.px) +
            ' x=' +
            game.px.toFixed(2),
    );

    // C4 受伤 + 无敌帧：径直走向炮塔（x=44）吃弹 → 无敌期接触敌人不掉血 → 过期后再掉
    game.hp = 3;
    game.invuln = 0;
    game.runUntil(() => game.hitsTaken >= 1, 3600, { right: true }); // 途中接触敌人/吃弹都算
    game.clearCmd();
    const hpAfterFirst = game.hp;
    pcheck(
        'c4-first-hit-damages',
        hpAfterFirst === 2 && game.invuln > 0,
        'hp=' + hpAfterFirst + ' invuln=' + game.invuln + ' hitsTaken=' + game.hitsTaken,
    );
    // 无敌期内强制接触（把玩家放到存活 walker 身上）——hp 不得再掉
    const liveWalker = game.enemies.find((e) => e.alive && e.kind === 'walker');
    if (liveWalker) {
        game.px = liveWalker.x;
        game.py = liveWalker.y;
        const savesBefore = game.invulnSaves;
        game.runSteps(30, {});
        pcheck(
            'c4-invuln-immunity',
            game.hp === hpAfterFirst && game.invulnSaves > savesBefore,
            'hp=' + game.hp + ' saves=' + game.invulnSaves,
        );
        // 无敌过期后接触 → 再掉血
        game.invuln = 0;
        game.px = liveWalker.x;
        game.py = liveWalker.y;
        game.runSteps(2, {});
        pcheck('c4-damage-after-invuln', game.hp === hpAfterFirst - 1, 'hp=' + game.hp);
    } else {
        pcheck('c4-invuln-immunity', false, '无存活 walker 可供无敌帧接触演示');
    }
    game.clearCmd();

    // C5 终点 → WON（脚本特权：直接推进到旗前，避免超长奔跑）
    game.hp = 3;
    game.invuln = INVULN_STEPS;
    game.px = game.flagX - 2;
    game.py = game.groundAt(game.flagX - 2);
    game.runUntil(() => game.gameState === 'won', 300, { right: true });
    pcheck(
        'c5-reach-goal-won',
        game.gameState === 'won' && game.px >= game.flagX,
        'state=' + game.gameState + ' x=' + game.px.toFixed(2),
    );

    // 重开 → 死亡演示（贴身 walker 持续接触至 hp=0）
    game.reset();
    const walker0 = game.enemies[0];
    let guard = 0;
    while (game.gameState === 'playing' && guard < 3000) {
        game.px = walker0.x + 0.3; // 脚本特权：保持贴身（接触伤害 + 无敌帧轮转直至阵亡）
        game.py = walker0.y;
        game.step();
        guard++;
    }
    pcheck(
        'c5-death-and-over',
        game.gameState === 'over' && game.hp === 0 && game.deaths === 1,
        'state=' + game.gameState + ' hp=' + game.hp + ' deaths=' + game.deaths + ' steps=' + guard,
    );

    // C6 场景复入（app.run 重建同构场景 → 世代全新；旧渲染资产先行显式释放，不留孤儿）
    const genBefore = generation;
    game.reset();
    const oldScene = scene;
    if (view.texture) {
        view.texture.destroy();
        view.texture = null;
    }
    if (boardMaterial) {
        boardMaterial.destroy();
        boardMaterial = null;
    }
    scene = buildScene('contra-action');
    buildBoard();
    const driverNode2 = new Node('Driver');
    driverNode2.setPosition(new Vec3(0, 0, 0));
    scene.addChild(driverNode2);
    driver = driverNode2.addComponent(ViewDriver);
    const audioNode2 = new Node('Audio');
    audioNode2.setPosition(new Vec3(0, 0, 0));
    scene.addChild(audioNode2);
    audioNode2.active = false; // 防止 onEnable 在配置前排入自动播放。
    audioSrc = audioNode2.addComponent(AudioSource);
    audioSrc.playOnAwake = false;
    audioNode2.active = true;
    if (shotClip) {
        audioSrc.clip = shotClip;
        audioSrc.playOnAwake = false;
    }
    app.run(scene);
    await sleep(300);
    pcheck(
        'c6-scene-reentry-fresh',
        generation === genBefore + 1 && !isValid(oldScene) && isValid(scene) && game.steps >= 0,
        'gen ' + genBefore + '→' + generation + ' oldSceneValid=' + isValid(oldScene),
    );
    game.reset();
    driver.realtime = true;

    // ---- 交互 ----
    const onKeyDown = (event: any): void => {
        const code = event.keyCode;
        if (code === KeyCode.ARROW_LEFT) {
            game.cmd.left = true;
        } else if (code === KeyCode.ARROW_RIGHT) {
            game.cmd.right = true;
        } else if (code === KeyCode.ARROW_UP || code === KeyCode.SPACE) {
            game.cmd.jump = true;
        } else if (code === KeyCode.KEY_Z) {
            onFire();
        }
    };
    const onKeyUp = (event: any): void => {
        const code = event.keyCode;
        if (code === KeyCode.ARROW_LEFT) {
            game.cmd.left = false;
        } else if (code === KeyCode.ARROW_RIGHT) {
            game.cmd.right = false;
        } else if (code === KeyCode.ARROW_UP || code === KeyCode.SPACE) {
            game.cmd.jump = false;
        }
    };
    function onFire(): void {
        const fired = game.fire();
        if (fired && audioSrc && shotClip) {
            try {
                audioSrc.stop();
                audioSrc.play(); // 手势回调内播放（audio-basic 实证口径）
            } catch (e) {
                /* 如实忽略：浏览器策略拒绝入 state */
            }
            probe.state.audioState = String((audioSrc as any).state);
        }
        if (!probe.clickPhaseDone) {
            probe.clickPhaseDone = true;
            pcheck(
                'click-fires-through-public-entry',
                fired || game.fireCd > 0,
                'fired=' + fired + ' cooldown=' + game.fireCd + ' shots=' + game.shotsFired,
            );
        }
    }
    const onClick = (): void => {
        onFire();
    };
    input.on(Input.EventType.KEY_DOWN, onKeyDown);
    input.on(Input.EventType.KEY_UP, onKeyUp);
    input.on(Input.EventType.TOUCH_START, onClick);

    // ---- §25 Lifecycle 合同 ----
    installAssetLifecycle({
        label: 'contra-action',
        hold: () => {
            const held: { name: string; ref: object }[] = [];
            if (view.texture) {
                held.push({ name: 'Texture2D(view)', ref: view.texture });
            }
            if (boardMaterial) {
                held.push({ name: 'Material(board)', ref: boardMaterial });
            }
            if (boardNode) {
                held.push({ name: 'BoardNode', ref: boardNode });
            }
            if (shotClip) {
                held.push({ name: 'AudioClip(tone)', ref: shotClip });
            }
            return held;
        },
        release: () => {
            input.off(Input.EventType.KEY_DOWN, onKeyDown);
            input.off(Input.EventType.KEY_UP, onKeyUp);
            input.off(Input.EventType.TOUCH_START, onClick);
            driver.realtime = false;
            game.gameState = 'over';
            if (audioSrc) {
                audioSrc.stop();
                audioSrc.clip = null;
            }
            if (shotClip) {
                assetManager.releaseAsset(shotClip);
                shotClip = null;
            } // audio-basic 实证口径
            if (boardNode) {
                boardNode.destroy();
                boardNode = null;
            }
            if (boardMaterial) {
                boardMaterial.destroy();
                boardMaterial = null;
            }
            if (view.texture) {
                view.texture.destroy();
                view.texture = null;
            }
        },
        reacquire: async () => {
            await sleep(300);
            buildBoard(); // 仅重建渲染资产（ViewDriver 组件属当前场景，复用）
            try {
                shotClip = await new Promise<AudioClip>((resolve, reject) => {
                    (assetManager as any).loadRemote('./assets/tone.wav', (err: unknown, clip: AudioClip) => {
                        if (err) {
                            reject(err as Error);
                        } else {
                            resolve(clip);
                        }
                    });
                });
                if (audioSrc && shotClip) {
                    audioSrc.clip = shotClip;
                    audioSrc.playOnAwake = false;
                }
            } catch (e) {
                /* 重载失败如实走泄漏核对 */
            }
            game.reset();
            driver.realtime = true;
            input.on(Input.EventType.KEY_DOWN, onKeyDown);
            input.on(Input.EventType.KEY_UP, onKeyUp);
            input.on(Input.EventType.TOUCH_START, onClick);
            const held: { name: string; ref: object }[] = [
                { name: 'Texture2D(view)', ref: view.texture as object },
                { name: 'Material(board)', ref: boardMaterial as object },
                { name: 'BoardNode', ref: boardNode as object },
            ];
            if (shotClip) {
                held.push({ name: 'AudioClip(tone)', ref: shotClip });
            }
            return held;
        },
    });

    renderPanel();
    probe.state.game = {
        gameState: game.gameState,
        hp: game.hp,
        kills: game.kills,
        shotsFired: game.shotsFired,
        bulletsSpent: game.bulletsSpent,
        invulnSaves: game.invulnSaves,
        deaths: game.deaths,
        generation,
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
