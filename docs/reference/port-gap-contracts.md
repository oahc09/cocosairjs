# 端口缺口实施合同

本合同对应 [实施计划](../../ai/plans/port-gap-remediation.md) 的 S0。2026-10-03 用户授权实施整份计划并由 Lead 主导、现有 Orca Worker 配合；该授权不包含提交、发布、外部消费者迁移或代签 owner 决议。下列公共接口为本轮增量实现的共同边界，实际交付和验证见 [台账](../../ai/ledgers/port-gap-remediation.md)。未实现接口不得当作当前 API 使用。

## 启动、配置与释放

- 保留主入口的 eager import 及现有 `createAirApp`、`AirAppImpl` 导出。新增 `cocosair.js/bootstrap` 子路径只依赖 DOM、类型和动态导入：先解析唯一 canvas、验证配置、设置 `__CC_CANVAS__`/DPR，再导入同一份运行时。不得将整个引擎内联进安全入口。
- 单例状态为 `idle / initializing / ready / failed / closed`。同 canvas、规范化配置相同的并发请求共享初始化和 app；不同 canvas 或配置拒绝，错误带稳定的 `AIR_E_*` 代码。默认值与显式默认值相等。回调按身份比较，不以 JSON 序列化掩盖差异。
- `pixelRatioCap` 为有限正数，默认 2，保留 `__CCDPR_CAP__` 兼容。安全入口在 import 前写入；首次缓冲尺寸和 resize 读相同规范化值。既有 eager 使用者须在 import 前配置；初始化后冲突不能静默改变全局状态。
- `designResolution` 使用 `{ width, height, policy }`，有限正宽高；policy 采用原生 `ResolutionPolicy` 支持的固定枚举。初始化后、运行场景前调用原生 `view.setDesignResolutionSize`；不建立第二套坐标换算或修改 body/CSS。
- `diagnostics` 采用 `'errors' | 'warnings'`，默认 `'errors'` 保持兼容；warnings 使用原生日志模式并由现有 debug session 捕获。正常剔除、无权重关节及合法 UBO→texture 自动选择不得升级为默认错误。
- `releaseScene()` 返回 Promise receipt；成功后 `getScene()` 为 null。在途重复释放返回同一 Promise，释放中 `run()` 拒绝。receipt 明列释放对象、保留的 runtime/cache、pending 和测量不可用项。暂停、未开始主循环或 context lost 也执行 CPU 清理，不等无限的 AFTER_DRAW；默认 5 秒内成功或明确清理失败。
- 首批 `close()` 若实施，仅承诺终止本 app 并要求 reload；不承诺同文档重建底层 singleton/GPU。该范围需以真实正负例审查后确定，不把 `releaseScene` 等同关闭 runtime。
- session scope 持有幂等清理回调和 generation token；deactivate/restart/dispose 撤销旧 generation。节点销毁、最后资产引用释放、GPU测量是三种不同证据。

## 输入动作

- 可选 `createActionState` 纯 reducer 与适配器分离；适配器后端二选一 `native` 或受控 `dom`，不得同时订阅两路造成双计数。保持原生鼠标转 TOUCH 通道。
- source 至少标识 backend、physical code/KeyCode、pointerId。每个动作持有 source 集合；释放其中一个不会释放其他键/触点。repeat 不重新产生 press。
- transition 队列保留顺序，`consumeTick()` 每次消费且不重放；0 tick 的快按/快放保留至下一业务 tick。held、pressed、released、axis 明确区分，业务 accumulator 不使用测试 `createStepClock` 代替。
- editable 中 keydown 不准入；已持有 source 的 keyup 仍释放。window capture 的准入依赖 active-session token。blur/hidden/pause/restart/session deactivation/dispose 分别 reset，普通 HUD 不 reset；只有明确 Start/Resume 操作可请求焦点。
- inspector 仅在工具侧 opt-in，最多 80 条、只读快照至多 2Hz；不记录文本、全页按键，不持久化或发送网络。测试注入必须进入现有 input 派发链，并标为合成输入。
- native触摸适配器只消费原生逐触点派发的event.touch；getTouches保留整批，可能包含被UI吞掉的兄弟触点。可选tools/debug/test-input通过合成DOM进入PAL，配对自持触点/按键，不启第二时钟；合成回执不认证焦点或实体设备，见[测试配方](../manual/test-input-injection.md)。

