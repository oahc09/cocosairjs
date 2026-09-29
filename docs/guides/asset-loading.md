# 资源加载

> Promise 加载 helper `loadAssetAsync`，对应 `src/air/utils/load-asset.ts`。

## 为什么需要

Code First 场景下没有 Creator 的 resources bundle 配置，V0.1 验证过的资产路径
（`assetManager.assets.add(path, asset)` 注册 + 按 path 加载）是回调式 API。
V0.2 将其正式化为 Promise helper —— 只做 DX 包装，不新建 Asset System。

## API

```ts
// 1) Code First / resources 双路径（返回引擎资产实例）
function loadAssetAsync<T extends Asset>(path: string, type: Constructor<T>): Promise<T>;

// 2) HTTP URL 形态（拉取 + 引擎 deserialize，非序列化格式按 JSON 返回）
function loadAssetAsync<T = unknown>(url: string): Promise<T>;
```

### 形态 1 的解析顺序

1. `assetManager.resources` 存在（Creator 常规形态）→ 走 `resources.load(path, type)` 原生路径；
2. 否则按 Code First 约定：在全局 `assetManager.assets` 中以 path 为键查找，并校验 `instanceof type`。

### 失败行为

- 未注册 / 类型不匹配 → reject，错误信息包含修复指引（`assetManager.assets.add(path, asset)`）。
- URL 形态 HTTP 非 2xx → reject（带状态码）。

## 示例

```ts
import { assetManager, Mesh, utils, primitives } from 'cocosair';
import { loadAssetAsync } from 'cocosair'; // 与 createAirApp 同入口导出

// 程序化资产：先注册，再按路径加载
assetManager.assets.add('models/box', utils.createMesh(primitives.box({})));
const mesh = await loadAssetAsync('models/box', Mesh);

// 远端运行时资产（V0.1 兼容形态）
const config = await loadAssetAsync('https://example.com/app-config.json');
```

## 覆盖测试与示例

- 单测：`test/smoke/smoke-05-promise-asset-helper.test.ts`
- 示例：`examples/static-model/`（V0.2 已改用 `loadAssetAsync` + `frameObject`）
