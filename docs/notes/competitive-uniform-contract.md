# 材质与灯光写入合同及 UBO 调查

本批 CB-02 修复已确认的数值污染入口；CB-08 在当前候选的 Chromium、Firefox、WebKit WebGL2 路径没有复现 Vec4 `.w` 丢失或顶点 UBO 漂移。这个结论不能代替历史 E01/E09 完整 shader 的复现，也不能推导其他驱动已通过。

## 正确写入材质属性

`Material.setProperty(name, value)` 的合法值由实际 shader uniform 类型决定。动态属性名无法仅靠 TypeScript 声明完成类型校验。

```ts
material.setProperty('u_value', new Vec4(1, 2, 3, 4));
// FLOAT4 数组 uniform：每项是向量，允许不超过声明数量的部分更新。
material.setProperty('u_values', [new Vec4(1, 2, 3, 4), new Vec4(5, 6, 7, 8)]);
// FLOAT 标量数组仍使用数字数组。
material.setProperty('u_scalars', [1, 2, 3]);
```

| Shader 类型            | 合法值              | 数值合同                                                 |
| ---------------------- | ------------------- | -------------------------------------------------------- |
| INT / FLOAT            | number              | 有限数值，不得在 float32 转换后成为 Infinity             |
| INT2 / FLOAT2          | Vec2                | x/y 必须有限                                             |
| INT3 / FLOAT3          | Vec3                | x/y/z 必须有限                                           |
| INT4                   | Vec4                | x/y/z/w 必须有限                                         |
| FLOAT4                 | Vec4 / Color / Quat | 保留原有四分量写入方式；Color 写入归一化通道             |
| MAT3 / MAT4            | Mat3 / Mat4         | 全部矩阵成员必须有限                                     |
| 上述类型的数组 uniform | 对应合法值数组      | 长度不超过 shader 声明 count；保留 null 跳过项和部分更新 |

FLOAT4 单值不能传 `[1, 2, 3, 4]`。旧路径会将它作为四个 uniform 元素逐一处理，writer 读取数字的 `.x/.y/.z/.w`，生成 NaN。新路径在写入前抛出 `TypeError`，具有 `code='AIR_E_MATERIAL_TYPE'`、`property`、`expected`、`example` 字段，消息给出属性名、期望 shader 类型和合法示例。

材质先为全部目标 pass 准备独立上传快照，完成各自实际转换并预检，再开始上传；数组会预检全部元素，然后写入。因此后面的不合法项、不兼容 pass 或转换异常不会部分覆盖前面的状态。`Pass.setUniform` / `setUniformArray` 也进行相同防御，发布构建不能只依赖 DEBUG assertion。校验仅发生在 setter 边界，没有新增逐帧扫描。

这里保留原生颜色语义：`properties[name].linear` 只对单值执行原有 `SRGBToLinear` 转换，alpha 不变；数组路径不自动逐元素转色，仍接受原始类型值、null 跳过与 partial 更新。业务需要线性数组时应明确提供对应值，不能认为 linear 标志会替数组做颜色转换。`getProperty()` 保留业务传入的原对象/数组引用，快照只用于此次实际上传，不改其它已保存属性。

复核曾发现 raw float32 可表示但转换后溢出的边界：两个不同 linear 标志的 pass 写入 Vec4(1e30,0,0,1)，后一个转换到 1e60 才拒绝，先前 pass 已部分覆盖。正式回归现覆盖该失败；当前实现先准备、验证每个实际转换值，转换/快照异常均发生在任何写入之前，也不复用共享 Vec4 scratch。

纹理和 sampler 不走此数值校验；已有 reset（null）语义保留。未知属性、无 effect 或不存在的 pass 的诊断不属于本批 CB-02 数值防御。

## 区分两层灯光颜色

| API                                 | 类型与单位             | 示例                                         |
| ----------------------------------- | ---------------------- | -------------------------------------------- |
| `DirectionalLight` 等组件的 `color` | Color，RGB 通道 0..255 | `component.color = new Color(255, 220, 180)` |
| `render-scene Light.color`          | Vec3，浮点 RGB         | `renderLight.color = new Vec3(1, 0.8, 0.6)`  |

组件层传 Vec3 在旧实现会先 clone 成错误的 `_color`，再读取不存在的 r/g/b，污染底层颜色。新实现在 clone 前报告 `AIR_E_LIGHT_TYPE`，保留旧颜色。渲染层继续接受合法 Vec3，拒绝非有限分量；两层色温 setter 拒绝非有限值。颜色单位、亮度/range/size/角度等其他 setter 语义没有调整。

