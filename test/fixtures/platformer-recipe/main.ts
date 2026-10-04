import {
    createAirApp,
    createStepClock,
    game, director, Asset, TextAsset, ImageAsset, Collider2D, IPhysics2DContact, PHYSICS_2D_PTM_RATIO,
    Scene,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    Layers,
    Color,
    UITransform,
    Canvas,
    Camera,
    input,
    Input,
    EventKeyboard,
    KeyCode,
    PhysicsSystem2D,
    RigidBody2D,
    BoxCollider2D,
    ERigidBody2DType,
    Contact2DType,
    TiledMap,
    TiledMapAsset,
    assetManager,
    Vec2,
    Vec3,
    Rect,
    Size,
} from 'cocosair';
import {
    FIXED_DT,
    GRAVITY_Y,
    MOVE_SPEED,
    JUMP_VELOCITY,
    GROUND_FRICTION,
    TMX_CONTRACT,
    oneWayShouldDisable,
    classifyVelocitySeries,
} from './recipe-contract';

const logLine = (message: string): void => {
    const pre = document.getElementById('log') as HTMLPreElement;
    pre.textContent = `${pre.textContent}\n${message}`.slice(-6000);
};

const W = TMX_CONTRACT.width * TMX_CONTRACT.tileWidth;   // 320
const H = TMX_CONTRACT.height * TMX_CONTRACT.tileHeight; // 192

const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
const app = await createAirApp({ canvas, designResolution: { width: W, height: H, policy: 0 } });
const scene = new Scene('PlatformerRecipe');
app.run(scene);

const physics = PhysicsSystem2D.instance;
physics.enable = true;
physics.autoSimulation = false; // 渲染帧不推进 2D 物理；显式 step 推进
physics.gravity = new Vec2(0, GRAVITY_Y);

// ── 相机与画布（正交，设计 320×192 = 20×12 @16px）──
const canvasNode = new Node('Canvas');
canvasNode.layer = Layers.Enum.UI_2D;
const canvasTransform = canvasNode.addComponent(UITransform);
canvasTransform.setContentSize(W, H);
const canvasComponent = canvasNode.addComponent(Canvas);
scene.addChild(canvasNode);
const cameraNode = new Node('RecipeCamera');
cameraNode.layer = Layers.Enum.UI_2D;
const cameraTransform = cameraNode.addComponent(UITransform);
cameraTransform.setContentSize(1, 1);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.priority = 0;
camera.visibility = Layers.Enum.UI_2D;
camera.near = 1; camera.far = 2000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(24, 30, 44, 255);
canvasNode.addChild(cameraNode);
cameraNode.setPosition(0, 0, 1000);
canvasComponent.cameraComponent = camera;

// ── 资产（真实 HTTP：loadRemote .tmx/.tsx/.png）──
const loadedAssets: Asset[] = [];
function loadRemote<T extends Asset> (url: string, ext: string): Promise<T> {
    return new Promise((resolve, reject) => {
        assetManager.loadRemote(url, { ext }, (err: Error | null, asset: T) => {
            if (err) reject(err); else { asset.addRef(); loadedAssets.push(asset); resolve(asset); }
        });
    });
}

const [tmxLoaded, tsxLoaded, pngLoaded] = await Promise.all([
    loadRemote<TextAsset>('./level.tmx', '.tmx'),
    loadRemote<TextAsset>('./platformer.tsx', '.tsx'),
    loadRemote<Texture2D | ImageAsset>('./tiles.png', '.png'),
]);

const tileTexture = pngLoaded instanceof Texture2D ? pngLoaded : (() => {
    const t = new Texture2D();
    t.image = pngLoaded as ImageAsset;
    return t;
})();

// ── TiledMap（真实 TMX/TSX 解析与渲染）──
const mapNode = new Node('LevelMap');
mapNode.layer = Layers.Enum.UI_2D;
mapNode.addComponent(UITransform);
canvasNode.addChild(mapNode);
const tiledMap = mapNode.addComponent(TiledMap);
tiledMap.enableCulling = false;

