# Box3D 后续补全执行台账

本台账记录 2026-11-01 获授权后的后续实施；不替代
[原始 35 项任务、91 类验收及 G0–G8 计划](../plans/box3d-v1.2-reference.md)，
也不是正式验收证据。历史失败、原有冻结记录和候选锁保持不变。

## 当前执行顺序

| 状态 | 工作与交付 |
| --- | --- |
| completed | 修复 Windows 源码清单、严格补丁暂存、编译清单比较及构建参数路径；增加两目录逐字节和拒绝漂移检查 |
| completed | 恢复旧 API 契约原件及独立只读历史入口；完整恢复原 2,128 cells / 186 definitions，保留全部 NOT_RUN |
| completed | 更正 world-control 的过时状态、恢复拖拽读回测试真实依赖，补充当前构建与使用指南 |
| completed | 用锁定官方工具链重新构建 ST、审计原生产物、检查消费门禁，生成匹配的可选 SDK/声明并执行真实浏览器检查 |
| completed | 完成当前真实资源负向验证并保留共享测试的平台失败，明确有限通过范围 |
| pending | 按原始要求补齐其余公开能力、示例和验证覆盖；原历史失败套件不因部分新测试通过而清零 |
| pending | 完成 MT、角色移动、录制回放及对应高级示例与完整消费者验收 |
| pending | 在实际目标设备、浏览器及真人参与条件下完成性能、业务与独立 Agent 验收，最后重跑同一最终指纹的完整矩阵 |

## 本次已经执行的定向检查

- 当前 CPU 集合：186/186，零跳过。包括源码暂存、历史恢复、world-control、应用准备、loader、空世界释放和 EX09 关闭策略。
- 拖拽读回：7/7。只补充真实 `constraint-state-control` 依赖，原有断言未删改。
- 在恢复出的独立原始输入树上，原冻结/展开测试：42/42；canonical v2 API 保留，旧指纹不变。该结果只证明历史可恢复。
- 新指南及变更文档的本地链接已检查。当前 CPU 结果不构成真实 WASM、浏览器、真机、性能或完整原始 Gate 的通过证明。
- Windows 门禁修复后，凸包路径与模块关闭/声明/loader 相关检查：73/73。合法 POSIX/Windows 路径重定位均覆盖，逃逸、控制字符、编译清单漏项/重复/乱序仍拒绝。
- 新鲜声明生成退出 0；保留原声明生成器的弃用、TemplateLiteralType 和 interface element 提示。三个现有示例的 noEmit 检查为零诊断，但其 `skipLibCheck=true`，不代替完整声明检查。
- 新公开类型消费者在 ESNext、Node16 下均为零诊断，`skipLibCheck=false`；覆盖配置、before-step 生命周期、只读运动快照与分离的关闭收据。声明 SHA256：`740a99533bac36f08d9fbead737c42f1b9678e510b03517d7d734b80d9d0ad08`。首次消费者漏判 `AirApp.close` 的既有可选性而失败；原失败日志和 fixture 已保留，修复消费者存在性检查后通过，未改变公开 API。
- Windows ST attempt2：构建 47 条命令、独立基线 57 条命令均 PASS；产物审计 PASS（87 编译单元），真实资源消费门禁 PASS。原始收据位于 `tools/physics/box3d/output/windows-st-20261101-attempt2/`。
- 匹配的可选 ESM SDK **254** 构建退出 0，运行时 SHA256 为 `3faacdd7243d0602df4a469ee6ba3b76a365b8c21a7a0729424c583b6983f908`；完整资源位于任务目录的 `runtime/`，未覆盖默认发布包。基于该产物的四个公开 WASM 场景全部退出 0，共 197 项检查通过，仍为有限范围结果。
- 实际 Chrome 156.0.8078.74 与 Edge 156.0.4314.58 分别完成 EX02 **20 轮重置 / 13 项检查**，均为 `LIMITED_OBSERVED_LIFECYCLE`，应用关闭及 `browser.close` 返回，无 page/console/HTTP 错误。已人工查看 Chrome 运行/第 20 轮重置/关闭及 Edge 运行截图；场景、物体及关闭后控件状态正常。截图复核另存 `desktop-screenshot-review.json`，未改写采集原件。无源码或运行时漂移；这不证明完整资源普查、物理进程关闭或全部物理行为。
- 本次 `verify-current` 第一组为 **180/186 通过，6 失败，0 跳过**，整体退出 1；后两组按原 runner 的失败中止规则未重跑，前面单独执行的 29/29、8/8 结果不改写为此次 runner 的通过。4 个共享 source-binding 测试在文件符号链接夹具创建时报 `EPERM`，2 个资源消费测试在符号链接夹具创建时报 `EISDIR`；相关断言未运行完，不能记作成功或删除。需要支持对应符号链接夹具的平台复核，不更改系统权限来绕过。
- 同一次真实资源测试中，正向完整资源分发、真实 Node loader/世界释放及 **52/52 类原始篡改与重建后重复拒绝**通过。完整负向清单为 `output/box3d-assets-tests-Z3635t/rejection-inventory.json`，状态 `PASS_ALL_52_RECONSTRUCTED_AND_REPEAT_REJECTED`；该子集不消除上述 6 项失败。
- 两个浏览器均完成关闭；任务专用开发服务器已按核验后的进程 ID 停止，端口 7479 不再监听。

## 当前本地尝试与限制

2026-11-01 用户明确答复：真实 Android、iOS、Mac Safari 环境及三位首次试玩者均为
**待安排**。这些资源相关验收保持待验收/资源阻塞，不以桌面仿真、WebKit 或 Agent 替代；
本次不再重复索取安排。其他可独立执行的代码与桌面自动检查继续。

第一次新原生输出为 `tools/physics/box3d/output/windows-st-20261101-attempt1/`，结果 **FAIL**：
87 个主编译单元和独立旧核心对照完成，但第 45 条 CPU/声明测试命令因 Windows 文件名后缀匹配失败，
导致 4 项测试失败；第 46/47 条不因其他子集通过而视为已执行。原失败收据及日志保留。
源修复后另起 `tools/physics/box3d/output/windows-st-20261101-attempt2/`，不重标第一次失败。
任务原始日志及工具链记录保存在 `output/box3d-completion-pqo_pukj/`；这些是本地保留目录，
并未声明已上传或发布。编译/审计/消费者的最终结果须以各自真实退出码及收据为准。

发现的历史失败包括：旧 Capsule/构建 source-control 测试仍依赖旧接口或旧精确清单，
旧 Hull 测试的加载器缺少后来引入的真实依赖，canonical v2 API 不匹配旧 v1 指纹。
保留原始失败；历史恢复只解决可恢复性，不把当前版本改回旧接口，也不自动认定这些测试已完成迁移。

新公开指南位于 [docs/guides/box3d.md](../../docs/guides/box3d.md)。刻意 unsupported 的
Plane、Simplex、完整 D6、动态凹网格等能力不因本次后续补全而自动扩大项目边界。
