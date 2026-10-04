# libGDX 文本图集加载（Atlas Loading）

`src/air/assets/atlas/` 提供libGDX TexturePacker 文本图集（.atlas/.pack）的纯解析器、原生 SpriteFrame 工厂与 AssetBank 加载上下文。共同合同见[端口缺口实施合同](../reference/port-gap-contracts.md)；加载/取消/所有权语义与 [AssetBank](asset-bank-loading.md) 完全一致。

> 状态与证据口径：纯解析与原生工厂/所有权已有 Jest 正负例（`test/smoke/port-gap-atlas.test.ts`，jsdom + 受控 loadRemote + 真实引擎 SpriteFrame/Texture2D）。GPU 像素/安装消费已由 Lead 通道验收（Lead 报告：air-atlas-s6-top-origin.json 三浏览器旧/新格式/旋转/trim/多页/index 与正常释放 PASS；port-atlas-action-build-all.log unmin/min/dts/npm PASS；port-atlas-action-installed-types.log 实际包 601 导出 + TS4.9/7.0.2 正负例 PASS；air-atlas-s6-installed-path-pixels.json tarball 离线安装后三浏览器像素/所有权 PASS，无 /build 替代引擎）。`parseAtlasText`/`createAtlasHandle`/`createAtlasSpriteFrame`/`loadAtlas` 已由统一集成流程公开导出。

## 解析合同（parseAtlasText）

`parseAtlasText(text: string): AirAtlasDocument` —— 纯函数、冻结输出、不触碰引擎。

**行识别（与缩进无关）**：字段行 = 匹配 `key: value`（页/区域字段均可无缩进，也可带缩进——legacy 写侧页字段无缩进、区域字段带缩进；紧凑新格式全部无缩进）；名字行 = 不含 `key:` 前缀的行（页名/区域名，名字含 `:` 不支持）。**块边界（size 前瞻）**：首个名字行 = 第一页文件名；此后名字行若其后首个字段为 `size:` 则是新页文件名，否则是当前页的区域名（两代写侧页块首字段恒为 `size:`，区域首字段恒为 rotate/bounds）。空行跳过；CRLF/BOM 支持。

**支持的页字段**（页名行后，首个字段恒为 `size:`）：`size: w,h`（必需）、`format`、`filter`/`filt`（两种拼写等价，不得同现）、`repeat`、`pma: true|false`。**如实披露：这些页字段仅被解析并暴露在 `AirAtlasPage` 上，不改变上传/采样行为**——过滤器由调用方在 Texture2D 上设置（如 NEAREST），PMA 不做预乘处理，format 不改写像素格式。

**支持的区域字段**：

| 字段 | 语义 |
| --- | --- |
| `rotate: false \| true \| 90` | true ≡ 90；其他值拒绝（`AIR_E_ATLAS_ROTATION`） |
| `xy: x,y` + `size: w,h` | 旧格式：xy 为页左上原点打包位置；rotate 时 size 为**逻辑**（未旋转裁剪后）尺寸，页上占用 = 交换 |
| `bounds: x,y,w,h` | 新格式：x/y 为页上位置，w/h 为**逻辑**尺寸（官方 TextureAtlas 语义）；rotate 时页上占用 = 交换；与 xy/size 互斥 |
| `orig: w,h` + `offset: left,bottom` | 旧格式修剪信息（offset 自原图左/下边）；与 offsets 互斥；缺省 orig = 逻辑尺寸、offset 0,0 |
| `offsets: offsetX, offsetY, originalWidth, originalHeight` | 新格式（官方 TextureAtlas 语义）：前两元 = 自原图左/下边的修剪距离，后两元 = 修剪前完整尺寸；与 orig/offset 互斥 |
| `index: n` | ≥ -1；n ≥ 0 为动画帧。同名不同 index **全部可查**（`getRegions`），绝不静默覆盖；同 name+index 重复拒绝 |

**显式拒绝**（稳定 `AIR_E_ATLAS_*`）：未知字段键、未知 rotate 值、区域越界页（按打包占用判定）、区域先于页块、同 name+index 重复、bounds 与 xy/size 混用、offsets 与 orig/offset 混用、非法整数/负数、页缺 size、字段先于任何名行、空输入。

