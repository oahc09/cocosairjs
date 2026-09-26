/**
 * LV12-11 · dragonbones-basic —「龙骨资产运行时构造 + 动画播放」（Cocos Air Code First）
 *
 * 合同（计划书 §LV12-11 + `tools/v12/browser-matrix-contract.json` 行 `dragonbones-basic`）：
 *  1. 资产**不来自** assetManager 的 uuid 依赖图，而是运行期构造：
 *     `new dragonBones.DragonBonesAtlasAsset()` 填 `atlasJson` + `texture`，
 *     `new dragonBones.DragonBonesAsset()` 填 `dragonBonesJson`，
 *     再交给 `ArmatureDisplay` 的 `dragonAsset` / `dragonAtlasAsset` / `armatureName`。
 *  2. 资产本身**手写、许可干净**：DragonBones 5.5 数据由
 *     `tools/fixtures/make-dragonbones-skeleton.cjs` 生成，不含任何第三方龙骨导出文件。
 *  3. 动画播放证据分三层，避免「只解析没渲染」与「只看动画不看数据」两种假通过：
 *     数据层（timeline 结构）、运行层（slot 换图 + 骨骼全局变换）、
 *     像素层（帧缓冲里出现对应 SubTexture 的纯色：plate=绿 / wing=蓝 / tip=红 ⇒ 颜色就是
 *     「采样到了哪个 region」的直接判据；逐帧采样 ⇒ 换图真的换了像素）。
 *
 * 访问器一律「先实测再用」，不按记忆写（本文件里每一处字段名都来自实测 dump）：
 *  - `display.armature` / `armature.animation` 是**方法**不是属性 ⇒ `attr()`。
 *  - `factory.getTextureAtlasData(uuid)` 返回数组 ⇒ 图集事实读 `atlasAsset._textureAtlasData`。
 *  - `SlotData` 的层级字段是 `zOrder`，没有 `z`。
 *  - `AnimationData` 的时间线是**按名字索引的映射**：`boneTimelines` / `slotTimelines`
 *    （值为 `TimelineData[]`，字段 `type/offset/frameIndicesOffset`）；`type 20` = SlotDisplay。
 *  - 运行层换图看 `Slot.displayIndex` + `Slot.rawDisplayDatas[i].name`；
 *    `Slot.display` 返回的是引擎 display 对象，其 `name` 是 slot 名，**不能**当 region 判据。
 *  - 缓存模式默认即 REALTIME（`ArmatureDisplay.ts:515` `_defaultCacheModeValue`），
 *    本例显式 `setAnimationCacheMode(REALTIME)`，这样 `gotoAndStopByFrame` 钉帧才有意义
 *    （cache 模式下渲染走缓存帧采样，钉帧不改变出图）。
 *
 * 取证顺序：armature 在 `__preload → _init → _refresh` 里才建出来 ⇒ 运行层事实必须在
 * `app.run(scene)` 且至少一帧 `EVENT_AFTER_DRAW` 之后采。
 *
 * 决定性策略：
 *  - `Animation.gotoAndStopByFrame(name, frame)`（内部 `gotoAndPlayByFrame` + `state.stop()`）
 *    把姿态钉到帧上，避开挂钟相位；选远离段边界的帧 6/12/18 与两端 0/23。
 *  - `playAnimation(name, playTimes)` 的第二参必须是 `-1`（循环）：`0` 在龙骨语义里是
 *    「播一次后停」，早先误传 `0` 导致探针看到 `isPlaying=false`（r6 实测归因）。
 *  - 浮点统一 `r(v)` 到 2~3 位小数；一切可能抛错的读回经 `safe()`/`safeAsync()` 变成
 *    `ERR:` 字符串——合同要求「有明确答案」，不允许 undefined 静默通过。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    Director,
    UITransform,
    Layers,
    Color,
    Label,
    Texture2D,
    assetManager,
    director,
    dragonBones,
    view,
    ResolutionPolicy,
} from 'cocosair';
import { installAssetLifecycle } from '../shared/asset-lifecycle.js';

const UI_LAYER = Layers.Enum.UI_3D;
const r = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;
const safe = (fn) => {
    try {
        return fn();
    } catch (e) {
        return `ERR:${e.message}`;
    }
};
const safeAsync = async (fn) => {
    try {
        return await fn();
    } catch (e) {
        return `ERR:${e.message}`;
    }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const list = (v) => (v == null ? null : Array.from(v));
const enumName = (dict, value) => {
    for (const k of Object.keys(dict)) {
        if (dict[k] === value) {
            return `${k}:${value}`;
        }
    }
    return `UNKNOWN(${value})`;
};
/** 只读「存在的那个字段名」，避免把版本差异写成假事实。 */
function firstDefined(obj, names) {
    for (const n of names) {
        if (obj && obj[n] !== undefined) {
            return { key: n, value: obj[n] };
        }
    }
    return { key: null, value: undefined };
}
/** 属性/方法两种形状都接：本构建里 `armature`、`animation` 是方法。 */
const attr = (obj, name) => {
    if (!obj) {
        return null;
    }
    const v = obj[name];
    return typeof v === 'function' ? safe(() => v.call(obj)) : v === undefined ? null : v;
};
/** 集合形状不假设：Map / 数组 / 普通对象统一成数组（保留 null 槽位）。 */
function named(container) {
    if (container == null) {
        return null;
    }
    if (container instanceof Map) {
        return [...container.values()];
    }
    if (Array.isArray(container)) {
        return container;
    }
    if (typeof container === 'object') {
        return Object.keys(container).map((k) => {
            const v = container[k];
            return v && typeof v === 'object' ? v : { name: k };
        });
    }
    return null;
}
function protoNames(obj) {
    const s = [];
    for (let pr = obj && Object.getPrototypeOf(obj); pr && pr !== Object.prototype; pr = Object.getPrototypeOf(pr)) {
        s.push(...Object.getOwnPropertyNames(pr));
    }
    return [...new Set(s)].sort();
}
function shapeOf(obj) {
    if (obj == null) {
        return 'null';
    }
    return { ctor: obj.constructor ? obj.constructor.name : null, ownKeys: Object.keys(obj).slice(0, 40) };
}
function waitFrames(n) {
    let chain = Promise.resolve();
    for (let i = 0; i < n; i++) {
        chain = chain.then(
            () =>
                new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        director.off(Director.EVENT_AFTER_DRAW, on);
                        reject(new Error('no rendered frame'));
                    }, 8000);
                    function on() {
                        director.off(Director.EVENT_AFTER_DRAW, on);
                        clearTimeout(timer);
                        resolve();
                    }
                    director.on(Director.EVENT_AFTER_DRAW, on);
                }),
        );
    }
    return chain;
}

