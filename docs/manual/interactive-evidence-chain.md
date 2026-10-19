# 从输入到原生画面的证据链

## 2026-10-19 当前定向复验

SDK CI 对当前构建运行 DPR1/2 的可信输入→原生节点→AFTER_DRAW→compositor PNG 链，每组含遮挡负控；仍不能用帧提交或 GPU 读回替代可见像素。单引擎结果只覆盖明确选择的引擎，不表示完整多浏览器或原项目比对。历史材料可用性与原工程验收分别记录在 SDK 审计账本。

IER-01 独立示范使用真实 Cocos Scene、Node、MeshRenderer、Mesh、Material，以及已有 ActionInput/SessionGate 和 createStepClock。没有复制云端工程或新增输入/场景框架。

已有开发 bundle 时启动 `npm run dev`，打开 `/test/fixtures/interactive-evidence/`。点击画布或按 D 将动作入队，调用 `await window.__ierEvidence.step()` 后移动红色网格；重置返回左侧也在提交下一步后显示。遮挡按钮盖住画面，但不阻挡 Canvas 输入：再点击并提交后对象仍会移动，而截图不可见。页面显式使用测试步进时钟，自动采集调用 fixture 的 `step()`；这是自动化夹具，不是生产应用的实时动画配方。

## 四段观测必须关联

1. 浏览器真实协议输入，记录收到的事件、`isTrusted`、sequence 和时间。
2. 现有 ActionInput 入队，单次 consumeTick 消费；记录原生 Node 位置、renderer 绑定和同一 input sequence。
3. createStepClock 暂停真实引擎 pacer，提交一步并等 AFTER_DRAW。回执仅证明提交，不证明屏幕呈现。
4. 再等两次浏览器 requestAnimationFrame（不调用引擎 tick），读取完整 compositor PNG；记录实际 SHA/bytes 和观察时间。画面位置由固定相机的独立解析投影核对。

相机 `orthoHeight=2`、画布 CSS 512×384、目标 `x=±1`。PNG 中心预期为 `[width/2+x*height/4-0.5,height/2-0.5]`，容差为 `2×DPR` 像素。颜色命中条件固定为 R>150、R-G>60、R-B>60；不得从应用自报可见 flag 得到 PASS，也不靠重复截图直到正确来放宽方法。

## 当前实测范围（Lead，2026-10-07）

Chromium、Firefox、WebKit × DPR1/2，每组 baseline/moved/reset/occluded/restored 五状态，共 30 个 PNG。24 个可见状态通过；6 个遮挡状态明确记录可见性 FAIL，候选 PASS 均被像素 oracle 拒绝。这是预期负例通过，不是把不可见对象包装成渲染成功。

每组两个自有资产各持一份引用，释放后 1→0；解绑 renderer 与 input 后关闭 app，再核对 renderer 已销毁。release 返回同一 Promise，后续 step 拒绝 `RECIPE_DISPOSED`。销毁后的 renderer 不再用于读取材质。

规范报告见[证据索引](../evidence/examples/interactive-engine-improvements/README.md)。S1 Firefox DPR2 重置曾截到旧帧，失败报告保留；S2 固定绘制等待后通过。首次 Chromium 夹具还暴露了销毁后读材质与漏调用 `isPaused()` 的错误，保留在独立失败尝试中，均不归为引擎缺陷。

## 边界

- 原 11/16/23、Water、soft 和 Puzzle50 资产未取得，本例标为 recreated；参考匹配 NOT_RUN。
- AFTER_DRAW 和截图时间不是物理显示时刻；没有测量 GPU 时间、GPU 内存或物理触摸设备。
- 静态诊断 healthy 不能替代像素、事件、颜色或资源清理检查。
- 工具的合成 PNG 单元测试只证明合同；实际浏览器结果单独保留版本身份。

工具字段详见[证据合同](../reference/interactive-improvement-evidence.md)，身份去重详见[基线合同](../reference/interactive-improvement-baseline.md)。
