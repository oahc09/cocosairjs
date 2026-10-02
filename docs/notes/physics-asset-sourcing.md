# WASM 物理运行资产来源

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

日期：2026-09-22（r44 建立）。归属：计划书 **D3**（box2d wasm 资产来源与部署路径）与 **R8**（wasm 资产不可得时的取证影响），
相关旧验收与预算报告已清理；保留的处置决定见 `docs/reference/owner-decisions.md` #10。
本文只交付**实测 + 可选路径 + 建议口径**，不代替 owner 批复（计划书护栏 ①：豁免需「理由 + 确认」）。

## 1. 一句话结论

**这些 wasm 资产不在上游快照里，也不在上游 git 里** —— 所以「Air 抽取时漏带」这一前提**不成立**；
任何依赖 `external:emscripten/**` 的后端，其运行级取证都**必须**先引入快照外部的资产来源，这是一条独立于 Air 的外部依赖决策。

## 2. 实测（每条都可复跑）

| 判据 | 命令 | 现读结果 |
|---|---|---|
| 上游快照 `external/` 只有两个子目录 | `ls E:/AIProMax/github/cocos4/external` | `compression` `deserialize`（**无 `emscripten`**） |
| 这些文件在上游是**被 git 跟踪**的（不是本地删的） | `cd E:/AIProMax/github/cocos4 && git ls-files external` | **11** 行，全部属 compression/deserialize |
| `.gitignore` 未忽略 `external/emscripten` | `grep -n "external" E:/AIProMax/github/cocos4/.gitignore` | 只有 `native/external/`（第 24 行）⇒ 不是 ignore 造成的缺失 |
| 上游无任何脚本/安装钩子去取这些资产 | `grep -rn "emscripten" scripts/ package.json extensions/`（上游仓库根） | **零命中** ⇒ 快照内没有获取通路 |
| Air 的 `src/external/**` 对上游逐字节 | 见本文末 §5 命令 | **11 文件 / 11 same / diff 0** |
| `@cocos/box2d` 包内没有 `.wasm` | `find node_modules/@cocos/box2d -name "*.wasm" \| wc -l`（版本 `1.0.2`） | **0**（包内只有 `box2d.umd.js` 等纯 JS 产物）⇒ 计划书 D3「来源 @cocos/box2d 包内资产」**前提为假** |

### 2.1 受影响的全部 `external:emscripten` 引用点（上游侧 grep 实测，Air 同路径逐字节）

| 资产族 | 引用点（`cocos4` 相对路径:行） | 归属能力 | 关联 LV12 / 决策点 |
|---|---|---|---|
| `box2d/box2d.release.wasm.{js,wasm}`、`box2d.release.asm.js` | `cocos/physics-2d/box2d-wasm/instantiated.ts:182,183,189` | 2D 物理 box2d **wasm** 后端 | LV12-14（blocked）/ D3、R8 |
| `bullet/bullet.release.wasm.{js,wasm}`、`.asm.js` | `cocos/physics/bullet/instantiated.ts:145,146,152` | 3D 物理 bullet | LV12-16（blocked）/ D8 |
| `physx/physx.release.wasm.{js,wasm}`、`.asm.js` | `cocos/physics/physx/physx-adapter.ts:62,63,69` | 3D 物理 physx | LV12-16（blocked）/ D8 |
| `webgpu/glslang.{js,wasm}`、`twgsl.{js,wasm}` | `cocos/gfx/webgpu/instantiated.ts:112-115` | WebGPU 着色器编译 | LV12-18（blocked D10） |
| `meshopt/meshopt_decoder.wasm.{js,wasm}`、`.asm.js` | `cocos/3d/misc/mesh-codec.ts:92,93,99` | glTF meshopt 解压 | V1.1 存量（draco/meshopt 同类欠账） |
| `spine/3.8/spine.wasm{,.js}`、`spine.asm.js`、`spine.js.mem` | `cocos/spine/lib/spine-instantiate-3.8.ts:34,35,42,43` | spine **wasm** 变体 | D2（spine js vs wasm）——本文把「wasm 变体」这一支的前提一并消掉 |

⚠️ 每条引用都是 **`import()` 的动态分支**，且都带 asm.js 兜底分支 ⇒ 「资产缺失」不会让构建或类型核对失败，
只会在**运行期**取资产时报错。这正是此前把 LV12-14/16 误写成「资产待部署」而非「资产不存在」的机制原因。

## 3. 若要真正取证，可选的外部来源路径