派生语义：packed（页上占用）= rotate ? 交换(logical) : logical；解析输出同时给出 `xy`（左上原点）、`packed`、`logical`、`original`、`offset{left,bottom}`，下游换算不再猜测。

## 原生 SpriteFrame 工厂

`createAtlasHandle(document, pageTextures: Texture2D[]): AirAtlasHandle`

- **rect 保留逻辑尺寸**；`rotated = true` 交给原生 `_calculateUV`：旋转帧的 UV 右/下边界取 `rect.x + rect.height`、`rect.y + rect.width`——即页上占用自动按交换宽高消费（已读实现确认并用 `frame.uv` 断言钉住）。
- **坐标换算**：rect.y 直接取 libGDX `xy.y`（GPU 实证：DOM 上传 UNPACK_FLIP_Y=false，原生 UV 将 rect.y/texh 分配给四边形顶边，v=0 即 PNG 视觉顶行；三浏览器像素验收确认）。原「页底原点换算 cocosY」为已纠正的错误实现。
- **trim 中心换算**（libGDX offset 为自原图左/下边距离）：`offset.x = left + logicalW/2 − originalW/2`；`offset.y = bottom + logicalH/2 − originalH/2`（Cocos offset 正 Y 向上）。
- 页纹理尺寸必须与页声明一致（`AIR_E_ATLAS_PAGE_TEXTURE`）；失败即抛、已建帧全部销毁，不产出半成品。
- 页的 format/filter/repeat/pma 与区域过滤**仅是解析数据**：工厂不据此改变像素格式、过滤器和预乘处理；过滤器/包裹由调用方在 Texture2D 上设置。

## 所有权（AirAtlasHandle）

- handle 对**每页纹理持一份 addRef**、对**每帧持一份 addRef**。**`Sprite.spriteFrame` 赋值不会自动 addRef**：调用方绑定前须 `frame.addRef()`、解绑后 `frame.decRef()`；`dispose` 的 IN_USE 守卫只识别这类显式 owner。
- `getFrame(name)` 返回 index −1 的普通帧；**动画帧必须显式 `getFrame(name, index)`**；`getFrames(name)` 按 index 升序返回全部。
- `dispose()`：幂等；任一帧 `refCount > 1`（Sprite 未解绑/额外 owner 未归还）时拒绝并抛 `AIR_E_ATLAS_IN_USE`——通过后逐帧 decRef、逐纹理 decRef，由 release manager 正常回收；绝不 force release 外部持有者。

## AssetBank 加载上下文（loadAtlas）

```ts
const handle = await loadAtlas('https://cdn.test/atlas/pack.atlas', {
    bank,                       // 共享 AssetBank（PG-06/32 合同）
    signal,                     // 订阅者取消（非网络级取消）
    baseURL,                    // 可选；缺省相对页 URL 基于 atlas URL，再退 document base
    pageExt,                    // 无后缀页文件必需；无默认值，缺失即拒绝
});
```

- 图集文本经 `bank.load(url, { ext: 'atlas', signal })`；页文件自带 `.png` 后缀自动使用；无后缀页必须显式 `pageExt`（无默认值，缺失即拒绝）；**自动路径仅支持 PNG**（其他格式拒绝 `AIR_E_ATLAS_PAGE_FORMAT`——请自备 Texture2D 走 `createAtlasHandle`）。
- 全部页以 `Promise.allSettled` 语义收敛后统一决策：任一页失败/取消 → 回滚已取得订阅（text+pages）、销毁未接管中间 Texture2D、不产出半成品 handle；兄弟页的迟到完成按"无人接管"出清（in-flight 记录正常清除，不挂 ghost 条目）。
- 取消是订阅者取消：底层 loadRemote 不可网络取消（`AssetBank.underlyingCancelSupported === false`），被取消页的迟到结果按无人接管归还。

## 边界

- 未支持字段（显式拒绝，不静默忽略）：`split`（九宫格）、`degree` 非 90 值、unknown 键。
- GPU 像素验收（UV 方向、trim 留白、多页、index、正常释放）已由 Lead 通道三浏览器完成（报告见上）；后续回归沿用同一采集器。本仓未含逐 region 烘焙 canvas 的替代实现，也不在计划内。
- 公共导出与 `cocosair` 入口接线由统一集成流程完成。