const mapAsset = new TiledMapAsset();
mapAsset.tmxXmlStr = tmxLoaded.text;
const tileFrame = new SpriteFrame();
tileFrame.texture = tileTexture;
mapAsset.spriteFrames = [tileFrame];
mapAsset.spriteFrameNames = ['tiles.png'];
mapAsset.spriteFrameSizes = [new Size(32, 16)];
mapAsset.tsxFiles = [tsxLoaded];
mapAsset.tsxFileNames = ['platformer.tsx'];
mapAsset.imageLayerSpriteFrame = [];
mapAsset.imageLayerSpriteFrameNames = [];
tiledMap.tmxAsset = mapAsset;

const levelLayer = tiledMap.getLayer(TMX_CONTRACT.layerName);
if (!levelLayer) { logLine('FATAL: level layer missing'); throw new Error('level layer missing'); }

// ── 配方：TiledMap 属性驱动碰撞生成（stone 静态实体；plank 单向平台）──
const GROUND_TAG = 1;
const ONEWAY_TAG = 2;
const playerSpawn = { x: 2 * 16 + 8 - W / 2, y: H / 2 - 9 * 16 - 8 };

const playerNode = new Node('Player');
playerNode.layer = Layers.Enum.UI_2D;
canvasNode.addChild(playerNode);
playerNode.setPosition(playerSpawn.x, playerSpawn.y, 0);
const playerTransform = playerNode.addComponent(UITransform);
playerTransform.setContentSize(12, 14);
const playerBody = playerNode.addComponent(RigidBody2D);
playerBody.type = ERigidBody2DType.Dynamic;
playerBody.enabledContactListener = true;
playerBody.fixedRotation = true;
playerBody.allowSleep = false;
playerBody.linearDamping = 0; // 真实合同：无 linearDamping
const playerCollider = playerNode.addComponent(BoxCollider2D);
playerCollider.size = new Size(12, 14);
playerCollider.friction = 0.2;
playerCollider.tag = 0;
playerCollider.apply();

// 玩家视觉（纯白方块，截图证据）
const playerSprite = playerNode.addComponent(Sprite);
playerSprite.sizeMode = Sprite.SizeMode.CUSTOM;
const playerSf = new SpriteFrame();
const playerTex = new Texture2D();
playerTex.reset({ width: 8, height: 8, format: Texture2D.PixelFormat.RGBA8888 });
const white = new Uint8Array(8 * 8 * 4);
white.fill(255);
playerTex.uploadData(white);
playerSf.texture = playerTex;
playerSf.rect = new Rect(0, 0, 8, 8);
playerSprite.spriteFrame = playerSf;

// 瓦片碰撞生成（配方核心：getTileGIDAt + getPropertiesForGID 属性驱动）
let stoneCount = 0;
let plankCount = 0;
// TiledMap 组件将地图锚定在节点中心（anchor 0.5）：地图跨 x[-160,160] y[-96,96]。
// tile (col,row) 中心 = (−W/2 + col*16 + 8, H/2 − row*16 − 8)
const tileWorld = (col: number, row: number): { x: number; y: number } => ({
    x: col * 16 + 8 - W / 2,
    y: H / 2 - row * 16 - 8,
});

for (let row = 0; row < TMX_CONTRACT.height; row += 1) {
    for (let col = 0; col < TMX_CONTRACT.width; col += 1) {
        const gid = levelLayer.getTileGIDAt(col, row);
        if (!gid) continue;
        const props = tiledMap.getPropertiesForGID(gid);
        const solid = props ? (props as Record<string, unknown>).solid === true : false;
        const oneway = props ? (props as Record<string, unknown>).oneway === true : false;
        if (!solid && !oneway) continue;
        const tileNode = new Node(`tile-${col}-${row}`);
        tileNode.layer = Layers.Enum.UI_2D;
        mapNode.addChild(tileNode);
        const pos = tileWorld(col, row);
        tileNode.setPosition(pos.x, pos.y, 0);
        const body = tileNode.addComponent(RigidBody2D);
        body.type = ERigidBody2DType.Static;
        body.enabledContactListener = true;
        const collider = tileNode.addComponent(BoxCollider2D);
        collider.size = new Size(16, 16);
        collider.friction = typeof (props as Record<string, unknown>)?.friction === 'number'
            ? (props as Record<string, number>).friction!
            : GROUND_FRICTION;
        if (oneway) {
            plankCount += 1;
            collider.tag = ONEWAY_TAG;
        } else {
            stoneCount += 1;
            collider.tag = GROUND_TAG;
        }
        collider.apply(); // Code First mutations rebuild the native Box2D fixture.
    }
}

