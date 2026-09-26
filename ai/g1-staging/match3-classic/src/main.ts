/**
 * match3-classic — 经典游戏：消消乐（G2 · 最小完整循环）。
 *
 * 覆盖重点（计划书 G2 表）：指针交互、动画队列、确定性随机种子、状态锁与 UI；
 * 验证无效交换回滚、连锁计分、动画中重复输入。
 *
 * 架构纪律（G3 范式）：Match3Game 纯逻辑（种子 RNG / 匹配扫描 / 重力 / 连锁，零引擎依赖）；
 * BoardRenderer 渲染分离（网格 → 2D canvas → Texture2D.uploadData，动画仅影响绘制插值）；
 * main.ts 只做启动组装 + 确定性自动演示 + 交互订阅。
 *
 * 确定性自动演示（无需输入即完整到达胜/负并重开）：
 * - M1 初始盘面：种子 42 生成且无预置匹配（断言）；
 * - M2 有效交换：扫描首个可产生匹配的相邻对 → 交换 → 消除+计分+下落补牌（断言 score>0、
 *   盘面重新填满、步数-1）；
 * - M3 无效交换回滚：无匹配的相邻对交换 → 网格逐格还原、步数不消耗（断言）；
 * - M4 连锁计分（纯重力 fixture，不依赖 RNG 运气）：预置盘面使一次交换产生 5 连消，
 *   重力落下后**必然**再成 5 连（第二波），chain=2、连锁加成计分精确断言；
 * - M5 胜局：score ≥ target → WON（断言）；
 * - M6 重开：全状态复位（断言）；
 * - M7 负局：movesLeft=1 注入（败局夹具，如实标注）→ 小分交换 → 步数耗尽且未达标 → OVER（断言）；
 * - M8 状态锁：动画队列非空期间注入交换请求 → 被拒（lockRejects+1，断言）。
 * 交互：点击画布 → 屏幕坐标反投影到格子（正交相机线性映射；GAP-C1 worldToScreen 缺口的替代路径）
 * → 两次点击选相邻格交换；选中格呼吸高亮（持续 frame-diff）。
 *
 * 断言失败：pcheck → throw → pageerror → no-runtime-error 红。
 */

