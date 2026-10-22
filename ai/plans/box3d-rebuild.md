# Box3D 重建准备与可恢复交付计划

日期：2026-10-22 UTC。本文件先交付重建计划 checkpoint；用户随后已授权独立分支直接重建与阶段 commit/push。计划状态不代表旧实现已恢复或运行验收通过。

## 1. 本次边界与可信起点

- 新目录为 `box3d-rebuild-20261022`，独立 Git 分支 `feat/box3d-rebuild-20261022`。远端同名分支已从真实 main 创建；允许在此分支阶段 commit/push，不允许 main push、PR、合并、部署或 npm 发布。
- 原目录为 `/workspace/scratch/62d43a81bbde/box3d-implementation`。它在本次环境变化后不再存在。Git 仓库、提交记录和本地压缩包若只在同一临时磁盘，也不是跨环境备份。
- 主工程取已核验 main `b573be0741db9e2a13d38ce7e65870b97a1f5fbc`，上游树 `13626c455aaadfea31bab1d9e634e0692045bc18`。该 main 不含完整 Box3D 实现。本次不继承上游更新任务的修改。远端使用真实 main 父提交和增量树；本地 snapshot 根提交只作为恢复备份，绝不作为远端父链。
- 源文件由原始 blob SHA 读取并重新计算 Git SHA-1、SHA-256；不是复制另一个工作树的未提交内容。本地 Git 首提交是诚实的新 source snapshot 导入，不伪造旧 Box3D 历史或上游父链。远端提交将基于完整 main 树增量添加这些文件，不删除本地缺失的上游路径。
- 导入 3,428 个可用主干文件，其中全部 1,493 个 src 文件齐全。另有 6,796 个上游路径缺失，完整本地清单随恢复 checkpoint 保存，简明元数据见 `docs/physics/box3d/rebuild/baseline.json`。这是部分主干快照，不是完整 checkout，也尚未证明可重建依赖闭包。
- v1.2 原计划使用主工程 `02261afc53caac4cbfae483feff2948da426681a`；新 main 增加 Box2D3 主干验收/CI 合并。M0 必须完成实际差异审查，尤其 2D/3D 初始化、失败与释放所有权，不把新 main 身份冒称旧 runtime225/226。
- 物理核心继续锁 `erincatto/box3d@efca0c184d40fd6a82016983f1601c4d23965867`；binding base 为 `isaac-mason/box3d.js@5d5a3af049cccd9948b2b55bac4342414af0ef64`，旧 vendor `8441b4a06d6d09dcfb0b0f704df4d847d1437b92`。emsdk 6.0.2 仍是待实测候选。未因恢复困难改成 Jolt、XPBD、旧 core 或旧 WASM。

## 2. 可复用、参考和待重建

| 资料 | 本次用途 | 不能据此声称什么 |
| --- | --- | --- |
| 完整 v1.2 原计划（已读全文） | 契约、35 项任务、9 阶段、9 示例及 91 个主类别的权威设计输入 | 文档不是实现，不是测试 PASS |
| 经 hash 核验的 main 源快照 | 新重建基础，复用现有 Node、PhysicsSystem、Box2D3、builtin/Cannon、构建结构 | 不含旧 Box3D adapter；部分非 src 文件尚缺 |
| C14 补丁，1,905 字节 | 保留原始修复意图，等 shapes/rollback 的真实上下文恢复后重新审查应用 | 不是完整三个文件，不能直接恢复可运行后端 |
| C14 初始 CPU 输入，15,234 字节及来源说明 | 后续重建回归测试的输入参考，保留初始字节 | 不是历史最终格式化测试；fixture/native 模块仍缺；语法检查不是测试通过 |
| runtime226 短报告 | 历史已观察结果、缺口和风险线索 | 旧 54 PASS、7200 样本、五布局通关不可迁入新验收 |
| 礼物工坊代表录像（仍在 Library） | 体验与行为参考；需要画面判断时另行读取像素 | 不是源码、输入流或完整五布局证据 |
| 其他候选旧包 | 等恢复调查按内容/身份交付，逐文件核验后可纳入 | 名字、日期、包内报告都不能证明旧 Box3D source 已恢复 |

本次完整保留恢复材料原始字节及 Library 身份。恢复调查进一步扫描五份候选ZIP的全部5156个文件（288,947,012字节解压内容），未找到Box3D/礼物工坊；PR8 sourcemap的939份基础源码逐blob与当前main一致，仅可复用基础引擎，不是Box3D。补丁 SHA-256 为 `4d8acea1fc9eccc4f22bb1724dab85487fb696d609890814d8cb696493eba41f`；初始 CPU 输入为 `1ca5d85805f168403b5c6b33087e692d36114894df5894d2cb02d958ff9341c8`。

必须重建：Box3D adapter/world/body/shapes/joints/loader/feature 接入、迁移后的 binding/native build chain、C16 candidate-5 最终修复、正式运动控制与 rollback、EX01–EX09（含 EX09 生产 1.2.5 与普通输入恢复）、全部 runner/validator/fixtures、原始连续物理流与失败负控、包与声明的完整身份链。没有找到的源码不根据报告“还原成原版”。重新实现使用新版本身份。

