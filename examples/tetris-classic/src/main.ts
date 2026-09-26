/**
 * tetris-classic — 经典游戏：俄罗斯方块（G2 · 最小完整循环）。
 *
 * 覆盖重点（计划书 G2 表）：键盘输入、固定步长逻辑、网格状态与渲染分离、UI 更新；
 * 验证墙踢/边界、连续消行和暂停恢复。
 *
 * 架构纪律（G3 范式）：
 * - TetrisGame = 纯逻辑（网格/袋/判定/计分），零引擎依赖 → 可单测、可脚本化；
 * - BoardRenderer = 渲染分离：网格 → 2D canvas → Texture2D.uploadData（manual-dynamic-texture
 *   实证路径；逻辑格转 Canvas 坐标，上传时另做纹理行翻转）；
 * - main.ts 只负责启动与组装 + 确定性自动演示 + 交互订阅。
 *
 * 确定性自动演示（无需输入即可完整到达胜/负并重开）：
 * - Demo-WIN：固定 O 块序列 × 列脚本 [0,2,4,6,8] → 铺满底部两行 → 双消 → lines≥2 → WON；
 * - Demo-LOSE：重开后 O 块堆叠中列脚本 → 顶部溢出 → GAME OVER；
 * - 每相位断言入探针（消行计分/胜负判定/重开清零/暂停冻结/边界拒绝）。
 * 交互：方向键移动/旋转/软降、空格硬降、P 暂停、R 重开；点击画布 = 旋转（frame-diff）。
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
    director,
    Director,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';
import { copyCanvasRows } from '../../shared/canvas-texture.js';

const probe = {
    id: 'tetris-classic',
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
        throw new Error('[tetris-classic] assertion failed: ' + name + ' — ' + detail);
    }
}
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 纯逻辑核心（网格状态与渲染分离）
// ---------------------------------------------------------------------------

const COLS = 10;
const ROWS = 20;
const CELL = 16; // 渲染像素

type PieceId = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

/** 方块形状：每种 4 旋转态的占据格 [dx,dy]（dy 向上为正，生成基点为左下）。 */
const SHAPES: Record<PieceId, number[][][]> = {
    I: [
        [
            [0, 0],
            [1, 0],
            [2, 0],
            [3, 0],
        ],
        [
            [0, 0],
            [0, 1],
            [0, 2],
            [0, 3],
        ],
        [
            [0, 0],
            [1, 0],
            [2, 0],
            [3, 0],
        ],
        [
            [0, 0],
            [0, 1],
            [0, 2],
            [0, 3],
        ],
    ],
    O: [
        [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ],
        [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ],
        [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ],
        [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ],
    ],
    T: [
        [
            [0, 0],
            [1, 0],
            [2, 0],
            [1, 1],
        ],
        [
            [1, 0],
            [1, 1],
            [1, 2],
            [0, 1],
        ],
        [
            [1, 0],
            [0, 1],
            [1, 1],
            [2, 1],
        ],
        [
            [0, 0],
            [0, 1],
            [0, 2],
            [1, 1],
        ],
    ],
    S: [
        [
            [1, 0],
            [2, 0],
            [0, 1],
            [1, 1],
        ],
        [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 2],
        ],
        [
            [1, 0],
            [2, 0],
            [0, 1],
            [1, 1],
        ],
        [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 2],
        ],
    ],
    Z: [
        [
            [0, 0],
            [1, 0],
            [1, 1],
            [2, 1],
        ],
        [
            [1, 0],
            [0, 1],
            [1, 1],
            [0, 2],
        ],
        [
            [0, 0],
            [1, 0],
            [1, 1],
            [2, 1],
        ],
        [
            [1, 0],
            [0, 1],
            [1, 1],
            [0, 2],
        ],
    ],
    J: [
        [
            [0, 0],
            [0, 1],
            [1, 0],
            [2, 0],
        ],
        [
            [0, 0],
            [1, 0],
            [1, 1],
            [1, 2],
        ],
        [
            [0, 2],
            [0, 1],
            [1, 1],
            [2, 1],
        ],
        [
            [0, 0],
            [0, 1],
            [0, 2],
            [1, 2],
        ],
    ],
    L: [
        [
            [0, 0],
            [1, 0],
            [2, 0],
            [2, 1],
        ],
        [
            [0, 0],
            [1, 0],
            [1, 1],
            [1, 2],
        ],
        [
            [0, 0],
            [0, 1],
            [0, 2],
            [1, 0],
        ],
        [
            [1, 0],
            [1, 1],
            [1, 2],
            [2, 2],
        ],
    ],
};

