# AssetBank 原始远程加载与所有权

`AssetBank` 是 raw 远程加载（图片/音频/文本等 `loadRemote` 类资源）的官方答案：Promise API、并发去重、ext 推断/显式声明、订阅者取消与迟到结果归还。业务不要再自包装 `assetManager.loadRemote`（端口工程 `loadRemoteAsset()` 即此类绕行，能力覆盖后可回收）。实现位于 `src/air/assets/asset-bank.ts`（`src/air/ui-kit.ts` 按原名重导出），共同合同见[端口缺口实施合同](../reference/port-gap-contracts.md)。

> 状态与证据口径：本模块已有 Jest 正负例（`test/smoke/port-gap-asset-bank.test.ts` + `port-gap-asset-bank-races.test.ts`：受控 `loadRemote`/`loadAny` 传输层边界 + 真实引擎 `Asset`/`factory`/强缓存链路）。**受控桩与 jsdom 不是真实网络/浏览器证据**；真实 HTTP、CORS/CSP/404 与解码器配置下的表现由发布流程统一采集。公共导出状态以 `src/air/index.ts` 当前集成为准。

## 加载 API

```ts
import { AssetBank, Asset, ImageAsset } from 'cocosair'; // 以实际集成为准

const bank = new AssetBank();

// 兼容签名（保留，行为不变）：带后缀 URL 走原生推断
const tex = await bank.load<ImageAsset>('/assets/hero.png');

// 增量签名：{ ext?, signal?, onProgress? }
const raw = await bank.load('https://cdn.example.com/level-1', {
    ext: 'json',                    // 无后缀 URL 必填；后缀不符时用于消歧
    signal: controller.signal,      // 订阅者取消
    onProgress: (current, total) => updateBar(current / total),
});
```

- 泛型 `T extends Asset` 只是**调用方断言**，bank 不据此猜测或校验资源类型。
- ext 形状：仅字母数字、1–16 字符；不合法同步抛 `AIR_E_INVALID_EXT`。传给引擎时按 `loadRemote` 合同带点（如 `.png`）。
- **无后缀 URL 必须显式 ext**（判定剥掉 query/hash），否则同步抛 `AIR_E_EXT_REQUIRED`。首批不做 magic-byte 嗅探；该能力若引入须以真实请求验证。
- 参数形状错误（ext/suffix）同步抛出；异步结果（加载失败/取消/撤销）以 Promise 拒绝表达。

## 解析键与并发去重

- 在途/缓存键 = **URL + 显式 ext（规范化小写）**：
  - 同 URL 无 ext：一个键，原生推断，并发合并；
  - 同 URL 同显式 ext：一个键，并发合并（`JSON`/`json` 视为同键）；
  - 显式 ext 与原生推断**永不合并**（保守策略：同 URL 两路独立加载，绝不静默复用错误类型）。
- 并发去重：同键在途只发一次请求，等待者共享底层操作、各自持独立 Promise。

## 所有权与释放

- 每个 bank 对每个入库资产**只持一份引擎 `addRef`**；条目 `refs` 是订阅计数，与引擎 ref 分开（`bank.refCount(url, ext?)` 读订阅计数）。
- `release(url, ext?)`：归还一个订阅；本地计数归零时 bank 才 `decRef()` 自己的引擎引用。**绝不 force releaseAsset**——其他 bank / 业务持有者不受影响。
- `releaseAll(): number`：释放全部入库条目并**撤销全部在途订阅**（等待者以 `AIR_E_REVOKED` 拒绝）。这是会话结束的推荐配方：

```ts
// 会话结束（PG-30 session scope 的清理回调内）
scope.onDispose(() => bank.releaseAll());
```

- 撤销/全员取消后的迟到完成：bank **不接管**结果（不加引用、不 force release，引擎引用自然回落），不入库；之后的 `load` 是全新请求，不与被撤销的在途合并。调用方应持有自己 `load()` 的 Promise（撤销会拒绝它）。

## AbortSignal：订阅者取消