| 路径 | 具体动作 | 代价 / 风险 |
|---|---|---|
| P1 官方发布通道取包 | 从 cocos 官方 npm（`@cocos/box2d` 的 wasm 版 / 对应引擎发行包）或官方 CDN 拉 `*.wasm.js` + `*.wasm` 放进 `src/external/emscripten/<族>/` | 需逐包**许可登记**（`verify:licenses` 会看 `.LICENSE.md`）；需扩展 `verify:web-only` 的资产白名单；产物/包体增加 wasm 字节；须确认取的版本与 `cocos4` 期望的导出符号一致 |
| P2 运行时资产（不进包） | 沿用 `loadRemote`/P2 模式，把 wasm 放示例资产目录，构建期不接线 | 只解决 example 取证，不解决 `verify:webgpu-plan` 这类**构建期**门禁；示例产物依赖外部 URL ⇒ 离线矩阵不可复现 |
| P3 本地从源码编 | 用 `@cocos/box2d` 包内 `Makefile` + emscripten 工具链自编 | 引入 emscripten SDK 依赖，产物与官方发行版不逐字节可比 ⇒ 违反「抽取逐字节」的可复核性，不建议 |
| P4 按 D8 口径结案 | 记「代码回归 verified + 选择器可达 + **降级路径可测**」为部分通过，验收报告显著标注 | 零成本；LV12-14/16 的 example 格**永久不到位**，需 owner 认这个不完整 |

**降级路径可测**这一半本文有实测支撑：每个 `instantiated.ts` 都有 `asm.js` 兜底分支（见 §2.1 行号），
即资产缺失时引擎走的是「可判定」的第二分支而非崩溃——但 Air 侧当前**没有**任何用例钉住这条兜底分支（待办，不属 owner 决策）。

## 4. 建议口径（供 owner 一句话批复）

1. **physics（LV12-14 的 wasm 变体、LV12-16 的 bullet/physx）**：按计划书自带默认 **D8** 结案 = 「代码回归 + 选择器可达 + 降级路径可测」部分通过，验收报告显著标注，不阻塞 V1.2 Gate；
   同时把计划书 **D3 的原文前提改正**为「已安装的 `@cocos/box2d@1.0.2` 无 wasm，需 P1 外部来源」。
2. **同族一并**：D2（spine wasm）、D10（webgpu glslang/twgsl）与 meshopt 的**资产不存在**是同一事实的不同面，建议一次批复同一口径，避免逐条重复取证讨论。
3. 若 owner 要 P1（真引入 wasm），则这是一次**发行物扩面**决策：需要许可登记 + `verify:licenses`/`verify:web-only`/bundle 预算三处门禁同步改，并触发 36 条矩阵记录与 V1.1 证据链全量重采。

## 5. 本文的命令留痕

```bash
# 逐字节镜像核对（实测输出：{"files":11,"same":11,"diff":[]}）
node -e "const fs=require('fs'),c=require('crypto'),p=require('path');
const up='E:/AIProMax/github/cocos4/external',air='E:/AIProMax/github/cocosair.js/src/external';
const h=f=>c.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0,16);
const walk=(d,b)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p.join(d,e.name),b):[p.join(d,e.name).slice(b.length+1)]);
const fl=walk(up,up); let same=0, diff=[];
for (const f of fl) { if (h(p.join(air,f))===h(p.join(up,f))) same++; else diff.push(f); }
console.log(JSON.stringify({files:fl.length,same,diff}));"
```

日志与快照：`E:/AIProMax/cocosair-scratch/pg-probe/`（本轮 r44 目录）。

## §结案（r46，2026-09-24，owner-decisions #10=(a)、#9 并入）

Owner 批复按计划书自带默认 **D8** 结案：box2d-wasm / bullet / physx（及同因的 spine-wasm、webgpu glslang/twgsl、meshopt）
维持「代码回归 + 选择器可达 + 降级路径可测」= **部分通过、显著标注、不阻塞 Gate**；从官方 npm/CDN 引入 wasm 资产的 (b) 路线**不执行**。
计划书 D3 行「来源 = @cocos/box2d 包内资产」的前提（`@cocos/box2d@1.0.2` 包内 `.wasm` 计数为 0）已由本文 §2 实测评证为假，
更正留痕见 `ai/` 计划书 §15 D3 行 r46 注。asm.js 兜底分支已由 `test/smoke/smoke-32-wasm-fallback.test.ts`（r45d，6 用例）钉住；
A6 解禁触发器（`verify:wasm-backends`）保持有效。
