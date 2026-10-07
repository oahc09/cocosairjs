# K0 R2 实施台账

关联[计划](../plans/k0-r2-engine-traps.md)。2026-10-07，起始HEAD `36cabc9`。当前17项合同处置与限定验收完成；未提交/推送/发布，保留原有`build/build.zip`。全仓库存既有失败单列，不声称release-ready。

## 本轮交付

- drawing-lines六处USE_COLOR改为USE_VERTEX_COLOR，保留其余字节与行尾。
- 动态更新配方补上每个使用者的onGeometryChanged；明确mesh.drawInfo为0不代表旧输入装配器同步，不将旧三角形误归因为WebGL清屏。
- Billboard尺寸与Node缩放区分；新手册提供原生透明/加色、glTF实例控制、DPR/DOM/子viewport转换及边界；索引接入。
- Orca Worker新增7项CPU；Lead补1项真实renderer通知回归，共新8项。
- Lead最终collector保存原始36状态与PNG/输入SHA，独立重算像素及实际控制器/主光/引用和错误；旧collector换为兼容入口，两轮失败报告和源码归档保留。
- 本轮抽取源码/AIR生产源码零改动，已有ENG-01–09不重复修复。unmin/min source map的9个相关源码与磁盘相同，无需重建。

## 17项当前结论

| ID | 当前处置 | 证据 |
| --- | --- | --- |
| N1 | 保留1024默认，显式大容量/越界拒绝 | 4096v/23814i三浏览器画面+CPU |
| N2 | 两套字段保留，错误键明确拒绝 | engine-contract-mesh生产代码回归 |
| N3 | Partial保留未变属性，通知使用者Model/输入装配器 | 100次更新，边界移动；旧IA6→通知0→背景及新CPU回归 |
| N4 | 未初始化拒绝，设备/布局失败可重试 | 浏览器AIR_E_MESH_NOT_READY→初始化后绘制，CPU分配清理 |
| N5 | 当前默认air-gltf-standard蒙皮可见，不替换PBR | Fox双实例37957有色像素/实际effect，工作区+实际包 |
| N6 | Normal默认正确，Loop仅作用实例状态 | 3.4167s clip：A至8.55s仍播，B一次finished后停终点 |
| N7 | 复用自动Animation，提示潜在重叠而非全面禁止 | 正常每根1控制器，第二控制器conflicts+warning，CPU路径解析 |
| N8 | 修正手册宏，缺属性/关闭宏分层 | red[229,0,0]与关闭white及diagnostics |
| N9 | 当前实际GPU消费a_color，历史K0不外推 | 实际subModel variant webgl-active+a_color及PNG红色 |
| N10 | 保留绕序/剔除语义，显式双面可用 | 正面红、反绕序黑、负缩放黑、NONE恢复红 |
| N11 | 缺UV为常量采样，透明/实色结果不同 | 透明0像素、实色green、有UVgreen+warning |
| N12 | opaque technique通过原生states声明混合 | alpha[115,114,0]、add[115,229,0]、depthWrite=false |
| N13 | 已有type请求修复复验 | 两setter次序[182,0,212]，关闭/恢复[229,0,0] |
| N14a | 左下物理→左上DOM按canvas比例，不重复乘DPR | DPR2、偏移37/29、子viewport、三点往返/反Y |
| N14b | Euler保持角度 | 矩阵90°Z将+X变为+Y |
| N14c | 多组件可注册，普通主光容量1 | renderScene 3→禁用2→移除1及接替 |
| N14d | 普通/instanced/蒙皮支持缩放，Billboard尺寸独立 | mesh/instanced90000→360000；skin18979→75525；bill90000→nodeScale仍90000→width/height360000 |

以上像素数和颜色三引擎一致。N14固定a坐标/b角度/c方向光/d缩放，旧Worker c/d混用已纠正。

## 实际执行渠道

**Orca Worker**：原始新7项Jest、已有16项合计23/23及当时typecheck通过。其两轮浏览器采集被Lead拒绝，不能用exit0作为GPU PASS，见[原生记录](../../docs/reference/k0-r2-native-contracts.md)。

**Lead**实际执行：

