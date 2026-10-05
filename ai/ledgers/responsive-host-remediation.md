# 响应式宿主与游戏配方修复

2026-10-05。范围为 SHARED-001–007 及附件中的缓存视图、棋盘配方和统计口径。未提交、未发布，不修改版本。

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| R1 | PAL 实测尺寸通知、父容器观察、隐藏恢复、退订、公开容器启动、DPR | 完成，本仓三浏览器验证 |
| R2 | Label 单行参数、输入/视觉缓存/棋盘与 restart 配方 | 完成，本仓三棋盘及 100 次重开验证 |
| R3 | 负例、单时钟截图、证据身份与 unknown 聚合、浏览器验收 | 原生 PNG 范围完成；页面合成通道仍有实际失败 |
| R4 | 外部 50 游戏去 workaround、宿主迁移、707 场景重采 | 等待用户提供原工程，本轮 NOT_RUN |

原站证据与 50 游戏工程不在当前仓库；在线链接返回 401。可复用的修复和验收在本仓实现，不能用本仓三棋盘测试冒称原站 50 游戏、707 场景已重采。

## 实施与验证

- `screenMode`/`container` 以原生 wrapper 和 settings 启动；省略时保持原默认。非法容器、初始零尺寸、冲突配置明确报错；原生 settings 的 null 表示未配置，已补回归。
- PAL 只经生成器补丁更新，冻结 MIT 原件不改。实测尺寸+有效 DPR 去重，ResizeObserver 合并，隐藏恢复，关闭断开 observer 和密度监听；原始 DPR 负责监听，有效 DPR 负责分配，不能绕过 cap。
- `labelNode.enableWrapText` 显式控制 SHRINK/CLAMP 换行，省略保留默认，非 boolean JS 值报错。
- 可选 board-state 配方：原生局部坐标格子、确定 seed 保存/恢复、合法滑动打乱、视觉缓存。模型与原生对象分开重开，资源清理按 session 归属，关闭后 HUD 与输入不再作用。
- 输入只消费一套主点击，另保留 hover/Flag；KEY_DOWN/KEY_PRESSING/KEY_UP 分清，字符走 DOM input；真实移焦后 keyup 仍释放 owner。
- 聚合器拒绝 UNKNOWN 填零、未知清单填空数组、重复 attempt 和缺失预期 project；静态位置、独立用例、执行次数分开，缺失指纹保持 null，不生成首次成功率或平均成本。

当前开发 bundle：`d23e90889afddf83e39e96887cd39ddbe095179c8c97daf35a949f2ac78026c0`。`build:all`、typecheck、PAL 重现、Web-only、file-map、实际安装包消费通过。相关七套单测共 56 项通过，聚合器追加断言单独再跑 7/7；相关格式与文档引用通过。没有整仓 Jest/全 Gallery/旧矩阵重采，也不声称发布就绪。

最终 `--capture=canvas`：Chromium/Firefox/WebKit × DPR1/2 各 42 项，另三浏览器各验证安全入口+cap1.5、显式窗口和默认窗口，15 个配置行全部 PASS。原版 b1ef301 在响应式 resize 后 buffer 和真实命中失败，原版应用 workaround 恢复；候选没有该 workaround。截图检查固定框单行、动态缩字、多行、fixture 零时间呈现、pulse 中途/结束和 Pause。相同尺寸去重、零尺寸、DPR 变更和 setter/比例模式另有 CPU 合同回归。

## 失败链与边界

保留失败原始报告，不重绑旧 hash：首次示例误把组件挂到 Scene；随后精确边界点击出现舍入差异，改为留出一个 CSS 像素容差的内侧点；新增启动冲突检测曾把 null 当已配置，已修复并补回归；回执标签带 #序号、已销毁 UI children 为 null，测试/检查器已遵循实际生命周期。

当前 Windows WebKit 在 page 截屏通道会出现空白：原生 readPixels 为目标颜色 `[210,185,110,255]`、GLerror=0、canvas PNG 正确；实时帧、RAF、CSS 和两个本机 WebKit revision 对照没有消除页面截屏差异。本轮明确提供原生 PNG 模式，并同存页面图及同点对照；`scopePassed=true` 仅表示该原生输出范围，`pageCompositionPassed=false` 仍保留，不宣称页面合成修复或物理 Safari/显示器 present 认证。

证据索引：[本轮原始结果及截图](../../docs/evidence/examples/responsive-host/index.json)。历史失败只保存已有实测数据；部分早期未提交源/SDK 没有字节快照，不冒称全历史可精确重建。旧 Gallery 和渲染 DX 完整证据仍绑定各自候选，不能作为此新 bundle 的全量证明。

## 运行入口

`node tools/verify/responsive-host-browser.cjs --capture=canvas --out=<new.json>` 要求当前 bundle、Git 中 b1ef301 原版、可用 Playwright/浏览器；只写新报告和相邻截图，禁止覆盖、不构建、不下载。省略 capture 使用 page，保留其失败语义。

`node tools/verify/integration-attempts.cjs <attempts.json> --expected=<projects.json>` 只读验证已给出的尝试和预期项目清单，不创建历史数据。完整合同和可运行配方见[手册](../../docs/manual/responsive-board-recipes.md)。