## 资产加载与所有权

- `AssetBank.load(url, onProgress?)` 兼容保留；增量 overload 接受 `{ ext?, signal?, onProgress? }`。带后缀 URL 自动使用原生推断；无后缀 URL 首批支持显式 `ext`，可选 magic-byte 推断另以真实请求验证，不以 TS泛型猜资源类型。
- 在途共享的键包含 URL 和影响解析的规范化选项；相同 URL 的冲突选项明确拒绝或独立加载，不静默复用错误类型。signal 是订阅者取消；取消一个订阅不能取消其他共享者。底层请求不可取消时明确记录，迟到结果无活跃持有者则归还本 bank 的引用。
- 每个 bank 对每个持有资产仅有一份引擎 addRef；订阅 refCount 与引擎 refCount 分开。session 结束撤销等待者，迟到结果不再挂入旧 scene。不得强制 releaseAsset 破坏共享拥有者。
- atlas 纯解析和 SpriteFrame 工厂分层，多页由调用者显式提供纹理；region 复用原生 rect/rotated/originalSize/offset，不烘焙 canvas。工厂持有/归还的 texture/frame 引用须成对可观测。
- `parseFnt(text)` 支持文本 BMFont；资源工厂明确单页范围，多页拒绝且不改变已有资源。相对页面 URL 基于 `.fnt` URL 或显式 baseURL；失败与成功 dispose 均归还持有引用。

## 形状、类型与能力声明

- `createPrimitiveGeometry` 用 discriminated union 薄转发原生 box/sphere/cylinder/cone，返回 `IGeometry`；仍通过 `utils.createMesh` 生成 Mesh。验证有限尺寸、半径、段数、arc，四种合法输出与原生相同，不更改原生签名。
- JS/TS 误用检查独立于原生兼容 API：Scene.addComponent（原生弃用 stub）、addChild 的 void 返回值、primitive 不是 Mesh。不得为检验便利改变 Scene 的历史声明或 addChild 返回值。
- `exported / bundled / configured / verified` 各自记录。builtin 碰撞不等于刚体，HEADLESS 不等于 GPU，合成 DOM 事件不等于可信设备输入。十类 NP 和六类配方保留计划的完整范围。
- 外部30项目、Spine 2.1端口资产不可访问的分支明确标为待材料；Spine转换/UI mesh/Billboard设计选择用具体备忘录供用户决定，不伪造已有批准。

新实现、声明、正负例和浏览器证据须引用同一候选身份。正式报告和共享 bundle 由 Lead 统一生成；Worker 可修改明确分配的独立源文件。

## 非等比设计视口增量（2026-10-04，PG-08/35）

实际原生投影在978×846→360×780窗口下复现左右裁切。补原生Camera正交半宽 `orthoWidth`，0表示沿用既有 `orthoHeight * aspect`；有限正数指定世界半宽，负数/非有限数拒绝并保留旧值。透视投影忽略此项。序列化组件、渲染相机投影/逆投影与模型池初始化共用同一值，不新增平行相机。

Canvas在alignCanvasWithScreen且非targetTexture的路径，按windowSize.width/view.getScaleX()/2和height/getScaleY()/2配置两个半轴，使EXACT_FIT的显示与原生screenToWorld/hitTest/getUILocation一致；其他policy在两轴同scale时得到原有宽高。targetTexture沿用既有自动纵横比，复位orthoWidth=0。createUICanvas不对根节点做隐式非等比scale，不改变body/CSS。独立相机默认orthoWidth=0，旧3D行为保留。

范围决议已定：Spine2.1不支持、UI-mesh薄封装、公开原生Billboard，见owner第13节；上文分支待决描述为2026-10-03历史合同。AG外部材料缺口继续披露。
