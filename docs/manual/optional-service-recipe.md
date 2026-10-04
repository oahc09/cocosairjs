# 可选音频、存储与加载配方

第六类配方的唯一实现是[随包发货的 optional-recipe.ts](examples/manual-port-recipes/optional-recipe.ts)，由 Lead 收回实施并集成到[六类共同入口](examples/manual-port-recipes/main.ts)。Orca Worker 的早期版本和采集保留为历史；其“WebKit 无法推进音频”结论已被当前真实手势和原始时钟测量纠正。

模块只组合公开 AudioService.load、AssetBank.load、sys.localStorage、Node 和 Label。它是应用示例，没有增加 SDK 场景或材质抽象，也不访问 AudioService 私有 Map。

## 接入与阶段

调用 createOptionalServiceRecipe({ scene, host, baseURL, render })。scene、host 和共享 render 由应用持有；baseURL 必须是包含 manifest.json 与 tone4s.wav 的**绝对目录 URL**。资源在[optional-assets](examples/manual-port-recipes/optional-assets/)中。

| 阶段 | 实际行为 |
| --- | --- |
| construct | 创建自己的 Label；公开加载 JSON 和音频；返回资源引用、加载错误和存储可用性；此时应用场景已经运行 |
| run | 在可信按钮回调中同步发起播放；等待原生播放器就绪；记录未经换算的播放头；写实例计数并显示原生 Label |
| pauseRestart | 记录暂停前后播放头、续播、stop 严格归零与重启后的推进 |
| negatives | 无后缀且未传 ext 的同步错误、真实 HTTP 404 加载拒绝、坏 JSON 解析错误与默认值恢复；故障后仍显示 HUD |
| release | 立即关闭准入、撤销 bank 订阅，等待实际在途阶段结算；退役自己创建的节点、归还资源引用、恢复自己写过的存储 |

手工预览在 test/fixtures/port-recipes/optional-preview/：先点击 construct，再点击 Run Optional Services，并点击 GameCanvas 解锁音频；其余按钮显式推进阶段。预览直接载入同一共同入口，沿用唯一 director.tick(0) 渲染通道。音频播放头按原生音频时钟推进，与业务定步分开。

## 音频测量与边界

PAL 的手势解锁监听位于 GameCanvas；单独点击 DOM 按钮不能保证异步创建的播放器获准播放。runner 使用真实 Playwright 按钮和画布点击，记录 isTrusted，等待原生播放器就绪最多十秒。WebKit 当前原生 DOM canplay 回退约需八秒；这只发生在用户明确运行可选阶段后，不阻塞 createAirApp 或场景 Start。

采样先等待播放头进入循环内的安全窗口，再保留 stateBefore/stateAfter 与窗口的原始样本。播放 delta 必须大于 0.1 秒；暂停漂移最多 0.03 秒；续播和停后重启各推进大于 0.1 秒；stop 必须严格为零。没有对负 delta 取绝对值，也不以 playing=true 代替连续时钟。WebKit 读回的 clip.getDuration() 是 1.02125 秒，不能用文件名 tone4s 推断该浏览器后端读回四秒。

这组自动化证明原生 API 时钟和可见 HUD，不认证扬声器实际出声、实体设备或所有浏览器权限环境。音频未推进必须披露 NOT_RUN，不能把缓存资源未产生新的网络响应推断为播放成功或失败。

## 所有权与终态

AudioService.load 交付的 AudioClip 由本模块显式 addRef 一份；AssetBank 自持 JSON 的一份引用，不再为 manifest 重复加引用。释放先 audio.dispose 停止并退役自身源节点，再归还 clip 引用；bank 只归还自己的引用，不 force release 外部资源。

模块只创建并销毁自己的 HUD，不创建假借用节点。host 现有子节点由调用者持有；共同 harness 创建独立 peer，并在模块 release 后验证它仍有效，最后才由 harness 释放整个 host。

每个实例使用独有 counter/corrupt key，写入前备份原值，release 恢复原值或删除原本不存在的项。不改外部固定 key。release 等待实际在途 Promise 的最终存储写入后才恢复，避免固定 50ms 延迟留下迟到写入。

全部阶段禁止在途重入，包括同名阶段：RECIPE_BUSY。创建前执行操作为 RECIPE_NOT_CONSTRUCTED；重复创建为 RECIPE_ALREADY_CONSTRUCTED；重复 run 为 RECIPE_ALREADY_RUN。release 返回同一个终态 Promise；其后的四个操作以 rejected Promise 返回 RECIPE_DISPOSED。需要重用时创建新实例。

## 验证入口

```powershell
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/air-port-recipes-browser.cjs --browser=all --out=output/playwright/new-six-recipes.json
node tools/verify/air-port-recipes-browser.cjs --installed --browser=all --out=output/playwright/new-installed-six-recipes.json
```

air-optional-recipe-browser.cjs 保留为共同六类 collector 的兼容入口，参数和报告范围与上述入口相同，不再运行另一份可选服务实现。out 必须是新文件。安装模式读取实际离线安装包的 main.ts、optional-recipe.ts 和两份资产，核对字节与 SHA；真实 TS4.9 类型检查覆盖实际包源码，浏览器拒绝任何仓库 /build 请求。

当前结果和原始报告见[六类组合配方](port-recipes.md)。每一行都保留正常、暂停、负例和释放阶段；runner 从 WebGL 缓冲读回 Label 白字，DOM 按钮或日志不计入 HUD 像素。真实 404 响应、存储解析错误、原始时钟、引用归零及借用节点存活分别校验。
