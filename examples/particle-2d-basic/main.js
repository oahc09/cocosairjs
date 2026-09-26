/**
 * Cocos AIR — particle-2d-basic（LV12-07 程序化 plist 粒子出图）
 *
 * 决定性三件套（缺一即三引擎读回不可能逐字节同构）：
 * 1) plist 文本在运行时**程序化生成**，交给引擎自己的解析器（`assetManager.parser.parsePlist`），
 *    解析出的字典再包成 `ParticleAsset._nativeAsset` 交给 `ParticleSystem2D.file`
 *    ⇒ 走的是上游真实通路 `_applyFile → _initWithDictionary`，而不是手写组件属性。
 * 2) 随机发生器换成**种子化 LCG**（`math.setRandGenerator`）⇒ 发射期所有 `random()` 参与的 variance 计算
 *    三引擎同串；IEEE754 双精度乘加本身跨引擎一致。
 * 3) 求值用**手工定步** `simulator.step(1/60) × N`，与真实帧率无关。
 *    ⚠️ `step` 把 dt 夹到 `assembler.maxParticleDeltaTime`，而该值只在**第一次**取 assembler 时由
 *    `cclegacy.game.frameTime / 1000 * 2` 定死（本例实测 0.033333）⇒ 不定住它，定步 dt 在慢机器上会被悄悄夹小。
 *
 * 两条反例（都是本例踩过的坑）：
 * • `ps.custom = true` 会**跳过** `_initWithDictionary` ⇒ 号称「程序化 plist」其实 plist 解析与字段映射一行都没跑。
 * • 贴图必须在 `createAirApp` 之后建：设备就绪前 `new Texture2D().image = canvas` 让 `_gfxDevice` 永远为 null，
 *   表现为每帧 `Can't getGFXSampler with out device`（errorID 9302）+ batcher 里 `sampler.hash` 读 null 崩。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    Component,
    UITransform,
    Layers,
    Color,
    Label,
    ParticleSystem2D,
    ParticleAsset,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    assetManager,
    math,
    view,
    ResolutionPolicy,
} from 'cocosair';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

const UI_LAYER = Layers.Enum.UI_3D;
const r = (v, n = 4) => Math.round(v * 10 ** n) / 10 ** n;
const safe = (fn) => {
    try {
        return fn();
    } catch (e) {
        return 'ERR:' + e.message;
    }
};
const DT = 1 / 60;

// ---------------------------------------------------------------- 种子化随机
let seed = 0x5eed1234;
function seededRandom() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
}

// ---------------------------------------------------------------- 程序化 plist
function plistXml(entries) {
    const body = Object.entries(entries)
        .map(([k, v]) => {
            if (typeof v === 'boolean') {
                return `    <key>${k}</key>\n    <${v ? 'true' : 'false'} />`;
            }
            if (v && v.raw !== undefined) {
                return `    <key>${k}</key>\n    ${v.raw}`;
            }
            const tag = typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'real') : 'string';
            return `    <key>${k}</key>\n    <${tag}>${v}</${tag}>`;
        })
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n${body}\n</dict>\n</plist>\n`;
}

const particleAssets = [];

/**
 * plist 文本 → 引擎解析 → ParticleAsset(_nativeAsset) → ParticleSystem2D.file（真实上游通路）。
 *
 * 实测（`_applyFile`）：`custom=false` 时只有 `this._spriteFrame !== file.spriteFrame` 才覆盖帧，
 * 而内置 ParticleAsset 未赋帧、运行时 canvas 帧没有 `_uuid`（setter 只写 `_renderSpriteFrame`），
 * 两边都是 null ⇒ 先前赋的帧不会被吃掉；`_initTextureWithDictionary`（会换内置图集子矩形）
 * 只在 `custom=true` 分支才走到。所以帧与 file 的赋值顺序无关。
 */