const { DragonBonesAsset, DragonBonesAtlasAsset, ArmatureDisplay, CCFactory, AnimationCacheMode } = dragonBones;

const NAME = 'AirDragon';
const ARMATURE_NAME = 'airdragon';
const SKELETON_URL = `./assets/${NAME}.json`;
const ATLAS_URL = `./assets/${NAME}_atlas.json`;
const PNG_URL = `./assets/${NAME}_atlas.png`;
// region 名 → 生成器里写死的纯色（像素层判据）。
const COLOR_TARGETS = { plate: [0, 255, 0], wing: [0, 120, 255], tip: [255, 0, 0], background: [255, 0, 255] };
const FRAME_PLAN = [0, 6, 12, 18, 23];

function loadRemote(url, ext) {
    return new Promise((resolve, reject) => {
        assetManager.loadRemote(url, { ext }, (err, asset) => {
            if (err) {
                reject(err);
            } else {
                resolve(asset);
            }
        });
    });
}
async function getText(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`fetch ${url} -> ${res.status}`);
    }
    return res.text();
}

// ---------------------------------------------------------------- 场景
const canvasEl = document.querySelector('#GameCanvas');
const app = await createAirApp({ canvas: canvasEl });
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

const scene = new Scene('v12-dragonbones-basic');
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
cam.clearColor = new Color(12, 16, 24, 255);
cam.priority = 1073741824;
cam.visibility = UI_LAYER;
canvasNode.addChild(cameraNode);
canvas.cameraComponent = cam;

