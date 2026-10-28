# Box3D：本地接管、当前进展与剩余闭环

## 最新补充：EX02 本地可执行验收入口（2026-10-28 UTC）

本节覆盖原 EX02 保龄球范围，优先于下方 2026-10-26 历史状态；不重判其余 C20/G0–G8 全项目任务。远端基线先核对 `54c4d8e4eba373ef20698857478e967954696018` 及本节随后提交，工作分支仍是 `feat/box3d-rebuild-20261022`。启动前 fetch/read-back 实际远端，不覆盖未知提交或本地修改；本地接手写入须与云端交接唯一 writer。

### 现在可以直接做什么

- 源码已实现：十个 compound 瓶、球、平台 target、COM、三档质量、冲量、计分、串行 Start/Stop/Close、两阶段公开释放。此次没有因缺 SDK 而重写生命周期。
- 工具已实现：`tools/verify/box3d/compound-bowling/browser-lifecycle.cjs` 真实浏览器采集器，以及 `lifecycle-evidence.cjs` 拒绝式判定器。它们不安装、不构建、不替换 SDK、不发布 canonical evidence；只接受 loopback Gallery URL、新输出目录、显式 runtime SHA256/build number。
- 已真实通过：官方 npm 源依赖恢复，esbuild 0.28.2 原 main.ts 转换与 HTTP 200 一致性，35 项 CPU 检查（原 29 + 新 6 项判定/参数测试），当前固定源码库存校验（130 files /111 core files）。这些均不是物理通过。
- 实际运行状态：Chromium/WebGL2/软件渲染器可用；正向生命周期 **NOT_RUN**。新 runner 在真实 HTTP/Chromium 下遇 identity 503 后正确失败并留证。历史失败和本轮两个独立负向 attempt 均保留，见 [runner 负向证据](../reports/artifacts/ex02-runner-negative-20261028/)。第一 attempt 后增加了严格 20 轮序列判定、当前源码 identity 比对和中性 Gallery 返回，第二 attempt 绑定最终工具哈希。
- 最小环境阻塞：本环境无 SDK235 二进制、无 Emscripten；Google 官方下载被代理 403。没有 SDK235 可复用，证据 tar.gz 不是 SDK。依赖安装已恢复，无需继续修 npm 或开放 npm 镜像。

### 当前保存环境复核（2026-10-28 14:57 UTC）

核验前本地/远端均为 `b3f942fbde0065610127ff35ac1ea6fd166dd14c`，feature工作区干净，无未知新修改。本轮仅提交状态文档及非敏感只读核验记录，不改功能、重建、下载、部署或再次运行缺SDK负向截图。

- **本任务实际观察：** hostname=`37db1441dfc2`，cwd/仓库=`/workspace/cocosairjs`。`/workspace/box3d-ex02-acceptance`、其emsdk克隆/任务目录CMake与Ninja包、dependency-followup、两次runner-negative目录、node_modules、普通build均在。4个选定临时文件与已提交原件字节一致；三批原证据共64项hash全匹配（13+31+20）。esbuild0.28.2可执行文件hash与此前修复后记录一致，普通JS/DTS也与本任务最初记录一致。此处是文件核验，不是重跑原测试。
- **仍缺但不是新丢失：** 任务目录的Emscripten compiler、build里的Box3D ST WASM/distribution receipt，以及本地ST output目录仍不存在于明确检查路径。SDK235二进制自本任务开始即未找到；原403失败日志仍在且与提交原件一致。现有证据压缩包不是SDK，普通build不能代替BOX3D_RUNTIME，counter仍235。本轮不外推“全磁盘不存在任何SDK”。
- **不能确认的部分：** 本任务前几轮未记录hostname，无法判定本任务主机/执行器是否更换。所查文件保留不等于平台从未恢复/迁移；缺少平台事件日志，不能确认“还原”的原因或过程。此前命令恢复可执行不代表知道额度余额。
- **父任务独立工作区（父任务提供的实测，不是本任务跨环境读取）：** Oct27 hostname `8a8701d643f0`，现在 `b8f4588b9ba0`；同一cwd `/workspace/scratch/62d43a81bbde` 下 `box3d-recovery-20261027T0928` 缺失，主要剩Oct3–11老文件。它支持父工作区主机标识变化/目录缺失，不能证明这里也重置，不能把两个工作区当共享路径。

[非敏感核验JSON](../reports/artifacts/ex02-environment-check-20261028.json)保留所查路径、文件hash、对照结果和不确定项；[STATUS](../STATUS.md)同步当前状态。没有读取凭据或受限路径。公开EX02有限采集仍可在取得合格SDK后启动；**完整计数采集/API、全量旧代访问审计、真实释放等待中途Close**三项缺口继续保留，具体分类在下方审计表，不能因文件还在就提升验收。

### 本地准备与新 SDK 身份（Bash，仓库根目录）

先检查 `AGENTS.md`、`git status --short --branch`、`git remote -v`、`git rev-parse HEAD`。执行 `git fetch origin feat/box3d-rebuild-20261022` 后读取 `git show FETCH_HEAD:tools/build/build-number.json`，与本地计数核对。最后已知功能分支计数 235；新构建必须消费新的实际编号，不能把新字节称为 SDK235，也不能覆盖其他构建者的新编号。不要并行运行两套构建。

依赖恢复命令已实际验证；host 替换仅对本次命令生效，保留原锁文件版本/SRI，不改网络配置：

```sh
npm ci --ignore-scripts --no-audit --no-fund \
  --registry=https://registry.npmjs.org/ \
  --replace-registry-host=registry.npmmirror.com \
  --cache "$PWD/output/ex02-npm-cache" --fetch-retries=0 --fetch-timeout=30000 --maxsockets=4
npm rebuild esbuild --offline --cache "$PWD/output/ex02-npm-cache"
npm ls --all
node --test examples/box3d-compound-bowling/tests/*.test.mjs \
  examples/box3d-compound-bowling/tests/*.test.cjs \
  tools/verify/box3d/compound-bowling/*.test.cjs
```

记录 `node --version`/`npm --version`。本轮依赖实际使用 Node24.19.0/npm11.9.0，历史 SDK235 使用 Node24.22.1；这不证明新 runtime 构建已经通过。`--ignore-scripts` 只对 esbuild 单独执行了 rebuild，不是所有依赖脚本资格。

如本地已有完整、可信 SDK，先验实际库存及来源，再使用后面的 `BOX3D_RUNTIME` 路径；不可只因目录名含235就信任。没有时，使用仓库**现有**工具链重建：