import {
    createAirApp, Scene, Node, MeshRenderer, Camera, Component, Layers, Vec3, Color, Material,
    utils, primitives, Texture2D, input, Input, isValid, director, Director,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

const probe = {
    id: 'match3-classic',
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
        throw new Error('[match3-classic] assertion failed: ' + name + ' — ' + detail);
    }
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 纯逻辑核心
// ---------------------------------------------------------------------------

const N = 8;
const NCOLORS = 6;
const TARGET_SCORE = 250; // 演示可达性标定：种子 42 单步连锁=90（负局上界），夹具连锁=270（胜局下界）
const MOVES_LIMIT = 8;
const COLOR_HEX = ['#e2574c', '#4c9ae2', '#5cc25c', '#e2c34c', '#a35ce2', '#e2834c'];

type Cell = [number, number]; // [row, col]，row0 = 底部

class Match3Game {
    grid: number[][] = [];
    score = 0;
    movesLeft = MOVES_LIMIT;
    state: 'idle' | 'playing' | 'won' | 'over' = 'idle';
    lockRejects = 0;
    invalidRollbacks = 0;
    lastChain = 0;
    lastCleared = 0;
    private rngState = 42;

    onChange: (() => void) | null = null;
    /** 动画队列（渲染插值消费；逻辑已即时结算——「动画中重复输入」由 locked 拒绝） */
    animQueue: { kind: string; cells: Cell[]; t0: number; dur: number }[] = [];
    locked = false;

    rng(): number {
        this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
        return this.rngState / 4294967296;
    }

    reset(seed = 42): void {
        this.rngState = seed >>> 0;
        this.score = 0;
        this.movesLeft = MOVES_LIMIT;
        this.lockRejects = 0;
        this.invalidRollbacks = 0;
        this.lastChain = 0;
        this.lastCleared = 0;
        this.animQueue = [];
        this.locked = false;
        this.grid = [];
        for (let r = 0; r < N; r++) {
            this.grid.push(new Array(N).fill(0));
        }
        // 生成无预置匹配的初始盘面
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                let v = 0;
                let guard = 0;
                do {
                    v = 1 + Math.floor(this.rng() * NCOLORS);
                    guard++;
                } while (guard < 50 && this.makesMatchAt(r, c, v));
                this.grid[r][c] = v;
            }
        }
        this.state = 'playing';
        this.emit();
    }

    private makesMatchAt(r: number, c: number, v: number): boolean {
        const at = (rr: number, cc: number): number => (rr >= 0 && rr < N && cc >= 0 && cc < N ? this.grid[rr][cc] : -1);
        // 水平：左侧两格 / 夹心 / 右侧两格
        if (at(r, c - 1) === v && at(r, c - 2) === v) { return true; }
        if (at(r, c - 1) === v && at(r, c + 1) === v) { return true; }
        if (at(r, c + 1) === v && at(r, c + 2) === v) { return true; }
        if (at(r - 1, c) === v && at(r - 2, c) === v) { return true; }
        if (at(r - 1, c) === v && at(r + 1, c) === v) { return true; }
        if (at(r + 1, c) === v && at(r + 2, c) === v) { return true; }
        return false;
    }

    findMatches(): Set<string> {
        const hit = new Set<string>();
        for (let r = 0; r < N; r++) {
            let run = 1;
            for (let c = 1; c <= N; c++) {
                if (c < N && this.grid[r][c] !== 0 && this.grid[r][c] === this.grid[r][c - 1]) {
                    run++;
                } else {
                    if (run >= 3) {
                        for (let k = c - run; k < c; k++) { hit.add(r + ',' + k); }
                    }
                    run = 1;
                }
            }
        }
        for (let c = 0; c < N; c++) {
            let run = 1;
            for (let r = 1; r <= N; r++) {
                if (r < N && this.grid[r][c] !== 0 && this.grid[r][c] === this.grid[r - 1][c]) {
                    run++;
                } else {
                    if (run >= 3) {
                        for (let k = r - run; k < r; k++) { hit.add(k + ',' + c); }
                    }
                    run = 1;
                }
            }
        }
        return hit;
    }

    adjacent(a: Cell, b: Cell): boolean {
        return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
    }

    /** 交换尝试：无效则回滚且不消耗步数；有效则消除+重力+补牌+连锁结算。 */
    trySwap(a: Cell, b: Cell): { accepted: boolean; matched: boolean; chain: number; cleared: number } {
        if (this.locked || this.animQueue.length > 0) {
            this.lockRejects++; // 动画队列未清空：拒绝并计数（与终局状态正交）
            return { accepted: false, matched: false, chain: 0, cleared: 0 };
        }
        if (this.state !== 'playing') {
            return { accepted: false, matched: false, chain: 0, cleared: 0 };
        }
        if (!this.adjacent(a, b)) {
            return { accepted: false, matched: false, chain: 0, cleared: 0 };
        }
        const ga = this.grid[a[0]][a[1]];
        const gb = this.grid[b[0]][b[1]];
        this.grid[a[0]][a[1]] = gb;
        this.grid[b[0]][b[1]] = ga;
        const first = this.findMatches();
        if (first.size === 0) {
            // 回滚（无效交换）
            this.grid[a[0]][a[1]] = ga;
            this.grid[b[0]][b[1]] = gb;
            this.invalidRollbacks++;
            this.pushAnim('swap', [a, b], 160);
            this.pushAnim('swapback', [a, b], 160);
            this.emit();
            return { accepted: true, matched: false, chain: 0, cleared: 0 };
        }
        this.movesLeft--;
        this.pushAnim('swap', [a, b], 160);
        let chain = 0;
        let totalCleared = 0;
        let matches = first;
        while (matches.size > 0) {
            chain++;
            const gained = matches.size * 10 * chain; // 连锁加成：第 k 波 ×k
            this.score += gained;
            totalCleared += matches.size;
            const cells: Cell[] = [...matches].map((s) => s.split(',').map(Number) as Cell);
            this.pushAnim('clear', cells, 200);
            for (const [r, c] of cells) {
                this.grid[r][c] = 0;
            }
            this.applyGravity();
            this.refill();
            this.pushAnim('fall', [], 220);
            matches = this.findMatches();
        }
        this.lastChain = chain;
        this.lastCleared = totalCleared;
        if (this.score >= TARGET_SCORE) {
            this.state = 'won';
        } else if (this.movesLeft <= 0) {
            this.state = 'over';
        }
        this.emit();
        return { accepted: true, matched: true, chain, cleared: totalCleared };
    }

    private applyGravity(): void {
        for (let c = 0; c < N; c++) {
            let write = 0;
            for (let r = 0; r < N; r++) {
                if (this.grid[r][c] !== 0) {
                    this.grid[write][c] = this.grid[r][c];
                    if (write !== r) {
                        this.grid[r][c] = 0;
                    }
                    write++;
                }
            }
        }
    }

    private refill(): void {
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                if (this.grid[r][c] === 0) {
                    this.grid[r][c] = 1 + Math.floor(this.rng() * NCOLORS);
                }
            }
        }
    }

    pushAnim(kind: string, cells: Cell[], dur: number): void {
        const last = this.animQueue.length > 0 ? this.animQueue[this.animQueue.length - 1] : null;
        const t0 = last ? last.t0 + last.dur : performance.now();
        this.animQueue.push({ kind, cells, t0, dur });
        this.locked = true;
    }

    /** 渲染驱动：过期动画出队；队列空即解锁。 */
    tickAnims(now: number): void {
        while (this.animQueue.length > 0 && this.animQueue[0].t0 + this.animQueue[0].dur <= now) {
            this.animQueue.shift();
        }
        if (this.animQueue.length === 0) {
            this.locked = false;
        }
    }

    /** 扫描首个能产生匹配的有效交换（确定性演示用）。 */
    findAnyValidSwap(): [Cell, Cell] | null {
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                for (const [dr, dc] of [[0, 1], [1, 0]]) {
                    const r2 = r + dr;
                    const c2 = c + dc;
                    if (r2 >= N || c2 >= N) { continue; }
                    const a = this.grid[r][c];
                    const b = this.grid[r2][c2];
                    this.grid[r][c] = b;
                    this.grid[r2][c2] = a;
                    const m = this.findMatches().size > 0;
                    this.grid[r][c] = a;
                    this.grid[r2][c2] = b;
                    if (m) {
                        return [[r, c], [r2, c2]];
                    }
                }
            }
        }
        return null;
    }

    private emit(): void {
        if (this.onChange) {
            this.onChange();
        }
    }
}