const statusNode = new Node('Status');
statusNode.layer = UI_LAYER;
statusNode.addComponent(UITransform).width = 460;
statusNode.getComponent(UITransform).height = 24;
statusNode.setPosition(0, 150, 0);
canvasNode.addChild(statusNode);
const status = statusNode.addComponent(Label);
status.string = 'dragonbones: loading';
status.color = new Color(220, 228, 240, 255);
status.fontSize = 15;
status.lineHeight = 18;

// ---------------------------------------------------------------- 资产运行期构造
const factory = CCFactory.getInstance();
const results = {};
const render = { tipFrames: [], plateFrames: [], everTip: false, everPlate: false };

const [skelText, atlasText, pngAsset, skelJsonAsset, atlasJsonAsset] = await Promise.all([
    getText(SKELETON_URL),
    getText(ATLAS_URL),
    loadRemote(PNG_URL, '.png'),
    loadRemote(SKELETON_URL, '.json'),
    loadRemote(ATLAS_URL, '.json'),
]);
function wrapTexture(asset) {
    if (asset instanceof Texture2D) {
        return asset;
    }
    const t = new Texture2D();
    t.image = asset;
    return t;
}
let texture = wrapTexture(pngAsset);

let atlasAsset = null;
let dragonAsset = null;

function buildAssets() {
    atlasAsset = new DragonBonesAtlasAsset(NAME);
    atlasAsset.atlasJson = atlasText;
    atlasAsset.texture = texture;
    dragonAsset = new DragonBonesAsset(NAME);
    dragonAsset.dragonBonesJson = skelText;
}
buildAssets();

const displayNode = new Node('airdragon');
displayNode.layer = UI_LAYER;
displayNode.addComponent(UITransform);
displayNode.setPosition(0, -10, 0);
canvasNode.addChild(displayNode);
const display = displayNode.addComponent(ArmatureDisplay);
display.setAnimationCacheMode(AnimationCacheMode.REALTIME);

function wireDisplay() {
    display.dragonAsset = dragonAsset;
    display.dragonAtlasAsset = atlasAsset;
    display.armatureName = ARMATURE_NAME;
}
wireDisplay();

const atlasUuid = atlasAsset.uuid;
const dragonUuid = dragonAsset.uuid;
const armatureKey = dragonAsset.init(factory, atlasUuid);

results.p1Construction = {
    atlasCtor: atlasAsset.constructor.name,
    dragonCtor: dragonAsset.constructor.name,
    displayCtor: display.constructor.name,
    pngAssetType: pngAsset.constructor.name,
    skelJsonAssetType: skelJsonAsset.constructor.name,
    atlasJsonAssetType: atlasJsonAsset.constructor.name,
    factoryType: factory.constructor.name,
    // 手工构造时 uuid 由数据名派生（`DragonBonesAtlasAsset.init`：uuid 为空则取 atlasJson.name）。
    atlasUuid,
    dragonUuid,
    armatureKey,
    armatureKeyIsUuidHashAtlas: armatureKey === `${dragonUuid}#${atlasUuid}`,
    setterRoundTrip: safe(
        () => JSON.parse(dragonAsset.dragonBonesJson).name === NAME && JSON.parse(atlasAsset.atlasJson).name === NAME,
    ),
    cacheMode: safe(() => {
        const f = firstDefined(display, ['_cacheMode', 'cacheMode']);
        return {
            key: f.key,
            value:
                f.value === undefined ? enumName(AnimationCacheMode, f.value) : enumName(AnimationCacheMode, f.value),
            isAnimationCached: safe(() => (display.isAnimationCached ? display.isAnimationCached() : 'no method')),
            realtimeEnum: safe(() => AnimationCacheMode.REALTIME),
        };
    }),
    sameDataFromFactory: safe(() => factory.getDragonBonesData(armatureKey) != null),
};