function applyPlist(ps, entries) {
    const xml = plistXml(entries);
    let parsed = null;
    let parseErr = 'unset';
    assetManager.parser.parsePlist(xml, {}, (err, data) => {
        parseErr = String(err);
        parsed = data;
    });
    const asset = new ParticleAsset();
    asset._nativeAsset = parsed;
    particleAssets.push(asset);
    ps.custom = false;
    ps.file = asset;
    return { xml, dict: parsed, parseErr, asset };
}

// ---------------------------------------------------------------- 运行时贴图（设备就绪后才建）
const frameCache = new Map();

function dotFrame(name, size, stops) {
    if (frameCache.has(name)) {
        return frameCache.get(name).spriteFrame;
    }
    const cvs = document.createElement('canvas');
    cvs.width = size;
    cvs.height = size;
    const ctx = cvs.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [at, color] of stops) {
        g.addColorStop(at, color);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const image = new ImageAsset(cvs);
    const texture = new Texture2D();
    texture.image = image;
    const spriteFrame = new SpriteFrame();
    spriteFrame.texture = texture;
    frameCache.set(name, { name, spriteFrame, texture, image });
    return spriteFrame;
}

const FIRE_STOPS = [
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,190,80,0.9)'],
    [1, 'rgba(255,80,0,0)'],
];
const SPARK_STOPS = [
    [0, 'rgba(255,255,255,1)'],
    [0.5, 'rgba(120,220,255,0.85)'],
    [1, 'rgba(40,120,255,0)'],
];

// ---------------------------------------------------------------- 场景
const canvasEl = document.querySelector('#GameCanvas');
const app = await createAirApp({ canvas: canvasEl });
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

let fireFrame = dotFrame('fire', 32, FIRE_STOPS);
let sparkFrame = dotFrame('spark', 32, SPARK_STOPS);

const scene = new Scene('v12-particle-2d-basic');
const canvasNode = new Node('Canvas');
canvasNode.layer = UI_LAYER;
canvasNode.addComponent(UITransform).width = 480;
canvasNode.getComponent(UITransform).height = 360;
const canvas = canvasNode.addComponent(Canvas);
scene.addChild(canvasNode);

const cameraNode = new Node('UICamera');
cameraNode.layer = UI_LAYER;
cameraNode.setPosition(0, 0, 1000);
const cam = cameraNode.addComponent(Camera);
cam.projection = Camera.ProjectionType.ORTHO;
cam.clearColor = new Color(10, 14, 26, 255);
cam.priority = 1073741824;
cam.visibility = UI_LAYER;
canvasNode.addChild(cameraNode);
canvas.cameraComponent = cam;

const statusNode = new Node('Status');
statusNode.layer = UI_LAYER;
statusNode.addComponent(UITransform).width = 460;
statusNode.getComponent(UITransform).height = 24;
statusNode.setPosition(0, 162, 0);
canvasNode.addChild(statusNode);
const status = statusNode.addComponent(Label);
status.string = 'particle-2d: waiting for click';
status.color = new Color(220, 228, 240, 255);
status.fontSize = 15;
status.lineHeight = 18;

/** 带偏移的容器：用来暴露 PositionType.FREE（世界）与 RELATIVE（本地）在 startPos 上的差别 */
const rig = new Node('Rig');
rig.layer = UI_LAYER;
rig.addComponent(UITransform);
rig.setPosition(30, -20, 0);
canvasNode.addChild(rig);

function makeParticle(name, x, y, parent, frame) {
    const node = new Node(name);
    node.layer = UI_LAYER;
    node.addComponent(UITransform).width = 1;
    node.getComponent(UITransform).height = 1;
    node.setPosition(x, y, 0);
    (parent || canvasNode).addChild(node);
    const ps = node.addComponent(ParticleSystem2D);
    ps.spriteFrame = frame;
    return ps;
}

const flame = makeParticle('Flame', -140, -120, null, fireFrame);
const ring = makeParticle('Ring', 140, -60, null, sparkFrame);
const probe = makeParticle('Probe', 0, 40, rig, fireFrame);