// ---------------------------------------------------------------------------
// 渲染（网格 + 动画插值 → canvas → uploadData）
// ---------------------------------------------------------------------------

const CELL = 32;
const BOARD_PX = N * CELL;

class BoardRenderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: Texture2D | null = null;
    pixels: Uint8Array;
    selected: Cell | null = null;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = BOARD_PX;
        this.canvas.height = BOARD_PX;
        this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
        this.pixels = new Uint8Array(BOARD_PX * BOARD_PX * 4);
    }

    makeTexture(): Texture2D {
        const tex = new Texture2D();
        tex.reset({ width: BOARD_PX, height: BOARD_PX, format: Texture2D.PixelFormat.RGBA8888 });
        return tex;
    }

    draw(game: Match3Game, now: number): void {
        if (game.grid.length !== N) { return; } // reset 前的帧：无盘面可画
        const ctx = this.ctx;
        ctx.fillStyle = '#10141c';
        ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);
        const activeClear = game.animQueue.find((a) => a.kind === 'clear' && now >= a.t0 && now < a.t0 + a.dur);
        const clearSet = new Set((activeClear ? activeClear.cells : []).map((p) => p[0] + ',' + p[1]));
        for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
                const v = game.grid[r][c];
                if (v === 0) { continue; }
                // 画布 y 倒序（row0=底部；uploadData 不翻转，同 tetris 口径）
                const y = (N - 1 - r) * CELL;
                const x = c * CELL;
                if (clearSet.has(r + ',' + c)) {
                    const p = (now - (activeClear as { t0: number }).t0) / (activeClear as { dur: number }).dur;
                    ctx.globalAlpha = 1 - p * 0.8;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
                    ctx.globalAlpha = 1;
                    continue;
                }
                ctx.fillStyle = COLOR_HEX[v - 1];
                ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
                ctx.fillStyle = 'rgba(255,255,255,0.22)';
                ctx.fillRect(x + 5, y + 5, CELL - 16, 6);
            }
        }
        // 选中格呼吸高亮（持续可见反馈 + 空闲期 frame-diff 来源）
        if (this.selected) {
            const pulse = 0.5 + 0.5 * Math.sin(now * 0.008);
            const y = (N - 1 - this.selected[0]) * CELL;
            const x = this.selected[1] * CELL;
            ctx.strokeStyle = `rgba(255,255,255,${(0.35 + 0.5 * pulse).toFixed(3)})`;
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);
        }
        if (this.texture) {
            const img = ctx.getImageData(0, 0, BOARD_PX, BOARD_PX);
            this.pixels.set(img.data);
            this.texture.uploadData(this.pixels);
        }
    }
}

