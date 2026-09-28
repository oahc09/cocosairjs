/* W02 冷启动回归探针（tools/debug/probes 隔离，不登记 files.json，不进 Gallery/coverage）。
 *
 * 任务清单 W02：无 Creator 资产包、空缓存条件下验证 Code First 冷启动三条路径：
 *   ?path=builtin   — createAirApp({physics:'builtin'})：默认材质预置、系统就绪、
 *                     静态世界（离散检测器不模拟）+ 资产包晚到覆盖合同 + 场景重复启动；
 *   ?path=cannon    — createAirApp({physics:'cannon'})：重力模拟真实推进（cannon-shape
 *                     setMaterial 消费默认材质不崩 = 历史缺陷不复现的直接证据）；
 *   ?path=lowlevel  — 公开低层 game.init()（不经 createAirApp）：模块求值期播种的
 *                     默认材质在 POST_PROJECT_INIT 消费前就位、PhysicsSystem 就绪。
 *
 * 记录：初始化阶段时间线、默认材质存在性、errorID(9642) 是否出现、退出清理（game.pause 静默）。
 * 运行：NODE_PATH=<playwright> node tools/verify/w02-coldstart.cjs
 * 证据：docs/evidence/w02-coldstart.json
 */
import {
    createAirApp,
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
    director,
    Director,
    Component,
    builtinResMgr,
    PhysicsMaterial,
    ERigidBodyType,
    physics as physicsNS,
    game,
    Game,
    DebugMode,
} from 'cocosair';

const params = new URLSearchParams(location.search);
const path = params.get('path') || 'builtin';

const probe = { id: 'coldstart-probe', ready: false, ok: true, checks: [], samples: {}, info: { path } };
window.__coldstartProbe = probe;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = performance.now();
const stages = [];
function markStage(name) {
    stages.push({ name, at: Math.round(performance.now() - t0) });
}
function check(name, pass, detail) {
    probe.checks.push({ name, pass: !!pass, detail: detail === undefined ? undefined : String(detail) });
    if (!pass) {
        probe.ok = false;
    }
}
const consoleErrors = [];
const origError = console.error;
console.error = function (...a) {
    consoleErrors.push(
        a
            .map((x) => (typeof x === 'string' ? x : String((x && x.message) || x)))
            .join(' ')
            .slice(0, 300),
    );
    origError.apply(console, a);
};

game.on(Game.EVENT_PRE_SUBSYSTEM_INIT, () => markStage('pre-subsystem'));
game.on(Game.EVENT_POST_SUBSYSTEM_INIT, () => markStage('post-subsystem'));
markStage('modules-evaluated');

function materialProbe(label) {
    const mat = builtinResMgr.get('default-physics-material');
    check(label + '_default_material_present', !!mat, mat ? mat.name : 'MISSING');
    let sysMatName = 'n/a';
    try {
        const sys = physicsNS.PhysicsSystem.instance;
        sysMatName = sys && sys._material ? sys._material.name : '(unset)';
    } catch (e) {
        sysMatName = 'read-err';
    }
    check(label + '_system_consumed_material', sysMatName === 'default-physics-material', sysMatName);
    return mat;
}

function checkNo9642(label) {
    const hit = consoleErrors.filter(
        (line) => line.indexOf('9642') >= 0 || line.indexOf('default physics material') >= 0,
    );
    check(label + '_no_error_9642', hit.length === 0, hit.slice(0, 2).join(' | ') || 'clean');
}