// Native velocity uses Box2D metres/second; gravity setter accepts pixels/second².
// The public PTM ratio converts the recipe's declared pixel speed only once.
const velocityPX = () => ({ vx: playerBody.linearVelocity.x * PHYSICS_2D_PTM_RATIO,
    vy: playerBody.linearVelocity.y * PHYSICS_2D_PTM_RATIO });
const setVelocityPX = (vx: number, vy: number) => {
    playerBody.linearVelocity = new Vec2(vx / PHYSICS_2D_PTM_RATIO, vy / PHYSICS_2D_PTM_RATIO);
};
const supports = new Map<Collider2D, { normalY: number; tag: number }>();
let previousFeet = playerSpawn.y - 7;
const actualGroundFrictions = new Set<number>();
let passThroughSteps = 0, groundImpulseSteps = 0, oneWayImpulseSteps = 0;
let fixedSteps = 0, renderedFrames = 0, inputEvents = 0, disposed = false, inputEnabled = false;
const normals: Array<{ tag: number; y: number; disabled: boolean }> = [];
const grounded = () => supports.size > 0;
playerCollider.on(Contact2DType.PRE_SOLVE, (_self: Collider2D, other: Collider2D, contact: IPhysics2DContact) => {
    supports.delete(other);
    const vy = velocityPX().vy;
    const manifold = contact.getWorldManifold();
    const normal = manifold.normal;
    const xs = manifold.points.map((point) => point.x);
    const footInterior = xs.length > 0 && Math.min(...xs) <= playerNode.worldPosition.x + 5
        && Math.max(...xs) >= playerNode.worldPosition.x - 5;
    // World manifold normal points A→B; invert when the player is A.
    const normalY = contact.colliderA === playerCollider ? -normal.y : normal.y;
    const platformTop = other.node.worldPosition.y + 8;
    const disabled = other.tag === ONEWAY_TAG
        && (oneWayShouldDisable(vy) || previousFeet < platformTop - 1);
    if (disabled) { contact.disabledOnce = true; passThroughSteps += 1; }
    if (!disabled && normalY > 0.5 && footInterior && vy <= 0.1) supports.set(other, { normalY, tag: other.tag });
    normals.push({ tag: other.tag, y: normalY, disabled }); if (normals.length > 40) normals.shift();
});
playerCollider.on(Contact2DType.END_CONTACT, (_self: Collider2D, other: Collider2D) => supports.delete(other));
playerCollider.on(Contact2DType.POST_SOLVE, (_self: Collider2D, other: Collider2D, contact: IPhysics2DContact) => {
    if ((contact.getImpulse()?.normalImpulses ?? []).some((v) => v > 0)) {
        if (other.tag === GROUND_TAG) { groundImpulseSteps += 1; actualGroundFrictions.add(contact.getFriction()); }
        if (other.tag === ONEWAY_TAG) oneWayImpulseSteps += 1;
    }
});
const inputState = { left: false, right: false, jumpQueued: false };
const heldKeys = new Set<number>();
function applyKeyCode(key: number, down: boolean): void {
    if (disposed || !inputEnabled) return;
    inputEvents += 1;
    const wasHeld = heldKeys.has(key);
    if (down) heldKeys.add(key); else heldKeys.delete(key);
    inputState.left = heldKeys.has(KeyCode.KEY_A) || heldKeys.has(KeyCode.ARROW_LEFT);
    inputState.right = heldKeys.has(KeyCode.KEY_D) || heldKeys.has(KeyCode.ARROW_RIGHT);
    if (down && !wasHeld && [KeyCode.KEY_W, KeyCode.ARROW_UP, KeyCode.SPACE].includes(key)) inputState.jumpQueued = true;
}
const onDown = (event: EventKeyboard) => applyKeyCode(event.keyCode, true);
const onUp = (event: EventKeyboard) => applyKeyCode(event.keyCode, false);
const clearInput = () => { heldKeys.clear(); inputState.left = inputState.right = inputState.jumpQueued = false; };
input.on(Input.EventType.KEY_DOWN, onDown); input.on(Input.EventType.KEY_UP, onUp);
window.addEventListener('blur', clearInput);
function onVisibility(): void { if (document.hidden) clearInput(); }
document.addEventListener('visibilitychange', onVisibility);
const world = physics.physicsWorld;
function stepPhysics(count: number): void {
    if (disposed) throw new Error('PLATFORMER_DISPOSED');
    for (let i = 0; i < count; i += 1) {
        world.syncSceneToPhysics(); previousFeet = playerNode.worldPosition.y - 7;
        const { vy } = velocityPX();
        if (inputState.right || inputState.left) setVelocityPX((Number(inputState.right) - Number(inputState.left)) * MOVE_SPEED, vy);
        if (inputState.jumpQueued && grounded()) { setVelocityPX(velocityPX().vx, JUMP_VELOCITY); supports.clear(); }
        inputState.jumpQueued = false;
        physics.step(FIXED_DT); world.syncPhysicsToScene(); fixedSteps += 1;
    }
}
let retiredMotion: { x: number; y: number; vx: number; vy: number; grounded: boolean; supportTags: number[] } | null = null;
const getPlayer = () => retiredMotion ? { ...retiredMotion, fixedSteps, renderedFrames, inputEvents } : ({ x: playerNode.worldPosition.x, y: playerNode.worldPosition.y,
    ...velocityPX(), grounded: grounded(), supportTags: [...supports.values()].map((v) => v.tag),
    fixedSteps, renderedFrames, inputEvents });
