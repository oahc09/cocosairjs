# Neon night city

原创实现公开E07 Scene Spec，未读取或复制私有Reference。
实际创建240栋建筑、80辆车、2400个雨粒，当前确定性种子生成15372个窗格。
楼群和车流使用原生GPU instancing，窗格合并静态网格，雨采用动态quad网格并每帧按摄像机深度排序。
没有外部图片、模型或视频素材。

```bash
npm run build
npm run dev -- --example neon-night-city --port 7454
```

按钮切换距离雾、重置时间与状态。雾保持LINEAR/accurate变体，开关只改变start/end，
不会为了开关效果重编译全场材质。发光窗格采用独立的Air unlit fog effect，保留实际矩阵结构；
无后处理bloom，不能声称已交付该后处理能力。

`__bench.getState()` 返回实际节点/顶点计数、雾开关和最近60个渲染回调的测得FPS，
同时明确FPS未取得GPU计时或显示present。`__lifecycle()` 释放并重新构建13份owned资产，
不通过刷新页面实现reset。`__cityProbe` 的freezeRain/freezeCars仅在明确调用时隔离像素归因，
不会检测自动化环境或降低满规模场景。

已有bundle与只读TS服务启动后，可运行：

```bash
node tools/verify/neon-night-city.cjs --url=http://127.0.0.1:7473/examples/neon-night-city/ --out=output/playwright/neon-night-city-acceptance.json
```

该脚本需要可解析的Playwright模块和本机Chrome；已有工具环境可通过NODE_PATH提供模块，
或显式使用 `--playwright-module` 指定现有模块目录。脚本只消费bundle和HTTP页面，
不会build、pack、覆盖正式证据或修改源码。输出带源码/bundle SHA及PNG。

当前Chrome/WebGL2固定1280×720、DPR1实测：8次draw；视口亮度覆盖约44.85%，
隔离雨后街道600ms发生1943个像素变化；隔离车流后雨约117ms变化9.98%；
fog切换的上部平均亮度32.57→33.08，reset计数和排序恢复，释放/重建通过。
这些是本轮观测及本仓独立验收口径，不替代外部完整竞争基准或跨浏览器发布门禁。
