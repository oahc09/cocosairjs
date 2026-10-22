# Box3D 实施进展：runtime226

日期：2026-10-22。实施与测试已完成以下范围，尚不是完整发布验收。没有 commit、push、deploy。

## 已验证

- **C14 修复**：空 mesh 时设置 convex 不再丢失；无效 mesh 回滚不会把后续有效凸体降成 triangle mesh。真实 Firefox Release/Debug 共46项、57项CPU回归通过，59个完整报告负对照拒绝。仅一项 required cell 升为PASS，证明身份是runtime225。
- **C16 修复**：原坡面球在tick38穿透69.558mm。修复静态三角面连续碰撞遗漏及TOI边界，保持原步长、速度、重力、阈值和600tick观察长度。runtime226真实Release/Debug共7200样本的独立有限三角形复核，最大穿透0mm。原50mm瞬时项通过；20mm持续项没有原始持续时间定义，因此完整C16仍不标PASS。
- **礼物工坊**：实际生产1.2.5版本在runtime226、LinuxFirefox153上，五个布局全部完整通关，每局3单、6件不同的实物、340分。路线8346–8381ticks，均低于原9600ticks预算。完整物理流独立重放全部通过，瓶子侧卧稳定1414–1542ticks。五布局完整报告8个负对照、完整物理流8个负对照均正确拒绝。

附代表录像为layout4实际全局，142.4秒，1100×760。没有直接回填商品姿态、速度、称重凭证或成功状态。

## 仍需完成

1. 当前环境可继续：15次真实半单卡货、回收、重新称重和重试，合并五个正常局严格核验20轮生命周期与资源基线；补齐其余业务异常/教学、消费者和相关回归。自动演示仍只允许从未处理的新一局开始，恢复试验将另用公开普通输入。
2. 外部条件：required Chrome宿主、真实Android/iOS与Safari相应项、真人参与者及设备性能测试。Firefox/WebKit或自动化不替代这些验收。
3. 类型声明仍有138项既有诊断，runtime225到226没有新增或消除；不能称严格类型检查通过。

## 身份与范围

- 重建基线：02261afc53caac4cbfae483feff2948da426681a，未改标成更新仓库版本。
- 当前可选runtime：226，JS SHA-256 4e164f92aa12dce35852a3f4f21998ac255ff02519673926c6097613e743df4a。
- 连续面策略：speculative-envelope-static-surface-v1。
- 生产配置1.2.5-ui2-dev3，config SHA-256 ca1f2d0d916163437740114e33ed132cc2e9b7bc0d1734932ad4ac0023847b16。
- required inventory：861项中54PASS、1项历史FAIL待完整资格、691BLOCKED、115NOT_RUN。旧失败和旧构建证据保留，BIZ-AUTO、T34、G5及完整计划尚未通过。
