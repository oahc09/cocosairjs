# Box2D 主干整合复核

结论：**尚未通过合并门禁**。Box2D 原始实现已提交，最新主干 `aaf58b14` 已整合到功能分支；
工作区中的实现不再游离于 Git。未推送、未合入本地或远端主干、未发布，版本仍为 `1.0.0`。

## 已完成

- `ac59bafd` 保存原始 Box2D 接入；`921ddaf8` 整合主干，保留 `./math` 导出、异步 math 构建及 Box2D 资产复制。
- 开发版、压缩版、source maps、主声明和 Spark 构建通过。
- 运行时回归 12 suites / 137 tests、SDK/math CPU 42 tests、CI 策略 50 tests 通过。
- 证据工具 22 tests 通过；另有 2 tests 明确保留为未在本宿主执行，不计入通过数。
- 真实 npm tarball 的离线安装、Node math 导入、两种 TypeScript 解析模式通过。解包 Box2D JS/WASM/许可与 receipt 完全匹配。
- 类型、格式、文件映射、许可、文档引用、Web-only 和 Box2D 冻结源码检查通过。
- 修复打包回归 fixture 的 Box2D 依赖闭包、Windows npm 调用、换行路径 Git fixture 及诊断逻辑路径的分隔符。
- [原始候选归档](../box2d3-acceptance/archives/initial/archive.json) 保存先前 1359 份原件，未改写历史指纹或 PASS。

运行时构建与包消费基于 `921ddaf8`；其后的改动仅涉及诊断路径、复核文档和证据运输。
每个报告的实际输入与当前运行时字节见 [复核记录](verification.json)，不把历史浏览器结果继承给整合候选。

## 未完成的门禁

| 项目 | 当前状态 | 原因 |
| --- | --- | --- |
| 整合候选的三浏览器 Box2D 全量复测 | BLOCKED；启动尝试为 FAIL | Chromium 在载入页面前报窗口类注册失败 `0x36B7`；Firefox、WebKit 也在启动时退出。原始案例执行数为 0，不属于模拟行为失败或通过。 |
| 整合候选的 SDK 浏览器配方与 tarball 浏览器检查 | BLOCKED | 显式选择正确 Chromium 可执行文件后仍在启动阶段失败。 |
| 正式五核心案例 CI 收集及完整证据工具控制 | NOT_RUN | 正式收集器要求 Linux `/proc` 和进程保管协议；符号链接控制需要本宿主没有的权限，compiler 子进程控制读取 `/proc`。 |

原先 Windows 尝试中的失败记录均保留。换用 Node、单浏览器重试及系统 Chrome 的诊断没有解除启动问题；
没有关闭用户的浏览器、重启系统或修改系统设置。

下一步需要在可用的浏览器宿主复测，并在 Linux 运行主干 CI。功能分支尚未推送，因此这里没有远端 CI 通过声明。
所有门禁通过后才可合并主干。Gallery 清单和 canonical example campaign 不在本次变更范围。

## 原件

[原件索引](artifacts.json) 和 [分卷归档](archives/archive.json) 包括本轮成功检查、失败尝试、完整报告及实际 tarball。
它们恢复原始逻辑路径，不依赖本机原来的 `output/`。归档核验命令：

```bash
node tools/verify/box2d3-archive.cjs --check=docs/evidence/box2d3-merge-main/archives
```