const FLAME_PLIST = {
    emitterType: 0,
    maxParticles: 260,
    particleLifespan: 1.1,
    particleLifespanVariance: 0.35,
    emissionRate: 140,
    duration: -1,
    angle: 90,
    angleVariance: 16,
    speed: 55,
    speedVariance: 28,
    gravityx: 0,
    gravityy: 34,
    radialAcceleration: -18,
    tangentialAcceleration: 12,
    startParticleSize: 30,
    startParticleSizeVariance: 10,
    finishParticleSize: -1,
    startColorRed: 1,
    startColorGreen: 0.72,
    startColorBlue: 0.2,
    startColorAlpha: 0.95,
    startColorVarianceAlpha: 0.1,
    finishColorRed: 0.85,
    finishColorGreen: 0.1,
    finishColorBlue: 0.05,
    finishColorAlpha: 0,
    sourcePositionVariancex: 9,
    sourcePositionVariancey: 3,
    positionType: 0,
    // plist 里常见的 770/1 是裸 GL 常量（GL_SRC_ALPHA/GL_ONE）。本引擎把它直接塞进 gfx 的
    // BlendFactor 枚举槽位（枚举只到 14），WebGL 侧越界被当作 GL_ZERO ⇒ 粒子算得出来但一个像素都不画。
    // 这里必须写 gfx 枚举值：SRC_ALPHA=2、ONE=1（等价于原来的相加混合）。
    blendFuncSource: 2,
    blendFuncDestination: 1,
};

const RING_PLIST = {
    emitterType: 1,
    maxParticles: 220,
    particleLifespan: 1.6,
    particleLifespanVariance: 0.4,
    emissionRate: 90,
    duration: -1,
    angle: 0,
    angleVariance: 360,
    maxRadius: 8,
    maxRadiusVariance: 4,
    minRadius: 96,
    rotatePerSecond: 42,
    rotatePerSecondVariance: 8,
    startParticleSize: 16,
    startParticleSizeVariance: 8,
    finishParticleSize: -1,
    startColorRed: 0.55,
    startColorGreen: 0.85,
    startColorBlue: 1,
    startColorAlpha: 0.9,
    finishColorRed: 0.1,
    finishColorGreen: 0.2,
    finishColorBlue: 0.9,
    finishColorAlpha: 0,
    positionType: 0,
    blendFuncSource: 2,
    blendFuncDestination: 1,
};

applyPlist(flame, FLAME_PLIST);
applyPlist(ring, RING_PLIST);

/** 探针系统的基础 plist：P1 的 gravity 模式运动学配置（reacquire 也用它把探针装回去） */
const GRAVITY_PLIST = {
    emitterType: 0,
    maxParticles: 40,
    particleLifespan: 1,
    particleLifespanVariance: 0,
    emissionRate: 10,
    duration: -1,
    angle: 0,
    angleVariance: 0,
    speed: 60,
    speedVariance: 0,
    gravityx: 0,
    gravityy: -100,
    radialAcceleration: 0,
    tangentialAcceleration: 0,
    startParticleSize: 20,
    startParticleSizeVariance: 0,
    finishParticleSize: 0,
    finishParticleSizeVariance: 0,
    rotationStart: 0,
    rotationStartVariance: 0,
    rotationEnd: 90,
    rotationEndVariance: 0,
    startColorRed: 1,
    startColorGreen: 1,
    startColorBlue: 0,
    startColorAlpha: 1,
    finishColorRed: 1,
    finishColorGreen: 0,
    finishColorBlue: 0,
    finishColorAlpha: 1,
    positionType: 0,
    sourcePositionVariancex: 0,
    sourcePositionVariancey: 0,
    blendFuncSource: 2,
    blendFuncDestination: 1,
};

// ---------------------------------------------------------------- 探针
const simOf = (ps) => ps['_simulator'];

