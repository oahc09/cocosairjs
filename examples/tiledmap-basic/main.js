/**
 * Cocos Air — tiledmap-basic（LV12-08：TMX/TSX 解析、正交/等距、图层渲染、object layer 读取）
 *
 * 通路（计划书 B3「小型 .tmx 资产经 loadRemote 加载」）：
 * `assetManager.loadRemote` 对 `.tmx/.tsx` 走 `downloadText → createTextAsset`（downloader.ts:283 / factory.ts:123），
 * 拿到的是 `TextAsset`；组件侧不吃这些 asset，只吃一个手搭的 `TiledMapAsset`：
 * { tmxXmlStr, tsxFileNames/tsxFiles, spriteFrames/spriteFrameNames/spriteFrameSizes }
 * ⇒ `TiledMap.tmxAsset` setter 直接调 `_applyFile()`（tiled-map.ts:104-110），
 *   把上面的数组摊成 parser 要的三张查找表再 `new TMXMapInfo(...)`。
 *
 * 三张表的键必须逐字符对上 XML 里的写法（parser 是纯字符串查表，不做路径归一）：
 * • `tsxFileNames[i]` == `<tileset source="...">` 的**原样**属性值（`tiles.tsx`，不带 `./assets/`）。
 * • `spriteFrameNames[i]` == `<image source="...">`，只把 `\` 换成 `/`（`tiles.png`）。
 * 对不上就是 `sourceImage` 为 null ⇒ `warnID(16406)` + 该图层一个顶点都不生成（静默空图）。
 *
 * 八条实测的非显然点（都钉在 results 里）：
 * 1) `Orientation` 枚举是 ORTHO=0 / HEX=1 / **ISO=2**（tiled-types.ts:54-72），不是按 XML 字面顺序。
 * 2) `<object>` 的 `class`/旧版 `type="solid"` 保存在 `className`，可用 getObjectsByType('solid') 查询。
 *    `objectProp.type` 仍是几何形状枚举；点对象 `<point/>` 沿用 RECT(0)。
 * 3) `_init` 会**就地改写** `object.x/y`（正交 `y = height - y`，等距走菱形公式），
 *    getRawObjects() 另提供冻结的原始几何；本例旧字段仍通过 object.offset 读原值，保持既有合同。
 * 4) 只有 TEXT/IMAGE 两类对象会生成节点（`text<id>` / `img<id>`），RECT/ELLIPSE/POLYGON 纯数据。
 * 5) 等距对象换算用的是 `object.x / tileSize.height`（`:231-232`，分母是 tile **height**），
 *    本例 tile 32×32 看不出来，但它是上游逐字节行为，登记不改。
 * 6) 读与写不对称：CSV 里翻转标记藏在 gid 高位（本例 `2147483649 / 1073741825 / 536870913` 解析后
 *    `getTileFlagsAt` 能读到），但 `setTileGIDAt` 先把高位 `& FLIPPED_MASK` 抹掉（tiled-layer.ts:694），
 *    标记只认第 4 个入参 ⇒ 照抄 CSV 写法运行时会静默丢翻转（P5 做了正反两组实测）。
 * 7) 往**空格** `setTileGIDAt` 只置 `_cullingDirty`，assembler 的 `updateRenderData` 不被调用 ⇒
 *    数据改了、批次没重算（图上看不见）；手动 `setCullingDirty(true)` 同样无效，
 *    实测要重激活图层节点（`node.active=false→true`）才重建（P6 留了刷新/不刷新两组对照）。
 * 8) 关掉 `enableCulling` 后连**已占用格**的 `setTileGIDAt` 也不改像素：`_updateVertex` 只维护
 *    裁减簿记（顶点的行列区间），`_cullingDirty` 又只在裁减路径末尾被消费（tiled-layer.ts:865）
 *    ⇒ 运行时想真的每帧改图只能走 TSX `<animation>`：`lateUpdate` 换 `_texGrids[gid]`，
 *    assembler 靠 `hasAnimation()` 每帧重建（assembler/simple.ts:119）。P8 测的就是这条。
 *
 * 决定性：关掉 `enableCulling`（视口相关的裁减会让三引擎/不同视口的批次数飘），
 * 图层级只读几何与 `tiledDataArray` 的批次数/顶点数；不做随机，无需种子。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    Canvas,
    UITransform,
    Layers,
    Color,
    Label,
    Size,
    SpriteFrame,
    Texture2D,
    TiledMap,
    TiledMapAsset,
    TiledLayer,
    TiledObjectGroup,
    assetManager,
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
const ORIENT = TiledMap.Orientation;
const OBJT = TiledMap.TMXObjectType;
const enumName = (dict, value) => {
    for (const k of Object.keys(dict)) {
        if (dict[k] === value) {
            return k;
        }
    }
    return `UNKNOWN(${value})`;
};

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

// ---------------------------------------------------------------- 场景
const canvasEl = document.querySelector('#GameCanvas');
const app = await createAirApp({ canvas: canvasEl });
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

const scene = new Scene('v12-tiledmap-basic');
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
statusNode.setPosition(0, 162, 0);
canvasNode.addChild(statusNode);
const status = statusNode.addComponent(Label);
status.string = 'tiledmap: loading';
status.color = new Color(220, 228, 240, 255);
status.fontSize = 15;
status.lineHeight = 18;

function makeMapNode(name, x, y) {
    const node = new Node(name);
    node.layer = UI_LAYER;
    node.addComponent(UITransform);
    node.setPosition(x, y, 0);
    canvasNode.addChild(node);
    const tm = node.addComponent(TiledMap);
    // 关掉视口裁减：批次只由几何决定，三引擎/任意视口都能逐字段对齐。
    tm.enableCulling = false;
    return tm;
}

const orthoMap = makeMapNode('OrthoMap', -84, -10);
const isoMap = makeMapNode('IsoMap', 118, -10);

// ---------------------------------------------------------------- 资源（loadRemote → Code First 装配）
const tmxText = await loadRemote('./assets/orthogonal.tmx', '.tmx');
const tsxText = await loadRemote('./assets/tiles.tsx', '.tsx');
const isoTmxText = await loadRemote('./assets/isometric.tmx', '.tmx');
const pngLoaded = await loadRemote('./assets/tiles.png', '.png');

const texture =
    pngLoaded instanceof Texture2D
        ? pngLoaded
        : (() => {
              const t = new Texture2D();
              t.image = pngLoaded;
              return t;
          })();

function makeFrame() {
    const sf = new SpriteFrame();
    sf.texture = texture;
    return sf;
}

/**
 * `TiledMapAsset` 只当"字段袋"用：`_applyFile` 读 tmxXmlStr + 三张并行数组，
 * 不会去碰 assetManager 的 uuid/依赖图，所以这里 new 完直接填。
 */