const clock = createStepClock(); clock.begin(); // engine pacer remains paused in BOTH controlled and live modes
async function render(): Promise<void> { await clock.step(0); renderedFrames += 1; }
function reset(x = playerSpawn.x, y = playerSpawn.y): void {
    clearInput(); supports.clear(); playerNode.setPosition(x, y, 0);
    playerBody.angularVelocity = 0; setVelocityPX(0, 0); playerBody.wakeUp(); previousFeet = y - 7;
    world.syncSceneToPhysics();
}
const results: Record<string, unknown> = {};
await render(); stepPhysics(60); await render();
results.spawn = { ...getPlayer(), stoneCount, plankCount, groundImpulseSteps };
// Real friction, with all input released. No manual velocity decay or damping.
inputState.right = true; stepPhysics(10); inputState.right = false;
const releaseVx = [velocityPX().vx], releaseGrounded = [grounded()];
for (let i = 0; i < 50; i += 1) { stepPhysics(1); releaseVx.push(velocityPX().vx); releaseGrounded.push(grounded()); }
results.groundDeceleration = { releaseVx, releaseGrounded, ...classifyVelocitySeries(releaseVx, MOVE_SPEED),
    linearDamping: playerBody.linearDamping, playerFriction: playerCollider.friction, actualGroundFrictions: [...actualGroundFrictions], groundImpulseSteps };
// Seed horizontal movement on the ground, jump, then release ALL controls before sampling.
reset(); stepPhysics(60); inputState.right = true; stepPhysics(2); inputState.jumpQueued = true; stepPhysics(1); clearInput();
const air: ReturnType<typeof getPlayer>[] = [];
for (let i = 0; i < 12; i += 1) { stepPhysics(1); air.push(getPlayer()); }
results.airConstant = { samples: air, ...classifyVelocitySeries(air.map((v) => v.vx), MOVE_SPEED), controlsReleased: !inputState.left && !inputState.right };
// Same body: rise from below the three TMX planks, then land with a real upward support normal.
reset(-56, playerSpawn.y); stepPhysics(60);
const beforePass = passThroughSteps, beforeImpulse = oneWayImpulseSteps;
inputState.jumpQueued = true; stepPhysics(1); clearInput();
const path: ReturnType<typeof getPlayer>[] = [];
for (let i = 0; i < 100; i += 1) { stepPhysics(1); path.push(getPlayer()); }
results.oneWay = { path, passThroughSteps: passThroughSteps - beforePass, impulseSteps: oneWayImpulseSteps - beforeImpulse,
    platformTop: tileWorld(6, TMX_CONTRACT.oneWayRow).y + 8, final: getPlayer() };
