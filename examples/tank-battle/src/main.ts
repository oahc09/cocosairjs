/**
 * tank-battle — 经典游戏：坦克大战（G2 · 最小完整循环）。
 *
 * 覆盖重点（计划书 G2 表）：明确的网格碰撞（cell 级，非物理后端——如实标注）、弹丸对象池、
 * 敌人状态机、音效与资源回收；验证弹丸销毁、障碍阻挡和同时命中。
 *
 * 架构纪律（G3 范式）：TankGame 纯逻辑（网格/实体/对象池/固定步长，零引擎依赖）；
 * BoardRenderer 渲染分离（canvas → Texture2D.uploadData）；main.ts 组装 + 确定性演示。
 *
 * 确定性自动演示（手动步进 = 与实时解耦的逐位可复现，physics-interaction 同款纪律）：
 * - D1 弹丸对象池：开火 → 池中 1 发激活；命中砖墙 → 砖格销毁、弹丸回池（activeCount 归零）；
 * - D2 障碍阻挡：钢块挡弹——弹丸回池、钢格完好、blockedBySteel 计数；
 * - D3 同时命中：同一步注入两发同位置弹丸 → 同一步双命中同一敌人（hp2 → 击毁），
 *   两发均回池、无重复击杀崩溃；
 * - D4 负局：敌人对齐射击 scripted 步进 → 玩家被敌方弹丸命中（playerHitsByEnemy>0）→
 *   持续至 hp=0 → OVER → 重开复位（网格/池/实体全量断言）；
 * - D5 胜局：重开后逐个 script 齐射击毁全部敌人 → enemyKills=2 → WON → 重开进入交互模式。
 * - 音效：assetManager.loadRemote 加载 tone.wav（仓库生成器产物）→ getDuration>0 断言；
 *   首次点击手势内 play()（浏览器自动播放策略内的合法时机），状态如实记录。
 * 交互：方向键移动、空格/点击开火（走与脚本同一 fire() 入口，含冷却）。
 *
 * 断言失败：pcheck → throw → pageerror → no-runtime-error 红。
 */

