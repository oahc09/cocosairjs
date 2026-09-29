# 00 — Upstream Baseline 记录

> 记录时间：2026-09-12
> 基线标识：`cocos4 @ 4.0.0-alpha.33 (snapshot 2026-09-12)`

## 1. 环境信息

| 项 | 值 |
|---|---|
| OS | Windows 10.0.28120 x64 |
| Shell | Git Bash |
| Node | v24.14.0 |
| npm | 11.11.1 |
| TypeScript（devDependency） | ^4.9.5 |
| 构建核心 | `@cocos/ccbuild` ^2.3.21 |

## 2. 源码状态（Task 0.1）

| 项 | 值 |
|---|---|
| Branch | `main`（未出生，无 commit） |
| Upstream SHA | 不可得 → Deviation-01（见 UPSTREAM.md） |
| 工作树 | 全部为 untracked 上游快照文件 |
| 上游文档 | `docs/`（CPP/TS coding style、contribution）原有内容保留 |

### 快照统计

| 目录 | 规模 | Air 处置 |
|---|---|---|
| `cocos/` | 1251 个 TS 文件（54 个 `*.jsb.ts`），~314,009 行 | Extraction 主体 → `src/cocos/` |
| `pal/` | 不在快照中；由 `npm install`（spread-pal.cjs）从 `@cocos/engine-pal@^1.0.4` 复制生成 | Extraction 主体 → `src/pal/` |
| `exports/` | 47 个入口 `.ts` | Extraction 主体 → `src/exports/` |
| `editor/` | 33 个 TS，~5,515 行 | 不入 Air（Creator Editor Runtime） |
| `native/` | ~855 MB（`native/external/` 本地也不存在，被 .gitignore 忽略） | 不入 Air（Native Engine） |
| `external/` `vendor/` `templates/` `tests/` `extensions/` | 2.8M / 1.5M / 120M / 77M / 256K | 按依赖闭包决定 |
| `@types/` | 16 个 `.d.ts` + `pal/` 子目录 | 随 Web 闭包保留 |

## 3. 当前 Web Build（Task 0.2）

### 命令（来自 package.json scripts，未沿用旧计划命令名）

| 命令 | 实际动作 |
|---|---|
| `npm run build:dev` | `build:debug-infos` → `node scripts/build-h5-source.js` |
| `npm run build:min` | `build:debug-infos` → `node scripts/build-h5-minified.js` |
| `npm run build:const` | 用 `@cocos/ccbuild` `StatsQuery` 生成 `@types/consts.d.ts` |
| `npm run build:declaration` | `build:const` + `build-declarations` |
| `postinstall` | `spread-pal.cjs` → `build:debug-infos` → `build:declaration` → `spread-adapter.cjs` → `build:native-pack-tool` |

### 构建参数（scripts/build-h5-source.js）

```js
buildEngine({
    engine: <repoRoot>,
    moduleFormat: 'system',
    mode: 'BUILD',
    platform: 'HTML5',
    out: '<repo>/bin/dev/cc',
    compress: false,
    sourceMap: false,
});
```

- 构建器：`@cocos/ccbuild`（读取根目录 `cc.config.json`）。
- 输出：`bin/dev/cc`（SystemJS 格式，全模块 dev bundle）。
- `build:min` 输出经 uglify（`build-h5-minified.js`）。

### Feature / 模块系统（cc.config.json）

- `features`：`base`、`gfx-webgl`、`gfx-webgl2`、`gfx-empty`、`gfx-webgpu`、`3d`、`animation`、`skeletal-animation`、`2d`、`ui`、`particle`、`physics-*`、`spine-*`、`dragon-bones`、`custom-pipeline`、`legacy-pipeline` 等 ~50 个 feature；每个 feature 声明 `modules`、`dependentModules`、`dependentAssets`、`overrideConstants`、`intrinsicFlags`。
- `constants`：`HTML5 / NATIVE / MINIGAME / EDITOR / PREVIEW / BUILD / TEST / DEBUG / DEV / JSB / WEBGPU ...`，含派生公式（如 `NATIVE = $ANDROID || $IOS || ...`）。
- `moduleOverrides`（构建期改写依赖图）：
  - `internal:native` 虚拟模块 → `cocos/native-binding/impl.ts`；
  - `!NATIVE` 时 `cocos/2d/renderer/native-2d.ts` → `native-2d-empty.ts`；
  - `NATIVE` 时 ~40 个核心文件替换为 `*.jsb.ts` 版本；
  - **平台 PAL 虚拟模块**：`HTML5` 时 `pal/audio → pal/audio/web/player.js`、`pal/system-info → pal/system-info/web/system-info.js`、`pal/screen-adapter → web`、`pal/input → pal/input/web/index.js`、`pal/env → web`、`pal/pacer → pal/pacer/pacer-web.js`、`pal/wasm → web`、`pal/minigame → non-minigame.js`；
  - MINIGAME / RUNTIME_BASED / NODEJS 各有对应映射。
- `includes`（构建扫描范围）：`exports/**`、`editor/exports/**`、`cocos/**`、`pal/**`。
- `treeShake.noSideEffectFiles`：14 个文件标注无副作用。

### 结论

Web build 的真实入口是 `@cocos/ccbuild.buildEngine({ platform: 'HTML5' })`；引擎侧的“Web 性”由三件事共同决定：
1. `cc.config.json` 的 constants（HTML5=true, NATIVE=false...）；
2. `moduleOverrides` 的 PAL 虚拟模块映射（把 `cocos/pal/*` 引用改写到 web 实现）；
3. feature → modules 选择（决定 exports 中哪些模块进入 bundle）。

Air V0.1 的 Extraction 必须完整保留这三套机制。

## 4. 原始 Web Baseline 构建（Task 0.3）

- 前置：`npm install`（含 postinstall 全链：spread-pal、debug-infos、declaration、adapter、native-pack-tool）。
- 命令：`npm run build:dev`
- 结果记录见 `docs/foundation/03-upstream-web-build-log.md`（构建完成后回填）。

## 5. 不改动承诺

- 不执行 `git reset / clean / checkout -- .`。
- 上游文件内容除 Extraction 拷贝外不做修改；确需修改的文件记录进 `docs/upstream-file-map.json`（Modified 字段）。