// Walls and underside contacts must not admit a ground jump.
reset(-138, 40); setVelocityPX(-MOVE_SPEED, 0); stepPhysics(8);
const wall = getPlayer(); inputState.jumpQueued = true; stepPhysics(1);
results.wallNegative = { before: wall, after: getPlayer(), normals: [...normals] };
// Keep rendering frames, while the simulation counter and body remain unchanged.
const pauseStart = getPlayer(); for (let i = 0; i < 10; i += 1) await render();
results.pauseNegative = { before: pauseStart, after: getPlayer(), enginePaused: game.isPaused() };
let outOfBoundsGid: unknown, outOfBoundsError: string | null = null;
try { outOfBoundsGid = levelLayer.getTileGIDAt(999, 999); } catch (error) { outOfBoundsError = String(error); }
results.tileQueryNegative = { outOfBoundsGid, outOfBoundsError, unknownProps: tiledMap.getPropertiesForGID(999) ?? null,
    emptyGid: levelLayer.getTileGIDAt(2, 2), stoneGid: levelLayer.getTileGIDAt(2, 11), plankGid: levelLayer.getTileGIDAt(6, 8) };
reset(); stepPhysics(60); await render(); results.restart = getPlayer();
// Sample the actual white player and a real tile at their projected locations.
function pixelAt(x: number, y: number): number[] {
    const gl = canvas.getContext('webgl2')!; const screen = new Vec3(); camera.worldToScreen(new Vec3(x, y, 0), screen);
    const pixel = new Uint8Array(4); gl.readPixels(Math.round(screen.x), Math.round(screen.y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [...pixel];
}
results.pixels = { player: pixelAt(playerNode.worldPosition.x, playerNode.worldPosition.y), tile: pixelAt(-120, -88) };
let accumulator = 0, lastRaf = 0, rafId: number | null = null, liveRunning = false;
function liveFrame(now: number): void {
    rafId = null; if (disposed) return;
    if (liveRunning) {
        accumulator += Math.min((now - lastRaf) / 1000, 0.1);
        while (accumulator >= FIXED_DT) { stepPhysics(1); accumulator -= FIXED_DT; }
    }
    lastRaf = now; director.tick(0); renderedFrames += 1; rafId = requestAnimationFrame(liveFrame);
}
function resume(): void { if (disposed) throw new Error('PLATFORMER_DISPOSED'); inputEnabled = true; clearInput(); accumulator = 0; lastRaf = performance.now(); liveRunning = true; }
function pause(): void { inputEnabled = false; clearInput(); accumulator = 0; liveRunning = false; }
let cleanupPromise: Promise<unknown> | null = null;
function cleanup(): Promise<unknown> {
    if (cleanupPromise) return cleanupPromise;
    disposed = true; liveRunning = false; clearInput();
    if (rafId !== null) cancelAnimationFrame(rafId); rafId = null;
    input.off(Input.EventType.KEY_DOWN, onDown); input.off(Input.EventType.KEY_UP, onUp);
    window.removeEventListener('blur', clearInput); document.removeEventListener('visibilitychange', onVisibility);
    const before = getPlayer(); retiredMotion = before;
    cleanupPromise = (async () => {
        playerSprite.spriteFrame = null;
        // Frames/textures were created by this recipe; remotely loaded assets have a separate acquired reference.
        const made: Asset[] = [mapAsset, tileFrame, playerSf, playerTex, ...(pngLoaded === tileTexture ? [] : [tileTexture])];
        app.session!.own(() => {
            for (const asset of made) asset.destroy();
            for (const asset of loadedAssets) asset.decRef();
        }, 'platformer-assets');
        const receipt = await app.close!();
        director.tick(0); await Promise.resolve(); director.tick(0);
        return { receipt, before, after: getPlayer(), rafId, liveRunning, disposed, enginePaused: game.isPaused(),
            valid: [...made, ...loadedAssets].map((asset) => asset.isValid), loadedRefs: loadedAssets.map((asset) => asset.refCount) };
    })();
    return cleanupPromise;
}
const api = { ready: true, snapshot: () => ({ results, playerSpawn, state: getPlayer(), normals }),
    live: getPlayer, pause, resume, cleanup, restart: () => { pause(); reset(); stepPhysics(60); director.tick(0); renderedFrames += 1; return getPlayer(); } };
(window as unknown as { __platformerProbe: typeof api }).__platformerProbe = api;
logLine('READY'); resume(); rafId = requestAnimationFrame(liveFrame);