- 固定 core `efca0c184d40fd6a82016983f1601c4d23965867`；binding-base `5d5a3af049cccd9948b2b55bac4342414af0ef64`（参考，不是混入旧 WASM）。
- `tools/physics/box3d/versions.lock.json`、`patches/lock.json`、`owned-files.json`、ABI schema 与实际 checkout 一并冻结。当前 schema SHA256 `8af84ffb85ce311e9693d378c70ca3c788896b8aeee228700bbddd61c0ca8a04`；patch chain `fce7869b3888ff9bfd417095e70ce72591893b2c3add1802e1a5bc32ca918bfe`。
- 官方 Emscripten 6.0.2；emsdk 锁定 commit `ca38f487f28b7c3c16f8f70cd0e012099ac4b7e2`；Emscripten commit `7a2d97d627ff4945eae28847ce0387ac52b92c09`；release `004876f1984e18a9eb0736c5ca417ac86d386fb8`。CMake4.4.4/Ninja1.13.2，使用任务目录安装/已有 shell-scoped 工具链，不改全局。
- 历史 SDK235 producer `a00306f391c595e292bbcaedd0f757bc99ca4ead`；库存25 files /43,837,664B，inventory SHA256 `e293c38f7c0c32460346993e337755698add63b4874d6686e581cc03ba00a7fc`。此值仅标识原235库存，不是新构建必须伪造的 hash。相对该 producer，目前生产 src/native/vendor 无差异；工具/元数据有差异，仍必须用当前实际 source SHA 记录新构建。

仅在本地工具链确已可用时执行以下起点。`RUN_ID` 必须换成不存在的新目录名。保留完整 stdout/stderr、exit、输入前后 hash、工具版本、构建 receipt、最终库存。命令是交接入口，**本环境没有执行其 ST/ESM/DTS 部分**；不等于 SDK235 的完整7项DTS gate重放或完整产品资格。设置合理时间/内存限额并按原 shutdown 合同记录后代退出；普通 shell exit0 不能冒充 ECHILD。

```sh
set -euo pipefail
# 在当前 shell 激活既有受控 emsdk；不要在此环境重试被拒下载。
# source /absolute/path/to/official-emsdk/emsdk_env.sh
emcc --version
cmake --version
ninja --version
export RUN_ID=local-ex02-attempt1
export BOX3D_ST_OUT="$PWD/tools/physics/box3d/output/$RUN_ID"
export BOX3D_SDK_OUT="$PWD/output/$RUN_ID-sdk"
mkdir -p "output/$RUN_ID-evidence"
git rev-parse HEAD | tee "output/$RUN_ID-evidence/source-sha.txt"
node tools/physics/box3d/verify-sources.mjs
node tools/physics/box3d/build-ready.mjs --out "$BOX3D_ST_OUT" \
  2>&1 | tee "output/$RUN_ID-evidence/st.log"
export AIR_FEATURES='air,base,gfx-webgl2,gfx-webgpu,gfx-empty,3d,animation,skeletal-animation,primitive,tween,custom-pipeline,legacy-pipeline,profiler,video,webview,2d,physics-2d-framework,particle-2d,tiled-map,ui,spine-3.8,spine-4.2,dragon-bones,physics-2d-box2d,physics-builtin,physics-cannon,custom-pipeline-post-process,physics-box3d'
AIR_OUT_DIR="$BOX3D_SDK_OUT" AIR_BOX3D_ST_BUILD_DIR="$BOX3D_ST_OUT" \
  AIR_BOX3D_PROVENANCE_ROOT="$PWD" \
  node --max-old-space-size=4096 tools/build/build.cjs --format esm \
  2>&1 | tee "output/$RUN_ID-evidence/esm.log"
# build-dts 不服从 AIR_OUT_DIR，写本 checkout 的 build/；先保留那里已有产物。
node --max-old-space-size=2048 tools/build/build-dts.cjs \
  2>&1 | tee "output/$RUN_ID-evidence/dts.log"
node tools/build/dts-inputs.test.cjs
node tools/build/dts-external-types.test.cjs
node tools/build/dts-symbols.test.cjs
node tools/verify/box3d/compound-bowling/check-types.cjs --dts "$PWD/build/cocosair.module.d.ts"
cp build/cocosair.module.d.ts build/cocosair.legacy.d.ts "$BOX3D_SDK_OUT/"
```

DTS 产物存在不代表成功；检查原始 emit diagnostics，非零退出/源码诊断立即停止，不以 finally 恢复的文件替换通过。历史 SDK235 7 gates 中的 app/mesh/terrain strict consumer 配置在历史临时 supervision 目录，不能假设当前存在；完整 SDK 资格仍需恢复相应消费者及原门禁。上面是 EX02 所需的现有直接类型检查，不冒称全部7项。

ST `consumer-ready.json` 必须为 `READY_FOR_LIMITED_CONSUMER_VERIFICATION`，且新 manifest/audit/receipt 和当前输入一致；不是 formal acceptance。记录新 ESM 导出的 `AIR_BUILD_NUMBER`（浏览器 export 将再次核验）、runtime JS SHA256、五个 ST transport 文件及 DTS 的 hash/字节数。选定完整运行目录应含 `cocosair.module.js` 和 `physics/box3d/st/{manifest.json,box3d-st.mjs,box3d-st.wasm,facade.mjs,distribution-receipt.json}`。runtime-route 会检查 manifest/receipt identity 及资产 hash，不能用缺 WASM 的普通 build/ 替代。

### 启动与采集

服务终端（Gallery dev server 保留既有 watcher 行为；冻结后不要改 source/SDK）：

```sh
BOX3D_RUNTIME=/absolute/path/to/new-qualified-sdk \
  node tools/dev/dev-server.cjs --example box3d-compound-bowling --port 7474
```

另一终端，指定已安装的 Playwright（可通过 NODE_PATH 指向既有 tooling，不自动下载浏览器）。`--expect-runtime-sha256` 必须填从选定 SDK 文件独立计算并留档的 hash，不能填零或为了匹配响应临时改值；build 填该 SDK 实际构建号。下面 shell 使用 Node 计算选定文件 hash；SDK_BUILD_NUMBER 仍须从真实构建身份取得，不能默认236。

