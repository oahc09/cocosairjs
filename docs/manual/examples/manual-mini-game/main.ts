/**
 * Cocos AIR 开发手册 — Start Making a Game（开始做小游戏）
 * 配套文章：docs/manual/game.md
 *
 * 不用任何游戏框架，纯引擎手写一个"方向键/WASD 移动小球、吃随机出现的
 * 方块、计分"的迷你游戏——碰撞用中心距离判定（勾股免开方），相机固定俯视。
 * （距离判定是本示例为最小闭环选择的近似；AIR 自带组件级 2D/3D 物理，physics 篇）：
 *   - 输入：window 级 input 单例，input.on(SystemEventType.KEY_DOWN/KEY_UP) + KeyCode
 *     （tips-keyboard 篇同款按下集合模式，源码锚：d.ts 28294 export const input）；
 *   - 移动：update(dt) 里按合成方向平移 + 场地边界 clamp；
 *   - 判定：XZ 平面平方距离 < (r_ball + r_coin)^2 即吃到——不开方；
 *   - 消失/重生：tween(node).to(scale→0).call(重摆位+tween 回 1).start()；
 *   - 计分 HUD：直接写 DOM #score div（引擎内外一张皮，无 UI 系统也够用）。
 * 持续变化源：金币立着自旋 + 空闲 3.5s 进入"自动演示"寻最近金币导航——headless
 * 取证没有键盘也照样吃币，frame-diff 有保障；任何真实按键立即夺回控制权。
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
    Mesh,
    Vec3,
    Color,
    utils,
    primitives,
    tween,
    input,
    SystemEventType,
    KeyCode,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('minigame');

// ---- 灯光 + 固定俯视相机（机位思路：一眼看清全场） ----
const dirNode = new Node('DirLight');
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

// ---- 场地：14×14 草地平面（Cocos plane 默认躺 XZ、法线 +Y，无需旋转） ----
const ARENA = 5; // 可动半宽（球心 clamp 到 ±ARENA）

function stdMesh(name: string, mesh: Mesh, color: Color, roughness: number): { node: Node; mat: Material } {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    scene.addChild(node);
    const r = node.addComponent(MeshRenderer);
    r.mesh = mesh;
    const mat = new Material();
    mat.initialize({ effectName: 'builtin-standard' });
    mat.setProperty('mainColor', color);
    mat.setProperty('roughness', roughness);
    r.material = mat;
    return { node, mat };
}

const ground = stdMesh(
    'Ground',
    utils.createMesh(primitives.plane({ width: 14, length: 14 })),
    new Color(104, 148, 114, 255),
    0.9,
);
const ballPart = stdMesh('Ball', utils.createMesh(primitives.sphere(0.4, 20, 14)), new Color(120, 180, 255, 255), 0.4);
ballPart.node.setPosition(new Vec3(0, 0.4, 0));

// ---- 金币：共享一个 Mesh + 一个 Material（6 个节点各自变换，资源只一份） ----
const COIN_N = 6;
const BALL_R = 0.4;
const COIN_R = 0.32;
const CATCH2 = (BALL_R + COIN_R) * (BALL_R + COIN_R); // 判定用平方距离，免开方
const coinMesh = utils.createMesh(primitives.cylinder(COIN_R, COIN_R, 0.06, { radialSegments: 20 }));
const coinMat = new Material();
coinMat.initialize({ effectName: 'builtin-standard' });
coinMat.setProperty('mainColor', new Color(255, 232, 120, 255));
coinMat.setProperty('roughness', 0.35);
// 实测坑：builtin-standard 下 metallic 拉高且无环境贴图 → 金属反射无源，金币渲染近黑（截图实锤），
// 卡通金币走 diffuse 亮黄即可
coinMat.setProperty('metallic', 0.0);

// 固定种子随机：取证可复现（mulberry32，seed 打进覆盖层）
function mulberry32(a: number): () => number {
    return function (): number {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const RNG_SEED = 20260920;
const rand = mulberry32(RNG_SEED);

const coins: { node: Node; x: number; z: number; caught: boolean }[] = [];
for (let i = 0; i < COIN_N; i++) {
    const node = new Node(`Coin${i}`);
    node.layer = Layers.Enum.DEFAULT;
    scene.addChild(node);
    const r = node.addComponent(MeshRenderer);
    r.mesh = coinMesh;
    r.material = coinMat; // 共享材质：只读不毁（materials 篇红线）
    coins.push({ node, x: 0, z: 0, caught: false });
}
function placeCoin(c: { node: Node; x: number; z: number; caught: boolean }): void {
    c.caught = false;
    c.x = rand() * (ARENA * 2 - 1.5) - (ARENA - 0.75);
    c.z = rand() * (ARENA * 2 - 1.5) - (ARENA - 0.75);
    c.node.setPosition(new Vec3(c.x, 0.42, c.z));
    c.node.setScale(new Vec3(0.001, 0.001, 0.001));
    tween(c.node)
        .to(0.3, { scale: new Vec3(1, 1, 1) })
        .start();
}
coins.forEach(placeCoin);

// ---- 键盘：按下集合 + 最近按键时刻（tips-keyboard 同款） ----
const pressed = new Set<number>();
let lastKeyAt = -100; // 自动演示判定用；初始 = "很久没按" → 开局即自动演示
input.on(SystemEventType.KEY_DOWN, (e) => {
    pressed.add(e.keyCode);
    lastKeyAt = performance.now() / 1000;
});
input.on(SystemEventType.KEY_UP, (e) => {
    pressed.delete(e.keyCode);
});
const KEYS: number[][] = [
    [KeyCode.KEY_A, KeyCode.ARROW_LEFT, -1, 0],
    [KeyCode.KEY_D, KeyCode.ARROW_RIGHT, 1, 0],
    [KeyCode.KEY_W, KeyCode.ARROW_UP, 0, -1],
    [KeyCode.KEY_S, KeyCode.ARROW_DOWN, 0, 1],
];

const info = document.querySelector('#info') as HTMLElement;
const scoreEl = document.querySelector('#score') as HTMLElement;

// ---- 游戏主循环：输入 → 移动(clamp) → 距离判定 → tween 消失/重生 → 计分 ----
interface MiniGameStats {
    mode: string;
    score: number;
    catches: number;
    ball: string[];
    nearestCoin: string;
    pressed: number;
    alive: number;
}

class MiniGame extends Component {
    score = 0;
    catches = 0;
    mode = '';
    private _spin = 0;
    stats: MiniGameStats | null = null;

    update(dt: number): void {
        const t = performance.now() / 1000;
        this.mode = t - lastKeyAt < 3.5 ? 'keyboard' : 'auto-demo';

        let dx = 0;
        let dz = 0;
        if (this.mode === 'keyboard') {
            for (const [k1, k2, ax, az] of KEYS) {
                if (pressed.has(k1) || pressed.has(k2)) {
                    dx += ax;
                    dz += az;
                }
            }
        } else {
            // 自动演示：直扑最近金币（headless 无键盘也持续产生吃币事件）
            let best = null;
            let bestD = Infinity;
            for (const c of coins) {
                const d = (c.x - this.node.position.x) ** 2 + (c.z - this.node.position.z) ** 2;
                if (!c.caught && d < bestD) {
                    bestD = d;
                    best = c;
                }
            }
            if (best && bestD > 1e-6) {
                const inv = 1 / Math.sqrt(bestD);
                dx = (best.x - this.node.position.x) * inv;
                dz = (best.z - this.node.position.z) * inv;
            }
        }

        const p = this.node.position;
        const nx = Math.min(ARENA, Math.max(-ARENA, p.x + dx * dt * 3));
        const nz = Math.min(ARENA, Math.max(-ARENA, p.z + dz * dt * 3));
        this.node.setPosition(new Vec3(nx, BALL_R, nz));

        // 金币立着自旋（持续变化源）+ 距离判定吃币
        // 实测坑：吃币后若 node.active=false，其 shrink tween 不再被驱动，call() 永不触发、金币永不重生
        // ——改"caught 逻辑标记 + 节点保持 active"，可见性交给缩到 0 的 scale
        this._spin = (this._spin || 0) + dt * 160;
        let nearest = Infinity;
        let alive = 0;
        for (const c of coins) {
            c.node.setRotationFromEuler(90, this._spin % 360, 0);
            if (c.caught) continue;
            alive++;
            const d2 = (c.x - nx) ** 2 + (c.z - nz) ** 2;
            if (d2 < nearest) nearest = d2;
            if (d2 < CATCH2) {
                // 吃到：平方距离过阈值即命中，免开方
                c.caught = true;
                this.score++;
                this.catches++;
                scoreEl.textContent = `Score: ${this.score}`;
                tween(c.node)
                    .to(0.22, { scale: new Vec3(0.001, 0.001, 0.001) })
                    .call(() => placeCoin(c))
                    .start();
            }
        }

        this.stats = {
            mode: this.mode,
            score: this.score,
            catches: this.catches,
            ball: [nx.toFixed(2), nz.toFixed(2)],
            nearestCoin: Math.sqrt(nearest).toFixed(2),
            pressed: pressed.size,
            alive,
        };
        info.textContent = [
            'mini-game: WASD/arrows move the ball, distance-check "collision", tween respawn, DOM score HUD',
            `mode=${this.stats.mode}${this.stats.mode === 'auto-demo' ? ' (idle >3.5s, steering to nearest coin; any key takes back control)' : ''}`,
            `score=${this.stats.score}  coins alive=${this.stats.alive}/${COIN_N} (shared mesh+material x1)`,
            `ball=(${this.stats.ball.join(', ')})  nearest coin d=${this.stats.nearestCoin}  catch^2 threshold=${CATCH2.toFixed(3)} (squared distance, no sqrt)`,
            `keys pressed=${this.stats.pressed}  arena clamp=±${ARENA}  rng seed=${RNG_SEED} (reproducible spawns)`,
        ].join('\n');
    }
}
const rig = ballPart.node.addComponent(MiniGame);

window.__airApp = app;
window.__inspect = {
    scene,
    camera,
    ball: ballPart.node,
    coins,
    rig,
    rngSeed: RNG_SEED,
    getStats: () => rig.stats || null,
    // 取证辅助：把球瞬移到最近未吃金币旁，让下一帧自然触发吃币（验证判定回路）
    forceCatchNearest: () => {
        let best = null;
        let bestD = Infinity;
        for (const c of coins) {
            if (c.caught) continue;
            const d = c.x ** 2 + c.z ** 2;
            if (d < bestD) {
                bestD = d;
                best = c;
            }
        }
        if (best) {
            ballPart.node.setPosition(new Vec3(best.x, BALL_R, best.z));
            return { teleportedTo: [best.x, best.z] };
        }
        return { teleportedTo: null };
    },
};
app.run(scene);

console.log('[manual/mini-game] running on cocosair');
