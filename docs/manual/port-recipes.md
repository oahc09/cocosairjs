# 六类组合配方（Port Recipes）

PG-33 将原生场景、输入、资源和可选服务组合成可以逐步运行的应用配方。Lead 已收回第六类的实施并完成共同入口集成；Orca Worker 当前仅作只读审查。历史草稿、旧配方失败与旧浏览器结果保留，不用它们替代当前测量。

当前证据：[S19 仓库预览](../evidence/port-recipes/pg33-six-s19-workspace-same-contract.json)与[S19 实际离线安装包](../evidence/port-recipes/pg33-six-s19-installed-same-origin.json)。每条路径三浏览器共 18 个配方行，17 行 PASS、1 行 WebKit FPS NOT_RUN，scopePassed=false、subset=true、completed=false，collector 按未完成范围返回 1。六类已经统一运行和安装消费；PG-33 整项仍为 NOT_RUN，因为 WebKit 没有取得指针锁内可信移动。两个路径均零 pageerror，安装路径零仓库 /build 请求。

唯一实现是随 npm 文档发货的 [main.ts](examples/manual-port-recipes/main.ts) 和 [optional-recipe.ts](examples/manual-port-recipes/optional-recipe.ts)，仓库 fixture 只是明确 ESM 的薄入口。安装验证从实际包读取这两份源码及 WAV/JSON 资产，核对字节完全相同；真正执行 TS4.9 类型检查并编译该包源码。安装资产通过同源真实 HTTP 服务交付，不回退工作区文件；未知资源返回真实 404。

## 六类的实际行为

| 配方 | 正常、暂停与 restart | cleanup | 两个负例 |
| --- | --- | --- | --- |
| Code First 3D | 具名 geometry → MeshRenderer/Material；实际红色像素；隐藏变黑、恢复红色和零旋转 | 解绑 mesh/material、销毁独占资产与根节点，等待原生销毁收敛 | 负半宽拒绝 AIR_E_ORTHO_WIDTH 且不污染原宽；负 geometry 尺寸拒绝 AIR_E_PRIMITIVE_DESCRIPTOR |
| 输入、HUD、定步 | 可信 KeyD → 原生 PAL/input → action reducer；0/1/3 tick，press/release 各消费一次；原生 Label 像素；暂停门拒绝可信按键且不推进；restart 清队列和位置 | dispose 适配器；移除订阅；退役后的可信键盘不能重新持有动作 | 错动作名 AIR_E_UNKNOWN_ACTION；NaN 值 AIR_E_INVALID_VALUE；另验终态 attach 拒绝 |
| FPS、pointer lock | 可信按钮请求，记录实际锁状态、鼠标移动计数和相机 yaw；暂停退出锁、restart 重置 yaw | 精确解绑原函数；退役后可信鼠标不再改变计数 | 无有效 pointerId 的 canvas/detached canvas setPointerCapture 均真实抛 NotFoundError（DOM 负例，不冒称 pointer-lock 权限负例） |
| chase、vehicle、flight | 原生 Node 世界位置/forward；chase 与 flight 相机偏移、lookAt、地面基准与红色实际像素；暂停不移动、restart 回原点 | 根和独占 mesh/material 销毁；退役目标的应用守卫拒绝 | 原始非有限坐标在构造 Vec3 前拒绝；垂直相机基准不能投影为地面移动方向；这些是配方应用策略 |
| 共享资产、池、子树替换 | 三个 Sprite 借用同一帧，各持显式 lease；隐藏/入池不丢引用；原节点复用；替换一个子树并保持两个 peer、共享帧和绿色像素 | 先清 Sprite 借用并归还三份 lease，再归还 owner；独占帧/纹理 refs=0 后明确销毁；节点与资产均失效 | 原生 NodePool 重复 put 不增加 size；空池 get 返回 null；共享 refs 与可见像素仍正确 |
| 可选音频、存储、加载 | 场景先 Start，公开加载与可信按钮/画布手势；原始时钟连续推进、暂停保持、stop 归零、续播与重启；真实 Label 白字 | 等实际在途阶段结算；只释放自己的源节点/HUD/clip/JSON 引用和实例存储；借用 peer 保持有效 | 无 ext 同步拒绝、真实 HTTP 404 加载拒绝、坏 JSON 错误与恢复；故障后 HUD 仍可见 |

Sprite 赋值本身不会自动 addRef。本配方的 SpriteFrame 引用数 4 = owner 1 + 三个显式 lease；Texture2D 由 owner 持 1 份。这两个数字不能互相替代，也不表示引擎为每个 Sprite 自动持引用。独占资源只有在自己所有 lease 均归还后才 destroy，不 force release 外部资源。

## 单一时钟与方法分层

统一入口先运行 Scene，然后暂停引擎 pacer。配方只请求共享 render，后者调用 `director.tick(0)`；输入配方的业务累加器由 runner 明确提供 dt，每次最多追赶五步。没有第二个 rAF、物理 pacer 或伪造浏览器事件流。

0 tick 时 `held=true`，待消费边沿保留；`pressed()` 在首次业务 tick 消费后才置位。多 tick 无新事件时不重放边沿。可信 Playwright 键盘与鼠标单列，暂停鼠标回调的合成调用单列，不能混为物理设备认证。