import {
    createAirApp, Scene, Node, MeshRenderer, Camera, Component, Layers, Vec3, Color, Material,
    utils, primitives, Texture2D, input, Input, KeyCode, isValid,
    assetManager, AudioSource, AudioClip,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const probe = {
    id: 'tank-battle',
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
        throw new Error('[tank-battle] assertion failed: ' + name + ' — ' + detail);
    }
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 纯逻辑核心（网格碰撞：cell 级判定，非物理后端）
// ---------------------------------------------------------------------------

const COLS = 16;
const ROWS = 12;
const FIXED_DT = 1 / 60;
const POOL_SIZE = 16;
const BULLET_SPEED = 12; // cells/s
const PLAYER_SPEED = 4;
const ENEMY_SPEED = 2;

// 地图（row0 = 底部）：# 砖（可毁） S 钢（不可毁） . 空
const MAP: string[] = [
    '................',
    '..#....SS....#..',
    '..#....SS....#..',
    '................',
    '....##....##....',
    '....##....##....',
    '................',
    '..#....SS....#..',
    '..#....SS....#..',
    '................',
    '....##....##....',
    '................',
];

interface Bullet {
    active: boolean;
    x: number;
    y: number;
    dx: number;
    dy: number;
    fromEnemy: boolean;
}

interface Tank {
    x: number;
    y: number;
    dir: number; // 0上 1右 2下 3左
    hp: number;
    alive: boolean;
    cooldown: number;
    route: number[][];
    routeIdx: number;
    pause: number;
}

const DIRV = [[0, 1], [1, 0], [0, -1], [-1, 0]];

class TankGame {
    grid: string[][] = [];
    pool: Bullet[] = [];
    player: Tank = this.makeTank(1.5, 0.5, 0, 3, []);
    enemies: Tank[] = [];
    state: 'idle' | 'playing' | 'won' | 'over' = 'idle';
    steps = 0;
    shotsFired = 0;
    bricksDestroyed = 0;
    blockedBySteel = 0;
    bulletsSpent = 0; // 回池总数（销毁=回收语义）
    playerHitsByEnemy = 0;
    enemyKills = 0;
    simultaneousDoubleHit = 0;
    cmd = { up: false, down: false, left: false, right: false };

    onChange: (() => void) | null = null;

    makeTank(x: number, y: number, dir: number, hp: number, route: number[][]): Tank {
        return { x, y, dir, hp, alive: true, cooldown: 0, route, routeIdx: 0, pause: 0 };
    }

    reset(): void {
        this.grid = MAP.map((row) => row.split(''));
        this.pool = [];
        for (let i = 0; i < POOL_SIZE; i++) {
            this.pool.push({ active: false, x: 0, y: 0, dx: 0, dy: 0, fromEnemy: false });
        }
        this.player = this.makeTank(1.5, 0.5, 0, 3, []);
        this.enemies = [
            this.makeTank(13.5, 10.5, 2, 2, [[13.5, 6.5], [9.5, 6.5], [9.5, 10.5], [13.5, 10.5]]),
            this.makeTank(13.5, 1.5, 0, 2, [[13.5, 5.5], [9.5, 5.5], [9.5, 1.5], [13.5, 1.5]]),
        ];
        this.state = 'playing';
        this.steps = 0;
        this.shotsFired = 0;
        this.bricksDestroyed = 0;
        this.blockedBySteel = 0;
        this.bulletsSpent = 0;
        this.playerHitsByEnemy = 0;
        this.enemyKills = 0;
        this.simultaneousDoubleHit = 0;
        this.cmd = { up: false, down: false, left: false, right: false };
        this.emit();
    }

    cellAt(x: number, y: number): string {
        const c = Math.floor(x);
        const r = Math.floor(y);
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) {
            return 'X'; // 边界 = 不可通行
        }
        return this.grid[r][c];
    }

    blockedForTank(x: number, y: number): boolean {
        // 坦克占 0.9 格：四角采样
        const h = 0.45;
        for (const [sx, sy] of [[-h, -h], [h, -h], [-h, h], [h, h]]) {
            const cell = this.cellAt(x + sx, y + sy);
            if (cell !== '.') {
                return true;
            }
        }
        return false;
    }

    acquireBullet(x: number, y: number, dir: number, fromEnemy: boolean): Bullet | null {
        const b = this.pool.find((p) => !p.active);
        if (!b) {
            return null;
        }
        b.active = true;
        b.x = x + DIRV[dir][0] * 0.5;
        b.y = y + DIRV[dir][1] * 0.5;
        b.dx = DIRV[dir][0];
        b.dy = DIRV[dir][1];
        b.fromEnemy = fromEnemy;
        this.shotsFired++;
        return b;
    }

    fire(tank: Tank, fromEnemy: boolean): boolean {
        if (tank.cooldown > 0 || !tank.alive) {
            return false;
        }
        const b = this.acquireBullet(tank.x, tank.y, tank.dir, fromEnemy);
        if (!b) {
            return false;
        }
        tank.cooldown = fromEnemy ? 90 : 30;
        return true;
    }

    /** 固定步长推进（手动/累加器共用同一入口——演示逐位可复现的根据）。 */
    step(): void {
        if (this.state !== 'playing') {
            return;
        }
        this.steps++;
        // 玩家移动
        const p = this.player;
        if (p.alive) {
            let dx = 0;
            let dy = 0;
            if (this.cmd.up) { dy = 1; p.dir = 0; } else if (this.cmd.down) { dy = -1; p.dir = 2; } else if (this.cmd.left) { dx = -1; p.dir = 3; } else if (this.cmd.right) { dx = 1; p.dir = 1; }
            if (dx !== 0 || dy !== 0) {
                const nx = p.x + dx * PLAYER_SPEED * FIXED_DT;
                const ny = p.y + dy * PLAYER_SPEED * FIXED_DT;
                if (!this.blockedForTank(nx, ny)) {
                    p.x = nx;
                    p.y = ny;
                }
            }
            if (p.cooldown > 0) { p.cooldown--; }
        }
        // 敌人状态机：巡逻 → 对齐玩家则转向并射击
        for (const e of this.enemies) {
            if (!e.alive) {
                continue;
            }
            if (e.cooldown > 0) {
                e.cooldown--;
            }
            if (p.alive) {
                const alignedCol = Math.abs(e.x - p.x) < 0.4;
                const alignedRow = Math.abs(e.y - p.y) < 0.4;
                if (alignedCol || alignedRow) {
                    e.dir = alignedCol ? (p.y > e.y ? 0 : 2) : (p.x > e.x ? 1 : 3);
                    if (e.cooldown === 0) {
                        this.fire(e, true);
                    }
                    e.pause = 20; // 对齐射击时短暂停驻（可被玩家利用的经典行为）
                }
            }
            if (e.pause > 0) {
                e.pause--;
                continue;
            }
            const target = e.route[e.routeIdx];
            const tdx = target[0] - e.x;
            const tdy = target[1] - e.y;
            const dist = Math.abs(tdx) + Math.abs(tdy);
            if (dist < 0.08) {
                e.routeIdx = (e.routeIdx + 1) % e.route.length;
                continue;
            }
            const mx = tdx !== 0 ? Math.sign(tdx) * Math.min(Math.abs(tdx), ENEMY_SPEED * FIXED_DT) : 0;
            const my = tdy !== 0 ? Math.sign(tdy) * Math.min(Math.abs(tdy), ENEMY_SPEED * FIXED_DT) : 0;
            if (!this.blockedForTank(e.x + mx, e.y + my)) {
                e.x += mx;
                e.y += my;
            } else {
                e.routeIdx = (e.routeIdx + 1) % e.route.length; // 被堵 → 换下一巡逻点
            }
        }
        // 弹丸推进 + 碰撞（同一遍处理所有活跃弹丸 → 同时命中天然成立）
        const hitThisStep = new Map<Tank, number>();
        for (const b of this.pool) {
            if (!b.active) {
                continue;
            }
            b.x += b.dx * BULLET_SPEED * FIXED_DT;
            b.y += b.dy * BULLET_SPEED * FIXED_DT;
            const cell = this.cellAt(b.x, b.y);
            if (cell === 'X') {
                b.active = false;
                this.bulletsSpent++;
                continue;
            }
            if (cell === '#' || cell === 'S') {
                if (cell === '#') {
                    this.grid[Math.floor(b.y)][Math.floor(b.x)] = '.';
                    this.bricksDestroyed++;
                } else {
                    this.blockedBySteel++;
                }
                b.active = false;
                this.bulletsSpent++;
                continue;
            }
            // 坦克命中（敌方弹丸打玩家、玩家弹丸打敌人）
            const targets: Tank[] = b.fromEnemy ? [this.player] : this.enemies;
            for (const t of targets) {
                if (!t.alive) {
                    continue;
                }
                if (Math.abs(b.x - t.x) < 0.55 && Math.abs(b.y - t.y) < 0.55) {
                    b.active = false;
                    this.bulletsSpent++;
                    hitThisStep.set(t, (hitThisStep.get(t) || 0) + 1);
                    break;
                }
            }
        }
        // 同一步的多发命中统一结算（同时命中：hp 一次扣减全部命中数）
        for (const [t, hits] of hitThisStep) {
            if (hits >= 2) {
                this.simultaneousDoubleHit++;
            }
            t.hp -= hits;
            if (t === this.player) {
                this.playerHitsByEnemy += hits;
            }
            if (t.hp <= 0 && t.alive) {
                t.alive = false;
                if (t !== this.player) {
                    this.enemyKills++;
                }
            }
        }
        // 终局判定
        if (!this.player.alive || this.player.hp <= 0) {
            this.state = 'over';
        } else if (this.enemies.every((e) => !e.alive)) {
            this.state = 'won';
        }
        this.emit();
    }

    runSteps(n: number): void {
        for (let i = 0; i < n && this.state === 'playing'; i++) {
            this.step();
        }
    }

    private emit(): void {
        if (this.onChange) {
            this.onChange();
        }
    }
}