| 命令 | 结果 |
| --- | --- |
| `NODE_PATH=output/playwright/tooling/node_modules node tools/verify/k0-r2-rendering.cjs --browser=all --out=docs/evidence/examples/k0-r2/workspace.json` | exit0；CH/FF/WK各36状态、56断言、35PNG、27资产引用归还 |
| 同上加`--installed --out=docs/evidence/examples/k0-r2/installed.json` | exit0；同范围；tarball离线安装+TS4.9实际声明；三引擎/build请求0 |
| `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath`指定五套+`--json --outputFile=output/playwright/k0-r2-lead-focused-tests.json` | exit0，5套/27项，新suite8项 |
| `npm run typecheck` | exit0 |
| `npm run verify:doc-refs` | exit0，docs153/refs1245/unresolved0（随后仅补手册边界文字） |
| `NODE_PATH=... node` stdin调用validateFiles及24种内存篡改 | exit0；两路径PNG/SHA无误，24种全部拒绝，未增加浏览器运行 |

每项输入、source map、实际测试名及历史身份见[审计JSON](../../docs/evidence/examples/k0-r2/audit.json)。development bundle SHA `3a448f029369ac0253f3098fc08680c65f81bdf3bb472795e3032fdd725ab01d`；实际安装tarball SHA `96ac26da56c932f00c7c7674801f0ab7ba796715fe9ac7f344d32cfa36b81558`。版本号不等同字节身份。

## 失败和未测边界

1. Worker两轮失败原始证据保留；Lead attempt1因reflection时机/缺renderer通知失败，installed attempt1因Uint8Array route超时失败，后续真实采集补偿。`output/playwright/k0-r2-*`均未覆盖。
2. 库存命令`npm run verify:test-inventory -- --update -- --runInBand`的Windows npm吞掉--update，实际mode=check，exit1。磁盘105suite、实际发现111suite、843tests/839pass/4fail；6份历史副本额外被发现（4份无法执行），旧V1.1/V1.2四断言及manifest88对105漂移属于既有全仓问题。新8项已登记限定审计，canonical全量库存待独立修复。测试生成的spec-compliance已备份并恢复。
3. 可读K0解包bundle SHA `3ccfdde16441c04d7be17d90ed7f341a48bc2a86e0925ab2ceb74c536451ced6`；可读baseline tarball SHA `0e368ae572ecd3812db2b7387828a8ac41a0b632d33f75bf4a74d942fd262a54`。仅记录身份，未重跑原臂/证明N5和N9旧根因，冻结K0未改。
4. CANVAS_NATIVE限定GPU结果，pageCompositorVerified=false；不承诺全Gallery、全35项端口、完整release gate、真机/多GPU/所有模型。未测不由文件存在、组件字段或旧报告补偿。

## Orca Worker最终只读复核

`CURRENT_TASK=K0-R2-FINAL-READONLY-REVIEW`回执：严格只读、stdin脚本、零写入/浏览器/构建/Jest，本人命令均exit0。两路径validateFiles均pass=true/errors=0；三引擎各36case、无page/console error、installed零/build；独立pngjs抽样9场景的中心像素/亮面积匹配，未独立重跑浏览器。清理字段、审计及口径无新增问题。

回执中的24种篡改与27个Jest结果属于读取Lead审计，不能认定Worker另行重做这些执行。引用数量按每引擎27计算：两路径六次运行合计162份lease归还记录，不将回执简写的“27×2”当总数。Lead最后只读validateFiles再次确认216状态/336断言/210PNG/162引用记录；不增加浏览器运行。

## 2026-10-07：补齐 tests / examples / docs

用户授权“补上”。**Orca Worker** 实施三处旧示例修正与新正式示例，按 Lead 审查再修正所有权、默认 glTF 材质与单一时钟；Worker 未采浏览器，首轮独立类型检查还有既有错误，不能作为最终四文件通过依据。

**Lead** 整合与修正：