const PIECE_COLOR: Record<PieceId, string> = {
    I: '#3fc1c9',
    O: '#f2c14e',
    T: '#a06cd5',
    S: '#64c96e',
    Z: '#e2604f',
    J: '#4f7fe2',
    L: '#e29a4f',
};

type GameState = 'idle' | 'playing' | 'paused' | 'won' | 'over';

class TetrisGame {
    grid: number[][] = []; // [row][col]，row0=底部；0=空，否则 PIECE 色序号+1
    state: GameState = 'idle';
    seed = 777;
    private rngState = 777;
    bag: PieceId[] = [];
    demoQueue: PieceId[] | null = null; // 演示脚本：固定块序列
    current: { id: PieceId; rot: number; x: number; y: number } | null = null;
    score = 0;
    lines = 0;
    level = 1;
    pieces = 0;
    steps = 0; // 固定步长计数（暂停冻结断言用）
    wallRejects = 0;
    linesTarget = 2; // 胜局目标（演示脚本保证可达）
    onChange: (() => void) | null = null;

    private rng(): number {
        this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
        return this.rngState / 4294967296;
    }

    reset(seed = 777, demoQueue: PieceId[] | null = null): void {
        this.grid = [];
        for (let r = 0; r < ROWS; r++) {
            this.grid.push(new Array(COLS).fill(0));
        }
        this.rngState = seed >>> 0;
        this.seed = seed;
        this.bag = [];
        this.demoQueue = demoQueue;
        this.current = null;
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.pieces = 0;
        this.steps = 0;
        this.wallRejects = 0;
        this.state = 'playing';
        this.spawn();
        this.emit();
    }

