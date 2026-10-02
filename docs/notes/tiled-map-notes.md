# TiledMap 行为调查

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

日期：2026-09-22。所有结论后面都跟着产生它的命令与证据路径；没有实测支撑的一律标「待核」。

## 1. 逐字节回归（计划书护栏 2）

`src/cocos/tiledmap/**` 对官方 `E:/AIProMax/github/cocos4/cocos/tiledmap/**` 逐个 sha256 前缀（16 位）比对：

```
node -e "…walk(src/cocos/tiledmap) 与 cocos4 同路径逐个 sha256(16) 比对…"
→ files 12 same 12 / no diff
```

⇒ 12 个文件（含 `assembler/simple.ts`、`tiled-{layer,map,object-group,tile,types,utils}.ts`、`tmx-xml-parser.ts` 等）**逐字节同源**，`docs/upstream-file-map.json` 无需新增偏差条目。

## 2. Code First 入口：`loadRemote` + 手搭 `TiledMapAsset`（示例采用，已出图）

计划书 B3 要求「小型 `.tmx` 资产经 `loadRemote` 加载」。实测通路三段：

```js
const tmx = await loadRemote('./assets/orthogonal.tmx', '.tmx');   // → TextAsset（downloader.ts:283 downloadText + factory.ts:123 createTextAsset）
const asset = new TiledMapAsset();
asset.tmxXmlStr = tmx.text;
asset.tsxFileNames = ['tiles.tsx'];  asset.tsxFiles = [tsxText];   // TextAsset 数组
asset.spriteFrameNames = ['tiles.png']; asset.spriteFrames = [frame]; asset.spriteFrameSizes = [new Size(64,32)];
tm.enableCulling = false;            // 必须在赋 tmxAsset 之前
tm.tmxAsset = asset;                 // setter → _applyFile()（tiled-map.ts:104-110）
```

三张并行数组是**纯字符串查表**、不做路径归一：`tsxFileNames[i]` 必须逐字符等于 `<tileset source="…">` 的原样值（写成 `./assets/tiles.tsx` 即查不到），`spriteFrameNames[i]` 必须等于 `<image source="…">`。对不上的后果是 `sourceImage` 为 null ⇒ 只有一条 `warnID(16406)`、图层一个顶点都不生成（静默空图，实测 `batches[].vertexCount` 归 0）。

证据：`examples/tiledmap-basic/`（`main.js` 的 `makeMapAsset()` / `loadRemote()`）。

## 3. 解析语义实测（钉进合同的可回读量）

| 点 | 实测 |
|---|---|
| `Orientation` 枚举 | ORTHO=0 / **HEX=1 / ISO=2**（tiled-types.ts:54-72），不是 XML 字面顺序 ⇒ 合同写 `"0:ORTHO"` / `"2:ISO"` 字符串对 |
| `<object type="solid">` | **引擎根本不读**：`objectProp.type` 只由子元素与 `gid` 推出（tmx-xml-parser.ts:964-1008）。带 `type="solid"` 的矩形与 `<point/>` 都是 `0:RECT`；`type` 只在 `<property type="bool">` 上表示值类型（TSX 的 `solid` 读回真布尔、`slip` 读回 `0.25`） |
| 对象坐标 | `TiledObjectGroup._init` **就地改写** `object.x/y` 为引擎坐标（正交 `y = height - y`；等距分母是 tile **height**，tiled-object-group.ts:231-232），Tiled 原值只留在 `object.offset` ⇒ 读回分两套（spawn `engineXY [32,32] / tmxXY [32,96]`） |
| 对象节点 | 只有 TEXT/IMAGE 建节点：markers 组 5 对象只有 `img3`（gid=2 torch）是子节点，RECT/ELLIPSE/POLYGON 纯数据 ⇒ 「object layer 已解析」必须逐对象回读字段，数 `children.length` 会得出反结论 |
| POLYGON `points` | y 分量整体取反（TMX `24,4 8,20` ⇒ `[24,-4] [8,-20]`） |
| 图层 offset 符号 | TMX 写 `offsetx="4" offsety="-6"` ⇒ `layer._offset` 读回 `[4, 6]`（y 取反）。**待核**：只在正交 deco 一层观察到，未做跨朝向推广 |

## 4. 运行时改图的三种路径（本组最有价值的一条，F-99 候选）