// ---------------------------------------------------------------- p2 图集解析（工厂侧）
// `factory.getTextureAtlasData(uuid)` 的返回形状由 `factoryReturnShape` 记录；
// 真正可读的 TextureAtlasData 在 `atlasAsset._textureAtlasData`（引擎侧 init 时创建并缓存）。
const atlasFactoryShape = safe(() => shapeOf(factory.getTextureAtlasData(atlasUuid)));
const atlasData = safe(() => atlasAsset._textureAtlasData);
function atlasRegions(d) {
    if (!d) {
        return null;
    }
    const cand = d.textures || d._textureDatas || d.regions || d._regions;
    return named(cand);
}
const atlasTex = safe(() => atlasRegions(atlasData));
results.p2Atlas = {
    factoryReturnShape: atlasFactoryShape,
    dataCtor: atlasData && atlasData.constructor ? atlasData.constructor.name : null,
    dataOwnKeys: safe(() => Object.keys(atlasData)),
    found: !!atlasData,
    name: safe(() => atlasData.name),
    width: safe(() => atlasData.width),
    height: safe(() => atlasData.height),
    imagePath: safe(() => atlasData.imagePath),
    scale: safe(() => atlasData.scale),
    regionCount: atlasTex && !Array.isArray(atlasTex) ? null : atlasTex ? atlasTex.length : null,
    textureNames: atlasTex && atlasTex.map ? atlasTex.map((t) => t.name).sort() : atlasTex,
    regions:
        atlasTex && atlasTex.map
            ? atlasTex.map((t) => ({
                  name: t.name,
                  rect: t.region ? [t.region.x, t.region.y, t.region.width, t.region.height] : null,
                  rotated: t.rotated,
                  hasFrame: !!t.frame,
                  frame: t.frame ? [t.frame.x, t.frame.y, t.frame.width, t.frame.height] : null,
              }))
            : atlasTex,
    renderTextureAttached: safe(
        () => !!(atlasData.renderTexture || (atlasTex && atlasTex[0] && atlasTex[0].renderTexture)),
    ),
};

