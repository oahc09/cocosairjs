# Dynamic Mesh 与屏幕投影

运行 `npm run dev -- --example interactive-geometry`。默认 `?mode=mesh`；`?mode=cut` 拖动画布得到刀线，`?mode=ribbon` 观察移动波带。Reset 和 Escape 取消当前代次，Release 关闭自有资源并禁用按钮。普通页面使用引擎原生 pacer，自动化 `?test=1` 才启用定步时钟。

三入口分别展示静态/动态网格、射线切平面与三个独立对象的投影、屏幕空间 ribbon。索引、容量、bounds、取消和释放用原生 API；示例侧纯 preflight 不替换 SDK。资产为原创程序化色块和平板，使用仓库 MIT 许可证。

详细坐标链、0.15px 设计目标、装饰 overlay 与真实切面区别、每轮引用退役及 WebKit 活 resize 限制见[手册](../../docs/manual/interactive-geometry.md)。当前状态 draft：参考 soft/Water 材料未取得，不声称原作复现、全平台验收或发布通过。

- [入口](index.html)
- [实现](src/main.ts)
- [纯几何检查](src/geometry-contract.ts)
- [规格](example.json)

`node node_modules/typescript/bin/tsc -p examples/interactive-geometry/tsconfig.json` 做严格 noEmit 检查。浏览器采集与只读重验见手册；AFTER_DRAW 只证明提交，最终可见性来自 PNG。