function readback(ps, tag) {
    const sim = simOf(ps);
    const p0 = sim.particles[0];
    const last = sim.particles[sim.particles.length - 1];
    return {
        tag,
        count: sim.particles.length,
        elapsed: r(sim.elapsed, 6),
        emitCounter: r(sim.emitCounter, 6),
        active: sim.active,
        uvFilled: sim.uvFilled,
        stopped: !!ps['_stopped'],
        totalParticles: ps.totalParticles,
        life: r(ps.life, 6),
        emissionRate: r(ps.emissionRate, 6),
        duration: r(ps.duration, 6),
        emitterMode: ps.emitterMode,
        positionType: ps.positionType,
        gravity: [r(ps.gravity.x, 6), r(ps.gravity.y, 6)],
        speed: r(ps.speed, 6),
        startSize: r(ps.startSize, 6),
        endSize: r(ps.endSize, 6),
        vertexCount: sim.renderData ? sim.renderData.vertexCount : -1,
        clampDt: r(ps.assembler.maxParticleDeltaTime, 6),
        p0: p0 && {
            x: r(p0.pos.x),
            y: r(p0.pos.y),
            dx: r(p0.dir.x),
            dy: r(p0.dir.y),
            size: r(p0.size),
            rotation: r(p0.rotation),
            ttl: r(p0.timeToLive, 6),
            color: [r(p0.color.r, 2), r(p0.color.g, 2), r(p0.color.b, 2), r(p0.color.a, 2)],
            start: [r(p0.startPos.x), r(p0.startPos.y)],
            radius: r(p0.radius),
            angle: r(p0.angle, 6),
            dps: r(p0.degreesPerSecond, 6),
        },
        last: last && { x: r(last.pos.x), y: r(last.pos.y), ttl: r(last.timeToLive, 6) },
    };
}

/** 手工定步 N 次；返回首粒出现的步号（0 表示整个区间没发过） */
function burst(ps, steps, dt = DT) {
    const sim = simOf(ps);
    let firstAt = 0;
    for (let i = 1; i <= steps; i++) {
        sim.step(dt);
        if (!firstAt && sim.particles.length) firstAt = i;
    }
    return firstAt;
}

const results = {};