// ---------------------------------------------------------------- p3 骨架解析（工厂侧，数据层）
const dbData = safe(() => factory.getDragonBonesDataByUUID(dragonUuid));
const armData = dbData && dbData.getArmature ? dbData.getArmature(ARMATURE_NAME) : null;
const defaultSkin = safe(() => (armData ? armData.getSkin(armData.defaultSkin.name) : null));
results.p3Skeleton = {
    dataName: dbData && dbData.name,
    dataVersion: dbData && dbData.version,
    armatureNames: dbData ? list(dbData.armatureNames) : null,
    armatureFound: !!armData,
    armDataOwnKeys: safe(() => Object.keys(armData)),
    boneNames: armData ? Object.keys(armData.bones) : null,
    boneParents: armData
        ? Object.keys(armData.bones).map((n) => [n, armData.bones[n].parent ? armData.bones[n].parent.name : null])
        : null,
    boneLengths: armData ? Object.keys(armData.bones).map((n) => [n, armData.bones[n].length]) : null,
    slotNames: armData ? Object.keys(armData.slots) : null,
    slotParents: armData
        ? Object.keys(armData.slots).map((n) => [n, armData.slots[n].parent ? armData.slots[n].parent.name : null])
        : null,
    // 实测：SlotData 用 zOrder 表示层序，没有 z 字段。
    slotZOrder: armData
        ? Object.keys(armData.slots).map((n) => [n, armData.slots[n].zOrder, armData.slots[n].displayIndex])
        : null,
    skinNames: armData ? Object.keys(armData.skins) : null,
    defaultSkin: armData && armData.defaultSkin ? armData.defaultSkin.name : null,
    defaultAnimation: armData && armData.defaultAnimation ? armData.defaultAnimation.name : null,
    animationNames: armData ? Object.keys(armData.animations) : null,
    // 默认 skin 下每个 slot 的候选 display（region 名）——换图取证的「应有集合」。
    skinDisplays: safe(() =>
        Object.keys(armData.slots).map((n) => [n, defaultSkin.getDisplays(n).map((d) => [d.name, d.type])]),
    ),
    // `AnimationData.parent` 为 null 会让 `TimelineState.init` 直接抛（读 `_animationData.parent.frameRate`）
    // ⇒ 这一条既是结构事实也是崩溃前置条件。
    animationsHaveParent: armData
        ? Object.keys(armData.animations).map((n) => [n, armData.animations[n].parent === armData])
        : null,
    animations: armData
        ? Object.keys(armData.animations).map((n) => {
              const a = armData.animations[n];
              const mapTypes = (m) =>
                  Object.keys(m).reduce((acc, k) => {
                      acc[k] = m[k].map((t) => [t.type, t.offset, t.frameIndicesOffset]);
                      return acc;
                  }, {});
              return {
                  name: n,
                  duration: a.duration,
                  frameCount: a.frameCount,
                  playTimes: a.playTimes,
                  fadeInTime: a.fadeInTime,
                  cacheFrameRate: a.cacheFrameRate,
                  parentIsArmatureData: a.parent === armData,
                  // 实测：时间线按 bone/slot 名字索引的映射，值是 TimelineData[]。
                  boneTimelines: mapTypes(a.boneTimelines),
                  slotTimelines: mapTypes(a.slotTimelines),
                  cachedFramesLength: a.cachedFrames ? a.cachedFrames.length : null,
                  ownKeys: Object.keys(a),
              };
          })
        : null,
    armDataProto: safe(() => protoNames(armData).filter((n) => /^(get|add|has|sort|cache|set)/.test(n))),
};

// ---------------------------------------------------------------- 像素层采样原语
async function samplePixels() {
    const canvasDom = document.querySelector('#GameCanvas');
    const gl = canvasDom.getContext('webgl2') || canvasDom.getContext('webgl');
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            reject(new Error('no rendered frame'));
        }, 8000);
        // 必须在 AFTER_DRAW 回调内 readPixels：回调结束后 drawing buffer 失效。
        function onDraw() {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            clearTimeout(timer);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            const w = gl.drawingBufferWidth,
                h = gl.drawingBufferHeight;
            const buf = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            const counts = { total: 0, lit: 0, plate: 0, wing: 0, tip: 0, background: 0 };
            for (let y = 0; y < h; y += 2) {
                for (let x = 0; x < w; x += 2) {
                    const i = (y * w + x) * 4;
                    const cr = buf[i],
                        cg = buf[i + 1],
                        cb = buf[i + 2];
                    counts.total++;
                    if (Math.abs(cr - 12) > 8 || Math.abs(cg - 16) > 8 || Math.abs(cb - 24) > 8) {
                        counts.lit++;
                    }
                    for (const key of Object.keys(COLOR_TARGETS)) {
                        const t = COLOR_TARGETS[key];
                        if (Math.abs(cr - t[0]) <= 24 && Math.abs(cg - t[1]) <= 24 && Math.abs(cb - t[2]) <= 24) {
                            counts[key]++;
                        }
                    }
                }
            }
            resolve({
                viewport: [w, h],
                litRatio: r(counts.lit / counts.total, 4),
                platePresent: counts.plate > 0,
                wingPresent: counts.wing > 0,
                tipPresent: counts.tip > 0,
                counts: { plate: counts.plate, wing: counts.wing, tip: counts.tip, background: counts.background },
            });
        }
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
    });
}

// ---------------------------------------------------------------- 场景跑起来后才采运行层
status.string = `dragonbones: armature=${ARMATURE_NAME} click=0`;
window.__airApp = app;
app.run(scene);
await waitFrames(3);

