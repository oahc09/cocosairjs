# Wave5 Emboss / Glass 融合 Pilot：十三项交付

> 本文的 `output/` 路径是未随仓库分发的本地历史产物，保留为溯源记录；不作为可点击仓库链接或当期验收证明。

2026-10-11，执行渠道：Lead（Codex）。[两个 Pilot 的六维 Gate](../evidence/shaders-absorption/wave5-uv-fusion-pilots-gate.json) 已通过生产重算与 38 类真实报告篡改拒收。测量发现 GPU 取舍，不开启默认自动融合。Driver 的 Orca Worker 实施与本交付分开；Wave5 整体仍 IN_PROGRESS。

## 1. Goal

比较程序子纹理 → 母效果的原生双遍与融合单遍；判断 UV 采样的重算是否保持算法、纹素存储和实际性能。Emboss 与 Glass 是两个独立案例，共用 [Pilot 页面](../../examples/shader-uv-fusion-pilot/index.html)，以 `effect` 与 `mode` 选择。只适用于固定程序输入，不对任意子场景自动融合。

## 2. Upstream references

上游固定 `shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。复用当前 SDK 已通过的 E05/E09 完整 GLSL、母参数和独立 CPU oracle，不执行上游 runtime。母文件及 UPSTREAM.md 的 SHA/bytes 和 SDK 三指纹绑定到每份报告；[许可通知](../../examples/shader-uv-fusion-pilot/LICENSE.reference.txt)随例保留。

## 3. CocosAirJS APIs used

`createAirApp`、`createStepClock`、`Scene`、`Node`、`Camera`、`MeshRenderer`、`Material.initialize/setProperty`、`EffectAsset`、`utils.createMesh`、`createAirRenderTarget/attachCamera/bindColor/readColor/dispose`、`Component.update` 与 Director 帧事件。一个 AIR canvas；无 TypeGPU、额外渲染 canvas、自有 RAF 或替代引擎。

## 4. Implementation details

[生成器](../../examples/shader-uv-fusion-pilot/generate-effect.cjs)读取完整母 shader。reference 不改变母主片段；fused 只替换 child sampler。源码回归撤销替换后精确得到完整母片段，生成元数据保留 UBO 顺序和全部母 defines。

采样重算先执行 CLAMP/NEAREST 索引，再在 256² texel 中心求程序图案，预乘并进行 `floor(value*255+0.5)/255` RGBA8 存储往返。保留母效果的逆预乘、Emboss 差分法线/双阴影、Glass 九点 Vogel/色散/Fresnel/高光以及一次 OETF。不能用连续程序采样绕过 RT 量化。

变体由真实 shape、blur/aberration 的零值跨界决定；uniform 不退休实例。每次 set 保存 before/receipt/after，生产 gate 重算是否应重建和配对退役。参数是纯函数原子验证，拒绝非法颜色、NaN/Infinity、未知 key、非法 enum、getter 和异型根对象。

## 5. Tests performed

Lead 的 NODE_CONTRACT Jest **33/33 + Gate 10/10 PASS**；strict TypeScript exit0，esbuild 真实 bundle >0，构建原始日志记录 exit0。最终功能采集自然 exit0，生产只读重算 `{ok:true,errors:[]}`，报告为 final functional（本地历史产物：`../../output/shaders-absorption/lead-w5-uv-fusion-final-functional.json`），另有独立 OS 回执（本地历史产物：`../../output/shaders-absorption/lead-w5-uv-fusion-final-functional-os.json`）与采集前冻结输入。两个接受真实基线的 38 类篡改（本地历史产物：`../../output/shaders-absorption/lead-w5-uv-fusion-final-actual-audit.json`）全部被生产数据门禁拒收，直接 structuredClone 保留 NaN；Gate 又独立绑定当前 SDK、前置 Wave4、两份原始报告、性能自然 OS 退出、采集前冻结输入与自身验证器指纹。不把 Node 测试标作浏览器实证。

## 6. Screenshots / visual comparison

Chromium/Firefox/WebKit × reference/fused × DPR1/2：每 Pilot 72 视觉例和 6 张 live-resize 截图，共 156 张 PNG。每例有母 CPU 数学 oracle 的固定 17 点、真实线性透明 RT 读回和 compositor PNG 两条证据。首次 72 对全图逐通道对照的最大差为 2，无通道超过 2；母数学容差保持 ±2，不因本地融合放宽。

## 7. Performance measurements

采集计划为两个 Pilot × 两管线 × 三 profile × 三引擎 = 36 窗口，串行、独立页面、真实 HTTP 隔离、导航后 DPR 协议修复、25000 次时钟标定。每窗口原生 pacer 6 秒，前 30 帧预热，稳态至少 60 帧；定时窗口内禁止 readPixels。CPU update、原生 gfx 方法墙钟包络、实际 GL draw、AFTER_DRAW 间隔与可用的原生 GPU query 分开记录。方法包络含 dispatch，不能称为纯编码时间；无法测 GPU 时明确 unavailable，不用 CPU 替代。

36 窗口全部自然 exit0，前后输入不变，生产重算 PASS；原始性能报告（本地历史产物：`../../output/shaders-absorption/lead-w5-uv-fusion-final-performance.json`）、OS 回执（本地历史产物：`../../output/shaders-absorption/lead-w5-uv-fusion-final-performance-os.json`）与冻结输入保留。合计 11684 稳态帧；原生命令/GL dispatch 确认 reference 每帧 2 pass/2 draw，fused 每帧 1 pass/1 draw。定时 readPixels 全部 0。

每个比较的实际 `device.memoryStatus.textureSize` 差为 **262144 bytes（256 KiB）**，与少一张 256² RGBA8 RT 一致。这是引擎纹理 payload 计数与格式估算，完整 GPU 驱动显存不可用。

Chromium 的实际设备为 ANGLE / NVIDIA GeForce RTX 4060 Laptop GPU / D3D11，有非 disjoint GPU timestamp；Firefox/WebKit GPU query unavailable，保留 null。以下中位数单位 ms：

| Pilot / profile      | CPU render envelope reference→fused | GPU reference→fused | GPU 变化 |
| -------------------- | ----------------------------------- | ------------------- | -------- |
| Emboss / 720p        | 0.525→0.415                         | 0.400→0.513         | +28.1%   |
| Emboss / 1080p       | 0.530→0.410                         | 2.101→2.063         | −1.8%    |
| Emboss / mobile DPR2 | 0.540→0.430                         | 0.670→0.787         | +17.6%   |
| Glass / 720p         | 0.525→0.420                         | 0.535→0.870         | +62.8%   |
| Glass / 1080p        | 0.550→0.415                         | 2.135→2.269         | +6.3%    |
| Glass / mobile DPR2  | 0.535→0.420                         | 0.800→1.299         | +62.5%   |

所有三引擎 profile 的 CPU render envelope 中位数降低，但 CPU update 中位数没有一致改善。每帧 gfx 方法包络整体减少；本测量含立即 GL dispatch，不能称为纯编码时间。GPU 结果明确说明少 Pass 不保证更快：重算图案增加片段 ALU，不能据此默认自动融合。三个 profile 是桌面窗口/DPR 仿真，不是实体手机测量。单次串行窗口用于本 Pilot 决策，不作跨设备普遍速度承诺。

## 8. Resource lifecycle

每 Pilot 600 次真实 create/destroy（每引擎两管线各 100 次）：renderer 解绑、相机 detach、RT dispose、EffectAsset registry remove、每资产 addRef1→decRef0→destroy、节点无效与原生 buffer/texture 字节回到预热基线。reference 自有 5 引用，fused 自有 3 引用；共享 quad mesh 显式持有一份。线性诊断临时 RT 完成后释放并恢复默认 framebuffer。可信 release 点击后按钮禁用、监听 AbortController 解绑、场景清空和精确缓存 Promise 幂等均采证。

## 9. API / DX gaps

没有新引擎反例。首轮非法 tintColor 被接受与 backing/合成器采样过早，第二轮 Firefox compositor 捕获前一参数状态，均是本 Pilot 的 AGENT_FAILURE。按已验证的母 collector 时序补固定 settling，并保留失败报告，不修改母算法、容差或 SDK。性能首轮代理 helper 实参传了 origin 字符串而非 server 对象，未进入测量窗口即超时；真实 Chromium 隔离启动已修复验证，失败 OS/log/frozen 保留。改动采集器后重新采集功能，未借旧工具指纹授予当前 PASS。

PERFORMANCE_GAP：没有可直接默认启用的自动融合成本决策，Glass 重算出现明确 GPU 回退。它是受限方案的取舍，不是 CocosAirJS 引擎缺陷主张。公开 CompositionIR/自动融合应先能声明并评估重算成本，再考虑默认策略。

## 10. Workarounds

沿用已有 shader-scoped Windows WebKit 启动项和 Firefox 隔离导航后的 DPR 修复。这是现有环境处理；功能采集独立等待实际 backing，再推进原生步进和合成器，不凭 resize CSS 变化宣称通过。

## 11. Proposed engine changes

本轮不新增 core API。将受限 procedural sampler fusion 留在 example-local 生成器/Recipe，作为明确的 CPU/内存取舍选项；不启用自动融合默认值。真实图片、完整场景、GPU 历史反馈和动态 Trail 继续需要中间纹理。泛化 CompositionIR 必须显式描述输入可重算性、RT 格式/分辨率/过滤/边界、alpha、副作用和重算成本，再决定 identity 与结构编译边界。

## 12. Validation status

生产原始验证与 Pilot Gate：Build/Runtime/Visual/Boundary/Resource/Performance 通过。Emboss：72视觉、480边界、600资源、6resize、18性能窗；Glass：72视觉、1176边界、600资源、6resize、18性能窗。Performance PASS 表示真实测量与合同通过，不表示优化普遍提速。所有 72 对最终 PNG 的全图比较最大差 2，超差通道 0。Wave5 Gate、Agent Gate 与独立 Gallery 尚未通过。本交付不代宣全项目完成。

SDK 三指纹保持 `69127f39…/5b67a560…/b7771393…`。未修改 `src/`、SDK/build、原十三例和已关闭的 Gate；未 stage/commit/push。

## 13. Known limitations

仅固定、无副作用的程序图案，256²、NEAREST/CLAMP、预乘 RGBA8。算法证据为独立母模型加真实读回和 PNG；固定点 oracle 不是全图二次数学复算，全图像素比较也不单独证明算法正确。基准为串行插桩窗口，不是实体设备或未插桩生产 benchmark；长时、多标签页、实体移动端和 Agent 使用率未测。