function makeMapAsset(tmxXmlStr, spriteFrame, extra) {
    const asset = new TiledMapAsset();
    asset.tmxXmlStr = tmxXmlStr;
    asset.spriteFrames = [spriteFrame];
    asset.spriteFrameNames = ['tiles.png'];
    asset.spriteFrameSizes = [new Size(64, 32)];
    asset.tsxFiles = [];
    asset.tsxFileNames = [];
    asset.imageLayerSpriteFrame = [];
    asset.imageLayerSpriteFrameNames = [];
    Object.assign(asset, extra);
    return asset;
}

let tileFrame = makeFrame();
let orthoAsset = makeMapAsset(tmxText.text, tileFrame, { tsxFileNames: ['tiles.tsx'], tsxFiles: [tsxText] });
let isoAsset = makeMapAsset(isoTmxText.text, tileFrame, {});

orthoMap.tmxAsset = orthoAsset;
isoMap.tmxAsset = isoAsset;

// ---------------------------------------------------------------- 探针
function layerSnap(tm, layerName) {
    const layer = tm.getLayer(layerName);
    if (!layer) {
        return { missing: true };
    }
    const size = layer.getLayerSize();
    const gids = [];
    const flags = [];
    for (let y = 0; y < size.height; y++) {
        for (let x = 0; x < size.width; x++) {
            gids.push(layer.getTileGIDAt(x, y));
            flags.push(layer.getTileFlagsAt(x, y));
        }
    }
    const batches = [];
    for (const entry of layer.tiledDataArray) {
        const rd = entry.renderData;
        if (!rd) {
            batches.push({ subNodes: entry.subNodes ? entry.subNodes.length : 0 });
            continue;
        }
        batches.push({ vertexCount: rd.vertexCount, hasTexture: !!entry.texture });
    }
    return {
        layerName: layer.getLayerName(),
        nodeIndex: tm.node.children.indexOf(layer.node),
        layerSize: [size.width, size.height],
        opacity: layer['_opacity'],
        visible: layer.node.active,
        offset: [r(layer['_offset'] ? layer['_offset'].x : 0, 4), r(layer['_offset'] ? layer['_offset'].y : 0, 4)],
        properties: layer.getProperties(),
        tileCount: gids.length,
        filled: gids.filter((g) => g !== 0).length,
        gidRow1: gids.slice(size.width, size.width * 2),
        flagsRow1: flags.slice(size.width, size.width * 2),
        cornerGids: [layer.getTileGIDAt(0, 0), layer.getTileGIDAt(size.width - 1, size.height - 1)],
        invalidGid: safe(() => layer.getTileGIDAt(size.width, 0)),
        pos00: (() => {
            const p = layer.getPositionAt(0, 0);
            return p ? [r(p.x), r(p.y)] : null;
        })(),
        posLast: (() => {
            const p = layer.getPositionAt(size.width - 1, size.height - 1);
            return p ? [r(p.x), r(p.y)] : null;
        })(),
        textures: layer.getTextures().length,
        tileset: (() => {
            const ts = layer.getTileSet(0);
            return ts
                ? {
                      name: ts.name,
                      firstGid: ts.firstGid,
                      imageName: ts.imageName,
                      tileSize: [r(ts._tileSize.width), r(ts._tileSize.height)],
                      imageSize: [r(ts.imageSize.width), r(ts.imageSize.height)],
                      tileOffset: [r(ts.tileOffset.x), r(ts.tileOffset.y)],
                  }
                : null;
        })(),
        batches,
        uiSize: (() => {
            const t = layer.node.getComponent(UITransform);
            return t ? [r(t.width), r(t.height)] : null;
        })(),
    };
}

