# 引擎合同改进 ENG-01–09

2026-10-06，起始 038b186。保留 build/build.zip、err.txt、out.txt；本轮不提交、不改版本。不把 K0 历史材质问题当作当前已复现缺陷。

| 批次 | 范围 | 状态 |
| --- | --- | --- |
| A | ENG-01–04 动态容量、索引、局部更新与失败清理 | 完成，7 个新增回归 |
| B | ENG-05 Fog 配置、ENG-06 动画控制器诊断 | 完成，原生状态与路径回归 |
| C | ENG-07 属性合同、ENG-08 TRS/剔除、ENG-09 主方向光能力 | 完成，只读接口及实际像素 |
| D | 相关回归、实际像素、当前 SDK/声明/包消费与文档 | 完成，定向门禁通过 |

保留原生对象体系与有效调用语义；错误前置，开发诊断显式启用。Windows WebKit 的页面截图 resize 缺陷与原生 framebuffer 像素分开记录，不重写历史失败。

## 交付与结果

ENG-01–04：默认容量仍 1024，显式配置完整校验；静态/动态索引字段误用报错；动态 Partial 更新按属性名匹配，不重传未变索引；非法属性、数量、范围和 bounds 在写入前拒绝；设备未就绪明示，分配失败清理全部已分配 buffer，out 可重试。新增 7 项回归检查实际 bytes、drawInfo、bounds 和 GPU 更新调用。

ENG-05：底层 Fog 保存请求类型，disabled getter/宏保持 NONE，启用/关闭/重新启用顺序一致；公开 FogInfo 保持兼容。

ENG-06：同节点多个 Animation 的 load/play 通过 warning 通道提示；跨根目标由 TrackPath 解析的只读检查列出潜在属性重叠，不冒称同时播放或禁止合法分工。

ENG-07：只读 mesh/material 合同区分宏关闭、缺属性、真实 GPU active attribute 未消费和 UV 常量回退；提供 renderer 时读实际 subModel shader variant，基础 pass 尚未 GPU 编译时明确 unavailable。

ENG-08：原生本地/世界 position/rotation/scale、Euler 和 setRTS 预检，非法 JS array/单数 overload/NaN/Infinity 不污染变换；零缩放合法并诊断 singular。检查实际 world matrix、负 determinant、三角形绕序与 normal dot；不猜相机可见性。

ENG-09：提供只读普通方向光列表和实际 mainLight/legacy 容量，额外方向光在 warning 模式说明边界；保留原选择、移除策略，不新增多方向光照明。

当前 unmin SDK：`ba9a0c0fc04e74df64db468ca259fc71a4d80f1b56903cfb844dfe98d856c208`。相关六 suite 33/33（含原蒙皮缓存、glTF 实例动画、雾专用 effect）；新增三 suite 共 16 项。typecheck、build:all（含 min/dts/npm 副本）、Web-only、file-map、PAL 重现、实际安装包 JS/TS4.9 消费、相关格式和文档引用通过。upstream mapping 1324 行、modified 115；API inventory 由当前 dts producer 刷新。未运行全 Gallery/整仓 Jest，旧全量证据不改成当前证明。

三浏览器各 14/14 原生像素/诊断检查通过：红→绿顶点色、UV-only 保留 normals/indices、非法索引无写入、宏关闭变白、负缩放剔除和显式 cull override、禁用时先配 Fog 后启用的蓝色输出、关闭 NONE、主光移除选择、诊断和资源清理。主线程实际查看绿色与蓝色 PNG。图像为 CANVAS_NATIVE；pageCompositorVerified=false，非物理 present/FPS 证明。

## 失败链与限制

- 初次 GPU 检查读基础 pass shader，而实际绘制的是 subModel variant；基础 reflection unavailable 与红色像素同时存在。修正为可显式读取 renderer 的已编译实际 variant 后重采，不强制编译，不改旧失败。
- 初次测试假定 Scene 未挂载时没有 renderScene；实际构造即有空 renderScene，测试按真实行为修正。Quat constructor 会将 NaN 初值回落，非法分量测试改为构造后显式写 NaN。精简 import 没注册 AnimationManager 的测试，改为原 SDK aggregate 初始化。
- 首次新 consumer 片段漏 Mesh import 导致 TS2304；只修测试导入，最终安装包出口 616、签名通过，不称为引擎 bug。
- 输入校验的原子性不等于任意 GPU 运行故障可回滚。custom float 通道使用 32-bit 布局；三角形检查采样不覆盖全部拓扑、相机朝向或实例化队列；主光报告限定 legacy 普通方向光。

原始报告、失败和源码指纹见[证据索引](../../docs/evidence/examples/engine-contracts/index.json)。使用说明见[手册](../../docs/manual/engine-contract-hardening.md)。本轮没有提交、推送、发布或变更版本，原三个未跟踪文件保留。