- `signal` 只取消**当前订阅**：本 Promise 以 `AIR_E_ABORTED` 拒绝；同键其他共享者与已入库条目不受影响。
- 已 abort 的 signal：即使缓存命中也拒绝（订阅在请求前已被订阅者撤销，不计数）。
- **底层不可取消**：`AssetBank.underlyingCancelSupported === false`（如实声明）。`loadRemote` 没有网络级取消通道——全员取消后请求仍会完成，bank 在完成时按"无人持有"处理（见上）。不要把订阅取消理解为带宽/请求终止。

## 进度

`loadRemote` 无任务级进度，bank 如实两阶报告：订阅时 `(0,1)`、完成时 `(1,1)`，不伪造细粒度。`onProgress` 内抛错只拒绝**该订阅**（`AIR_E_PROGRESS_ERROR`，原始错误保留在 `cause`），不影响其他共享者与入库结果。

## 错误码

| 码 | 时序 | 含义 |
| --- | --- | --- |
| `AIR_E_EXT_REQUIRED` | 同步抛 | 无后缀 URL 未提供显式 ext |
| `AIR_E_INVALID_EXT` | 同步抛 | ext 形状不合法 |
| `AIR_E_ABORTED` | Promise 拒绝 | 本订阅者经 signal 取消（含缓存命中前已取消） |
| `AIR_E_REVOKED` | Promise 拒绝 | releaseAll/会话结束撤销在途订阅 |
| `AIR_E_LOAD_FAILED` | Promise 拒绝 | 底层加载失败（原始错误在 `cause`；失败不留悬挂条目，可直接重试） |
| `AIR_E_PROGRESS_ERROR` | Promise 拒绝 | 订阅者自己的 onProgress 抛错 |

## 与原生缓存/解析器的关系（精确范围）

- **无显式 ext（原生推断）**：走 `loadRemote(url, cb)`，可命中引擎按 URL 的强缓存（同后缀同类型，语义安全）；同 URL/同后缀在不同 bank 间共享同一底层资产是正常行为。
- **显式 ext**：传给 `loadRemote` 为 `{ ext: '.<ext>', reloadAsset: true }`。原生 `loadRemote` 按 URL 强缓存命中时**不看 ext** 直接早退（返回按旧 ext 解析的资产）；`reloadAsset: true` 绕过该早退，强制原生解析器真实按本次 ext 解析——这是“解析真实符合 ext”的保证，不依赖 mock 选项证明（真实 loadRemote/factory/cache 链路见 races 回归）。
- 交接事实（原生合同）：真实 `loadRemote` 交付给回调的资产零引用——按 URL 的缓存早退与 factory 新建/缓存分支都不 addRef 给调用方；外部持有者（引擎强缓存/其他 bank）的引用独立存在。bank 采用时只自持一份 `addRef`；正常释放只 `decRef` 自己的那份；绝不 force releaseAsset。
- 无人接管的迟到结果（撤销/全员取消/进度全失败）：bank 以成对 `addRef→decRef`（净 0）触发正常 tryRelease，让引擎自然回收无主缓存资产；外部 owner 因 refCount>0 被 `_free` 跳过，不受侵害。ref0 本身不证明释放，释放以成对触发为准。
- releaseAll/会话结束：入库条目全部归还 bank 引用，在途等待者以 `AIR_E_REVOKED` 同步拒绝；不可取消的底层请求稍后完成时按上一条处理；撤销后同键新加载是新请求，旧回调不会移除它（身份守卫）。已 resolve 的订阅若在撤销前已交付，其资产可能随后被引擎回收（会话合同：迟到结果不挂回旧 scene）。
- 缓存命中交付与原生 `asyncify` 对齐经微任务异步化：同 tick 内的 abort/release/releaseAll 先于交付生效，精确回退本次订阅（不影响其他订阅者与外部 owner）。

## 边界

- 真实 HTTP、CORS/CSP、404、解码器配置（draco/basis/meshopt 等）下的诊断与验证属 PG-32 浏览器/发布证据范围，本模块不声称已验。
- bank 不解析资源内容、不建立场景对象；绑定到 Sprite/Label 的配方见 ui-kit 其余 helper 与示例。