const armature = attr(display, 'armature');
const anim = attr(armature, 'animation');
const runtimeSlots = () => named(attr(armature, 'getSlots') || armature.slots || armature._slots);
const runtimeBones = () => named(attr(armature, 'getBones') || armature.bones || armature._bones);
const getSlot = (n) => {
    const l = runtimeSlots();
    return l ? l.find((x) => x && x.name === n) || null : null;
};
const getBone = (n) => {
    const l = runtimeBones();
    return l ? l.find((x) => x && x.name === n) || null : null;
};
/** 换图判据：displayIndex + 该 index 上 rawDisplayDatas 的 region 名（display 对象名是 slot 名，不可用）。 */
function regionOf(slot) {
    if (!slot) {
        return { index: null, region: null, displayListLength: null, rawNames: null };
    }
    const index = safe(() => slot.displayIndex);
    const datas = named(safe(() => slot.rawDisplayDatas)) || [];
    const d = typeof index === 'number' && index >= 0 ? datas[index] : null;
    return {
        index: typeof index === 'number' ? index : null,
        region: d && d.name ? d.name : null,
        displayListLength: (named(safe(() => slot.displayList)) || []).length,
        rawNames: datas.map((x) => (x && x.name) || null),
    };
}

results.p4Runtime = {
    armatureIsMethodOnDisplay: typeof display.armature === 'function',
    built: !!armature,
    armatureName: armature && armature.name,
    armatureCtor: armature && armature.constructor ? armature.constructor.name : null,
    armatureOwnKeys: safe(() => Object.keys(armature).slice(0, 40)),
    armatureMethods: safe(() =>
        protoNames(armature).filter((n) => /^(get|set|has|invalid|update|advance|replace|add)/.test(n)),
    ),
    slotSource: safe(() =>
        typeof armature.getSlots === 'function'
            ? 'getSlots()'
            : armature.slots instanceof Map
              ? 'slots:Map'
              : Array.isArray(armature.slots)
                ? 'slots:Array'
                : armature.slots
                  ? 'slots:object'
                  : 'none',
    ),
    slotNames: safe(() => runtimeSlots().map((s) => s.name)),
    slotProto: safe(() => protoNames(getSlot('tail')).filter((n) => /^(get|set|invalid|contains|dispose)/.test(n))),
    slotDisplays: safe(() =>
        runtimeSlots().map((s) => {
            const rg = regionOf(s);
            return {
                slot: s.name,
                visible: safe(() => s.visible),
                displayIndex: rg.index,
                region: rg.region,
                displayListLength: rg.displayListLength,
                rawDisplayDataNames: rg.rawNames,
            };
        }),
    ),
    boneNames: safe(() => runtimeBones().map((b) => b.name)),
    drawListLength: safe(() => (display.drawList ? display.drawList.length : 'no drawList')),
    nodeParent: displayNode.parent ? displayNode.parent.name : null,
    dataSlotCount: armData ? Object.keys(armData.slots).length : null,
};

/** 数值型字段快照：不确定哪个字段承载旋转时，先把整块形状记进合同，再按实测收敛。 */
function numMap(o) {
    if (!o) {
        return null;
    }
    const out = {};
    for (const k of Object.keys(o)) {
        const v = o[k];
        out[k] =
            typeof v === 'number' ? r(v, 3) : v === null ? null : Array.isArray(v) ? `array:${v.length}` : typeof v;
    }
    return out;
}