## 3. 旧缺陷转换成重建硬性检查

1. C14 的凸体开关不能依赖 mesh 已存在；pending-null、disabled、无效 mesh、重复拒绝再有效更新都必须测试。拒绝后组件字段、mesh 对象身份、native 几何、下一 tick 行为及资源数一致，验证→准备→提交且可回滚。补丁三处不替代其依赖的 shape rollback。
2. C16 历史坡面球在 tick 38 有 69.558mm 穿透，修复涉及静态有限三角形连续检测和 TOI 边界。最终 native patch 已丢失，不能将旧 candidate 或描述当修复源码。保留原 dt、速度、重力、600 tick 窗口与失败 fixture；新修复须独立有限三角形复核和负控。
3. C16 原 50mm 瞬时项与 20mm 持续项分开：持续项缺少原始持续时间定义，M0 在运行前冻结时间/采样规则并版本化，旧结果不能证明该项 PASS；不能事后改阈值消红。
4. EX09 的正常自动演示只能从新局起；半单卡货恢复用公开普通输入，不重用新局专用 runner 当恢复适配器。不能写商品姿态/速度、凭证或成功状态来补通关。
5. 五正常局不替代 15 次异常恢复；20 轮必须逐轮完整、有物理流、代际/账本/资源闭合。中断第五轮不把前四轮称为五轮 shard，失败和未完成记录不删除。
6. 事件与 contact 快照必须同一时刻；sensor CCD 承诺按真实路径而非一刀切。资源 late arrival、destroy/disable/rebuild、ID 复用及 2D/3D 失败清理分别验证。
7. 历史 138 项类型诊断不是本基线的已核验现状，也不等于严格类型通过。重建前后各自采集本次诊断并比较，报告现存、增量及是否真正通过。
8. Firefox/WebKit 与自动化不能替代 required Chrome 宿主、真实 Safari/Android/iOS 或 BIZ07 三位首次使用者；缺资源保留 BLOCKED，不缩分母。
9. 原源码和证据只存临时文件系统是本次恢复缺口。每阶段“代码完成”必须同时满足版本化、外部持久化、异地重新取回与干净恢复演练；只有报告或视频绝不算源码已备份。

## 4. 分阶段实施与验收

首个 checkpoint 只创建 source snapshot、资料、状态和备份门禁；它不等于 G0。用户已授权后续直接按完整计划实施，无需再次等待“准备通过”的口头批准。原 v1.2 全文保存在 `ai/plans/box3d-v1.2-reference.md`，不删 required 能力或新增默认后端。各阶段同时只允许一个主阶段 IN_PROGRESS。

| 阶段 | 工作与主要任务 | 进入/结束条件及 checkpoint |
| --- | --- | --- |
| P0 重建准备 | 独立 Git；真实基线；恢复材料；任务/测试父类别；恢复工具与首包 | git fsck、原始 blob 校验、bundle 干净 clone、Library 取回后二次恢复；当前不写大范围产品实现 |
| M0/G0 | T00–T03、T32：补齐依赖源码；基线差异；API/能力/阻尼/快照/事件/ownership；设备台账；EX09 配置与 fixture；冻结 required 子例 | 版本/接口/负控/预算/分母有机器可读版本；未知设备与人明确 BLOCKED；持续穿透定义先解决；阶段源包和 Git bundle 持久化 |
| M1/G1 | T04–T07：固定 core/binding ABI 差异；宿主 CMake；ST SIMD；静态 reader、loader、ID/memory/ownership | 真实固定目标 core 构建；非隔离浏览器运行；Debug/Release 和 CSP/内存/销毁契约；build 输入、WASM/JS/manifest 与 raw 样本一同备份 |
| M2/G2 | T08–T12：应用准入与 prepare、world/body、质量/力/阻尼、target/teleport、app 生命周期 | 真实 box/sphere 路径；无第二 RAF/累计器；2D/3D LOWLEVEL/BASIC；目标冲突/回滚与关闭守卫；不得提前声明复杂事件通过 |
| M3/G3 | T13–T16：其他 geometry/cooking、事件、查询、CCD、共享资产与完整生命周期 | C14 回归、C16原失败/新修复/独立复核优先；C21快照/C22瞬时sensor/C28边界；保留失败对照与完整流；复杂回调/late arrival/persist 通过 |
| M4/G4 | T17–T19：P2P/Hinge/Fixed 与 AIR 扩展、unsupported 负例 | Fixed disabled 配置→enable 接合不瞬移；单位/限位/电机/断裂、D6等拒绝；不可用能力不做空 wrapper |
| M5/G5 | T20–T23、T33/T34：EX01–EX06、EX09；BIZ 自动路径；宿主回归；pack/d.ts/文档 | BIZ-AUTO 与 ST-HOST 仅为技术检查点；五正常布局+15异常恢复、20轮闭合；核心消费者；BIZ07真机/真人未完成则 G5 不 PASS |
| M6/G6 | T24–T26：MT、胶囊 mover、record/replay；EX07/EX08 | 三项独立能力各验收；不声称通用 box controller、rollback 或任意 ABI 录制互通；对应源码/工件/证据分别 checkpoint |
| M7/G7 | T27–T29：冻结真实设备预算、性能、五项独立 Agent 验收 | raw逐tick、五run最坏P95、冷启动30次、100轮资源与移动30分钟；EX09业务/改版；不能用 Node紧循环或菜单均值替代 |
| M8/G8 | T30/T31：最终冻结身份，完整消费者与全部 required inventory | 同一 source/build/ABI/fixture/config；9示例与全部子项；源码/工件/raw/失败/许可证完整持久化并恢复演练，才允许“完整计划完成” |