function objectSnap(tm, groupName) {
    const group = tm.getObjectGroup(groupName);
    if (!group) {
        return { missing: true };
    }
    return {
        groupName: group.getGroupName(),
        properties: group.getProperties(),
        positionOffset: [r(group.getPositionOffset().x), r(group.getPositionOffset().y)],
        nodeSize: (() => {
            const t = group.node.getComponent(UITransform);
            return [r(t.width), r(t.height)];
        })(),
        childNames: group.node.children.map((c) => c.name),
        objects: group.getObjects().map((o) => ({
            id: o.id,
            name: o.name,
            typeEnum: `${o.type}:${enumName(OBJT, o.type)}`,
            // x/y 是引擎坐标；旧 probe 保留 offset 字段，业务也可用 getRawObjects()。
            engineXY: [r(o.x), r(o.y)],
            tmxXY: [r(o.offset.x), r(o.offset.y)],
            size: [r(o.width), r(o.height)],
            rotation: r(o.rotation),
            visible: o.visible,
            gid: o.gid === undefined ? null : Number(o.gid),
            points: o.points ? o.points.map((p) => [r(p.x), r(p.y)]) : null,
            properties: o.properties,
        })),
        byName: (() => {
            const o = group.getObject('crate');
            return o ? { name: o.name, hp: o.properties.hp } : null;
        })(),
        missing: group.getObject('nope'),
    };
}

const results = {};