function runSequence() {
    const assembler = probe.assembler;
    results.clampFromFirstAssemblerFetch = r(assembler.maxParticleDeltaTime, 6);
    assembler.maxParticleDeltaTime = 0.05;
    math.setRandGenerator(seededRandom);

    // P1 gravity 模式运动学（30 步 = 0.5s）
    const p1 = applyPlist(probe, GRAVITY_PLIST);
    results.p1ParseErr = p1.parseErr;
    results.p1DictKeys = Object.keys(p1.dict).length;
    probe.resetSystem();
    burst(probe, 6);
    results.p1AtStep6 = { count: simOf(probe).particles.length, emitCounter: r(simOf(probe).emitCounter, 6) };
    burst(probe, 1);
    results.p1AtStep7 = { count: simOf(probe).particles.length, emitCounter: r(simOf(probe).emitCounter, 6) };
    burst(probe, 23);
    results.p1 = readback(probe, 'gravity@30');

    // P2 继续到 160 步：老粒子到期、新粒子补上 ⇒ 存活数由 life 与发射栅格决定
    burst(probe, 130);
    results.p2 = readback(probe, 'gravity@160');
    probe.resetSystem();
    results.p2AfterReset = readback(probe, 'afterReset');

    // P3 totalParticles 上限
    applyPlist(probe, { ...GRAVITY_PLIST, maxParticles: 3, particleLifespan: 5, emissionRate: 50 });
    probe.resetSystem();
    results.p3EmittedOnFirstStep = burst(probe, 20);
    results.p3Cap = readback(probe, 'cap3');

    // P4 plist 缺省推导：无 emissionRate → min(total/life)；finishParticleSize = -1 → 尺寸不衰减
    const p4 = applyPlist(probe, {
        emitterType: 0,
        maxParticles: 24,
        particleLifespan: 1.5,
        duration: -1,
        angle: 0,
        speed: 10,
        startParticleSize: 6,
        finishParticleSize: -1,
        positionType: 0,
    });
    results.p4 = {
        hasEmissionRateKey: 'emissionRate' in p4.dict,
        emissionRate: r(probe.emissionRate, 6),
        endSizeFromPlist: r(probe.endSize, 6),
    };
    probe.resetSystem();
    burst(probe, 60);
    results.p4SizeFlat = {
        first: simOf(probe).particles[0] && r(simOf(probe).particles[0].size, 6),
        startSize: r(probe.startSize, 6),
    };

    // P5 PositionType：FREE 用世界坐标、RELATIVE 用本地坐标（particle.pos 两者相同，startPos 才见差别）
    const BASE = {
        emitterType: 0,
        maxParticles: 2,
        particleLifespan: 5,
        emissionRate: 10,
        duration: -1,
        angle: 0,
        angleVariance: 0,
        speed: 12,
        speedVariance: 0,
        gravityx: 0,
        gravityy: 0,
        startParticleSize: 10,
        startParticleSizeVariance: 0,
        finishParticleSize: 10,
        finishParticleSizeVariance: 0,
        sourcePositionVariancex: 0,
        sourcePositionVariancey: 0,
        positionType: 0,
    };
    applyPlist(probe, BASE);
    probe.resetSystem();
    burst(probe, 10);
    results.p5Rig = [r(rig.position.x), r(rig.position.y)];
    results.p5Node = [r(probe.node.position.x), r(probe.node.position.y)];
    results.p5World = [r(probe.node.worldPosition.x), r(probe.node.worldPosition.y)];
    results.p5Free = readback(probe, 'free');
    applyPlist(probe, { ...BASE, positionType: 1 });
    probe.resetSystem();
    burst(probe, 10);
    results.p5Relative = readback(probe, 'relative');

    // P6 radius 模式：maxRadius→startRadius、minRadius→endRadius、rotatePerSecond→弧度/s
    applyPlist(probe, {
        emitterType: 1,
        maxParticles: 1,
        particleLifespan: 2,
        particleLifespanVariance: 0,
        emissionRate: 10,
        duration: -1,
        angle: 0,
        angleVariance: 0,
        maxRadius: 60,
        maxRadiusVariance: 0,
        minRadius: 0,
        minRadiusVariance: 0,
        rotatePerSecond: 90,
        rotatePerSecondVariance: 0,
        startParticleSize: 12,
        startParticleSizeVariance: 0,
        finishParticleSize: 12,
        finishParticleSizeVariance: 0,
        positionType: 1,
        sourcePositionVariancex: 0,
        sourcePositionVariancey: 0,
    });
    seed = 0x1234abcd;
    probe.resetSystem();
    results.p6FirstEmitStep = burst(probe, 10);
    results.p6Radius = readback(probe, 'radius@10');

    // P7 FREE 模式下节点世界旋转参与发射方向（angle + getWorldRotation(node)）
    applyPlist(probe, {
        emitterType: 0,
        maxParticles: 1,
        particleLifespan: 5,
        particleLifespanVariance: 0,
        emissionRate: 10,
        duration: -1,
        angle: 0,
        angleVariance: 0,
        speed: 30,
        speedVariance: 0,
        gravityx: 0,
        gravityy: 0,
        startParticleSize: 8,
        startParticleSizeVariance: 0,
        finishParticleSize: 8,
        finishParticleSizeVariance: 0,
        positionType: 0,
        sourcePositionVariancex: 0,
        sourcePositionVariancey: 0,
    });
    probe.node.setRotationFromEuler(0, 0, 90);
    seed = 0x0ddba11;
    probe.resetSystem();
    burst(probe, 10);
    results.p7Rotated = readback(probe, 'worldRotation90');
    probe.node.setRotationFromEuler(0, 0, 0);

    // P8 duration 到期只停「发射」，存活粒子继续老化；elapsed 只在 active 且有 emissionRate 时累加
    applyPlist(probe, { ...BASE, maxParticles: 40, emissionRate: 10, duration: 0.2, particleLifespan: 5 });
    seed = 7;
    probe.resetSystem();
    let stopStep = 0;
    for (let i = 1; i <= 20 && !stopStep; i++) {
        simOf(probe).step(DT);
        if (!simOf(probe).active) stopStep = i;
    }
    results.p8DurationStopStep = stopStep;
    results.p8ElapsedAtStop = r(simOf(probe).elapsed, 6);
    burst(probe, 20);
    results.p8 = readback(probe, 'afterDuration');

    // P9 GROUPED：step() 的 GROUPED 分支既不写 _pos 也不写 _worldRotation ⇒ 发射点沿用上一次 FREE/RELATIVE 留下的值
    applyPlist(probe, { ...BASE, maxParticles: 1, emissionRate: 10, duration: -1, positionType: 2 });
    probe.node.setPosition(0, -100, 0);
    seed = 0xbeef;
    probe.resetSystem();
    burst(probe, 10);
    results.p9Grouped = readback(probe, 'grouped');
    results.p9WorldAfterMove = [r(probe.node.worldPosition.x), r(probe.node.worldPosition.y)];
    probe.node.setPosition(0, 40, 0);

    // P10 plist 取值/类型的边角事实
    const p10 = applyPlist(probe, {
        emitterType: 0,
        maxParticles: 40.7,
        particleLifespan: 2,
        emissionRate: 10,
        duration: -1,
        angle: 0,
        speed: 5,
        startParticleSize: 6,
        finishParticleSize: 6,
        positionType: 0,
        rotationIsDir: true,
        // 故意保留裸 GL 常量 770：本阶段断言引擎对 plist 的 blend 值「原样透传、不校验、不换算」。
        blendFuncSource: 770,
        blendFuncDestination: 1,
        textureImageData: { raw: '<data>aGVsbG8=</data>' },
        spriteFrameFileName: { raw: '<string>no-such.png</string>' },
    });
    results.p10 = {
        rawMaxParticles: p10.dict.maxParticles,
        mappedTotalParticles: probe.totalParticles,
        rotationIsDirJson: JSON.stringify(p10.dict.rotationIsDir),
        mappedRotationIsDir: probe.rotationIsDir,
        dataTagValue: JSON.stringify(p10.dict.textureImageData),
        unknownKeyPresent: 'spriteFrameFileName' in p10.dict,
        blendPrivate: { src: probe['_srcBlendFactor'], dst: probe['_dstBlendFactor'] },
        blendPublicGetter: safe(() => (probe.dstBlendFactor === undefined ? 'no-such-getter' : probe.dstBlendFactor)),
        materialInstance: safe(() =>
            probe.getMaterialInstance(0) ? 'instance' : String(probe.getMaterialInstance(0)),
        ),
        spriteFrameStillOwnedByExample: safe(() => !!probe['_renderSpriteFrame']),
    };
    applyPlist(probe, BASE);
    probe.resetSystem();
    burst(probe, 20);
    // plist 不含 blend 键时回到 gfx 枚举默认 SRC_ALPHA=2 / ONE_MINUS_SRC_ALPHA=4（而非裸 GL 常量）
    results.p10BlendDefaults = { src: probe['_srcBlendFactor'], dst: probe['_dstBlendFactor'] };

    // P11 缺 `particleLifespan` 的 plist ⇒ 静默零粒子：`life = wrapParseFloat(dict.particleLifespan || 0)`，
    // 而 emissionRate 缺省时按 `totalParticles / life` 反推（particle-system-2d.ts:1047/1055）⇒ Math.min(Infinity, MAX_VALUE)。
    // 观测面上「一个粒子都没有」和「blend 写错」「贴图没上传」同形，且全程零告警零 GL 错误。
    applyPlist(probe, {
        emitterType: 0,
        maxParticles: 40,
        duration: -1,
        angle: 90,
        speed: 20,
        startParticleSize: 8,
        finishParticleSize: 8,
        positionType: 0,
        blendFuncSource: 2,
        blendFuncDestination: 1,
    });
    seed = 5;
    probe.resetSystem();
    burst(probe, 10);
    results.p11NoLifespan = {
        life: probe.life,
        emissionRateIsMaxValue: probe.emissionRate === Number.MAX_VALUE,
        totalParticles: probe.totalParticles,
        count: simOf(probe).particles.length,
        vertexCount: simOf(probe).renderData ? simOf(probe).renderData.vertexCount : -1,
    };
    applyPlist(probe, BASE);
    probe.resetSystem();
    burst(probe, 20);

    assembler.maxParticleDeltaTime = results.clampFromFirstAssemblerFetch;
    // ⚠️ 只能交回 Math.random。`math.random` 是引擎里的 `random() { return _random(); }` 包装，
    // setRandGenerator(math.random) 会让 _random 指向自己 ⇒ 立刻 RangeError: Maximum call stack size exceeded。
    math.setRandGenerator(Math.random);
    results.randomRestored = r(math.random(), 0) >= 0;
    summary();
}