function readPose(snapshotWing) {
    const tail = getSlot('tail');
    const wing = getBone('wing-left');
    const root = getBone('root');
    const rg = regionOf(tail);
    const wingGlobal = wing ? wing.global : null;
    const skew = firstDefined(wingGlobal, ['skewX', 'skew', 'rotation']);
    const state = safe(() => (anim ? anim._lastAnimationState : null));
    const t = firstDefined(state, ['currentTime', '_currentTime', 'time']);
    return {
        tailIndex: rg.index,
        tailRegion: rg.region,
        wingSkewKey: skew.key,
        wingSkew: skew.value === undefined || skew.value === null ? null : r(Number(skew.value), 2),
        rootY: root && root.global ? r(Number(root.global.y), 2) : null,
        stateTime: state && t.value !== undefined ? r(Number(t.value), 2) : null,
        // 只在 0 / 12 两帧带整块形状快照：两帧差集即「哪个字段真的随帧变化」。
        wingGlobalShape: snapshotWing
            ? {
                  ctor: wingGlobal && wingGlobal.constructor ? wingGlobal.constructor.name : null,
                  keys: safe(() => Object.keys(wingGlobal)),
              }
            : null,
        wingGlobal: snapshotWing ? safe(() => numMap(wingGlobal)) : null,
    };
}
/** 钉帧 → 读姿态 → 等一帧真实出图并采样像素 → 再读姿态（跨渲染帧自一致性）。 */
async function frameFacts(frame) {
    if (!anim || typeof anim.gotoAndStopByFrame !== 'function') {
        return {
            frame,
            first: {},
            second: {},
            pixels: null,
            stable: false,
            error: anim ? `no gotoAndStopByFrame ownKeys=${Object.keys(anim).slice(0, 12).join(',')}` : 'no-animation',
        };
    }
    anim.gotoAndStopByFrame('flap', frame);
    armature.advanceTime(0);
    const snap = frame === 0 || frame === 12;
    const first = readPose(snap);
    const pixels = await safeAsync(() => samplePixels());
    const second = readPose(snap);
    if (pixels && pixels.counts) {
        if (pixels.counts.tip > 0) {
            render.tipFrames.push(frame);
        }
        if (pixels.counts.plate > 0) {
            render.plateFrames.push(frame);
        }
    }
    return { frame, first, second, pixels, stable: eq(first, second) };
}

const goFrames = [];
for (const f of FRAME_PLAN) {
    goFrames.push(await frameFacts(f));
}

// 状态对象要到第一次真正播过动画才存在 ⇒ 形状事实必须在钉帧之后采（r7 实测：更早采到 null）。
const stateNow = safe(() => (anim ? anim._lastAnimationState : null));
const stateShape = safe(() => shapeOf(stateNow));
const timeKey = safe(() => firstDefined(stateNow, ['currentTime', '_currentTime', 'time']).key);

results.p5Animation = {
    animationObject: !!anim,
    animationCtor: anim && anim.constructor ? anim.constructor.name : null,
    animationOwnKeys: safe(() => Object.keys(anim).slice(0, 40)),
    animationMethods: safe(() => protoNames(anim).filter((n) => /^(get|goto|play|stop|has|is)/.test(n))),
    stateShape,
    stateTimeKey: timeKey,
    lastAnimationName: safe(() => {
        const f = firstDefined(anim, ['lastAnimationName']);
        return f.value === undefined ? null : f.value;
    }),
    animationStateNames: safe(() => list(anim._animationNames)),
    tailDisplayCount: safe(() => regionOf(getSlot('tail')).displayListLength),
    goToFrame: goFrames,
    allFramesStable: goFrames.every((e) => e.stable),
    // 换图序列 + 像素层：region 变了、而且变的像素也变了，才算「displayFrame 时间线真的出图」。
    regionSequence: goFrames.map((e) => [e.frame, e.first.tailIndex, e.first.tailRegion]),
    displayIndices: goFrames.map((e) => e.first.tailIndex),
    displayIndexSwapped: safe(() => new Set(goFrames.map((e) => e.first.tailIndex)).size > 1),
    tipRenderedAtFrames: render.tipFrames,
    plateRenderedAtFrames: render.plateFrames,
    render: { everTip: render.tipFrames.length > 0, everPlate: render.plateFrames.length > 0 },
};