创建只能执行一次：重复创建拒绝 RECIPE_ALREADY_CONSTRUCTED；释放后创建/运行/暂停重启均拒绝 RECIPE_DISPOSED，避免复活后资源无人接管。所有 release 调用返回相同终态 Promise。销毁后检查 `isValid=false`，不以即时 children 数量或常量 releaseOK 代替。当前原生 3D 管线红色实测约 229，UI 纯绿为 255；runner 按各自路径比较实际颜色。

## 指针锁的捕获监听与验证边界

AIR 的 PAL 在 canvas 上对原生 mousemove 调用 stopPropagation。因此配方必须在 document 捕获阶段观察同一个事件；默认冒泡监听会漏掉锁内输入。安装和释放使用同一函数及相同 capture=true，不再派发第二份原生输入。S17 曾把缺少事件误归因为 headless 协议限制，S18 无 SDK 的最小页面证明 Chromium/Firefox 能送达真实锁内移动，现已纠正配方。

S18 首次补齐且 S19 两路径继续验证：Chromium/Firefox 可信按钮获得锁，实际受理的 movementX 记录全部 isTrusted=true；相机 yaw 增量严格等于这些 dx 的总和乘 0.2。两条消费路径都通过暂停后的可信移动不改变 yaw/受理计数，以及退役后监听不再触发。不同浏览器协议的锁内坐标转换不同，runner 用小幅移动避免误把视角转离方块后的黑色中心像素判为渲染失败；实际 dx 以浏览器事件读回为准。首次捕获采集中的 Firefox 大幅相对移动和真实黑色像素保留在 attempt1，不当作引擎故障。

WebKit 在最小无 SDK 页面和当前配方仍拒绝 pointer lock，当前完整 FPS 行为 NOT_RUN。DOM pointer-capture 两负例、退出/解绑和可见像素不能补偿没有锁内移动的范围，不用 synthetic movement 冒充该项通过。三个浏览器的实体鼠标、权限交互和所有系统环境不由这组自动化认证。

## 运行和独立检查

```powershell
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/air-port-recipes-browser.cjs --browser=all --out=output/playwright/new-six-recipes.json
```

`--installed` 先本地npm pack，再在自有临时目录离线安装；读取并编译实际包内的这份文档源码，真实TS4.9检查只使用安装包SDK声明。浏览器importmap切到该包编译的runtime，任何仓库/build请求均拒绝。prepack仅从既有构建刷新npm副本；不重建、不发布。退出后清理自有临时消费者，报告保留tarball/source/chunk SHA和原始类型文件清单。

out 必须是新文件。runner 拒绝缺阶段、错误像素、丢失边沿、暂停推进、错误相机坐标、缺负例、引用不对和仍有效的退役资产；pageerror 不按关键词宽泛忽略。报告记录实际浏览器版本、命令、时间、输入 SHA、每阶段原始数据和截图；前后检查全部十五份输入的漂移。仓库与安装路径都保留18个配方行；不能用其余成功行补偿 FPS 未达，也不能把重复消费路径算成额外配方。

当前公开源码和预览的真实 TS4.9 noEmit 记录是 port-s19-six-public-types.log；实际安装源码的类型命令和文件清单保留在安装报告。port-s19-six-check-regression.log 接受两路径 36 个实际行，校验 15 份当前 SHA、释放幂等和终态守卫，并拒绝 29 种篡改（含不可信移动、错误 yaw、暂停推进、伪造音频时钟、错误 HTTP 状态、存储残留和借用节点失效）。后者没有新增浏览器运行。

第六类详见[可选服务配方](optional-service-recipe.md)。Lead 的 port-s19-optional-terminal-races.json/.log 用真实生产模块验证同名/跨阶段重入、重复构造、创建前操作、释放后四操作和实际在途 404 阶段立即释放；最终无实例 key、无自建节点残留，外部 peer 有效，release Promise 身份相同。

S19 首次音频采样跨循环末尾、媒体拦截不支持和独立资产 origin 请求失败均保留为失败/未测尝试；改为循环内原始窗口采样和同源真实安装资产服务后重新采集。WebKit 当前音频时钟确实可测，不再沿用“headless 音频不推进”的旧归因。连续时钟通过不认证扬声器出声。S16/S17 SyntaxError 与 S18 旧输出也是历史，源码和 runner SHA 已变，不能继续称它们绑定当前配方。

外部原作应用、真实后台 hidden、GPU 分配量、WebKit 指针锁以及完整35项 gate 均未由这些报告认证。

在提供GameCanvas/HUD/lockBtn/optionalBtn并为cocosair配置importmap的页面中，编译并载入这份main.ts后，可用JS显式控制生命周期：

```js
const recipe = window.__portRecipes.recipes['r1-code3d'];
await recipe.construct();
await recipe.run();
await recipe.pauseRestart();
await recipe.release(); // 终态；需要新的实例时重新载入页面
```

输入配方的业务时钟是显式`await recipe.step(1 / 60)`，可信键盘事件由用户或自动化送达。FPS需用户按钮请求锁后真实相对移动；移动只请求共享的dt0 render，不另开时钟。该控制入口属于示例应用，未新增SDK场景/材质抽象。