// ---------------------------------------------------------------------------
// 渲染（网格+实体 → canvas → uploadData）
// ---------------------------------------------------------------------------

const PX = 32;

class BoardRenderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: Texture2D | null = null;
    pixels: Uint8Array;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = COLS * PX;
        this.canvas.height = ROWS * PX;
        this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
        this.pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    }

    makeTexture(): Texture2D {
        const tex = new Texture2D();
        tex.reset({ width: this.canvas.width, height: this.canvas.height, format: Texture2D.PixelFormat.RGBA8888 });
        return tex;
    }

    draw(game: TankGame): void {
        if (game.grid.length !== ROWS) {
            return;
        }
        const ctx = this.ctx;
        ctx.fillStyle = '#0c0f14';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const cell = game.grid[r][c];
                if (cell === '.') {
                    continue;
                }
                // 画布 y 倒序（row0=底部）
                const y = (ROWS - 1 - r) * PX;
                ctx.fillStyle = cell === '#' ? '#9c5a3c' : '#8a93a3';
                ctx.fillRect(c * PX + 1, y + 1, PX - 2, PX - 2);
                if (cell === '#') {
                    ctx.fillStyle = 'rgba(0,0,0,0.28)';
                    ctx.fillRect(c * PX + 1, y + PX / 2 - 1, PX - 2, 2);
                    ctx.fillRect(c * PX + PX / 2 - 1, y + 1, 2, PX - 2);
                }
            }
        }
        const drawTank = (t: Tank, body: string): void => {
            if (!t.alive) {
                return;
            }
            const x = t.x * PX;
            const y = (ROWS - t.y) * PX; // 中心锚点：row0=底部 → 画布 y 翻转
            ctx.fillStyle = body;
            ctx.fillRect(x - PX * 0.4, y - PX * 0.4, PX * 0.8, PX * 0.8);
            ctx.fillStyle = '#d8dee9';
            const bw = PX * 0.5;
            const bh = PX * 0.16;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-t.dir * Math.PI / 2); // dir0=上 → 画布 -y
            ctx.fillRect(-bh / 2, -PX * 0.4 - bw + PX * 0.4, bh, bw);
            ctx.restore();
            // hp 点
            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < t.hp; i++) {
                ctx.fillRect(x - PX * 0.35 + i * 7, y + PX * 0.28, 5, 3);
            }
        };
        drawTank(game.player, '#57b65b');
        for (const e of game.enemies) {
            drawTank(e, '#d16a4f');
        }
        ctx.fillStyle = '#f2f2f2';
        for (const b of game.pool) {
            if (b.active) {
                ctx.fillRect(b.x * PX - 2, (ROWS - b.y) * PX - 2, 5, 5);
            }
        }
        if (this.texture) {
            const img = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            this.pixels.set(img.data);
            this.texture.uploadData(this.pixels);
        }
    }
}

