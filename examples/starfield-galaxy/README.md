# Fifty Thousand Suns

原生 `POINT_LIST` 的 50,000 个顶点组成四条对数旋臂与 7,000 点核球。旋转、径向颜色和点尺寸在 GPU shader 中计算；相机、输入与节点由原生 Cocos API 驱动。

```powershell
npm run dev -- --example starfield-galaxy
```

移动指针产生视差，滚轮改变真实相机距离（40–400，初始 120），Reset 恢复相机、视差与 GPU 相位。HUD 的点数来自实际 mesh vertex view，fps 来自两秒窗口内实际渲染回调时间，不是 GPU 或显示 present 指标；不能把 rAF 达到 60 当作 GPU 容量证明。

`window.__bench.getState()` 实现公开冻结 E01 的全部状态字段；`window.__lifecycle()` 释放并重建 mesh、material、effect。冻结规范原字节收纳在 `assets/benchmark-spec.json`，来源及 SHA-256 见 `example.json.benchmarkOrigin`。没有读取或复制私有 Reference。

重新生成 shader 资产：

```powershell
node tools/build/effect-json.mjs examples/starfield-galaxy/galaxy.effect-spec.json examples/starfield-galaxy/galaxy.effect.json
```

冻结行为、原生 50k draw、像素、真实时钟 fps、录像与生命周期验收：

```powershell
# NODE_PATH 指向已有 Playwright/pngjs 工具环境。
node tools/verify/competitive-scenes-browser.cjs --scene=starfield-galaxy --browser=chromium
```

输出在 `output/playwright/`，不自动构建、不写 canonical evidence。视觉运动通过画布中心区域帧差验证，不以 phase 字段代替画面；性能通过实测 render-loop 和独立 rAF 窗口交叉报告，但不声称 GPU/present 已测。

主行为/性能执行不全程录像；视频是同候选、同初始状态独立重放 P1 前置及 P2 的证据。两次执行在报告中分开，不能拼成“一次录像运行全部通过”。本机 WebKit 全程录像时曾约 28–29fps，不录像对照约 34fps；失败记录保留在本地 `output/playwright/starfield-galaxy-webkit-recording-overhead.json`，不降低 30fps 门槛，也不修饰 HUD 数值。

星点、生成器与 shader 全部原创，没有图片、模型或网络资产依赖。

## 本批验证

Chromium、Firefox、WebKit 各 15/15；每份报告包含无全程录像的行为/性能执行和独立 P1/P2 录像重放。当前共同候选 SHA-256 为 `572f0a41fc0ac115e566f9596957d81137e26015d2838017624e8dfdbfd2b3f4`，代码/规范/验证器指纹匹配，零 console error。

自包含嵌套静态产物在 Chromium 同样 15/15。使用 `node tools/verify/competitive-scenes-browser.cjs --static` 仅在 `output/playwright/competitive-static/` 生成产物，不改默认 `build/`；生产入口位于例根 `main.boot.js`，effect URL 基于 HTML 的 `document.baseURI`，不依赖源文件的 `src/` 深度。