「改数据」与「改像素」在 tiledmap 里是三件事：

| 路径 | 数据 | 像素 | 源码位置 |
|---|---|---|---|
| A 往**空格** `setTileGIDAt` | 改 | **不改**，零报错：只置 `_cullingDirty`，`Simple.updateRenderData` 不被标脏 ⇒ 顶点数不变 | tiled-layer.ts:730 / assembler/simple.ts:115-121 |
| A′ 补一步 `setCullingDirty(true)` | — | 仍不改（实测 60 顶点不动） | |
| A″ 补一步 `node.active=false→true` | — | **改**，但重建推迟到下一次渲染遍历：点击回调里同步读 `vertsOf` 是 **0**，1500 ms 后 `live.groundVerts` 才读回 96 | |
| B 往**已占用**格写 gid（含 flag），`enableCulling=false` | 改 | **不改**：`_updateTileForGID → _updateVertex(x,y)` 维护的是裁减簿记（顶点行列区间、`_hasAniGrid`），不重写 UV/顶点缓冲；`_cullingDirty` 只在 `_updateCullingOffsets()` 末尾被消费（tiled-layer.ts:865），而该路径仅在裁减开启时跑 | tiled-layer.ts:714-731, 865, 961-1146 |
| C TSX `<animation>` | gid 不变 | **改，且每帧**：`TiledMap.lateUpdate` 写 `_texGrids[aniGID] = frames[frameIdx].grid`，并对 `hasAnimation()` 的图层 `_markForUpdateRenderData()`；assembler 脏判里 `hasAnimation()` 独立于裁减（simple.ts:119） | tiled-map.ts:636-660 / simple.ts:119 |

路径 B 的否证是一次真实踩坑：先前用 `Component.update` 每 20 帧在已占用格上 1↔2 交替，探针自证在跑（`pulseRunning:true`、`filled:24`），矩阵仍 `frameChanged:false`：

```
NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules \
  node tools/verify/browser-matrix.cjs --ids=tiledmap-basic --engines=chromium \
  --out=E:/AIProMax/cocosair-scratch/v12-diag/matrix-debug-tiledmap-chromium-r2.json
→ result FAIL，checks.frameChanged=false，p8RenderLoop={pulseRunning:true, filled:24, verts:0}
```

改走路径 C（`assets/tiles.tsx` 的 tile 0 加两帧 500 ms/500 ms `<animation>`）后，同一合同 `frameChanged:true`：

```
node … browser-matrix.cjs --ids=tiledmap-basic --engines=chromium --out=…/matrix-debug-tiledmap-chromium-r4.json   → PASS（r5 复跑同样 PASS）
```

P8 读数（`…-r4.json` → `records[0].probe.results.p8TileAnimation`）：`animatedGidKeys '1'`、`framesSpec '1@0.5,2@0.5'`、`isoAnimatedCount 0`（等距是内联 tileset，无 `<animation>`）、`groundHasAnimation true / diamondHasAnimation false`、`cellGid 1` 而 `liveGrid [2,32,0,0.5,0,1,1]` ⇒ **草格此刻用的是石砖 UV**，gid 不变、换的只是 `_texGrids` 里的对象引用。

⚠️ 断言「两帧不同」只能比 `animation.frames[i].grid`：`_texGrids.get(1)` 已被 `lateUpdate` 就地改写成某一帧，拿它跟 `_texGrids.get(2)` 比会假阴性判成「两帧相同」（r3 就是这么红的）。

## 5. 决定性与门禁

关掉 `enableCulling`（且必须在赋 `tmxAsset` **之前**）后批次只由几何决定 ⇒ 三引擎/任意视口逐字段一致：正交 ground 23 格 = 92 顶点、deco 4 格 = 16、等距 diamond 15 格 = 60。

```
node tools/examples/spec-evidence.cjs --check   → 1004 entries checked: 0 drifted, 0 detached-validator, 0 errors
node tools/examples/spec-validate.cjs --strict  → 52 examples: 52 frozen / 0 draft / 0 blocked（exit 0）
NODE_PATH=… node tools/verify/example-spec-browser.cjs --ids=tiledmap-basic → PASS，1 promoted
```

三引擎矩阵（含本示例）：见 §6。

## 6. 验收结论

**LV12-08 = PASS**（计划书 B3「TMX/TSX 解析、正交/等距、图层渲染、object layer 读取」+ Example `examples/tiledmap-basic`）。