// ---------------------------------------------------------------------------
// 组装 + 演示
// ---------------------------------------------------------------------------

let scene: Scene;
let game: TankGame;
let board: BoardRenderer;
let boardMaterial: Material | null = null;
let boardNode: Node | null = null;
let audioSrc: AudioSource | null = null;
let shotClip: AudioClip | null = null;

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace;z-index:10;white-space:pre';
document.body.appendChild(panel);
function renderPanel(): void {
    panel.textContent = [
        `tank-battle · ${game.state.toUpperCase()} · hp ${game.player.hp} · kills ${game.enemyKills}/2 · steps ${game.steps}`,
        `shots ${game.shotsFired} · bricks ${game.bricksDestroyed} · steel-blocks ${game.blockedBySteel} · pool-spent ${game.bulletsSpent}`,
        '方向键移动 · 空格/点击开火 · 演示自动先行（弹池/阻挡/双命中/胜负/重开）',
    ].join('\n');
}

function buildBoard(): void {
    board.texture = board.makeTexture();
    boardMaterial = new Material();
    boardMaterial.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
    boardMaterial.setProperty('mainColor', new Color(255, 255, 255, 255));
    boardMaterial.setProperty('mainTexture', board.texture);
    boardNode = new Node('Board');
    boardNode.layer = Layers.Enum.DEFAULT;
    boardNode.setPosition(new Vec3(0, 0, 0));
    boardNode.setRotationFromEuler(90, 0, 0);
    scene.addChild(boardNode);
    const renderer = boardNode.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.plane({ width: 6.4, length: 4.8, widthSegments: 1, lengthSegments: 1 }));
    renderer.setSharedMaterial(boardMaterial, 0);
}

/** 实时驱动：累加器固定步长（暂停=不累加；演示期为手动步进，此驱动只服务交互模式）。 */
class GameDriver extends Component {
    acc = 0;
    realtime = false;
    update(dt: number): void {
        if (!this.realtime || game.state !== 'playing') {
            return;
        }
        this.acc += dt;
        let guard = 0;
        while (this.acc >= FIXED_DT && guard < 8) {
            this.acc -= FIXED_DT;
            game.step();
            guard++;
        }
        board.draw(game);
    }
}

