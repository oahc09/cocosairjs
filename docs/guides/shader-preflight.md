# 独立 Shader 预检

`cocosair.js/shader-preflight` 是可选、CPU-only 的 Effect JSON 检查入口，不导入主引擎，不注册资源，也不需要 DOM、WebGL 或 Shader 翻译 WASM。它复用运行时的 Effect 归一化/内容签名、输出声明读取和现有窄范围布局预检。

## API 与状态

```ts
import { preflightEffect, preflightEffects } from 'cocosair.js/shader-preflight';

const report = preflightEffect(compiledEffectJson);
// For a collection, indices identify the exact supplied JSON objects.
const batch = preflightEffects([firstEffectJson, secondEffectJson], [
    { effectIndex: 0, technique: 0 },
    { effectIndex: 1, technique: 0 },
]);
```

输入是编译后的普通 JSON，不是 live EffectAsset、函数、循环引用或带 getter 的对象。缺省资源数组按运行时合同补空，显式 null/错误类型拒绝；输入不会被修改。报告带 `analysisScope: 'compiled-json-identity-and-bounded-layout'` 和固定 `gpuValidated: false`。

- `passed`：本工具能检查的已声明范围通过。它不证明完整 GLSL 语法、类型、值语义、链接或最终画面正确。
- `failed`：发现确定错误，例如注册 hash/program 碰撞、非法引用、缺 stage、ESSL 300 使用 gl_FragColor、明确的重复输出 location、可证明的布局不匹配。
- `unknown`：条件宏、include、运行时 builtin descriptor 绑定或超出窄范围的资源需要编译器/设备进一步判定。不能把它计入 Agent Gate 成功，也不能当成确定的源码错误。

诊断有稳定的 code、effect、shader、JSON path，并在能定位时给出 target/stage、从 1 开始的 line/column。输出是结构化诊断，不是驱动错误日志的替代品；GPU 编译仍使用引擎原有带编号源码的错误。

## 身份与引用

自动 hash 来自运行时同一内容签名；相同显式 hash 对应不同源码/资源布局时拒绝。当前 ProgramLib 仍使用全局 program 名称，因此不同源码必须使用不同 program 名称，工具不会自动改名，也不会宣称同名 Shader 已能安全共存。

不同 Effect 可以有相同展示名称，但集合中的名字引用必须唯一；歧义时使用 `effectIndex`。显式 index 无效时不会退回 effectName。这里的 index 是**离线工具关联字段**，不是 Material 新增参数：业务加载后仍应把选定的真实对象传给 `Material.initialize({ effectAsset })`。不同源码若同时使用同一个全局 program 名，即使 Effect 对象明确，仍会被预检拒绝。

布局检查只覆盖现有 unconditional vec4/mat4 UBO 与 scalar sampler2D 合同。内建资源只有名称、需从运行时注册表补绑定时保留 unknown；不会将缺少外部上下文误报为确定绑定冲突。本工具不实现新的 Shader DSL、宏编译器、GLSL lowering 或预编译 GPU 二进制。

## CLI

安装包含此入口的新包后：

```bash
npx cocosair-shader-preflight effect.json --out=preflight-report.json
npx cocosair-shader-preflight collection.json --collection --out=collection-report.json
```

collection.json 使用 `{ "effects": [...], "references": [{ "effectIndex": 0 }] }`。可用 `-` 从 stdin 读取；报告路径必须是新文件。退出码分别为 0 passed、1 failed、2 unknown。先检查退出码和 status，再决定下一步，不能仅凭报告文件存在判定成功。

源码仓库可以独立构建，不重建主引擎、不增加 AIR_BUILD_NUMBER：

```bash
node tools/build/shader-preflight.cjs
node build/shader-preflight-cli.cjs effect.json --out=preflight-report.json
node --test tools/verify/shader-preflight.test.cjs
```

构建也支持 `--out=output/new-preflight`，输出 ESM、独立 `.d.ts`、CJS CLI 和输入/输出哈希收据。`prepack` 会生成并收纳对应 npm 文件。部署普通应用不需要这些文件。

## 验证边界

CPU 回归覆盖缺数组、hash/名称碰撞、引用优先级、行号、unknown、非 JSON 输入，以及按原生启动转换装配的全部 22 个内建 Effect。内建宏保留 unknown，不追求把它们全部刷成 passed。

`node tools/verify/shader-preflight-package.cjs --out=output/new-preflight-package` 会生成可选入口并复制到 `build/npm/`，用 `npm pack --ignore-scripts` 打真实 tarball，再离线安装验证公共子入口、CLI 和无 lib.dom 的 TypeScript 消费；它需要既有主引擎发布副本，但不重写或认证这些副本。写入范围包括可选构建产物及指定新输出目录。静态预检和安装通过不等于引擎浏览器渲染或完整发布验收。

`node tools/verify/shader-preflight-browser.cjs --bundle=build/cocosair.module.js --out=output/new-preflight-browser` 对当前独立构建收据与源码绑定 SDK 做 Chromium WebGL2 定向对照：预检后的源码经原生 GFX 编译/绘制，验证结构体按值传递、提前 return 与两个 MRT 输出。它保留精确像素和实际提交源码，不修改静态报告的 gpuValidated，也不覆盖所有 GLSL 或其他后端。需要可解析的 Playwright 与对应浏览器。