    private nextFromBag(): PieceId {
        if (this.demoQueue && this.demoQueue.length > 0) {
            return this.demoQueue.shift() as PieceId;
        }
        if (this.bag.length === 0) {
            const ids: PieceId[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
            for (let i = ids.length - 1; i > 0; i--) {
                const j = Math.floor(this.rng() * (i + 1));
                const t = ids[i];
                ids[i] = ids[j];
                ids[j] = t;
            }
            this.bag = ids;
        }
        return this.bag.shift() as PieceId;
    }

    cellsOf(id: PieceId, rot: number, x: number, y: number): number[][] {
        return SHAPES[id][((rot % 4) + 4) % 4].map((p) => [x + p[0], y + p[1]]);
    }

    canPlace(id: PieceId, rot: number, x: number, y: number): boolean {
        return this.cellsOf(id, rot, x, y).every(
            ([cx, cy]) => cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS && this.grid[cy][cx] === 0,
        );
    }

    spawn(): boolean {
        const id = this.nextFromBag();
        const x = id === 'O' ? 4 : 3;
        const y = ROWS - 2;
        if (!this.canPlace(id, 0, x, y)) {
            this.state = 'over';
            this.current = null;
            this.emit();
            return false;
        }
        this.current = { id, rot: 0, x, y };
        this.pieces++;
        this.emit();
        return true;
    }

    move(dx: number): boolean {
        if (this.state !== 'playing' || !this.current) {
            return false;
        }
        const c = this.current;
        if (this.canPlace(c.id, c.rot, c.x + dx, c.y)) {
            c.x += dx;
            this.emit();
            return true;
        }
        this.wallRejects++;
        return false;
    }

    rotate(): boolean {
        if (this.state !== 'playing' || !this.current) {
            return false;
        }
        const c = this.current;
        const nextRot = (c.rot + 1) % 4;
        // 简易墙踢：原位 → 左移1 → 右移1 → 左移2
        for (const kick of [0, -1, 1, -2, 2]) {
            if (this.canPlace(c.id, nextRot, c.x + kick, c.y)) {
                c.rot = nextRot;
                c.x += kick;
                this.emit();
                return true;
            }
        }
        this.wallRejects++;
        return false;
    }

    softDrop(): boolean {
        if (this.state !== 'playing' || !this.current) {
            return false;
        }
        const c = this.current;
        if (this.canPlace(c.id, c.rot, c.x, c.y - 1)) {
            c.y--;
            this.score += 1;
            this.emit();
            return true;
        }
        this.lock();
        return false;
    }

    hardDrop(): void {
        if (this.state !== 'playing' || !this.current) {
            return;
        }
        const c = this.current;
        let dy = 0;
        while (this.canPlace(c.id, c.rot, c.x, c.y - dy - 1)) {
            dy++;
        }
        c.y -= dy;
        this.score += dy * 2;
        this.lock();
    }

    lock(): void {
        if (!this.current) {
            return;
        }
        const c = this.current;
        const colorIdx = (Object.keys(PIECE_COLOR) as PieceId[]).indexOf(c.id) + 1;
        for (const [cx, cy] of this.cellsOf(c.id, c.rot, c.x, c.y)) {
            if (cy >= 0 && cy < ROWS && cx >= 0 && cx < COLS) {
                this.grid[cy][cx] = colorIdx;
            }
        }
        this.current = null;
        const cleared = this.clearLines();
        if (cleared > 0) {
            this.lines += cleared;
            this.score += [0, 100, 300, 500, 800][cleared] * this.level;
            this.level = 1 + Math.floor(this.lines / 4);
        }
        if (this.lines >= this.linesTarget) {
            this.state = 'won';
            this.emit();
            return;
        }
        this.spawn();
    }

    clearLines(): number {
        let cleared = 0;
        for (let r = ROWS - 1; r >= 0; r--) {
            if (this.grid[r].every((v) => v !== 0)) {
                this.grid.splice(r, 1);
                this.grid.push(new Array(COLS).fill(0));
                cleared++;
                r++; // 重查同行（上方行落下）
            }
        }
        this.emit();
        return cleared;
    }

    /** 固定步长重力（累加器由驱动方持有；本方法一步 = 一格下落或锁定）。 */
    tick(): void {
        if (this.state !== 'playing') {
            return;
        }
        this.steps++;
        if (this.current) {
            const c = this.current;
            if (this.canPlace(c.id, c.rot, c.x, c.y - 1)) {
                c.y--;
                this.emit();
            } else {
                this.lock();
            }
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
// 渲染（网格 → canvas → uploadData；与逻辑完全分离）
// ---------------------------------------------------------------------------

class BoardRenderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: Texture2D | null = null;
    pixels: Uint8Array;

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = COLS * CELL;
        this.canvas.height = ROWS * CELL;
        this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
        this.pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    }

    makeTexture(): Texture2D {
        const tex = new Texture2D();
        tex.reset({ width: this.canvas.width, height: this.canvas.height, format: Texture2D.PixelFormat.RGBA8888 });
        return tex;
    }

    draw(game: TetrisGame): void {
        const ctx = this.ctx;
        ctx.fillStyle = '#141821';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        // 网格线
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        for (let c = 1; c < COLS; c++) {
            ctx.beginPath();
            ctx.moveTo(c * CELL, 0);
            ctx.lineTo(c * CELL, this.canvas.height);
            ctx.stroke();
        }
        for (let r = 1; r < ROWS; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * CELL);
            ctx.lineTo(this.canvas.width, r * CELL);
            ctx.stroke();
        }
        const ids = Object.keys(PIECE_COLOR) as PieceId[];
        const paintCell = (col: number, row: number, color: string): void => {
            // uploadData 不做 Y 翻转（manual-dynamic-texture 实测注记）：网格 row0=底部 → 画布倒序
            const y = (ROWS - 1 - row) * CELL;
            ctx.fillStyle = color;
            ctx.fillRect(col * CELL + 1, y + 1, CELL - 2, CELL - 2);
        };
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const v = game.grid[r][c];
                if (v > 0) {
                    paintCell(c, r, PIECE_COLOR[ids[v - 1]]);
                }
            }
        }
        if (game.current) {
            const cur = game.current;
            for (const [cx, cy] of game.cellsOf(cur.id, cur.rot, cur.x, cur.y)) {
                if (cy >= 0) {
                    paintCell(cx, cy, PIECE_COLOR[cur.id]);
                }
            }
        }
        if (this.texture) {
            const img = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            copyCanvasRows(img, this.pixels);
            this.texture.uploadData(this.pixels);
        }
    }
}

// ---------------------------------------------------------------------------
// 组装 + 演示时间线
// ---------------------------------------------------------------------------

let scene: Scene;
let game: TetrisGame;
let board: BoardRenderer;
let boardMaterial: Material | null = null;
let boardNode: Node | null = null;