function summary() {
    const p1 = results.p1 || { count: 0, p0: null, vertexCount: 0 };
    status.string = `particle plist step=30 count=${p1.count} p0=(${p1.p0 ? `${p1.p0.x},${p1.p0.y}` : '-'}) verts=${p1.vertexCount}`;
    return status.string;
}

canvasNode.on(Node.EventType.TOUCH_START, runSequence);

class ProbeReadout extends Component {
    update() {
        window.__geom = {
            results,
            live: { flame: simOf(flame).particles.length, ring: simOf(ring).particles.length },
        };
    }
}
canvasNode.addComponent(ProbeReadout);

function heldAssets() {
    const list = [];
    for (const f of frameCache.values()) {
        list.push({ name: `SpriteFrame:${f.name}`, ref: f.spriteFrame });
        list.push({ name: `Texture2D:${f.name}`, ref: f.texture });
        list.push({ name: `ImageAsset:${f.name}`, ref: f.image });
    }
    particleAssets.forEach((a, i) => list.push({ name: `ParticleAsset#${i}`, ref: a }));
    return list;
}

/** 释放后重建：新的程序化帧 + 重新过一遍 plist → file 上游通路 */
function reacquireSystem(ps, entries, frame) {
    ps.spriteFrame = frame;
    applyPlist(ps, entries);
    return ps;
}

installAssetLifecycle({
    label: 'particle-2d-basic',
    hold: heldAssets,
    release: () => {
        for (const ps of [flame, ring, probe]) {
            ps.spriteFrame = null;
        }
        for (const { ref } of heldAssets()) {
            ref.destroy();
        }
        particleAssets.length = 0;
        frameCache.clear();
    },
    reacquire: () => {
        fireFrame = dotFrame('fire', 32, FIRE_STOPS);
        sparkFrame = dotFrame('spark', 32, SPARK_STOPS);
        reacquireSystem(flame, FLAME_PLIST, fireFrame);
        reacquireSystem(ring, RING_PLIST, sparkFrame);
        reacquireSystem(probe, GRAVITY_PLIST, fireFrame);
        return heldAssets();
    },
});

window.__airApp = app;
window.__runSequence = runSequence;
app.run(scene);

window.__probe = async () => ({
    results,
    live: { flame: simOf(flame).particles.length, ring: simOf(ring).particles.length },
    summary: status.string,
    clamp: r(probe.assembler.maxParticleDeltaTime, 6),
    phaseKeys: Object.keys(results).length,
});