```sh
export BOX3D_RUNTIME=/absolute/path/to/new-qualified-sdk
export SDK_BUILD_NUMBER=实际新构建号
export SDK_RUNTIME_SHA256="$(node -e 'const fs=require("fs"),c=require("crypto"); process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.env.BOX3D_RUNTIME+"/cocosair.module.js")).digest("hex"))')"
mkdir -p output
node tools/verify/box3d/compound-bowling/browser-lifecycle.cjs \
  --url=http://127.0.0.1:7474/gallery.html \
  --out=output/ex02-browser-new-attempt1 \
  --expect-runtime-sha256="$SDK_RUNTIME_SHA256" --expect-build="$SDK_BUILD_NUMBER"
# 如 tooling 需要，追加 --executable=/absolute/path/to/already-installed/chromium
```

输出目录必须不存在；参数错误 exit2，执行失败 exit1。完整有限观察 exit0 且 `report.json.status=LIMITED_OBSERVED_LIFECYCLE`，**永不自动给整体 PASS**。每轮导出由页面原 Export 按钮真实下载，另存 screenshot、console、HTTP、identity、inputs 与 SHA256 库存。没有 mock SDK、私有 world/native 调用、释放延时替身或 baseline 重置。

runner 在当前 Gallery iframe 中使用同一 public createStepClock，动作/断言暂停 native pacer 后显式推进；不在 app 之外创建物理 world。它执行：Start→中心冲量后真实 native ball motion→Stop→后续 clock frames 旧历史不变→Start 新代→20 次实际 release/rebuild（必须21个连续有原生观察的快照）→同 stack DOM Start/Close 竞争→terminal Close→clock.end→回到中性 Gallery。竞争测试是 reset 已准入、release 尚在 Promise 队列时的真实 DOM 控件调用，**不冒称可信鼠标连点或 await release 中途延时竞态**；该更窄中途场景仍未覆盖。可信指针快速连点与真实 fault-then-Close 也仍未验收；原CPU竞争测试不能替代这些浏览器结果。

### 通过条件与真正剩余项

| 项目                              | 实现 / 工具                                                                                                | 当前实际验收                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stop→Start 新代、20轮真实释放重建 | 功能已实现；runner 校验12个活动 actor/10瓶身份、clock、两阶段receipt和owned资产0                           | 正向 native/browser NOT_RUN，缺 SDK                                                                                                                |
| reset 准入队列中 Close            | 功能及runner已实现；校验不得新 mount、4个阶段receipt、1个终态receipt                                       | 正向 NOT_RUN；更窄的释放 await 中途 Close 不被此方法证明                                                                                           |
| 旧 generation                     | guard 已有；runner 对退休代 frames/clocks/requests/geometry/score 做不变性比较，拒绝 fault                 | 正向 NOT_RUN；全量 native 读写追踪缺口仍 NOT_RUN                                                                                                   |
| 两阶段资源恢复                    | receipt RESTORED、owned valid0、destroyErrors空均强断言                                                    | EX02没有逐阶段原生计数导出；已有backend资格诊断但非稳定公开IPhysicsWorld接口。完整计数还含原生API缺口，不能把receipt等同零增长（详见下方三项复核） |
| 最终 Close                        | 校验公开 moduleRelease VERIFIED、完整 schema/counter、同module terminal=baseline，cleanup/pending/errors空 | 正向 NOT_RUN；不是全 malloc/GC/所有handle资格                                                                                                      |
| Gallery 返回与画面                | 真实入口点击/PNG采集/返回中性Gallery已接线                                                                 | HTML导航和缺SDK负向已实测；原生画面仍NOT_RUN，PNG仍需人工review                                                                                    |
| 正向runner自身                    | CPU拒绝测试6项，真实缺runtime负向通过（collector本身exit1）                                                | 未用真SDK贯通，不能声称采集器的后续分支已浏览器资格                                                                                                |

每轮缺计数、完整 stale native access census、截图review、物理浏览器进程树闭合目前明确留在report.boundaries，缺任一都不能提升成完整 lifecycle/leak PASS。35项CPU包含人造策略输入，只验证拒绝逻辑。三档质量、COM正确性、独立中心/偏心冲量、计分物理效果、static baked compound及C04/C06–C12/C18不由本runner代替；保留原矩阵，不扩大本轮去实现全引擎。

下一步最小阻塞：在用户本地提供实际合格 runtime，或让管理员允许 `storage.googleapis.com:443` 官方 `/webassembly/emscripten-releases-builds/` 下载以重建；本轮不再请求该域名、不换镜像、不改网络安全设置。源码/工具/文档可先取走；先运行有限正向runner，保留所有失败，再针对真实失败修复。完整资源基线与全量访问证明是随后明确的证据/功能工作，不能让网络解锁自动变成整体完成。

### 三项覆盖缺口复核（只读源码审计，不是新运行证据）

审计基线：`cb129643335da622fbbd98d2467490ec28b1273d`，已重新核验远端及干净工作区。本轮不再运行缺 runtime 的负向截图、不下载 SDK、不新增延时/拦截钩子、不改生产代码或现有判定。下述结论来自实际源码与已有资格工具的接口合同；正向 SDK 结果仍不存在。

| 要求 / 层级                                                                             | 现有能力和实现位置                                                                                                      | 准确分类                                            | 本轮结论 / 下一步                                                                                                                    |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 原公开流程：Stop/Start、20次重建、两阶段receipt、owned资产失效、退休历史冻结、排队Close | EX02功能与runner均已接线；35项CPU包含拒绝式检查                                                                         | **实现/采集已接线，正向尚未运行**                   | 取得合格SDK后运行已有runner；未因此取得全量计数或访问证明                                                                            |
| 每轮可观测原生计数子集                                                                  | 后端已有 `getNativeCounts()`、`getNativeMemoryDiagnostics()`、`getStaticMeshResourceDiagnostics()`；C20已有受控consumer | **原生子集已实现；EX02采集缺失；稳定公开入口缺口**  | 不是“底层没计数”。直接取后端扩展需明确资格profile/接口边界；当前公开EX02路线未接，不偷偷绕过源合同                                   |
| 每轮完整原生资源/所有handle/malloc/GPU总量                                              | 世界计数、账本和终态module登记项均不是完整census；receipt显式GPU不可测                                                  | **原生/平台API及度量范围缺口**                      | SDK到位也不会自动补齐；必须先界定可证明范围及安全只读接口，不能以0资产或RESTORED充数                                                 |
| 退休代历史冻结与拒绝旧身份                                                              | 已有generation/alive guard、内部source撤销和runner历史比较                                                              | **实现/有限采集已接线，正向尚未运行**               | SDK到位可测此有限性质；不能外推“从未发生任何旧代native read”                                                                         |
| 全量旧代native读写审计                                                                  | 无公开全量访问事件/序列/计数；内部WeakMap不是事件流，读取可无外部副作用                                                 | **访问审计API缺口，同时缺相应采集能力**             | 单靠继续导出相同历史永远无法证明；需独立明确审计范围/入口并资格，不能补一个JS计数冒充                                                |
| Close发生在真实release等待尚未完成的区间                                                | release Promise实现存在；只有结束receipt和session状态通知；EX02未导出pending phase                                      | **可观测控制点与采集能力缺口；自然可达性待SDK实测** | 不能把目前同stack排队Close升级为此项；先实测是否有天然task-yield窗口，再决定是否能用正常UI输入采集。若无窗口，须另行设计合规测试合同 |