/** 图层当帧的顶点总数（4 顶点/quad）：批次数与顶点数随几何变化，是「图层渲染」可机器回读的代理量 */
function vertsOf(tm, layerName) {
    const layer = tm.getLayer(layerName);
    return layer ? layer.tiledDataArray.reduce((sum, e) => sum + (e.renderData ? e.renderData.vertexCount : 0), 0) : -1;
}

/** `_texGrids[gid]` 的 UV 四边 + 图内原点：动画换的就是这个对象引用 */
function texGridOf(tm, gid) {
    const g = tm['_texGrids'].get(gid);
    return g ? [g.gid, r(g.x), r(g.y), r(g.l, 6), r(g.t, 6), r(g.r, 6), r(g.b, 6)] : null;
}
function gridKey(g) {
    return g ? `${g.gid}|${g.x}|${g.y}|${g.l}|${g.t}|${g.r}|${g.b}` : null;
}
function sameGrid(a, b) {
    return !!a && !!b && gridKey(a) === gridKey(b);
}

function runSequence() {
    // P1 TMX 头部 + 图层清单
    results.p1Header = {
        types: {
            layer: orthoMap.getLayer('ground') instanceof TiledLayer,
            group: orthoMap.getObjectGroup('markers') instanceof TiledObjectGroup,
            map: orthoMap instanceof TiledMap,
        },
        ortho: {
            orientation: `${orthoMap.getMapOrientation()}:${enumName(ORIENT, orthoMap.getMapOrientation())}`,
            mapSize: [orthoMap.getMapSize().width, orthoMap.getMapSize().height],
            tileSize: [orthoMap.getTileSize().width, orthoMap.getTileSize().height],
            layerNames: orthoMap.getLayers().map((l) => l.getLayerName()),
            childNames: orthoMap.node.children.map((c) => c.name),
            groupNames: orthoMap.getObjectGroups().map((g) => g.getGroupName()),
            mapProperties: orthoMap.getProperties(),
            levelProperty: orthoMap.getProperty('level'),
            missingProperty: orthoMap.getProperty('nope'),
            uiSize: (() => {
                const t = orthoMap.node.getComponent(UITransform);
                return [r(t.width), r(t.height)];
            })(),
        },
        iso: {
            orientation: `${isoMap.getMapOrientation()}:${enumName(ORIENT, isoMap.getMapOrientation())}`,
            mapSize: [isoMap.getMapSize().width, isoMap.getMapSize().height],
            layerNames: isoMap.getLayers().map((l) => l.getLayerName()),
            childNames: isoMap.node.children.map((c) => c.name),
        },
    };

    // P2 TSX：外部 tileset 的 image/tile 属性是否解析进来
    results.p2Tsx = {
        orthoTilesets: orthoMap['_tilesets'].map((ts) => ({
            name: ts.name,
            firstGid: Number(ts.firstGid),
            sourceImage: !!ts.sourceImage,
        })),
        isoTilesets: isoMap['_tilesets'].map((ts) => ({
            name: ts.name,
            firstGid: Number(ts.firstGid),
            sourceImage: !!ts.sourceImage,
        })),
        grass: orthoMap.getPropertiesForGID(1),
        stone: orthoMap.getPropertiesForGID(2),
        none: orthoMap.getPropertiesForGID(7),
    };

    // P3 图层渲染：两张正交图层 + 等距图层的几何/批次
    results.p3Layers = {
        ground: layerSnap(orthoMap, 'ground'),
        deco: layerSnap(orthoMap, 'deco'),
        diamond: layerSnap(isoMap, 'diamond'),
    };

    // P4 object layer 读取
    results.p4Objects = {
        markers: objectSnap(orthoMap, 'markers'),
        isoMarkers: objectSnap(isoMap, 'isoMarkers'),
    };

    // P5 运行时改图：写 gid + 翻标记，再读回；顶点数在 live 里回读（下一帧重建后）
    const ground = orthoMap.getLayer('ground');
    const before = ground.getTileGIDAt(3, 1);
    ground.setTileGIDAt(2, 3, 1);
    // 反例：TMX/CSV 把翻转标记塞在 gid 高位，但 setTileGIDAt 第一行就 `gid & FLIPPED_MASK`（tiled-layer.ts:694）
    // ⇒ 照抄 CSV 的写法标记被静默抹掉，图上是个正放的 tile。
    ground.setTileGIDAt(TiledMap.TileFlag.DIAGONAL | 2, 5, 1);
    const flagInGidOnly = { gid: ground.getTileGIDAt(5, 1), flags: ground.getTileFlagsAt(5, 1) };
    // 正解：标记走第 4 个入参
    ground.setTileGIDAt(2, 5, 1, TiledMap.TileFlag.DIAGONAL);
    results.p5RuntimeEdit = {
        before,
        after: ground.getTileGIDAt(3, 1),
        flagInGidOnly,
        flagViaParam: { gid: ground.getTileGIDAt(5, 1), flags: ground.getTileFlagsAt(5, 1) },
        filled: ground.tiles.filter((g) => g !== 0).length,
        outOfRange: safe(() => ground.setTileGIDAt(1, 99, 0)),
    };

    // P6 可见性 + 渲染刷新阶梯（实测）：往**空格**写 tile 只置 `_cullingDirty`（tiled-layer.ts:730），
    // 而 `Simple.updateRenderData` 只在渲染器本身被标脏时才跑（assembler/simple.ts:115-121）
    // ⇒ 数据已改、批次没重算；手动 `setCullingDirty(true)` 也不够，重激活图层节点才触发重建。
    // 这里留两组：ground 改完立刻重激活（应当反映到新 tile），diamond 只改不刷新（应当保持旧批次数）。
    const diamond = isoMap.getLayer('diamond');
    diamond.setTileGIDAt(1, 2, 2);
    const decoNode = orthoMap.getLayer('deco').node;
    decoNode.active = !decoNode.active;
    ground.node.active = false;
    ground.node.active = true;
    results.p6RefreshLadder = {
        decoActive: decoNode.active,
        groundActive: ground.node.active,
        isoActive: isoMap.node.active,
        groundFilled: ground.tiles.filter((t) => t !== 0).length,
        diamondFilled: diamond.tiles.filter((t) => t !== 0).length,
        groundDirtyFlag: ground.isCullingDirty(),
        diamondDirtyFlag: diamond.isCullingDirty(),
    };

    // P7 换贴图重建（reacquire 走同一条通路）
    const rebuilt = makeMapAsset(tmxText.text, tileFrame, { tsxFileNames: ['tiles.tsx'], tsxFiles: [tsxText] });
    const swapMap = makeMapNode('SwapMap', 0, -150);
    swapMap.tmxAsset = rebuilt;
    swapMap.enableCulling = false;
    results.p7Rebuild = {
        sameLayerNames: swapMap.getLayers().map((l) => l.getLayerName()),
        groundSize: (() => {
            const s = swapMap.getLayer('ground').getLayerSize();
            return [s.width, s.height];
        })(),
        firstGid: swapMap['_tilesets'][0].firstGid,
        torchSprite: !!swapMap.getObjectGroup('markers').node.getChildByName('img3'),
    };
    swapMap.node.destroy();

    // P8 TSX `<animation>`（唯一真正每帧改图的通路）：parser 把 `<frame>` 存进 `_animations`
    // （键=被动画 tile 的 gid；`tileid` 已加 firstGid、`duration` 毫秒→秒，tmx-xml-parser.ts:752-764），
    // `TiledMap.lateUpdate` 每帧把当前帧的 grid 写进 `_texGrids[gid]`（tiled-map.ts:636-653），
    // assembler 见 `hasAnimation()` 就重建（assembler/simple.ts:119）⇒ 格内 gid 恒为 1，换的是 UV。
    const ani = orthoMap['_animations'].get(1);
    const liveGridObj = orthoMap['_texGrids'].get(1);
    results.p8TileAnimation = {
        animatedGidKeys: [...orthoMap['_animations'].keys()].join(','),
        isoAnimatedCount: isoMap['_animations'].size,
        framesSpec: ani ? ani.frames.map((f) => `${Number(f.tileid)}@${r(f.duration, 3)}`).join(',') : null,
        frameIdxInCycle: !!ani && ani.frameIdx >= 0 && ani.frameIdx < ani.frames.length,
        dtWithinFrame: !!ani && ani.dt >= 0 && ani.dt < 0.5,
        groundHasAnimation: ground.hasAnimation(),
        diamondHasAnimation: diamond.hasAnimation(),
        // 格 (1,1) 的 gid 恒为 1，动画换的是 `_texGrids[1]` 指向的 UV 对象
        cellGid: ground.getTileGIDAt(1, 1),
        liveGrid: texGridOf(orthoMap, 1),
        // 当前 UV 必须是候选帧之一，且必须正好是 `frameIdx` 指向的那一帧（lateUpdate 的写入目标）；
        // 帧 grid 之间必须互不相同 ⇒ 换帧才会换像素。注意 `_texGrids.get(1)` 本身已被 lateUpdate 就地
        // 改写成某一帧的对象，所以「帧不同」只能比 `frames[i].grid`，比 `_texGrids` 两项会得到假阴性。
        gridIsOneOfFrames: !!ani && ani.frames.some((f) => sameGrid(f.grid, liveGridObj)),
        gridIsCurrentFrame: !!ani && sameGrid(ani.frames[ani.frameIdx].grid, liveGridObj),
        framesDistinct:
            !!ani && ani.frames.every((f, i) => ani.frames.every((g, k) => k === i || !sameGrid(f.grid, g.grid))),
        filled: ground.tiles.filter((g) => g !== 0).length,
    };

    status.string = `tiledmap ortho=${results.p1Header.ortho.layerNames.join('+')} iso=${results.p1Header.iso.orientation} filled=${results.p3Layers.ground.filled} objects=${results.p4Objects.markers.objects.length}`;
    return status.string;
}

