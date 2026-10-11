# Cursor Trail 光标轨迹（E08）

用已有 SDK 与开发服务器打开 [index.html](index.html)。移动鼠标画出速度响应的轨迹；滑块控制半径、寿命、衰减与柔边，支持暂停/继续/重置/释放，Escape 清轨迹。

实现：[场景](src/main.ts)、[轨迹记录器](src/recorder.ts)、[着色器](src/trail.frag)。CPU 每帧维护最多 63 点和一个头副本，上传 512 字节的半精度数据纹理；原生单 quad 材质按三段 Bézier 子弦扫描。无第二 canvas、独立渲染器或 compute pass。

来源、算法边界和差异见 [UPSTREAM.md](UPSTREAM.md)；MIT 通知见 [LICENSE.reference.txt](LICENSE.reference.txt)。只支持两个线性颜色端点，不支持上游多色 stops/其它颜色空间。轨迹不是流体模拟，也不宣称精确圆锥 SDF 或最新线段硬覆盖。

验证：[采集器](../../tools/verify/shaders-cursor-trail-browser.cjs)、[独立 oracle](../../tools/verify/shaders-cursor-trail-oracle.cjs)、[性能合同](../../tools/verify/shaders-cursor-trail-performance.cjs)。`--phase=functional --browser=all --out=<新.json>` 收集真实截图、透明 RT、输入、边界、活 resize 与 100 轮资源退役；`--verify=<report>` 只读重算。性能需 `--phase=performance --authorization=<token>` 串行静默窗口，记录真实帧中的 64 活 texel、512 字节上传；诊断路径不冒称用户真实移动。

每实例 mesh/material/effect/pointsTexture 四份自有引用归还；renderer 与 sampler 解绑后销毁；终态 `TRAIL_DISPOSED`、释放 Promise 幂等。Gallery `__lifecycle` 接线已实现，独立 Gallery 验收仍 `NOT_RUN`。实体触屏、多标签页、长时运行和 GPU 物理显存尚未验证。Engine/Agent Gate 分离，Agent Gate `NOT_RUN`。

触摸采集使用浏览器协议的可信 primary PointerEvent（`pointerType='touch'`），并独立记录旧式 TouchEvent。协议触摸与实体触屏验证分别计数；未收到旧式事件时不将其标为已测。