**逐项源码依据与排除方案：**

1. **计数：** [world.ts](../../../../src/air/physics/box3d/world.ts) 1253–1292 行已实现复制式后端读回。`getNativeCounts` 返回 bodies/shapes/contacts/joints 和 bigint liveBytes；内存诊断要求 idle ready safe point，绑定实际 world identity。它不是完整进程malloc或GPU计数，也不能在release任意半途读取。[C20 fixture合同](../../../../tools/physics/box3d/c20-app-scene-cycles/v2/README.md) 的“Exact measurement boundary”已明确它是 **actual backend diagnostic，不是稳定IPhysicsWorld接口**；fixture保留bigint十进制字符串并与首次pre-scene基线严格比较。C20 v5已有内存观察器，但安全点由该fixture自身受控记录，不是可直接装到任何App的公开hook。

   [IPhysicsWorld](../../../../src/cocos/physics/spec/i-physics-world.ts) 无这些扩展方法；[AirApp](../../../../src/air/app.ts) 48–54、139–151行只提供diagnostics/session及release/close结果。[AirPhysicsSceneReleaseResult](../../../../src/air/physics/preparation.ts) 61–64行只有 backend/status；公开moduleRelease只出现在终态preparation收据，并不提供每轮可调用的原生模块句柄。`AirDiagnostics.snapshot()`是有界错误/警告日志，不是内存快照；`session.ownedCount`只是cleanup callback账本，不能替代native资源数。

   当前EX02的 `releaseOwned` 在同一异步操作内依次完成第1次release→请求asset.destroy→第2次release，Start随后立即mount。外部采集器在await结束后只能看到最终导出，无法无侵入地插入两阶段之间的safe-point读回。把每轮改成Stop→读数→Start会形成另一条操作路线，不能偷偷替代现有Start/reset验收。把内部getter藏进新helper以绕过EX02的公开API源检查也不接受。本轮保留现有强断言，没有把未知数改为0、warmup、重置baseline或放宽字节比较。

2. **旧代访问：** [main.ts](../../../../examples/box3d-compound-bowling/src/main.ts) 130–157行在idle操作和motion读前检查generation/alive；before-step另有token guard，release将actor标死并dispose handle。内部 [body-motion-source.ts](../../../../src/air/physics/box3d/body-motion-source.ts) 33–48行通过WeakMap撤销source并在错误world/source下拒绝；[公开controls](../../../../src/air/box3d-controls.ts) `readBox3DBodyMotion`描述已销毁/陈旧owner拒绝。这证明有防护实现，不等于记录了每一次native调用。现有导出完全不变也与“发生过无副作用读取”相容。包裹一个motion helper最多数到该helper，不能覆盖collider、target、binding、engine内部的所有路径；代理WASM exports或替换facade会改变候选身份和测量范围。因此本轮不新增“全量trace已实现”的假证据。真实SDK后可以取得历史不变、stale rejection等有限证据，不能凭这些提升全量访问结论。

3. **释放等待中Close：** [app.ts](../../../../src/air/app.ts) 219–234行先安装共享release Promise，再在microtask中dispose scope/destroy scene/await cleanup；这是真实等待实现，但不是面向浏览器的“当前正在await”事件。`session.onChange`通知中的active/reason会在deactivate/dispose时同步发生；[session-scope.ts](../../../../src/air/session-scope.ts) 87–109行是在安装scope disposal Promise后notify，并未给出cleanup实际未完成的持久区间，更没有stage-1/stage-2 release边界。EX02的module-local app也未对采集器暴露该session。

   从通知中立即调用Close会变成新增的重入回调测试；插入session.own(async delay)、替换releaseScene Promise、调试断点、添加测试专用await或修改释放时序均会制造原来没有的窗口。本轮全部不做。普通浏览器输入是task，不能被假定能穿插进只含microtask的短释放链。真实SDK必须先显示自然异步窗口和真实输入发生在开始之后/receipt之前，才可判这项；若没有，应诚实记录本workload中未捕获，不能让排队Close的boolean代替pending区间证据。

**下一步边界：** 当前可立即交付的是现有runner、源码防护审计和上述准确能力表；本轮没有发现可在原公开EX02合同内无侵入补齐三项完整证明的安全捷径，所以没有为了提交制造新钩子或策略自测。35项CPU和两次缺SDK负向的原始记录仍仅属于上一轮明确范围，不在本轮重复或追溯改写。取得SDK后，先实际跑已接线的有限序列，并观察真实release行为；每轮完整计数和全量访问审计仍需要受支持的观测合同，而非只等待二进制。若另行选择已有C20后端资格读回，须明确它是新增的受限qualification profile，不把它混称普通公开EX02或全量census。

---

更新时间：2026-10-26 23:15（UTC+8）。这是执行交接，不是完成报告。

## 0. 一页结论