canvasNode.on(Node.EventType.TOUCH_START, runSequence);

// ---------------------------------------------------------------- 资源生命周期（§25 合同）
function heldAssets() {
    return [
        { name: 'orthoAsset', ref: orthoAsset },
        { name: 'isoAsset', ref: isoAsset },
        { name: 'tileFrame', ref: tileFrame },
    ];
}

installAssetLifecycle({
    label: 'tiledmap-basic',
    hold: heldAssets,
    release: () => {
        for (const { ref } of heldAssets()) {
            ref.destroy();
        }
    },
    reacquire: () => {
        tileFrame = makeFrame();
        orthoAsset = makeMapAsset(tmxText.text, tileFrame, { tsxFileNames: ['tiles.tsx'], tsxFiles: [tsxText] });
        isoAsset = makeMapAsset(isoTmxText.text, tileFrame, {});
        orthoMap.tmxAsset = orthoAsset;
        isoMap.tmxAsset = isoAsset;
        return heldAssets();
    },
});

window.__airApp = app;
window.__runSequence = runSequence;
window.__assets = () => ({
    orthoAsset: orthoAsset ? orthoAsset.constructor.name : null,
    tmxAssetType: tmxText.constructor.name,
    tsxAssetType: tsxText.constructor.name,
    pngAssetType: pngLoaded.constructor.name,
    frameRect: (() => {
        const rc = tileFrame.rect;
        return [rc.x, rc.y, rc.width, rc.height];
    })(),
    held: heldAssets().map((e) => e.name),
});
app.run(scene);

window.__probe = async () => ({
    results,
    live: {
        orthoChildren: orthoMap.node.children.length,
        isoChildren: isoMap.node.children.length,
        canvasChildren: canvasNode.children.length,
        groundVerts: safe(() => vertsOf(orthoMap, 'ground')),
        decoVerts: safe(() => vertsOf(orthoMap, 'deco')),
        diamondVerts: safe(() => vertsOf(isoMap, 'diamond')),
        markerChildren: safe(() => orthoMap.getObjectGroup('markers').node.children.map((c) => c.name)),
    },
    summary: status.string,
    phaseKeys: Object.keys(results).length,
});
