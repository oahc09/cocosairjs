# 响应式容器、输入与缓存视图

本配方复用原生 Scene、UITransform、Label、Input、时钟和资源生命周期。完整源码见[响应式棋盘示例](../../examples/responsive-board-recipes/)。它是 4×4、10×20、16×16 的独立接入验收，不代表外部 50 游戏工程已重新验收。

## 选择启动布局

未传 `screenMode` 时保留原生 settings 行为，默认占满窗口。显式 `screenMode: 'window'` 选择窗口填充；`screenMode: 'container'` 使用已挂载的 canvas 祖先容器，不写宿主 body 的尺寸。`container` 接受元素或 selector，不能是 body、html、canvas 或不含该 canvas 的元素。

推荐安全入口；先挂载容器和 canvas，再调用启动函数：

```html
<section id="host" style="width:min(100vw,720px);aspect-ratio:1">
  <canvas id="board"></canvas>
</section>
<script type="module">
  import { createAirApp } from '/build/bootstrap.js';
  const app = await createAirApp({
    canvas: '#board', screenMode: 'container', container: '#host',
    pixelRatioCap: 2,
    designResolution: { width: 720, height: 720, policy: 0 }
  });
  const { Scene } = await import('/build/cocosair.module.js');
  app.run(new Scene('Board'));
</script>
```

JS 与 TS 使用相同参数，`AirAppOptions` 已声明类型。安全入口在导入 PAL 前设置 canvas 和 DPR，并在宿主内部准备原生 GameDiv/Cocos3dGameContainer；既有 wrapper 必须包含同一 canvas，不能复用另一个应用的同名 wrapper。直接导入完整引擎时仍须提前准备 DOM；自定义 canvas ID 先绑定 `__CC_CANVAS__`，自定义 cap 先绑定 `__CCDPR_CAP__`。显式模式与已有 `screen.exactFitScreen` 冲突会报 `AIR_E_SCREEN_CONFIG_CONFLICT`，不要让两条配置各自覆盖。

容器初始布局必须有正尺寸，隐藏或未定义高度会报 `AIR_E_CONTAINER_SIZE`。运行中隐藏保留最后有效 buffer，恢复后重新同步。相同尺寸不重复通知；父容器独立变化经 ResizeObserver 合并后走原生 resize 链。`view.resizeWithBrowserSize(false)` 关闭自动同步；恢复后下一次尺寸通知继续同步。`app.close()` 断开新增 observer 并取消待处理回调。

有效 DPR 是 `screen.devicePixelRatio`，已经应用 `pixelRatioCap`。在默认 resolutionScale、无额外 CSS transform 的画布上，buffer 为 `round(实际画布 CSS 尺寸 × 有效 DPR)`。比例适配时以实际 canvas/container 区域校验，不用整个父 frame 冒充绘图区；使用 shadingScale 时渲染附件还受其影响。设计分辨率与逻辑格子数不随 buffer 尺寸变化。

## 输入只消费一次

原生 MOUSE_DOWN 先合成 TOUCH_START 再派发 MOUSE_DOWN。主点击可只订阅 TOUCH_START；不要把两个都接到 Hard Drop/Restart。MOUSE_MOVE 可以另作 hover。原生鼠标保留 button 信息，但 TOUCH 不是完整鼠标事件替身：右键/中键需要明确的鼠标分支和消费规则，不能一面无条件消费合成 TOUCH、一面再次消费右键。示例为移动设备提供独立 Flag 控件。

键盘首次按下是 KEY_DOWN，浏览器 repeat 是 KEY_PRESSING，释放是 KEY_UP。连续动作读取 held；单次动作消费 press transition。现有 `createActionInput` 与 `createActionState` 已处理 backend 独占、repeat 去重及 source 所有权，不需要另一套全局键盘队列。Pause/Restart 调适配器 reset；退出 dispose；失焦/hidden 清理持有状态。文本字符使用 DOM input/beforeinput/composition，不从 KeyCode 或“Shift+9 缓存队列”推算字符。

宿主合同须列出 keyup、blur、hidden、右键、pointer 身份和退订职责。单元测试注入不能证明线上宿主也传递了这些字段，合成事件和可信协议输入须分开记录。

## 用原生局部坐标拾取

先取事件 `getUILocation()`，再用棋盘 UITransform 的 `convertToNodeSpaceAR()` 转到局部坐标，传给可选 [board-state](../../tools/recipes/board-state.ts) 的 `pickBoardCell`。该函数只划分已知局部矩形，不减画面中心、不预乘 DPR，因此挂在已平移父节点下也遵循原生变换。row 从上到下；左、上边界包含，右、下边界不含，区域外返回 null。