91 个主类别只代表 C36+WASM15+I10+A10+BIZ8+P7+AG5。历史 861 个 required cell 的原始 inventory 已丢失，不能照搬数字或制造 861 行空记录。本次 `rebuild-state.json` 的 91 行均为 NOT_RUN，`inventoryFrozen=false`；M0 必须从原计划所有固定子例×required 环境×variant 重新展开并审查分母。

## 5. Git 与持久化门禁

### 5.1 开工与提交

- 新工程先建立 Git，再产生业务修改。确认根路径、分支、HEAD、工作区差异及权限，不在另一个任务的工作树开发。
- 当前明确授权此独立 Box3D 分支的本地/远端阶段提交。只通过真实 main parent/tree 增量提交，不将本地 snapshot 假接到历史；不扩大到 PR、main push、合并或部署。
- 功能、缺陷修复、测试与文档使用清晰独立提交；每个工作段结束前提交可恢复状态，不以长时间未提交工作树替代版本历史。
- 每个可用阶段打命名 checkpoint tag，并生成包含全部 refs 的 Git bundle。提交源代码、构建脚本、锁文件、fixture、validator 与证据索引；大工件和原始流另封存并记录 SHA-256，不能依赖被忽略的 output/ 或机器缓存。
- 不在 Git 保存口令、密钥、token、浏览器 profile、node_modules 或与本项目无关的私有数据。

### 5.2 阶段交付顺序

1. 格式化→静态检查→固定源码 commit/tree；改变源码后使受影响证据失效，不改旧报告身份。
2. 实际构建/测试，收集真实退出码、完整 raw、失败、负控和运行环境。代码/构建/fixture/config/validator 的 hash 必须能相互对应。
3. 生成 Git bundle、工件归档及外部 checkpoint receipt（避免把自身 hash 写进自身造成循环）。receipt 标明是否包括可重建工具链与依赖。
4. 从 bundle 在新目录无依赖 clone，运行 git fsck，逐文件核对 tree/bytes、refs 和历史；不能只执行 bundle verify。
5. 保存到用户 Library，取得已确认身份；从 Library 重新取回相同工件，比对外层 SHA-256，再解包并在另一个空目录恢复 Git。此步骤通过前不能宣称持久备份完成。
6. 下一阶段可记录上一阶段的已确认 receipt，但不能对未完成/未验证上传写成功。恢复失败先保留坏包与日志，修复或重传新版本，不继续扩大实现。
7. 当前准备没有运行物理测试，恢复工具的 PASS 只能说明源码与 Git 包可恢复，不代表引擎功能、构建或 G0–G8 PASS。

### 5.3 每次环境变化后的第一步

优先取回最近经验证的 checkpoint；确认 commit、分支、依赖闭包和证据身份；运行 fsck 与 hash检查；检查缺失/脏工作区。验证通过前不从旧报告续写“已完成”。source-only checkpoint 能恢复源码和计划，但运行产物、工具链、raw 数据不存在就明确列缺，不能承诺无需网络重建。

## 6. 下一次正式开发的第一批工作

1. 合入恢复调查新发现的真实文件，保留原来源和 hash；报告/截图仅参考。此动作不改写当前 import commit。
2. 补齐 M0 必需主干文件（当前缺失包括一个 verify 工具、部分测试/vendor、三个许可证与六个 workflow）。原始 SHA 清单已具备；先取得 build/test/license 闭包，不用空 stub。
3. 单列 main 相对 v1.2 的差异，固定开发容器/工具链和网络资源。获取 core/binding 目标源，40提交 ABI 差异审查不能省略。
4. 完成 M0 契约、fixture、required 子例与资源台账，包括 C16 持续定义以及 EX09 初始配置/输入。
5. 实施首个垂直切片：固定core → 真实 ST WASM → 最小body/query/destroy → 独立source/build/raw checkpoint。它通过后再扩展完整 adapter，不先做大 UI 或复写九示例。

不重做 Jolt/XPBD；不从失败的历史状态复制 PASS；已获得独立分支直接重建授权；技术Gate具备后按依赖自主继续，不为每一阶段重复请求批准。
