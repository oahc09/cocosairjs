# 多 Pass 与 Mip 渲染

## 2026-10-19 选定矩阵修复

原采集器支持 --browser=webkit，却在完成真实矩阵后硬要求三浏览器，造成 invalid report header。现在显式选择只验证该引擎完整五行/15 场景和两种普通模式；默认 all 的三引擎完整 gate 不变。报告分开保存 selectedScopePassed 与 scopePassed，逐行像素、mip、负控和释放预算不变。动态 shared helper 及 auditor 进入身份清单。

本地 37974d6e runtime + 工作树工具复验 15 场景及两种普通模式通过，19/19 实际报告篡改被拒绝；新提交的同 head Chromium 结果由 SDK CI 留存。原作品参考、实体设备与性能预算仍是单独范围。

对应任务 IER-02（原 ENG-02）。完整示例见 `examples/interactive-multipass/`（含
[README](../../examples/interactive-multipass/README.md)）；本页只讲最小接法与常见误用。

## 1. 场景 capture → 全屏采样（引擎路径）

```ts
const target = createAirRenderTarget({
    width: canvas.width, height: canvas.height, // 实际 backing-pixel 基准
    scale: 1,
    colorFormat: 'rgba16f', depthFormat: 'none', samples: 4, filter: 'nearest',
});
const detach = target.attachCamera(captureCamera);   // 解绑函数保存好
const unbind = target.bindColor(displayMaterial, 'displayMap');
// 释放顺序：先解绑再销毁，解绑在销毁前观察
unbind(); detach(); target.dispose();
```

要点：

- `width/height` 是 **scale 之前的 backing-pixel 基准尺寸**，SDK不自动转换CSS或DPR。
  本仓配方以CSS数值乘显式`scale=devicePixelRatio`完成应用侧换算，数值结果有实证；这不是CSS输入合同。
  通用接法先取真实canvas.width/height，再以scale做独立质量缩放，避免DPR重复相乘。`resize()` 后消费 `target.info.generation`，旧 generation 不再被采样
  （`AttachmentView` 随 resize 自动换底层纹理）。
- `sampleFallback` 只管采样数（`'error'|'lower'`），**没有**颜色格式自动降级；颜色降级
  由示例显式选择，回执同时记录 requested 与 effective（`info.requested/info.effective`）。
- 4x MSAA 的 resolve 在 `RENDER_CAMERA_END` 自动 blit；`readColor()` 对 rgba16f/rgba32f
  返回 `Float32Array`。

## 2. 低层 gfx 多 pass + 真实 mip（原生路径）

```ts
const device = director.root.device;
// 逐级上传：不是"开了 mipFilter 就有 mips"
const texture = device.createTexture(new gfx.TextureInfo(
    gfx.TextureType.TEX2D, gfx.TextureUsageBit.SAMPLED | gfx.TextureUsageBit.TRANSFER_DST,
    gfx.Format.RGBA8, 256, 256, gfx.TextureFlagBit.NONE, 1, 6, // levelCount=6
));
device.copyBuffersToTexture(levelBuffers, texture, levelRegions); // 每级真实纹素
const sampler = device.getSampler(new gfx.SamplerInfo(
    gfx.Filter.POINT, gfx.Filter.POINT, gfx.Filter.POINT, ...)); // mipFilter 不能是 NONE
```

三条本仓实证过的硬约束（详见示例 README 的 std140/binding 清单）：

1. **用户 descriptor 用 set 1**；set 0 是引擎内部保留（sampler 偏移为负会得到
   `Sampler uniform value out of range`）。
2. `ShaderInfo` 的 blocks/samplerTextures 携带 set/binding 元数据；GLSL ES 3.00 源里
   **不要写** `layout(set=…)`、varying `location`（编译错误）。
3. `descriptorSet.bind*()` 后必须 `update()`；UBO/DS 更新在 pass 外、`begin()` 前。
   绑定后不 update 的症状是 `used but unbound uniform buffer`。

## 3. 何时用哪条

| 需求                                        | 路线                                                   |
| ------------------------------------------- | ------------------------------------------------------ |
| 相机视图离屏、后处理采样、MSAA resolve      | capture（AirRenderTarget）                             |
| 自管 mip 数据、逐级采样诊断、非相机数据通路 | native（gfx command buffer）                           |
| 多 pass 中间链                              | 两者可组合：native 写纹理 → bindColor 类视图给引擎材质 |

## 4. 如实披露的行为边界（审查修订新增）

- **普通模式跑原生 pacer**：`?test=1` 才使用步进时钟；普通页面的 AFTER_DRAW 回执来自
  引擎自身帧（`director.getTotalFrames()` 可观测前进）。暂停点击后帧冻结、恢复后继续。
- **引擎运行中 CSS resize 会重算相机 aspect**（暂停的测试页不会）——普通模式证据在初始
  640×400 布局采集。
- **descriptor binding 冲突无运行时校验**：引擎接受同一 binding 槽声明两种资源类别并
  静默"后写者胜"；检测方法是静态声明交叉检查（本例 `staticBindingCheck`，gate 由
  声明数组重算而非采信自报字符串）。
- **未绑 sampler 在本批三浏览器上不产生 GL 错误**：引擎回退到设备 null 纹理
  （bindStates 跳过未绑描述符）；这是本批实测行为，不泛称所有引擎/驱动；完备性由
  静态检查承担。
- **节点 destroy 提交在帧末**：同步可观测的是 `node.parent === null`；`isValid` 变 false
  发生在 destroy 提交后。gfx 对象销毁的实时观测 = gpu 访问器置空/抛错 + memoryStatus
  计数下降（引擎侧计数，非物理 GPU 分配量）。
- **native MSAA = NOT_RUN**：引擎把 samples>1 TEX2D 分配为 renderbuffer，无公开
  sampler2DMS 读回路径；4x resolve 由 capture 路线承担。
- 原云端 02/13/soft 素材未获得：`sourceStatus=recreated`，referenceComparison NOT_RUN。

## 5. 验收口径

- 像素证据：三浏览器 DPR1/2 compositor 截图 + runner 冻结 oracle（区域/颜色/质心
  从像素复算；native 路线画面含 LOD 无关红色标记条作为锚点）。
- 负例四类（重复 binding / GLSL 声明顺序 / std140 错布局 / 未绑 sampler）必须捕获
  真实错误文本并给出通过的正确最小例；静态工具查不到的字段明确标范围。
- 生命周期：10 轮 create/resize/dispose 回到基线；GPU 物理分配量与时间 unavailable
  如实记录（引擎 memoryStatus 是引擎侧计数）。

当前[归档证据](../evidence/examples/interactive-engine-improvements/multipass-s3.json)由 Orca Worker
实际采集，Lead 复核：三浏览器 45 个定步状态与 6 个普通模式截图，两个普通入口均帧前进。
真实 reset 十轮自有资产保持 8 份，每份旧引用 1→0；同步有效性和异步回收分别记录。
Lead 在 Chromium 等待释放调度后确认 buffer/texture 计数与重置前相等。
此结果涵盖本例，不代表原云端参考匹配、长期稳定性或 native MSAA 采样已验。

本地npm tarball附带[消费者副本](examples/interactive-kit/README.md)，源文件仍由仓库examples目录维护。