function buildScene(name) {
    const scene = new Scene(name);
    const cameraNode = new Node('Main Camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(new Vec3(0, 1.6, 6));
    cameraNode.lookAt(new Vec3(0, 1, 0));
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.PERSPECTIVE;
    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 100;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(30, 40, 60, 255);
    camera.visibility = Layers.Enum.DEFAULT;
    const lightNode = new Node('Main Light');
    scene.addChild(lightNode);
    lightNode.setPosition(new Vec3(0, 8, 0));
    lightNode.setRotationFromEuler(-45, -30, 0);
    const keyLight = lightNode.addComponent(DirectionalLight);
    keyLight.illuminance = 65000;
    const box = new Node('SubjectBox');
    box.layer = Layers.Enum.DEFAULT;
    scene.addChild(box);
    box.setPosition(new Vec3(0, 1, 0));
    const renderer = box.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
    const mat = new Material();
    mat.initialize({ effectName: 'builtin-standard' });
    mat.setProperty('mainColor', new Color(70, 120, 235, 255));
    renderer.setSharedMaterial(mat, 0);
    return scene;
}

function waitFrames(n) {
    return new Promise((resolve) => {
        let c = 0;
        function onDraw() {
            c += 1;
            if (c >= n) {
                director.off(Director.EVENT_AFTER_DRAW, onDraw);
                resolve();
            }
        }
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
    });
}

if (path === 'lowlevel') {
    // 公开低层路径：不经 createAirApp，直接 game.init（模块求值期播种应已生效）。
    try {
        await game.init({
            debugMode: DebugMode.ERROR,
            settingsPath: '',
            overrideSettings: { rendering: { renderMode: undefined } },
        });
        markStage('game-inited');
        check('lowlevel_game_inited', game.inited === true, String(game.inited));
        materialProbe('lowlevel');
        checkNo9642('lowlevel');
        // 低层路径无 AIR builtin effects 注册：只跑空场景清屏（不触碰 builtin-standard）。
        const scene = new Scene('lowlevel-empty');
        const camNode = new Node('Cam');
        scene.addChild(camNode);
        camNode.setPosition(new Vec3(0, 1, 6));
        const cam = camNode.addComponent(Camera);
        cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        cam.clearColor = new Color(30, 40, 60, 255);
        director.runSceneImmediate(scene);
        game.run();
        await waitFrames(10);
        markStage('first-frames');
        check('lowlevel_frames_flow', true, '10 frames observed');
        let backendId = 'n/a';
        try {
            backendId = String(physicsNS.PhysicsSystem.instance.physicsWorld.constructor.name || '');
        } catch (e) {
            backendId = 'read-err';
        }
        probe.info.lowlevelWorldCtor = backendId;
    } catch (e) {
        check('lowlevel_init_no_throw', false, String((e && e.message) || e));
    }
    try {
        game.pause();
        await sleep(150);
    } catch (e) {
        check('lowlevel_pause_clean', false, String(e));
    }
    checkNo9642('lowlevel-final');
} else {
    const physicsOpt = path === 'cannon' ? 'cannon' : 'builtin';
    let app = null;
    try {
        app = await createAirApp({ canvas: '#GameCanvas', physics: physicsOpt });
        markStage('createAirApp-resolved');
    } catch (e) {
        check(path + '_createAirApp_no_throw', false, String((e && e.message) || e));
    }
    if (app) {
        check(path + '_createAirApp_no_throw', true);
        const scene = buildScene('coldstart-' + physicsOpt);
        app.run(scene);
        await waitFrames(20);
        markStage('scene-running');
        materialProbe(path);
        checkNo9642(path);

        if (physicsOpt === 'cannon') {
            // 历史缺陷靶：cannon-shape.setMaterial 读默认材质字段——材质缺失即崩。
            // 用官方 postUpdate 同序手动步进 3 秒重力，球从 y=10 落到 ~0.5 视为模拟真实推进。
            const sys = physicsNS.PhysicsSystem.instance;
            const world = sys.physicsWorld;
            sys.fixedTimeStep = 1 / 60;
            sys.enable = false;
            const ball = new Node('Ball');
            ball.layer = Layers.Enum.DEFAULT;
            scene.addChild(ball);
            ball.setPosition(new Vec3(0, 10, 0));
            const ballBody = ball.addComponent(physicsNS.RigidBody);
            ballBody.type = ERigidBodyType.DYNAMIC;
            const ballCollider = ball.addComponent(physicsNS.SphereCollider);
            ballCollider.radius = 0.5;
            const ground = new Node('Ground');
            ground.layer = Layers.Enum.DEFAULT;
            scene.addChild(ground);
            ground.setPosition(new Vec3(0, 0, 0));
            ground.addComponent(physicsNS.BoxCollider);
            await sleep(300); // onLoad 挂体进世界
            const y0 = ball.position.y;
            for (let i = 0; i < 180; i++) {
                sys.syncSceneToPhysics();
                sys.step(1 / 60);
                sys.emitEvents();
                world.syncAfterEvents();
            }
            const y1 = Math.round(ball.position.y * 100) / 100;
            probe.samples.cannonSim = { y0, y1, fell: y1 < y0 - 1 };
            check('cannon_sim_fell', y1 < y0 - 1, `y ${y0} → ${y1}`);
            check('cannon_setMaterial_survived', true, 'no crash during step');
        } else {
            // builtin：离散检测器不模拟——验证体/碰撞器挂接无错 + 静态 y 不变（语义对照）。
            const sys = physicsNS.PhysicsSystem.instance;
            const ball = new Node('Ball');
            ball.layer = Layers.Enum.DEFAULT;
            scene.addChild(ball);
            ball.setPosition(new Vec3(0, 10, 0));
            ball.addComponent(physicsNS.RigidBody);
            ball.addComponent(physicsNS.SphereCollider);
            await sleep(300);
            sys.fixedTimeStep = 1 / 60;
            sys.enable = false;
            const world = sys.physicsWorld;
            for (let i = 0; i < 60; i++) {
                sys.syncSceneToPhysics();
                sys.step(1 / 60);
                sys.emitEvents();
                world.syncAfterEvents();
            }
            const yStill = Math.round(ball.position.y * 100) / 100;
            probe.samples.builtinStatic = { yStill };
            check('builtin_no_sim_by_contract', yStill === 10, `y=${yStill}（builtin 为离散检测器，位移恒 0）`);

            // 资产包晚到合同：模拟官方 loadBuiltinAssets 以 asset.name 覆盖同名条目。
            const seed = builtinResMgr.get('default-physics-material');
            const official = new PhysicsMaterial();
            official.name = 'default-physics-material';
            builtinResMgr.addAsset('default-physics-material', official);
            const after = builtinResMgr.get('default-physics-material');
            check(
                'builtin_late_asset_overrides_seed',
                after === official && after !== seed,
                after === official ? 'official wins' : 'seed survived (override broken)',
            );
        }

        // 重复启动（场景级）：第二场景切换后继续出帧、无错。
        const scene2 = buildScene('coldstart-second');
        app.run(scene2);
        await waitFrames(10);
        markStage('second-scene-running');
        check(
            path + '_second_scene_runs',
            director.getScene() === scene2,
            director.getScene() && director.getScene().name,
        );

        try {
            game.pause();
            await sleep(150);
        } catch (e) {
            check(path + '_pause_clean', false, String(e));
        }
        checkNo9642(path + '-final');
    }
}

probe.info.stages = stages;
probe.info.consoleErrors = consoleErrors.slice(0, 10);
probe.info.consoleErrorCount = consoleErrors.length;
check('no_console_errors_total', consoleErrors.length === 0, consoleErrors.length + ' errors');
probe.ready = true;