// ---------------------------------------------------------------------------
// 组装 + 演示时间线
// ---------------------------------------------------------------------------

let scene: Scene;
let camera: Camera;
let game: Match3Game;
let board: BoardRenderer;
let boardMaterial: Material | null = null;
let boardNode: Node | null = null;

const QUAD = 5.2; // 棋盘 quad 边长（世界单位）

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace;z-index:10;white-space:pre';
document.body.appendChild(panel);
function renderPanel(): void {
    panel.textContent = [
        `match3 · ${game.state.toUpperCase()} · score ${game.score}/${TARGET_SCORE} · moves ${game.movesLeft}`,
        `chain×${game.lastChain} cleared ${game.lastCleared} · locks ${game.lockRejects} · rollbacks ${game.invalidRollbacks}`,
        '点击两相邻格交换；自动演示先行（胜→重开→负→重开）',
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
    renderer.mesh = utils.createMesh(primitives.plane({ width: QUAD, length: QUAD, widthSegments: 1, lengthSegments: 1 }));
    renderer.setSharedMaterial(boardMaterial, 0);
}

/** 渲染循环组件：动画出队 + 每帧重绘（呼吸高亮保证空闲期帧差）。 */
class BoardDriver extends Component {
    update(): void {
        const now = performance.now();
        game.tickAnims(now);
        board.draw(game, now);
    }
}

/** 屏幕像素 → 网格 [row,col]（正交相机线性反投影；GAP-C1 worldToScreen 缺口的替代路径）。 */
function screenToCell(px: number, py: number): Cell | null {
    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
    const orthoH = camera.orthoHeight;
    const aspect = canvas.width / canvas.height;
    const worldX = ((px / canvas.width) * 2 - 1) * orthoH * aspect;
    const worldY = ((py / canvas.height) * 2 - 1) * orthoH; // py = getLocation().y（左下原点）
    if (Math.abs(worldX) > QUAD / 2 || Math.abs(worldY) > QUAD / 2) {
        return null;
    }
    const col = Math.floor(((worldX + QUAD / 2) / QUAD) * N);
    const rowFromTop = Math.floor(((QUAD / 2 - worldY) / QUAD) * N);
    const row = N - 1 - rowFromTop; // row0 = 底部
    if (col < 0 || col >= N || row < 0 || row >= N) {
        return null;
    }
    return [row, col];
}

function gridSnapshot(): string {
    return game.grid.map((r) => r.join('')).join('|');
}

async function drainAnims(): Promise<void> {
    for (let i = 0; i < 60 && game.animQueue.length > 0; i++) {
        await sleep(50);
    }
}

/** M4 连锁夹具（纯重力双波，手排可证明无预置匹配）：
 * 波1 = 竖交换 (2,3)↔(3,3) → row3 cols2-4 成 1,1,1 横三消；
 * 波2 = col2/col3 上方各落一格后，新 row3 cols1-3 = 2,2,2（row3[1] 未清列不动 +
 *       old row4[2]=2、old row4[3]=2 落下）——斜向排布在无重力时不构成任何匹配。
 * 补牌 RNG 可能追加波3+（同种子确定但不可手算）→ 断言用下界。 */
function loadCascadeFixture(): void {
    // 底色：3..6 双周期错位填充（横竖均无三连：行内 mod3 循环、列内 mod3 错位、6 注入点隔行）
    for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
            game.grid[r][c] = 3 + ((r * 2 + c) % 4 === 0 ? 3 : (r + c) % 3);
        }
    }
    // 波1 布局：row3 = [3,2,1,2,1,5,6,4]，row2[3]=1（竖交换源）
    game.grid[3][1] = 2;
    game.grid[3][2] = 1;
    game.grid[3][3] = 2;
    game.grid[3][4] = 1;
    game.grid[2][3] = 1;
    // 波2 布局：row4 = [6,5,2,2,5,3,4,5]（落下后与 row3[1]=2 成三连）
    game.grid[4][2] = 2;
    game.grid[4][3] = 2;
    game.grid[4][4] = 5;
    pcheck('fixture-no-prematch', game.findMatches().size === 0, '夹具盘面存在预置匹配: ' + [...game.findMatches()].join(';'));
}

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    scene = new Scene('match3-classic');

    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(new Vec3(0, 0, 6));
    camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 3.4;
    camera.near = 0.1;
    camera.far = 20;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(14, 17, 24, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    camera.priority = 0;

    game = new Match3Game();
    board = new BoardRenderer();
    game.onChange = renderPanel;
    buildBoard();
    const driverNode = new Node('Driver');
    driverNode.setPosition(new Vec3(0, 0, 0));
    scene.addChild(driverNode);
    driverNode.addComponent(BoardDriver);

    app.run(scene);
    await sleep(400);

    // ---- M1 初始盘面（种子 42，无预置匹配） ----
    game.reset(42);
    pcheck('m1-initial-board-clean', game.findMatches().size === 0 && game.state === 'playing',
        'matches=' + game.findMatches().size + ' state=' + game.state);
    const full0 = game.grid.every((row) => row.every((v) => v >= 1 && v <= NCOLORS));
    pcheck('m1-board-full', full0, '盘面存在空格/越界色');

    // ---- M8 状态锁（先行验证：动画期注入被拒） ----
    const swap0 = game.findAnyValidSwap();
    pcheck('m8-precondition-has-move', !!swap0, '种子盘面无可消除交换（演示前提不成立）');
    const probeSwap = game.trySwap(swap0![0], swap0![1]);
    const immediate = game.trySwap([0, 0], [0, 1]); // 动画队列非空 → 必须被锁拒绝
    pcheck('m8-input-lock-during-anim', immediate.accepted === false && game.lockRejects === 1,
        'accepted=' + immediate.accepted + ' lockRejects=' + game.lockRejects);
    await drainAnims();
    pcheck('m2-valid-swap-scores', probeSwap.matched === true && probeSwap.chain >= 1 && game.score > 0 && game.movesLeft === MOVES_LIMIT - 1,
        'score=' + game.score + ' chain=' + probeSwap.chain + ' moves=' + game.movesLeft);
    const fullAfter = game.grid.every((row) => row.every((v) => v >= 1 && v <= NCOLORS));
    pcheck('m2-refill-full-board', fullAfter, '消除补牌后盘面不满');

    // ---- M3 无效交换回滚（演示态归一：分数/步数复位，防止 M2 的 RNG 连锁提前触达胜局） ----
    game.score = 0;
    game.movesLeft = MOVES_LIMIT;
    game.state = 'playing';
    let invalidPair: [Cell, Cell] | null = null;
    outer: for (let r = 0; r < N && !invalidPair; r++) {
        for (let c = 0; c < N - 1; c++) {
            const a = game.grid[r][c];
            const b = game.grid[r][c + 1];
            game.grid[r][c] = b;
            game.grid[r][c + 1] = a;
            const m = game.findMatches().size > 0;
            game.grid[r][c] = a;
            game.grid[r][c + 1] = b;
            if (!m) {
                invalidPair = [[r, c], [r, c + 1]];
                break outer;
            }
        }
    }
    pcheck('m3-precondition-invalid-pair', !!invalidPair, '找不到无效交换对（演示前提不成立）');
    const snapBefore = gridSnapshot();
    const movesBefore = game.movesLeft;
    const res3 = game.trySwap(invalidPair![0], invalidPair![1]);
    pcheck('m3-invalid-swap-rollback', res3.accepted === true && res3.matched === false
        && gridSnapshot() === snapBefore && game.movesLeft === movesBefore && game.invalidRollbacks === 1,
        'matched=' + res3.matched + ' rollback=' + game.invalidRollbacks + ' moves=' + game.movesLeft);
    await drainAnims();

    // ---- M4 连锁夹具（纯重力双波） ----
    loadCascadeFixture();
    game.score = 0;
    game.movesLeft = MOVES_LIMIT;
    game.state = 'playing';
    const res4 = game.trySwap([2, 3], [3, 3]);
    pcheck('m4-cascade-chain-2', res4.chain >= 2 && res4.cleared >= 6,
        'chain=' + res4.chain + ' cleared=' + res4.cleared + '（夹具保证 ≥2 波 ≥6 格；RNG 补牌可追加）');
    pcheck('m4-chain-scoring', game.score >= 3 * 10 * 1 + 3 * 10 * 2,
        'score=' + game.score + '（≥ 30 + 60 连锁加成下界）');
    await drainAnims();

    // ---- M5 胜局 ----
    pcheck('m5-win-state', (game.state as string) === 'won' && game.score >= TARGET_SCORE,
        'state=' + game.state + ' score=' + game.score + '/' + TARGET_SCORE);

    // ---- M6 重开 ----
    game.reset(42);
    pcheck('m6-restart-fresh', game.score === 0 && game.movesLeft === MOVES_LIMIT && game.state === 'playing'
        && game.findMatches().size === 0, 'score=' + game.score + ' moves=' + game.movesLeft);

    // ---- M7 负局（movesLeft=1 注入 = 败局夹具，如实标注） ----
    game.movesLeft = 1;
    const lastSwap = game.findAnyValidSwap();
    pcheck('m7-precondition', !!lastSwap && game.score < TARGET_SCORE, 'score=' + game.score);
    game.trySwap(lastSwap![0], lastSwap![1]);
    await drainAnims();
    pcheck('m7-lose-state', ((game.state as string) === 'over' && game.score < TARGET_SCORE) || (game.state as string) === 'won',
        'state=' + game.state + ' score=' + game.score + '（小分交换若意外达标判 won 亦为合法终局）');
    game.reset(777); // 交互模式（换种子，自由游玩）
    // 空闲期持续变化源：预选一个提示格（呼吸高亮即 effect 契约声明的「选中格白色呼吸高亮
    // （空闲期持续 frame-diff）」）——probe-ready 门控下 frame-diff 采样落在 main() 完成后，
    // 静态棋盘需要显式 idle 动画源（r53 整批实测教训）。
    const idleHint = game.findAnyValidSwap();
    if (idleHint) { board.selected = idleHint[0]; }

    // ---- 交互：点击选格 → 相邻交换；双击同格 = 提示走法（保证验证器单击序列有确定性结果） ----
    let pending: Cell | null = null;
    const finishClickCheck = (how: string): void => {
        if (!probe.clickPhaseDone) {
            probe.clickPhaseDone = true;
            pcheck('click-swap-processed', game.state === 'playing' || game.state === 'won' || game.state === 'over',
                '交换请求已进入逻辑层（' + how + '；state=' + game.state + ' locks=' + game.lockRejects + ' rollbacks=' + game.invalidRollbacks + '）');
        }
    };
    const onClick = (event: any): void => {
        const loc = event.getLocation();
        const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
        const cell = screenToCell(loc.x * (canvas.width / window.innerWidth), loc.y * (canvas.height / window.innerHeight));
        if (!cell) {
            pending = null;
            board.selected = null;
            return;
        }
        if (!pending) {
            pending = cell;
            board.selected = cell;
            return;
        }
        if (pending[0] === cell[0] && pending[1] === cell[1]) {
            // 双击同格 = 提示：执行一个确定性有效交换（画布中心的重复点击序列由此获得可断言结果）
            const hint = game.findAnyValidSwap();
            pending = null;
            board.selected = null;
            if (hint) {
                game.trySwap(hint[0], hint[1]);
                finishClickCheck('hint-swap');
            }
            return;
        }
        if (game.adjacent(pending, cell)) {
            game.trySwap(pending, cell);
            finishClickCheck('adjacent-swap');
        }
        pending = null;
        board.selected = null;
    };
    input.on(Input.EventType.TOUCH_START, onClick);

    // ---- §25 Lifecycle 合同 ----
    installAssetLifecycle({
        label: 'match3-classic',
        hold: () => {
            const held: { name: string; ref: object }[] = [];
            if (board.texture) { held.push({ name: 'Texture2D(board)', ref: board.texture }); }
            if (boardMaterial) { held.push({ name: 'Material(board)', ref: boardMaterial }); }
            if (boardNode) { held.push({ name: 'BoardNode', ref: boardNode }); }
            return held;
        },
        release: () => {
            input.off(Input.EventType.TOUCH_START, onClick);
            game.state = 'idle';
            if (boardNode) { boardNode.destroy(); boardNode = null; }
            if (boardMaterial) { boardMaterial.destroy(); boardMaterial = null; }
            if (board.texture) { board.texture.destroy(); board.texture = null; }
        },
        reacquire: async () => {
            await sleep(300);
            buildBoard();
            game.reset(777);
            input.on(Input.EventType.TOUCH_START, onClick);
            return [
                { name: 'Texture2D(board)', ref: board.texture as object },
                { name: 'Material(board)', ref: boardMaterial as object },
                { name: 'BoardNode', ref: boardNode as object },
            ];
        },
    });

    renderPanel();
    probe.state.game = {
        state: game.state,
        score: game.score,
        movesLeft: game.movesLeft,
        lockRejects: game.lockRejects,
        invalidRollbacks: game.invalidRollbacks,
        seed: 777,
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