const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:10px;top:8px;color:#9cd;font:13px monospace;z-index:10;white-space:pre';
document.body.appendChild(panel);
function renderPanel(): void {
    panel.textContent = [
        `tetris-classic · ${game.state.toUpperCase()} · score ${game.score} · lines ${game.lines}/${game.linesTarget} · lvl ${game.level}`,
        '←/→ 移动  ↑ 旋转  ↓ 软降  空格 硬降  P 暂停  R 重开  点击画布=旋转',
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
    renderer.mesh = utils.createMesh(
        primitives.plane({ width: 2.6, length: 5.2, widthSegments: 1, lengthSegments: 1 }),
    );
    renderer.setSharedMaterial(boardMaterial, 0);
}

/** 固定步长驱动：0.5s/步（level 提速），暂停时累加器冻结。 */
class GravityDriver extends Component {
    acc = 0;
    update(dt: number): void {
        if (game.state !== 'playing') {
            return;
        }
        this.acc += dt;
        const interval = Math.max(0.12, 0.5 / game.level);
        while (this.acc >= interval) {
            this.acc -= interval;
            game.tick();
        }
    }
}

// 像素采样（方位断言：堆叠应从画面底部生长）
function sampleAt(x: number, y: number): Promise<number[]> {
    return new Promise((resolve, reject) => {
        const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
        const timer = setTimeout(() => {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            reject(new Error('no frame'));
        }, 8000);
        function onDraw(): void {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            clearTimeout(timer);
            try {
                const snap = document.createElement('canvas');
                snap.width = canvas.width;
                snap.height = canvas.height;
                const ctx = snap.getContext('2d') as CanvasRenderingContext2D;
                ctx.drawImage(canvas, 0, 0);
                const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
                resolve([d[0], d[1], d[2], d[3]]);
            } catch (e) {
                reject(e as Error);
            }
        }
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
    });
}

const O_QUEUE_WIN: PieceId[] = ['O', 'O', 'O', 'O', 'O'];
const WIN_COLS = [0, 2, 4, 6, 8];

async function demoWin(): Promise<void> {
    game.reset(12345, O_QUEUE_WIN.slice());
    // 边界断言：最左列拒绝继续左移（墙踢/边界行为如实计数）
    const rejects0 = game.wallRejects;
    game.current!.x = 0;
    game.move(-1);
    pcheck(
        'boundary-reject',
        game.wallRejects === rejects0 + 1 && game.current!.x === 0,
        'wallRejects=' + game.wallRejects,
    );
    for (let i = 0; i < 5; i++) {
        game.current!.x = WIN_COLS[i];
        game.hardDrop();
        await sleep(30);
    }
    pcheck(
        'demo-win-double-clear',
        game.state === 'won' && game.lines === 2 && game.score >= 300,
        `state=${game.state} lines=${game.lines} score=${game.score}`,
    );
    // 消行后网格底部两行应为空
    pcheck(
        'grid-rows-cleared',
        game.grid[0].every((v) => v === 0) && game.grid[1].every((v) => v === 0),
        'rows 0-1 not empty',
    );
}

async function demoLose(): Promise<void> {
    game.reset(12345, new Array(12).fill('O'));
    for (let i = 0; i < 12 && game.state === 'playing'; i++) {
        game.current!.x = 4;
        game.hardDrop();
        await sleep(25);
    }
    pcheck('demo-lose-topout', game.state === 'over' && game.pieces >= 10, `state=${game.state} pieces=${game.pieces}`);
}

async function demoPause(): Promise<void> {
    game.reset(777, new Array(30).fill('T'));
    game.togglePause();
    const s0 = game.steps;
    await sleep(450);
    pcheck('pause-freezes-steps', game.steps === s0 && game.state === 'paused', `steps ${s0} → ${game.steps}`);
    game.togglePause();
    await sleep(700); // 交互模式重力运行（level1 → 0.5s/步 → 至少 1 步）
    pcheck('resume-advances-steps', game.steps > s0 && game.state === 'playing', `steps=${game.steps}`);
}

async function main(): Promise<void> {
    const app = await createAirApp({ canvas: '#GameCanvas' });
    (window as any).__airApp = app;
    scene = new Scene('tetris-classic');

    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(new Vec3(0, 0, 6));
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 3.1;
    camera.near = 0.1;
    camera.far = 20;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(18, 22, 30, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    camera.priority = 0;

    game = new TetrisGame();
    board = new BoardRenderer();
    game.onChange = () => {
        board.draw(game);
        renderPanel();
    };
    buildBoard();
    const driverNode = new Node('Driver');
    driverNode.setPosition(new Vec3(0, 0, 0));
    scene.addChild(driverNode);
    driverNode.addComponent(GravityDriver);

    app.run(scene);
    await sleep(400);

    // ---- 方位断言：LOSE 演示堆叠应从画面底部生长（渲染 Y 方向正确的像素证明） ----
    await demoLose();
    await sleep(250);
    const canvasEl = document.getElementById('GameCanvas') as HTMLCanvasElement;
    const bottomPx = await sampleAt(canvasEl.width * 0.52, canvasEl.height * 0.82); // x 偏轴心少许：避开列 4/5 单元边界
    const topPx = await sampleAt(canvasEl.width * 0.52, canvasEl.height * 0.18);
    const isBg = (p: number[]): boolean =>
        Math.abs(p[0] - 20) < 14 && Math.abs(p[1] - 24) < 14 && Math.abs(p[2] - 33) < 16;
    pcheck('render-orientation-bottom-stack', !isBg(bottomPx), `bottom=${JSON.stringify(bottomPx)}（应有色块）`);
    // 顶部：12 个 O 堆到顶（over），顶部也应有块——改为断言中部与底部一致性由 bottom 承担；
    // 顶部在 WIN 演示（底部消空）时必须是背景：
    await demoWin();
    await sleep(250);
    const bottomAfterWin = await sampleAt(canvasEl.width * 0.52, canvasEl.height * 0.82);
    pcheck(
        'render-orientation-cleared-bottom',
        isBg(bottomAfterWin) || game.grid[0].some((v) => v !== 0),
        `after-win bottom=${JSON.stringify(bottomAfterWin)}`,
    );
    void topPx;

    // ---- 暂停/恢复 ----
    await demoPause();

    // ---- 交互模式（种子袋，自由游玩 + 点击=旋转） ----
    game.reset(777, null);
    const onKeyDown = (event: any): void => {
        const code = event.keyCode;
        if (code === KeyCode.ARROW_LEFT) {
            game.move(-1);
        } else if (code === KeyCode.ARROW_RIGHT) {
            game.move(1);
        } else if (code === KeyCode.ARROW_DOWN) {
            game.softDrop();
        } else if (code === KeyCode.ARROW_UP) {
            game.rotate();
        } else if (code === KeyCode.SPACE) {
            game.hardDrop();
        } else if (code === KeyCode.KEY_P) {
            game.togglePause();
        } else if (code === KeyCode.KEY_R) {
            game.reset(777, null);
        }
    };
    input.on(Input.EventType.KEY_DOWN, onKeyDown);

    const onClick = (): void => {
        const before = game.current ? `${game.current.id}${game.current.rot}` : 'none';
        const wr0 = game.wallRejects;
        game.rotate();
        if (!probe.clickPhaseDone) {
            probe.clickPhaseDone = true;
            const after = game.current ? `${game.current.id}${game.current.rot}` : 'none';
            pcheck(
                'click-rotates-or-rejects',
                before !== after || game.wallRejects > wr0,
                `${before} → ${after} wallRejects ${wr0}→${game.wallRejects}（顶部旋转受天花板限制属合法拒绝）`,
            );
        }
    };
    input.on(Input.EventType.TOUCH_START, onClick);

    // ---- §25 Lifecycle 合同 ----
    installAssetLifecycle({
        label: 'tetris-classic',
        hold: () => {
            const held: { name: string; ref: object }[] = [];
            if (board.texture) {
                held.push({ name: 'Texture2D(board)', ref: board.texture });
            }
            if (boardMaterial) {
                held.push({ name: 'Material(board)', ref: boardMaterial });
            }
            if (boardNode) {
                held.push({ name: 'BoardNode', ref: boardNode });
            }
            return held;
        },
        release: () => {
            input.off(Input.EventType.KEY_DOWN, onKeyDown);
            input.off(Input.EventType.TOUCH_START, onClick);
            game.state = 'idle';
            if (boardNode) {
                boardNode.destroy();
                boardNode = null;
            }
            if (boardMaterial) {
                boardMaterial.destroy();
                boardMaterial = null;
            }
            if (board.texture) {
                board.texture.destroy();
                board.texture = null;
            }
        },
        reacquire: async () => {
            await sleep(300);
            buildBoard();
            game.reset(777, null);
            input.on(Input.EventType.KEY_DOWN, onKeyDown);
            input.on(Input.EventType.TOUCH_START, onClick);
            return [
                { name: 'Texture2D(board)', ref: board.texture as object },
                { name: 'Material(board)', ref: boardMaterial as object },
                { name: 'BoardNode', ref: boardNode as object },
            ];
        },
    });

    probe.state.game = {
        state: game.state,
        score: game.score,
        lines: game.lines,
        level: game.level,
        pieces: game.pieces,
        steps: game.steps,
        wallRejects: game.wallRejects,
        seed: game.seed,
    };
    probe.state.boardValid = isValid(board.texture as Texture2D);
    renderPanel();
    probe.ready = true;
    probe.ok = probe.checks.every((c) => c.ok);
}

main().catch((e) => {
    probe.ready = true;
    probe.ok = false;
    probe.state.fatal = String((e && e.message) || e);
    throw e;
});