let driver: GameDriver;

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    scene = new Scene('tank-battle');

    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(new Vec3(0, 0, 6));
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 2.75;
    camera.near = 0.1;
    camera.far = 20;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(10, 12, 18, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    camera.priority = 0;

    game = new TankGame();
    board = new BoardRenderer();
    game.onChange = renderPanel;
    buildBoard();
    const driverNode = new Node('Driver');
    driverNode.setPosition(new Vec3(0, 0, 0));
    scene.addChild(driverNode);
    driver = driverNode.addComponent(GameDriver);

    // 音效节点（AudioSource 挂空节点；资源走 audio-basic 实证路径 loadRemote）
    const audioNode = new Node('Audio');
    audioNode.setPosition(new Vec3(0, 0, 0));
    scene.addChild(audioNode);
    audioSrc = audioNode.addComponent(AudioSource);

    app.run(scene);
    await sleep(350);

    // ---- 音频加载（真实资产链） ----
    let audioLoaded = false;
    try {
        // loadRemote 为回调式 API（audio-basic 实证口径），包一层 Promise
        shotClip = await new Promise<AudioClip>((resolve, reject) => {
            (assetManager as any).loadRemote('./assets/tone.wav', (err: unknown, clip: AudioClip) => {
                if (err) {
                    reject(err as Error);
                } else {
                    resolve(clip);
                }
            });
        });
        audioLoaded = !!shotClip && shotClip.getDuration() > 0;
        if (audioSrc && shotClip) {
            audioSrc.clip = shotClip;
            audioSrc.playOnAwake = false;
        }
    } catch (e) {
        probe.state.audioLoadError = String((e as Error).message || e);
    }
    pcheck('audio-clip-loaded', audioLoaded, 'clip=' + !!shotClip + ' duration=' + (shotClip ? shotClip.getDuration() : -1));

    const activeCount = (): number => game.pool.filter((b) => b.active).length;

    // ---- D1 弹丸对象池：开火 → 激活 → 命中砖墙 → 回池 + 砖毁 ----
    game.reset();
    game.player.x = 7.5;
    game.player.y = 0.5;
    game.player.dir = 0; // 朝上，正对 row1 的砖? map row1 col7 = 'S'… 选朝左对准 col4-5 砖块行
    // 明确布局：玩家置于 (7.5,3.5)（row3 全空），朝上打 row4 col7 的 '#'? row4='....##....##....' col7='#'? 索引4,5与10,11是#。
    // 取玩家在 (4.5,3.5) 朝上：row4 col4='#' ✓
    game.player.x = 4.5;
    game.player.y = 3.5;
    game.player.dir = 0;
    pcheck('d1-pool-idle-initial', activeCount() === 0, 'active=' + activeCount());
    game.player.cooldown = 0;
    const fired1 = game.fire(game.player, false);
    pcheck('d1-shot-acquired-from-pool', fired1 && activeCount() === 1, 'fired=' + fired1 + ' active=' + activeCount());
    // 手动步进至弹丸命中 row4 砖（距离 ~1 格 → <10 步）
    game.runSteps(30);
    pcheck('d1-brick-destroyed-bullet-recycled',
        game.bricksDestroyed === 1 && activeCount() === 0 && game.bulletsSpent === 1 && game.grid[4][4] === '.',
        'bricks=' + game.bricksDestroyed + ' active=' + activeCount() + ' spent=' + game.bulletsSpent + ' cell=' + game.grid[4][4]);

    // ---- D2 钢块阻挡 ----
    game.reset();
    game.player.x = 6.5;
    game.player.y = 5.5; // row5='....##....##....'? 钢在 row7-8 col7-8；取玩家 (7.5,6.5) 朝上打 row7 col7='S'
    game.player.x = 7.5;
    game.player.y = 6.5;
    game.player.dir = 0;
    game.player.cooldown = 0;
    game.fire(game.player, false);
    game.runSteps(30);
    pcheck('d2-steel-blocks-bullet',
        game.blockedBySteel === 1 && game.bricksDestroyed === 0 && activeCount() === 0 && game.grid[7][7] === 'S',
        'steelBlocks=' + game.blockedBySteel + ' cell=' + game.grid[7][7] + ' active=' + activeCount());

    // ---- D3 同时命中（同一步注入两发 → 同步双命中） ----
    game.reset();
    const victim = game.enemies[0];
    victim.x = 13.5;
    victim.y = 10.5;
    victim.hp = 2;
    game.player.x = 13.5;
    game.player.y = 6.5; // 与敌人同列（col13），row7-8 col13 为空? row7='..#....SS....#..' col13='#'！会挡弹。
    // 改走 row9（全空）上方同列：玩家在 (13.5, 6.5) 会被 row7 col13 砖挡住 → 先清掉路径砖（演示脚本特权，如实注释）
    game.grid[7][13] = '.';
    game.grid[8][13] = '.';
    game.player.dir = 0;
    game.player.cooldown = 0;
    game.fire(game.player, false);
    const b2 = game.acquireBullet(game.player.x, game.player.y, 0, false); // 脚本齐射第二发（绕过冷却＝测试钩子，如实标注）
    pcheck('d3-two-bullets-in-flight', activeCount() === 2 && !!b2, 'active=' + activeCount());
    game.runSteps(200);
    pcheck('d3-simultaneous-double-hit',
        game.simultaneousDoubleHit >= 1 && !victim.alive && game.enemyKills === 1 && activeCount() === 0,
        'doubleHits=' + game.simultaneousDoubleHit + ' victimAlive=' + victim.alive + ' kills=' + game.enemyKills + ' active=' + activeCount());

    // ---- D4 负局：敌弹命中玩家 → OVER → 重开复位 ----
    game.reset();
    // 玩家置于敌人巡逻列上不动（脚本：清空命令），步进直到被命中/终局（有界）
    game.player.x = 13.5;
    game.player.y = 8.5;
    game.grid[7][13] = '.';
    game.grid[8][13] = '.';
    let guardSteps = 0;
    while (game.state === 'playing' && guardSteps < 12000) {
        game.step();
        guardSteps++;
    }
    pcheck('d4-player-hit-by-enemy', game.playerHitsByEnemy >= 1, 'hitsByEnemy=' + game.playerHitsByEnemy + ' steps=' + guardSteps);
    pcheck('d4-lose-state', game.state === 'over' && game.player.hp <= 0,
        'state=' + game.state + ' hp=' + game.player.hp);
    game.reset();
    pcheck('d4-restart-fresh',
        game.state === 'playing' && game.player.hp === 3 && game.enemyKills === 0 && game.bulletsSpent === 0
        && activeCount() === 0 && game.grid[7][13] === '#' && game.enemies.every((e) => e.alive),
        'hp=' + game.player.hp + ' kills=' + game.enemyKills + ' brick-restored=' + (game.grid[7][13] === '#'));

    // ---- D5 胜局：冻结巡逻 + 逐个齐射（演示脚本特权如实标注）→ WON → 重开进入交互 ----
    for (const enemy of game.enemies) {
        enemy.pause = 100000; // 冻结移动（pause 只挡移动不挡射击——敌方仍会对齐开火，玩家 hp 足以承受）
        game.player.x = enemy.x;
        game.player.y = enemy.y - 2;
        game.player.dir = 0;
        const col = Math.floor(enemy.x);
        for (let r = Math.max(0, Math.floor(game.player.y) + 1); r <= Math.min(ROWS - 1, Math.floor(enemy.y)); r++) {
            game.grid[r][col] = '.'; // 清空射击走廊（脚本特权）
        }
        game.player.cooldown = 0;
        game.fire(game.player, false);
        game.acquireBullet(game.player.x, game.player.y, 0, false); // 齐射第二发（绕过冷却＝测试钩子）
        game.runSteps(90);
        if (game.state !== 'playing') {
            break;
        }
    }
    pcheck('d5-win-state', game.state === 'won' && game.enemyKills === 2 && game.player.hp > 0,
        'state=' + game.state + ' kills=' + game.enemyKills + ' hp=' + game.player.hp);
    game.reset();
    driver.realtime = true; // 交互模式：实时固定步长

    // ---- 交互：键盘 + 点击开火 ----
    const onKeyDown = (event: any): void => {
        const code = event.keyCode;
        if (code === KeyCode.ARROW_LEFT) { game.cmd.left = true; }
        else if (code === KeyCode.ARROW_UP) { game.cmd.up = true; }
        else if (code === KeyCode.ARROW_RIGHT) { game.cmd.right = true; }
        else if (code === KeyCode.ARROW_DOWN) { game.cmd.down = true; }
        else if (code === KeyCode.SPACE) { onFire(); }
    };
    const onKeyUp = (event: any): void => {
        const code = event.keyCode;
        if (code === KeyCode.ARROW_LEFT) { game.cmd.left = false; }
        else if (code === KeyCode.ARROW_UP) { game.cmd.up = false; }
        else if (code === KeyCode.ARROW_RIGHT) { game.cmd.right = false; }
        else if (code === KeyCode.ARROW_DOWN) { game.cmd.down = false; }
    };
    let audioStateRecorded = '';
    function onFire(): void {
        const before = game.shotsFired;
        game.fire(game.player, false);
        if (game.shotsFired > before && audioSrc && shotClip) {
            // 手势回调内 play()：浏览器自动播放策略内的合法时机（audio-basic 同款口径）
            try {
                audioSrc.stop();
                audioSrc.play();
            } catch (e) { /* 播放失败如实记录 */ }
            audioStateRecorded = String((audioSrc as any).state);
        }
        if (!probe.clickPhaseDone) {
            probe.clickPhaseDone = true;
            pcheck('fire-through-public-entry', game.shotsFired > before || game.player.cooldown > 0,
                'shotsFired=' + game.shotsFired + ' cooldown=' + game.player.cooldown);
        }
    }
    const onClick = (): void => { onFire(); };
    input.on(Input.EventType.KEY_DOWN, onKeyDown);
    input.on(Input.EventType.KEY_UP, onKeyUp);
    input.on(Input.EventType.TOUCH_START, onClick);

    // ---- §25 Lifecycle 合同 ----
    installAssetLifecycle({
        label: 'tank-battle',
        hold: () => {
            const held: { name: string; ref: object }[] = [];
            if (board.texture) { held.push({ name: 'Texture2D(board)', ref: board.texture }); }
            if (boardMaterial) { held.push({ name: 'Material(board)', ref: boardMaterial }); }
            if (boardNode) { held.push({ name: 'BoardNode', ref: boardNode }); }
            if (shotClip) { held.push({ name: 'AudioClip(tone)', ref: shotClip }); }
            return held;
        },
        release: () => {
            input.off(Input.EventType.KEY_DOWN, onKeyDown);
            input.off(Input.EventType.KEY_UP, onKeyUp);
            input.off(Input.EventType.TOUCH_START, onClick);
            driver.realtime = false;
            game.state = 'idle';
            if (audioSrc) { audioSrc.stop(); audioSrc.clip = null; }
            if (shotClip) { assetManager.releaseAsset(shotClip); shotClip = null; } // audio-basic 实证：releaseAsset 才会 assets.remove + destroy
            if (boardNode) { boardNode.destroy(); boardNode = null; }
            if (boardMaterial) { boardMaterial.destroy(); boardMaterial = null; }
            if (board.texture) { board.texture.destroy(); board.texture = null; }
        },
        reacquire: async () => {
            await sleep(300);
            buildBoard();
            try {
                shotClip = await new Promise<AudioClip>((resolve, reject) => {
                    (assetManager as any).loadRemote('./assets/tone.wav', (err: unknown, clip: AudioClip) => {
                        if (err) { reject(err as Error); } else { resolve(clip); }
                    });
                });
                if (audioSrc && shotClip) { audioSrc.clip = shotClip; audioSrc.playOnAwake = false; }
            } catch (e) { /* 重载失败如实走泄漏核对 */ }
            game.reset();
            driver.realtime = true;
            input.on(Input.EventType.KEY_DOWN, onKeyDown);
            input.on(Input.EventType.KEY_UP, onKeyUp);
            input.on(Input.EventType.TOUCH_START, onClick);
            const held: { name: string; ref: object }[] = [
                { name: 'Texture2D(board)', ref: board.texture as object },
                { name: 'Material(board)', ref: boardMaterial as object },
                { name: 'BoardNode', ref: boardNode as object },
            ];
            if (shotClip) { held.push({ name: 'AudioClip(tone)', ref: shotClip }); }
            return held;
        },
    });

    renderPanel();
    probe.state.game = {
        state: game.state,
        steps: game.steps,
        shotsFired: game.shotsFired,
        bricksDestroyed: game.bricksDestroyed,
        blockedBySteel: game.blockedBySteel,
        bulletsSpent: game.bulletsSpent,
        simultaneousDoubleHit: game.simultaneousDoubleHit,
        playerHitsByEnemy: game.playerHitsByEnemy,
        enemyKills: game.enemyKills,
        audioState: audioStateRecorded,
        audioDuration: shotClip ? shotClip.getDuration() : -1,
    };
    probe.state.boardValid = isValid(board.texture as Texture2D);
    probe.ready = true;
    probe.ok = probe.checks.every((c) => c.ok);
}

main().catch((e) => {
    probe.ready = true;
    probe.ok = false;
    probe.state.fatal = String((e && e.message) || e);
    throw e;
});