格子命中容差按一个 CSS 像素映射到设计坐标定义，各轴分别取缩放；别把 299.077 强行断言成无容差的 300。边界分类测试在边界内外至少留这个容差，数学 helper 的精确半开区间另做 CPU 测试。

## 单行按钮与多行说明

`labelNode(parent, 'RIGHT', 'Right', { fontSize: 18, boxSize: [64, 80], overflow: Label.Overflow.SHRINK, enableWrapText: false })` 创建单行缩字按钮。未传 `enableWrapText` 保持 Label 默认值；说明文字显式 true。SHRINK 与“禁止换行”是两件事；NONE 自适应内容，RESIZE_HEIGHT 强制折行，不能用新参数改变这些原生模式的语义。动态文案/盒宽仍由原生 Label 更新。

## 规则快照与视觉失效

影响画面的 pulse、highlight 等必须进入缓存键。示例将规则状态与 `ceil(pulse * 30)` 一起交给 `createVisualGate`；它只缓存一次成功的 render，异常后不吞失效。量化精度属于视觉合同，不污染规则回放。暂停冻结计时，Restart 清理效果并使视图失效；闲置 key 不变，不重建标签。

可选 `createSeededRandom` 支持保存/恢复确定状态；`shuffleSlidingBoard` 从解态执行合法滑动，保证可解，不承诺均匀随机排列。复杂游戏的胜负、求解器、字典和评分仍在应用模型内。模型 Restart 复用原生对象；releaseScene 释放会话与场景，close 最终关闭运行时，两者需读取清理回执，不能以 pagehide 被调用证明释放完成。

## 验收配方

1. fixture 只设前置状态，先用独立 oracle 检查合法性；结果由生产模型的真实输入/时间推进产生。
2. 使用 `createStepClock.begin()` 暂停真实循环，只保留一个时钟。fixture 后 `await clock.step(0)` 提交画面，再截图；AFTER_DRAW 不是显示器 present/FPS 证明。
3. resize 后点击已知目标，检查命中格子和动作恰好一次。不能用“错点前后都 playing”作通过条件。
4. 同时记录模型、buffer/view/DPR、console/pageerror、contextHealth 和截图像素。healthy 只说明上下文状态，不说明尺寸同步正确。
5. 保留原版失败、原版加 workaround 通过、候选移除 workaround 通过；保留启动图和 fixture 图，不改写历史失败。
6. 测试控制面仅在 `?test=1` 启用；最终释放 clock 或关闭 app，不恢复另一个已关闭的时钟。

独立采集器：`node tools/verify/responsive-host-browser.cjs --out=output/responsive-host/new-attempt.json`。要求现有当前 bundle、可用 Playwright/浏览器；只写显式新报告和相邻截图，不构建、不下载、不发布。`--browser=chromium` 是定向子集。外部原工程未提供，不能据此宣称 50 项、707 场景已重采。

截图通道显式选择：默认 `--capture=page` 检查页面合成截图；`--capture=canvas` 在零时间原生 draw 后调用 `canvas.toDataURL('image/png')`，检查真实 framebuffer 像素，要求上下文 preserveDrawingBuffer=true。后者同时保留页面截图及同点对照，不把两种通道混成一个 PASS。当前 Windows WebKit 的 GPU 读回和原生 PNG 正确、GLerror=0，但页面截图可能为空；实时/固定帧及 CSS 对照也保留此差异。`scopePassed` 只对应所选通道，`pageCompositionPassed=false` 不能当作页面合成通过，不推广成物理 Safari 或显示器 present 认证。

## 首次接入与成本统计

`node tools/verify/integration-attempts.cjs attempts.json` 只读聚合。每条记录保留 project、batch、attemptId、integrationId、category、status、calls、reason、measuredAt、source/harness/runtime SHA256、staticCallSites、executedCases。category 分别为 shared-integration、application-development、browser-verification、coordination；status 为 PASS/FAIL/UNKNOWN。

声称完整项目范围时增加 `--expected=projects.json`，该文件是预期 project ID 的唯一非空数组；遗漏项目须补 UNKNOWN 记录，否则聚合拒绝。未给预期清单时 `projectScopeVerified=false`，不能从输入恰好有 50 行推导完整性；空记录也拒绝。

缺失历史用 `status: 'UNKNOWN', calls: null`，不能填零；未知 executedCases 使用 null，未知静态清单和指纹也可用 null，不能伪装成零条或补造哈希。共享 integrationId 只计一个集成；静态点按 source 指纹+位置去重，独立用例按 project+case 去重，重复尝试的执行次数另列。每种统计都保留未知清单数和 complete 状态，不混算。工具不从最终结果推断首次成功，也不自动输出不具备完整历史的平均成本。未来效率对照必须两侧隔离、同 brief/预算/证据口径，另立目标后执行。