全量三引擎矩阵（含本示例，`subset=false` / `completed=true` / `contractFingerprint 3dd04e191f69fcd3`）：

```
NODE_PATH=E:/AIProMax/Y2026M08/AIShaderBenchmark/node_modules node tools/verify/browser-matrix.cjs
→ 21/21 PASS across 3 engines → docs/evidence/browser-matrix/browser-matrix.json（bundle 未变：build/cocosair.module.js sha256_16 35496aebda066ab5）
```

`tiledmap-basic` 三引擎逐条：`checks = {noConsoleError, noFailedRequest, frameChanged, pngBytesAboveFloor, probeAssertions}` **全 true**，`failedAssertions []`，控制台只有既有良性一条 `[Physics] PhysicsSystem initDefaultMaterial()`。截图与出处（一次运行一次捕获）：

| 引擎 | 截图 | bytes | sha256_16 |
|---|---|---|---|
| chromium | `docs/evidence/browser-matrix/tiledmap-basic/matrix-chromium.png` | 12297 | 0b7d30543716d15e |
| firefox | `…/matrix-firefox.png` | 16267 | 95593b5988aa50e2 |
| webkit | `…/matrix-webkit.png` | 13273 | cdff8fb5b6fb04d3 |

合同规模：161 条 `probeEquals`（P1 类型/头部、P2 TSX、P3 图层几何与批次顶点数、P4 object layer 逐对象字段、P5 flag 读写正反、P6 刷新阶梯、P7 换 asset 重建、P8 tile 动画、`live.*` 终态）+ 5 条 `probeNonEmpty` + 4 条 `probePresent`。

### 6.1 负向控制（证明 frameChanged 断言有牙）

只把 `assets/tiles.tsx` 的 `<animation>` 三行删掉（其余一字不动），并用一份剥掉全部 `results.p8TileAnimation.*` 断言的合同副本（`E:/AIProMax/cocosair-scratch/v12-diag/contract-no-p8.json`，剩 145 条 `probeEquals`）单跑 chromium，好让「画面没变」不被 P8 的连带失败掩盖：

```
NODE_PATH=… node tools/verify/browser-matrix.cjs --ids=tiledmap-basic --engines=chromium \
  --contract=E:/AIProMax/cocosair-scratch/v12-diag/contract-no-p8.json \
  --out=E:/AIProMax/cocosair-scratch/v12-diag/matrix-negctl-tiledmap-noanim.json
→ result FAIL · checks={noConsoleError:true, noFailedRequest:true, frameChanged:false, pngBytesAboveFloor:true, probeAssertions:true} · failedAssertions=[] · pngBytes=12460
```

⇒ 145 条数据断言全绿、截图仍过字节下界，唯独帧间变化为 false：画面变化确实只来自被断言的那条引擎通路（`lateUpdate` 换 `_texGrids`），不是页面噪声。测后 `tiles.tsx` 已按 sha1 还原（前后均 `54c425d6c857359c049280fbcbd91433aa542cb9`），并重跑全量矩阵覆盖被这次负控写脏的 chromium 截图。

对照的第二个负例（路径 B）：`Component.update` 每 20 帧改已占用格 ⇒ `…-r2.json` 的 `frameChanged=false` 而 `pulseRunning=true`（见 §4）。

## 7. 残留 / 未覆盖（诚实口径）

- `Orientation.HEX`（六边形图）与 `StaggerAxis/StaggerIndex` 分支未覆盖：本例只钉 ORTHO 与 ISO。
- `TiledTile`（`getTiledTileAt/setTiledTileAt`）、`addUserNode` 系列、image layer（`<imagelayer>`）未覆盖。
- JSON 通路（`.json` 地图、`TiledMapAsset` 走 uuid 依赖图的 Creator 产物）未覆盖：Code First 只能走 `tmxXmlStr`，与计划书 B3 的「`.tmx` 资产」口径一致。
- `enableCulling=true` 的视口裁减量（`cullingRect`/`leftDown`/`rightTop`）刻意不进合同（随视口与引擎漂移），只在 §5 说明其关闭理由。
- 图层 `offset` 的 y 取反（TMX `-6` ⇒ 读回 `6`）只在正交 deco 一层观测到，未做跨朝向/跨图层推广 ⇒ **待核**。
