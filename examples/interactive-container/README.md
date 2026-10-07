# 容器就绪、隐藏恢复和页面代次

运行 `npm run dev -- --example interactive-container`。初始host为display:none，页面不导入SDK；可信Run使宿主非零后才通过单独bootstrap入口初始化。原生GameDiv/Cocos3dGameContainer模板具有父容器宽高；没有应用写screen.windowSize的旧补丁。

ResizeObserver只记录真实CSS并取消旧输入会话，不替引擎写buffer、相机或设计尺寸。页面导航代次与输入/布局代次分开。冷加载被切换标签时保留必要的非零启动布局但visibility:hidden，旧异步回调检查导航token后拒绝回写；最后选择的Run复用同一加载Promise。

布局验收分别等待正CSS、原生buffer/相机匹配和最新提交；PNG仍由独立可见性oracle验收。setViewportSize或class修改返回不表示resize已发生。协议即时回执与观测到布局之后的旧输入取消是两条记录。

## 当前实际结果（Lead，2026-10-08）

[S6规范报告](../../docs/evidence/examples/interactive-engine-improvements/container-s6.json)/[原字节报告](../../docs/evidence/examples/interactive-engine-improvements/container-s6-raw.json)：三引擎×DPR1/1.25/2，63场景PNG中48可见通过、15失败；实际CLI exit1 / scopePassed=false / subset=true / completed=false。布局、buffer、相机、隐藏时保留有效framebuffer、已观测取消、新输入恢复、冷加载Compare→Run及旧结果拒绝均通过，零页面/console错误。

15失败均为WebKit的窄/宽父class布局及随后的恢复/标签/输入场景；首次正尺寸启动与独立冷加载最后Run正常。对应无SDK WebGL2同页对照27张PNG：21可见、6在WebKit resize后不可见；GPU中心仍[255,0,0,255]、glError=0/contextLost=false，PNG中心却是页面背景[17,28,44,255]，控制页零SDK请求。此证据支持环境/compositor责任调查，不能证明SDK核心违反布局合同。

九实例三次CSS观测与原生提交不假造target generation：本页直接渲染主framebuffer，无额外RenderTexture。target generation为不适用；应用代次及layoutEpoch另行记录。AFTER_DRAW不是物理显示时刻。DPR1.25截图设备像素允许floor/ceil量化±1px，不放宽2 CSSpx目标质心预算。

九release同Promise，两自有资产各1→0。释放后再改变父class，实际RO epoch、帧、事件不增长，控件全部禁用；不只信observerDisconnected布尔。[审计](../../docs/evidence/examples/interactive-engine-improvements/container-s6-audit.json)24种像素、原生布局、冷加载、清理、范围/身份及无SDK隔离篡改全拒。原始失败尝试见[索引](../../docs/evidence/examples/interactive-engine-improvements/container-attempts-index.json)，未覆盖历史记录。

**原Puzzle50最小反例和旧应用workaround材料未提供，NOT_RUN。** 此例是独立新配方(recreated)，不关闭原反例，也不称完整IER-06或实体设备旋转/发布验收完成。

`?control=webgl`启动原生WebGL2对照。只有该无SDK分支会按浏览器CSS尺寸设置canvas backing；它不为SDK路径提供尺寸修补。