- 新增 `examples/k0-r2-porting-contracts/` 正式交互入口、README 和 Gallery 规格；生成 `examples/files.json`（167例）。四种模式与暂停/恢复/重置/释放使用原生 API；资源解绑在归还之前，释放取消 Director 回调，保存真实归还记录；移动视口按钮在画面内。
- `batching-routes.ts` 只传 positions/bounds 并调用 `onGeometryChanged()`；`gltf-skin` 挂载前用实例循环 API，复用单个自动 Animation，直接渲染默认 `air-gltf-standard`，不修改共享 clip 或替换材质；手册线条宏改为 `USE_VERTEX_COLOR`。修正手册示例的 nullable MaterialInstance、builtin 资源泛型和 Window 声明，四文件独立 strict noEmit 检查通过。
- 五个受影响规格（新例、gltf-skin、batching 三路线）的实际 sourceLocation/provenance 已重新定位，结构检查零 issue。变更源码的旧 promotion 清除，状态为 validated，没有伪造全仓 Stable 晋级。未改全仓既有问题来绕过门禁。
- Jest 限定发现 `test/smoke/*.test.ts`，不再执行证据归档中的测试副本。canonical 库存已真实更新为 **106套 / 846项 / 842通过 / 4失败**，其中新 K0 原生 suite8项与示例验收 suite9项均在册；不隐藏全仓失败。

| Lead 实际命令 | 结果 |
| --- | --- |
| `node node_modules/typescript/bin/tsc -p tools/verify/k0-r2-examples.tsconfig.json` | exit0；四份示例对当前SDK声明，JS helper不启用checkJs |
| `NODE_PATH=output/playwright/tooling/node_modules node tools/verify/k0-r2-examples.cjs --browser=all --out=docs/evidence/examples/k0-r2/examples-verified.json` | exit0；CH/FF/WK全部通过，30张native PNG+3张移动页面截图；17份输入指纹 |
| Jest指定6套，输出 `output/playwright/k0-r2-examples-focused-verified.json` | exit0；36/36，含新9项实际记录接受/篡改拒绝回归 |
| `node tools/verify/test-inventory.cjs --update -- --runInBand` | exit1；106套 / 846项 / 842通过 / 4失败；库存写真实计数与全部测试名 |
| `npm run typecheck` / `npm run verify:doc-refs` / `git diff --check` | exit0；docrefs 153 docs / 1251 refs / unresolved0 |
| stdin 文件核对与原两路径 validateFiles（传报告对象） | exit0；17 SHA、30 PNG SHA与颜色统计一致；workspace/installed仍PASS |

新增验收：[examples-verified.json](../../docs/evidence/examples/k0-r2/examples-verified.json) 与 [examples-audit.json](../../docs/evidence/examples/k0-r2/examples-audit.json)。每引擎13份显式lease归还1→0；三个例子的实际 lifecycle 均 released/reloaded、无leaked/errors。SimpleSkin clip duration5.5s，三引擎步进到6s以上仍playing，实例Loop且共享clip保持Normal；默认材质有超过1000个真实亮前景像素（黑体不能通过）。

历史失败保留：首轮 favicon404使严格采集红，验证环境明确拦截favicon为204后重新执行；首轮Jest因jsdom/esbuild realm不兼容无法require，server依赖改为CLI内延迟加载后回归绿；`examples.json`/`examples-final.json`保留为迭代记录，当前是`examples-verified.json`。早期PNG复核遗漏NODE_PATH及错传validateFiles路径的命令失败不冒充引擎失败，按接口/环境修正后的文件核对为实际通过依据。

四项**既有全仓门禁失败**：smoke29全部规格frozen/零问题、smoke29证据链零fail、smoke29Gallery字段裁剪、smoke30旧浏览器矩阵bundle绑定。可定位原因包括未完善的responsive-board-recipes规格、gltf-viewer旧出处行与旧全仓证据；完整输出在`output/playwright/k0-r2-examples-inventory-final.log`。本轮产生的spec-compliance红报告另存output，原canonical报告恢复，不以失败测试的副作用覆写历史证据。**相关36项与四例通过，不等于全仓发布就绪。**

未build/提交/push/发布；原有`build/build.zip`（12,244,598B，2026-10-06 22:20:18）保持不变。当前用户要求的对应测试登记、正式示例与手册补充已交付。