// 切到 idle：验证换动画真的换了状态（flap playTimes 数据侧是 0，所以引擎侧显式要 -1 循环）。
display.playAnimation('idle', -1);
await waitFrames(2);
results.p5Animation.afterIdle = safe(() => ({
    animationName: display.animationName,
    playTimesProp: display.playTimes,
    last: firstDefined(anim, ['lastAnimationName']).value,
    isPlaying: anim.isPlaying,
    stateName: firstDefined(anim._lastAnimationState, ['name', '_name']).value,
    tailIndex: regionOf(getSlot('tail')).index,
}));
display.playAnimation('flap', -1);
await waitFrames(2);
results.p5Animation.backToFlap = safe(() => ({
    animationName: display.animationName,
    isPlaying: anim.isPlaying,
    stateName: firstDefined(anim._lastAnimationState, ['name', '_name']).value,
}));

// ---------------------------------------------------------------- p6 资源生命周期（§25 合同）
function heldAssets() {
    return [
        { name: 'dragonAsset', ref: dragonAsset },
        { name: 'atlasAsset', ref: atlasAsset },
        { name: 'texture', ref: texture },
    ];
}
installAssetLifecycle({
    label: 'dragonbones-basic',
    hold: heldAssets,
    release: () => {
        display.dragonAtlasAsset = null;
        display.dragonAsset = null;
        for (const { ref } of heldAssets()) {
            ref.destroy();
        }
    },
    reacquire: async () => {
        // release 已把 `texture` 销毁：重建必须重新取一份**有效**纹理，
        // 复用被销毁的 Texture2D 会让工厂解析图集时读到 null。
        const png = await loadRemote(PNG_URL, '.png');
        texture = wrapTexture(png);
        buildAssets();
        atlasAsset.init(factory);
        wireDisplay();
        dragonAsset.init(factory, atlasAsset.uuid);
        display.playAnimation('flap', -1);
        await waitFrames(2);
        return heldAssets();
    },
});
results.p6Lifecycle = {
    // 事实由 `window.__lifecycle()`（V1.1 生命周期 validator 调）产出；这里只登记合同面。
    releasePath: 'display.dragonAtlasAsset=null → dragonAsset=null → 三个资产 destroy()',
    reacquirePath: '重新 new + 填 setter → atlasAsset.init(factory) → wireDisplay → dragonAsset.init → playAnimation',
    armatureAfterRelease: '由 live.lifecycle 判定（released/leaked/reloaded 三项）',
};

window.__probe = async () => {
    const rg = regionOf(getSlot('tail'));
    let pixels = null;
    try {
        pixels = await samplePixels();
    } catch (e) {
        pixels = `ERR:${e.message}`;
    }
    if (pixels && pixels.counts) {
        if (pixels.counts.tip > 0) {
            render.everTip = true;
        }
        if (pixels.counts.plate > 0) {
            render.everPlate = true;
        }
    }
    return {
        results,
        live: {
            animationName: display.animationName,
            armatureName: display.armatureName,
            isPlaying: safe(() => anim.isPlaying),
            tailIndex: rg.index,
            tailRegion: rg.region,
            tailDisplayListLength: rg.displayListLength,
            tipSeenInPerFrameSampling: render.tipFrames.length > 0,
            tipSeenInLiveSampling: render.everTip,
            drawListLength: safe(() => (display.drawList ? display.drawList.length : 'no drawList')),
            slotCount: (runtimeSlots() || []).length,
            lifecycle: safe(() =>
                typeof window.__lifecycle === 'function'
                    ? 'window.__lifecycle available (validator 负责调)'
                    : 'missing',
            ),
            pixels,
        },
        summary: status.string,
        phaseKeys: Object.keys(results).length,
    };
};

// ---------------------------------------------------------------- 交互：点击切换 flap / idle
let clickCount = 0;
canvasNode.on(Node.EventType.TOUCH_END, () => {
    clickCount++;
    const next = clickCount % 2 === 1 ? 'idle' : 'flap';
    display.playAnimation(next, -1);
    status.string = `dragonbones: armature=${ARMATURE_NAME} anim=${next} slots=${(runtimeSlots() || []).length} click=${clickCount}`;
});
