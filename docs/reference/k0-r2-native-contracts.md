# K0 R2 原生合同复验

2026-10-07。N14固定为a坐标、b角度、c主方向光、d缩放。动态空索引归N3更新合同，不归N4设备初始化。

## 执行渠道

- **Orca Worker**：原始7个新增Jest用例及已有16项，共23项通过，当时typecheck通过，抽取源码零改动。
- **Lead**：补1项真实renderer通知回归，当前新suite为8项；与mesh/state/inspection及glTF animation五套共27/27通过，typecheck通过。原始Jest输出`output/playwright/k0-r2-lead-focused-tests.json`；每项名称和状态登记在[限定审计](../evidence/examples/k0-r2/audit.json)。
- **Lead**：最终[工作区](../evidence/examples/k0-r2/workspace.json)与[实际安装包](../evidence/examples/k0-r2/installed.json)各三浏览器通过，每引擎36状态、56独立断言、35PNG、27项自有引用归还。两mode共216状态、336断言、210PNG。安装包零仓库/build请求。

`tools/verify/k0-r2-native-contracts.cjs`现在是 `k0-r2-rendering.cjs` 的兼容CLI；旧collector已退役，旧probe入口导入同一最终实现。

## 当前原生合同

| ID | 验证与处理 |
| --- | --- |
| N1 | 4096v/23814i真实GPU可见，默认1024及容量前置拒绝保持 |
| N2 | 静态indices/动态indices16或32类型和错误键经生产代码CPU回归 |
| N3 | 100次Partial保留索引/UV/法线，边界和画面移动；通知使用者后空索引清绘制 |
| N4 | 未初始化设备明确AIR_E_MESH_NOT_READY，初始化后可绘制；CPU失败分配/重试保持 |
| N10 | CCW可见，CW/负缩放被剔，显式NONE恢复几何，不自动改索引 |
| N13 | disabled-first/enabled-first雾像素相同，关闭恢复；请求type及非法输入CPU回归 |
| N14b | 90°Z的实际矩阵将+X变为+Y，单位保持角度 |
| N14c | 3组件注册/1主光，禁用和移除后接替，普通legacy-forward容量1 |
| N14d | 父缩放复合，普通/instanced/realtime蒙皮GPU尺寸改变，Billboard由width/height控制 |

材质、glTF、混合与坐标配方见[开发手册](../manual/k0-r2-porting-contracts.md)。

## 失败和边界

Worker首轮5×5 readPixels只分配4字节，未校验GL错误，几何朝向和销毁时机有误，不构成GPU PASS。第二轮未将原始观测写入JSON、只在采集结束读取两次所谓before/after、截图前仍销毁资源，且将未通知输入装配器的旧绘制误归因为清屏行为，同样不被接纳。两轮JSON/PNG在`output/playwright/k0-r2-worker-*`原样保留，第二轮工具源码归档为`output/playwright/k0-r2-lead-rejected-worker-source.json`。

Lead attempt1因首帧前检查reflection与缺renderer通知失败；安装attempt1因route交付Uint8Array超时，转换为Buffer后通过。原始路径`output/playwright/k0-r2-lead-*`保留，无覆盖。

审计重新从PNG计算像素/面积，24种内存篡改全部拒绝；unmin/min source map中的9项生产源码与磁盘字节一致。本轮无需重建，不改变build date/number、默认资源或冻结上游。

全仓库存检查失败：6份历史证据测试副本被发现（4份无法执行）、4项V1.1/V1.2旧矩阵/规格断言失败、canonical库存88对磁盘105套漂移。新8项已登记限定审计；整仓库存未以失败或子集运行伪造刷新。全量测试生成的spec-compliance副作用已归档并恢复。

GPU证据是CANVAS_NATIVE，页面compositor未验。K0旧臂未复跑、旧黑体根因未追溯；当前候选通过不宣称旧K0包被修改，亦不宣称全Gallery、端口35项或release gate完成。