不要在 setter 校验通过后再直接把已暴露的可变数学对象改成 NaN；这批防御不是对全部数学对象的冻结或逐帧检查。

## 实测与复跑

定向测试：

```powershell
node node_modules/jest/bin/jest.js --runInBand test/smoke/competitive-uniform-contract.test.ts
```

21 项测试覆盖非法数组、NaN/Infinity/float32 溢出、转换后溢出、数组容量及 sparse 孔、多 pass 不同 linear 元数据、转换/快照异常原子性、合法 Color/Quat/矩阵/标量数组、xyzw 完整 block 上传，以及两层灯光颜色合同。修复后 21/21 PASS；`npm run typecheck` PASS。NaN 用分量赋值构造，避免 Vec3/Vec4 构造函数将 NaN 归零而使复现失真。

浏览器探针是 [competitive-uniform-probe](../../tools/debug/probes/competitive-uniform-probe/index.html)。自动运行器启动自己的只读静态服务，关闭后不保留服务进程；不会重建 bundle 或刷新 canonical evidence。

```powershell
# NODE_PATH 指向已有 Playwright 的 node_modules，按实际环境配置。
node tools/verify/competitive-uniform-browser.cjs --browser=chromium --out=output/playwright/competitive-uniform-chromium.json
```

最终复核 Chromium、Firefox、WebKit 各 30/30 PASS；运行器记录浏览器版本、bundle 与相关源码 SHA-256，并拒绝运行中产物变化、console error、缺失或失败检查。三个报告使用同一候选 bundle SHA-256 `006ae858d4e75dcb4c716afccd2eedcbefe81300304cb0cfca9d1fffa918c03e`，位于本地 `output/competitive-benchmark/final-review/uniform-{chromium,firefox,webkit}.json`。其他驱动或不同 shader 布局尚不能据此声称通过。

旧 bundle 对照的相同 30 项检查中有 8 项失败，全部是非法 FLOAT4 数组没有被拒绝、写入后像素变化；合法 xyzw 与 UBO 一致性检查均通过。对照结果位于本地 `output/playwright/competitive-uniform-baseline.json`，最终结果使用上一段的 `final-review/` 路径。输出文件是本地验收产物，不作为发布门禁的已验证声明。

## CB-08 定位结论与边界

- CPU 路径：Vec4.toArray 写全 xyzw；Pass.update 上传整个 ArrayBuffer。两次运行期更新包括 `.w` 均到达完整上传数据。
- GPU 路径：独立 raw WebGL2 控制和引擎 vertex/fragment Constants 路径均读回预期颜色；每次更新在中心及四个不同位置采样，未出现顶点依赖的离散值。CCGlobal 在顶点阶段读出的屏幕尺寸倒数也在五点保持一致。
- GL 反射：独立 Constants 为 16B，CCGlobal 为 64B；当前绑定分别是 11 和 0。绑定值是本次布局结果，不是 SDK 固定合同。
- 额外调查 physical.glb 的实际 784B Constants：airTransmission 的 handle offset 是 184 floats，即 736B；GL active uniform offset 同为 736B；GPU buffer 读回 factor 0/1，另外 y/z/w 保持 `[1.5, 0.6000000238, 5]`。该场景的大块布局和四分量上传没有错位。完整反射与读回位于本地 `output/playwright/physical-uniform-layout.json`。
- 对照实际 draw：`SubModel.shaders[0]` 可能是 `Pass.getShaderVariant()` 加上模型宏 patch 的变体，应检查实际 CURRENT_PROGRAM。physical.glb 的 draw 确实绑定该 pass 的 buffer，factor 0/1 完整；仍无像素变化的断点是物理 effect 仅向第一个 `main` 注入赋值，当前 forward base 绘制执行的是第二个 `main`。这是 shader 分支注入问题，不能据此推断 UBO 上传丢失。

目前没有证据支持给所有材质加入“只用 xyz”规避，也没有依据修改 `.w` writer 或统一限制顶点 UBO。历史 EB-05/EB-09 尚缺同候选、同 shader、同 mesh 的公开最小复现。后续若出现失败，应对照 effect metadata 成员顺序、实际 GLSL 声明、GL UNIFORM_OFFSET、staging offset 和 GPU buffer，再判断是否属于引擎布局、调用错误或特定驱动；不能从单一像素簇直接判定上传缺陷。