- 仓库：[oahc09/cocosairjs](https://github.com/oahc09/cocosairjs)，工作分支 `feat/box3d-rebuild-20261022`，不是展厅仓库，也不是 main。
- 本次交接的远端已核基线：`f7ff40c23ed4ab3f8cf119ec92289de6277c1024`。2026-10-26 23:09 已重新读取远端引用确认。今晚后续小修复可能继续推进分支；本地启动前必须 fetch 并核对最新提交，不强制 reset。
- 已实现并提交：Box3D 单线程接入的大量核心代码、Terrain/shared mesh、生命周期和事件修复、87 行原生内存诊断、SDK227 对应源码及验证报告、空 world 安全回收设计和 CPU 代际模型。
- **最关键未闭环项：C20 应用层同 app／同 world 的 100 次 scene 生命周期。SDK227 在第 1 轮释放后就因 bytes 未回初始基线而失败，0/100 qualified。不是还没跑，也不是已通过。**
- 新诊断三点已完整取得；释放后 world 账本净增 76,940 B，module 请求字节净增 76,160 B，bridge 净增 0。已能定位保留容量的类别，但不能据此宣布“泄漏”或“无泄漏”。
- 修复方向：先解决四类对象 ID 的代际安全和溢出／故障处理，再做同 world 的空闲容量回收，接入 releaseScene 正确尾部；不改原验收比较、不 warmup、不重建 world 规避。
- **阶段 2 identity core 的 11 文件候选未提交，随临时环境变化丢失。它不是本地可取的代码。只能依据已提交设计重新实施、重新测试、产生新证据。**
- 其余原项目范围没有取消：35 tasks、91 父类别、9 examples、G0–G8；冻结矩阵 2,128 required cells / 186 execution definitions。不能以 C20 或有限回归代替整体完成。

## 1. 当前执行与写入责任

用户最新要求：今晚将可提交的 Box3D 小任务尽快修复提交，保证功能代码及时入库，同时准备本地接管并自行管理状态。

因此：

1. 云端今晚仅继续原 Box3D 分支上可独立审查的小批修复；不合 main、不强推、不发布、不创建新云任务或切环境。
2. 本地开始修改时，应明确切换唯一写入者。云端与本地不要同时修改同一功能/分支；建议本地从最新已核提交新建本地接管分支。
3. 本文记录的是上述基线时刻，不会把后续源码候选自动记为已测试。
4. 远端已经存在的功能修复和报告可以获取；原临时 SDK、raw 大包、工具链、未提交候选不能假定仍存在。
5. 后续可用提交必须带代码、配套测试和真实状态；只完成源码审查的独立资格候选可以提交保存，但必须标记 `NATIVE_NOT_RUN / NOT_INTEGRATED`，不得装入生产 SDK。

## 2. 已提交检查点

下表是定位锚点，不是所有提交的完整列表。完整历史以 Git 为准。

| 提交                                       | 内容                                               | 准确边界                                                   |
| ------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------- |
| `cd742f8000e8718f2bdfde0ce1eb9015271c1e28` | 不支持的 Terrain/Hull/RoundHull 事件注册原子性修复 | 不添加不支持的 geometry 配对；失败注册不遗留 listener/flag |
| `e5a7ddec9fa515a2fe17316dd3ab36538e48e23d` | SDK225 Terrain 有限公开运行回归及 build225         | 不是全部 Terrain/C19/Gate 完成                             |
| `4a21d78d95b3a7e09f3f6c1226cf0a56339cfea2` | C20 lowlevel v3 debug-cache 口径修正               | shapeHandles 是懒建 debug cache，不是所有 shape 总数       |
| `84ccd9292af6bea1eb525a50bfc857fe96154c4d` | lowlevel 100 轮可观测子集报告                      | 完整 global world/all-handle census 尚未资格               |
| `f1380eb96809c3a24e7f2ec024f4cdeebefb327e` | APP fixture v2：关节阈值设置移到 mount 后          | 原 baseline 和 100 轮条件不变                              |
| `9e91b0e5570ae0a14a53460beb0a4f4e9331bb0e` | APP 首轮 strict baseline 失败证据                  | 不隐去失败                                                 |
| `8d5fa3208ee2b02793ac50d86e31b5cd11fe860f` | 只读 memory diagnostics                            | 初版后续发现 tree scratch NULL 误判                        |
| `f3d7457c7b81283bc1af31a0b0a892aedc5f5760` | 精确库存门禁同步修复                               | 37 commands / 92 inputs / 84 units / 55 evidence           |
| `3048ffe289cd37e59a66de44472cd18108f05693` | capture 的真实 native producer root 绑定           | 不放宽原构建 gate，不重写编译证据路径                      |
| `117d6af86f96ff15e0d734745b47a8b0b19a9c5f` | tree ledger 合法 inactive scratch 修复             | SDK227 producer；只修六行 guard/描述，不改原账本公式       |
| `64d3a39884cb0816b34b9bdd89957318a3091be7` | SDK226 capture 失败报告                            | 旧 1/3 诊断失败不追溯改成通过                              |
| `a104f15f4ae2fc1f280fd5edfbadc14d5e709e12` | SDK227 构建链报告和 counter227                     | native/unit/WASM/ESM/DTS 有限通过，不是 C20 APP 通过       |
| `a14ce32567166b8b0c124ffaadfe0d92b8db0ee7` | SDK227 capture v2 runner                           | fixture 身份与 producer 身份分开                           |
| `65730a3adb4c8fc588c7aa2c4a412ba9f891dc7c` | SDK227 三点完整 capture 报告                       | strict 仍 FAIL、0 qualified                                |
| `f7ff40c23ed4ab3f8cf119ec92289de6277c1024` | 同 world 回收设计 + 代际 CPU 模型                  | 只有设计/模型；尚无生产 trim                               |

## 3. 先读哪些仓库文件

### 合同与完整范围

- `AGENTS.md`
- `ai/plans/box3d-v1.2-reference.md`
- `docs/physics/box3d/contracts/inventory-freeze-v1.md`
- `docs/physics/box3d/empty-world-trim-design.md`
- `tools/physics/box3d/empty-world-trim/generation-model.mjs`
- `tools/physics/box3d/empty-world-trim/generation-model.test.mjs`

### 最新关键报告（均在 `docs/physics/box3d/reports/`）

1. `c20-app-memory-diagnostics-sdk227-capture-20261026.md` 与 `.json`：最新三点实测及完整类别差分。
2. `sdk227-memory-tree-ledger-build-20261026.md` 与 `.json`：SDK227 新构建身份、真实 39/10 检查和 DTS。
3. `c20-app-memory-diagnostics-failures-20261026.md` 与 `.json`：旧 NOT_READY 和 SDK226 诊断失败。
4. `c20-app-strict-baseline-failures-20261026.md` 与 `.json`：原 APP v1/v2 失败背景。
5. `c20-lowlevel-observable-regression-20261026.md` 与 `.json`：100×50 低层可观测子集。
6. `sdk225-terrain-regression-20261026.md` 与 `.json`：Terrain 真实有限回归。
7. `sdk223-ex02-initial-observations-20261025.*`、`sdk223-ex03-channel-regression-20261025.*`、`sdk223-ex05-comparisons-lifecycle-20261025.*`、`sdk223-ex09-limited-route-2026-10-25.*`：已有示例的有限结果，不要重列为“无源码/未运行”。

报告是已提交的摘要及 hash 索引，不是 self-contained 原始证据归档。文中的旧工作区路径现在不可作为可下载输入。

## 4. 实际完成与当前失败

### 4.1 Terrain 与低层资源生命周期

Terrain 是 heightfield-cooked-static-triangle-mesh 路线，不是 native compressed heightfield。共享 cooking、查询、变换、启停、替换拒绝、资源释放已有实现及有限证据。

SDK225 公开 fixture：43 ray、3 sweep、1 committed query、41 drop samples、45 个固定 1/60 frame；首次接触后继续观察至第41步，正常 close，进程闭合、输入零漂移。它不代表完整 C19、移动真机或全部渲染验收。

C20 lowlevel v3：真实执行100 world ×50 body/50 shape，包含fixed joint、共享mesh与debug cache；每轮激活debug后handles 0→50，3456条lines，core/bridge回原基线。结论为 `OBSERVED_NATIVE_SUBSET_PASS`；完整 global world 与所有 handle census 不足，C20LOWLEVEL 仍 `NOT_QUALIFIED`。

### 4.2 SDK227 构建身份

- producer：`117d6af86f96ff15e0d734745b47a8b0b19a9c5f`
- upstream core：`efca0c184d40fd6a82016983f1601c4d23965867`
- 生产 patch chain：`4c9d057fe6d7403f6f2c7672c4a7abe38041d845942540a6b5c5abbc6f4bc45c`
- ABI schema SHA256：`3a1c552650979c205898c90c4d862483810b66dc5c875f155c80e92fb15618da`
- 内存诊断布局：87 rows /740 words。
- ST 精确库存：37 commands /92 producer inputs /84 compile units /55 evidence files；全部实际检查通过。
- 39项受控 native-unit 断言 +10项生产 WASM 检查实际通过，新增真正 step→tree rebuild→released 读取，不再只有step0。
- ST 98.286s、ESM227 79.350s、DTS227 63.148s；DTS 7/7。各阶段退出/后代闭包和输入零漂移有报告。
- SDK最终25 files /43,747,642 bytes；当时已实际产生，**当前临时副本缺失，不能当作现在可直接使用的包**。
- build counter 227已入库；本地新构建必须产生新身份/编号，不冒认旧227原字节。

### 4.3 SDK227 APP capture：诊断完整，验收失败

同 app、同 world，初始/nativeStep0、满载step7、释放step58，三点各87行全部通过诊断求和与身份校验。

| 计量范围                    |    初始 |    满载 |  释放后 | 释放−初始 |
| --------------------------- | ------: | ------: | ------: | --------: |
| world ledger                |  36,040 | 108,708 | 112,980 |   +76,940 |
| module core requested bytes | 167,320 | 239,624 | 243,480 |   +76,160 |
| world bridge bytes          |      48 |     224 |      48 |         0 |
| global bridge bytes         |      48 |     224 |      48 |         0 |
| excluded arena backing      | 131,072 | 131,072 | 131,072 |         0 |

world ledger净增分类：

| 分类          |   字节增量 |
| ------------- | ---------: |
| solverSet     |     38,656 |
| worldArray    |     16,512 |
| dynamicTree   |     12,348 |
| graph         |      7,104 |
| events        |      1,848 |
| ID free lists |        384 |
| hulls.map     |         88 |
| 合计          | **76,940** |

其中tree的1,932 B属于未实际分配backing的共同capacity估算，不能当malloc。module与world两个差值相差780 B，不得人为填平或未经证据归因。

其余事实：mesh cook/destroy 0/0→4/3→4/4；resources空→一项lease1/borrow3→空；释放后body/shape/contact/joint四live counts均0；双方trigger事件各1 enter/52 stay/1 exit。1 app、1正常close，58连续frames；1,884保护记录/1,868唯一路径零漂移；ECHILD且无后代，预算无违规。

**结论：原strict断言失败，首轮停止，0/100 qualified。三点诊断完整不等于生命周期验收通过；正常close不证明after-close所有资源归零。**

### 4.4 已修复的诊断问题

core在heuristic0时只分配leafCenters，leafBoxes/binIndices可合法NULL，但core ledger仍按shared rebuildCapacity计账。旧诊断误要求capacity>0必有非NULL指针，导致SDK226在step7/58拒绝返回。SDK227仅对六个inactive行使用专用检查，保留其余指针、sum、overflow、原子输出检查；元数据说明改为估算。这不是对原76,940 B严格失败的修复。

## 5. 环境变化、丢失范围及恢复原则

已核事实：运行机器标识发生变化；旧Box3D工作目录、恢复工具链、SDK224–227临时包和下一阶段候选在当前工作区不可见，较早目录仍在。未获得平台系统事件日志，**无法确认系统为何替换/恢复环境**。

已保住：远端f7ff及之前的源码、测试工具、设计、摘要报告、build counter。

未保住：

- 11文件stage2 identity未提交候选、其完整manifest和原日志；
- control/candidate各111 core staging；
- 临时SDK与完整raw大包、原工具链目录。

历史候选manifest `42c3dad95976b6a67212aa863d9cb105f4a9fc2e52ec77222da426fcec339613` 只是历史标识。**不能声称恢复了其原字节，也不能让新实现沿用旧PASS日志。**

今晚可重建并提交新候选；必须生成新manifest和测试记录。报告里旧原件hash继续作为历史索引保存，不代表文件仍可取得。所有重要代码应及时分批提交；大产物另用用户批准的持久归档，不能把“在临时目录里”当交付。

## 6. C20 修复的确定路线

### A. Identity基础：先不启用生产trim

对body/shape/joint/contact分别维护固定大小H（历史generation高水位）与F（新槽floor）。同slot在epoch内只递增；trim时F=H，随后所有fresh slot包括高index均从F起步，因此跨trim新身份大于旧历史。

- body/shape/joint为uint16，contact为uint32；必须checked unsigned、溢出前拒绝，不能wrap。
- 不用“每创建一个对象全局++”策略；不同slot可共用generation。
- 预检须在创建的第一次状态修改之前。joint拒绝不能先删除两body之间已有contact。
- 已对回调/缓存/外界暴露的候选ID，不得回滚其generation历史。
- contact现有signed中间量要修；内部contact耗尽必须明确fault，不得静默漏碰撞或把void Step后当成功。
- fault出口仍释放stack、等待tree task、解锁；不solve/翻event buffer/发布成功snapshot；保持可靠destroy/close。
- 该证明只适用于同一world lifetime，raw IDs不含world generation，不能顺带宣称跨world槽复用ABA安全。
- 固定identity metadata从world创建时就计账。历史候选拟36 B，必须实际native确认；它不是malloc额外请求。旧87行诊断不含这一项，生产集成需新分类/schema。

已提交CPU模型13项通过，有限穷举9,761状态/65,809边，并有3种错误seed反例。**它不是C/native/allocator/真实fault-unwind证明。**

### B. 同 world 空容器回收

保留world ID/generation、stepIndex、配置、callbacks和历史maxima。容量目标来自创建配置，不能反推76,940或拿高水位当新基线。

逐类恢复：solver-set空数组（保留0/1/2 reserved sets）、world arrays及paired fatAABBs、空树/graph、ID free lists、空hull map、events及其他未增长但可能持有容量的结构。必须真实释放/重建合格容器，不只改count/capacity/计量字段，也不能把代际状态藏到未计账目录。

H==MAX、world锁定、仍有对象/资源/任务/命令/引用等均须在修改前拒绝。allocator当前断言式失败不等于可恢复OOM事务，必须明确定义失败路径。

### C. 正确release接入与事件ACK

已核顺序：scope deactivate/pause → scope dispose微任务 → director摘persist/scene destroy/第一次deferredDestroy → await cleanup → releaseQueue flush → 第二次deferredDestroy → **新增受控hook** → receipt。

- 不放在scope disposer内部，不加dummy step。
- 正常release queue是paused，不能用assertSteppingAllowed误拒。
- event getters不是ACK，只看得到previous endbuffer；ACK需覆盖两个sensorEnd、两个contactEnd及move/begin/hit/joint残留。
- 静默退役旧scene，不给新scene补旧回调，不虚构exit；保持stepIndex和end-buffer角色。
- 非空persist world应 `SKIPPED_NONEMPTY`，不能删合法持久对象或让原本合法release一概失败；这也不证明剩余对象无泄漏。
- 真正eligible-empty但ACK/trim失败需在receipt可见，阻止假成功；close仍应能执行。
- 成功推进binding mutation revision，旧native snapshot capability失效；已复制的不可变JS事件不被修改。

### D. 原样重跑

新source→新patch chain/schema→新ST→新ESM/DTS→原same-app/world100scene fixture。保留原首次scene前baseline比较。新固定metadata可改变新实现的初始字节数，但不能重设已经开始的run基线，更不能改写旧SDK227的36040失败记录。

## 7. 丢失stage2候选的重建规格

下列是历史候选目标路径，不表示文件已存在于远端：

```text
tools/physics/box3d/patches/same-world-identity-v1.candidate.patch
tools/physics/box3d/patches/identity-step-status-v1.candidate.patch
tools/physics/box3d/empty-world-trim/identity/CMakeLists.txt
tools/physics/box3d/empty-world-trim/identity/README.md
tools/physics/box3d/empty-world-trim/identity/compare-ledgers.mjs
tools/physics/box3d/empty-world-trim/identity/native-contract.c
tools/physics/box3d/empty-world-trim/identity/patch-lock.json
tools/physics/box3d/empty-world-trim/identity/profile.json
tools/physics/box3d/empty-world-trim/identity/profile.mjs
tools/physics/box3d/empty-world-trim/identity/source-contract.test.mjs
tools/physics/box3d/empty-world-trim/identity/stage.mjs
```

使用既有patch-intake严格before/after hash、精确context、无fuzz；保留原三patch及顺序（SSE2 alignment、contact geometry epoch、checked hull cooking），不直接改vendor原件。独立资格profile先不激活生产locks/schema/SDK。

九个core变更点：physics_world.h的H/F与fault；id_pool.h只读peek；body.c/shape.c/joint.c前置检查及9joint入口NULL传播；contact.c unsigned与stickyfault；broad_phase.c公共stack清理；physics_world.c fault/Step出口/event getters/初始metadata账本；公开header只读fault查询。

独立bridge资格层必须让真实world_step在core fault后返回非OK；不能仅改core而原bridge仍返回OK。生产完整facade/backend fault-close尚需后续集成。

历史拟171项native断言，**从未编译执行**：body28、shape26、hull失败8、joint35、contact高index22、contactunsigned7、contactfault16、main9。重建时按真实测试组织更新精确计数，不为追求171而凑断言。

关键hull失败负控：fixture-only H/F=59，单位BoxHull有限scale1e8尝试checked惯量失败，确认实际进入fresh槽后归还free pool、floor/H仍59，再同槽sphere成功generation60。是否进入该数值分支必须实际运行确认。

**native资格要求Debug并核真实compile_commands无NDEBUG；BOX3D_VALIDATE=ON不能单独证明断言启用。** control与candidate同工具链分别构建，实际验证embedded metadata增量；不要复用旧日志或挂SDK227。

## 8. 原项目剩余范围，不止C20

| 范围             | 剩余工作                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| T00–03、T32      | 同步合同/决策/fixture/预算/当前实际结果；文档存在不等于关闭                                                    |
| T04–07           | ST、SIMD/CSP、loader/ABI/ownership、ID/heap/bulk-read完整矩阵                                                  |
| T08–13           | 已有world/body/基础与凸形状能力；补全部setter rollback、父变换/缩放、COM、销毁和指定几何验收                   |
| T14 / C16–20     | mesh/Terrain已有有限实测；static baked compound C18仍缺；完整资源/查询合同；C20APP修复及全局census             |
| T15 / C21–25     | 事件已有通道；补原要求contact geometry配对/snapshot/transient sensor/目标回调；不删除unsupported guard冒充支持 |
| T16              | 完整query/CCD/事件/生命周期矩阵；已有ray/primitive sweep不是从零；不自增任意hull sweep范围                     |
| T17–19           | P2P/Hinge/Fixed已有基础；T18/C35/C30EXT高级joint与revolute spring、公共合同/拒绝路径                           |
| T20/T33 examples | 已有EX01/02/03/05/09；缺EX04 joint-mechanisms、EX06 terrain-assets；已有项还需完整操作/重置/UI/证据            |
| T21–23/T34       | ST Node/browser完整回归、builtin/Cannon/2D共存、真实npm pack空消费者、文档、BIZ01–08                           |
| T24–26           | MT、character、正式recording/replay，EX07/EX08；EX09 action playback不能替代T26                                |
| T27–29           | 冻结设备性能P01–07、AG01–05独立验收                                                                            |
| T30–31           | 同一source/runtime全required矩阵、九示例、消费者、许可证、可访问证据闭环                                       |

当前示例有限证据：EX02 Firefox 2436 ticks，但20次reset/运动中Stop等未完整覆盖；EX03 channel有限回归，armed preset真人取消未覆盖；EX05对照有限；EX09三单333分仅D路线、formal0。不要把这几项重新称为“源码缺失”，也不能把有限操作升级成formal通过。

建议顺序：C20安全回收闭环 → static baked compound/contact geometry/advanced joints与EX04/06 → G5完整核心preview → G6–G8。**G5不是原项目全部结束。G5须同时满足EX01–06+09、BIZ01–08、完整ST矩阵、tarball consumers与核心文档，C20修复不等于G5自动通过。** 真Android/iOS/Safari、BIZ07人工首次使用必须真实设备/人员，不能用桌面viewport代替。

## 9. 本地接管第一轮步骤

1. 读取本地AGENTS，确认origin是指定仓库，检查 `git status --short`；保留已有修改，不 `reset --hard`、不强推。
2. fetch工作分支，查看与本交接基线f7ff的差异。今晚可能有后续小提交；以远端最新已核记录与用户本地改动合并决策为准。
3. 从确认的commit新建本地接管分支，记录source SHA。与云端确认唯一写入责任后再开始同模块修改。
4. 先运行已提交的纯CPU generation model及相关source controls；源码准入与native通过必须分列。
5. 依仓库locks安装/核对依赖。历史成功工具版本：Node22.16.0、Emscripten6.0.2、CMake4.4.4、Ninja1.13.2。它们是历史重现参考，不代表本机已具备；以锁文件和真实 `--version` 为准，不擅自全局改环境或安装不可信工具。
6. 不必为了开始代码开发先重建全部历史SDK。先把新独立identity源码/测试小批提交，再做其有界native资格；真正启用生产时才重建完整同版链。
7. 新OUT独立，不覆盖旧失败目录。记录命令、时间/内存/磁盘上限、stdout/stderr、exit、全部后代闭合、输入前后hash及产物hash。Windows采用能证明等价进程树闭合的方法，不伪造Linux ECHILD。
8. 生产build-ready默认ST；`--native`是另一种host诊断，不能替代生产WASM。当前gate37/92/84/55是SDK227事实，加入功能后需准确迁移所有引用，不能改为“至少”或跳过清单。
9. 生产构建保持现有默认27 features加physics-box3d共28，不做只剩物理的缩水SDK；ESM只构建一次，独立DTS源副本，7gates与strict consumers实际跑。
10. 编译器/产物/fixture/schema变化必须重新锁定；最终以同一套新source+ST+SDK完成实际100轮，历史有限证据只作背景。

## 10. 自主管理状态：不要靠聊天记忆

接管者在仓库中维护一个短状态入口（建议 `docs/physics/box3d/STATUS.md`）和结构化任务清单（建议同目录 `closure-tasks.json`）。若已有等价文件先复用，避免双重真相。此处是建议路径，不声称已经创建。

每项最少字段：`id, contractRefs, implementationStatus, validationStatus, sourceCommit, runtimeIdentity, evidencePaths, blocker, nextAction, owner, updatedAt`。

状态必须区分：

- `NOT_STARTED`：未开始；
- `SOURCE_ONLY`：源码/审查完成，实际native/runtime未跑；
- `VERIFIED_LIMITED`：明确范围的实际检查通过；
- `FAIL`：实际断言失败；
- `BLOCKED`：缺设备/输入/权限等；
- `DONE`：原合同要求全部完成且证据可取。

执行规则：

1. 同一核心链只维持一个主要IN_PROGRESS阶段；可并行只读审查或不冲突测试，不多写者争用。
2. 每个小单元代码+测试+状态成组提交，推送后读回远端SHA；不等长任务全部结束才保存。
3. 每个新运行独立attempt，不覆盖失败；修复可继续新attempt，但必须标明差异与新身份。
4. 检查失败先分类ENGINE / TEST-HARNESS / INFRA / MISSING-EVIDENCE，不把环境阻塞当功能通过，也不把模型证明当native通过。
5. 原断言/required matrix不得缩范围；不能用warmup、重置baseline、fixture特判、重建world或忽略输出制造PASS。
6. 行动结束前更新下一步和实际证据。若必须用户输入，给单一清楚阻塞；其他可独立工作继续。
7. 功能代码进入Git；大raw/SDK使用已授权持久归档，保存位置与hash；不可只记临时路径。未获归档许可时至少先提交可入库源码与精简报告，不上传到自选第三方。
8. 最终DONE要求所有原范围逐项可核；百分比不得由源码文件数或有限断言数推算。

## 11. 可直接给本地 Agent 的启动提示词

```text
接手 oahc09/cocosairjs 的 Box3D 完整接入与验收闭环。
先读取 AGENTS.md、本交接文档、ai/plans/box3d-v1.2-reference.md、
docs/physics/box3d/contracts/inventory-freeze-v1.md，以及最新reports。
交接已核基线是 feat/box3d-rebuild-20261022 @ f7ff40c23ed4ab3f8cf119ec92289de6277c1024，
但云端今晚仍可能提交小修复；先fetch/检查本地未提交改动和最新差异，明确唯一写入者，
不要reset或覆盖他人修改，不合main、不强推、不发布、不擅自换环境。

第一目标是原C20同app/world100scene严格基线，不改fixture、warmup或重建world。
SDK227三点诊断已完整，但释放ledger+76940、module+76160，strict FAIL、0/100 qualified。
empty-world-trim-design与generation-model已入库；stage2 identity 11文件候选未提交且丢失，
不得假装已恢复或沿用旧manifest/PASS。检查今晚是否已有新重建提交，再决定是否重建。

先实现四类H/F代际安全及溢出/内部contact fault/可close，保持独立非生产资格profile；
Debug真实native验证后再实现empty-world回收、双buffer ACK、releaseScene尾hook和新计量schema。
保留world身份/step，真实释放容量，metadata从初始即计账，旧raw ID不能复活。
新同版ST/ESM/DTS后原样跑100scene，补全global census；再完成原完整范围的其余任务。

自行维护仓库STATUS和任务清单，区分SOURCE_ONLY/VERIFIED_LIMITED/FAIL/BLOCKED/DONE，
每个小修复带测试及时commit/push并核远端，保存新attempt的原始证据，不覆盖旧失败。
缺设备/人工验收如实BLOCKED，不停掉其他可做任务，不把未执行前置写成事实。
最终报告列完成项、剩余项、提交SHA、测试范围、失败和证据位置。
```

---

本交接不含SDK二进制、完整raw包或丢失的stage2候选。所有“历史通过”均限定于当时报告所绑定的源码/运行范围；本地重建后的新版本须重新验证。
