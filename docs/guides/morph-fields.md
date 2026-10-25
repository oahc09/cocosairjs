# GPU 点 / 体素形态场

`createAirMorphField()` 将有相同样本数的形态一次上传到两张 RGBA32F 纹理，再由 GPU 插值位置与线性 RGB。每个场使用一个原生 Node/Model、共享图元几何和实例流，没有逐样本 Node，也没有每帧 CPU 插值矩阵。

```ts
import { createAirMorphField, sampleAirTextShape, sampleAirTriangleShape, primitives } from 'cocosair';

// 在 createAirApp() 之后组装；可以先组装，再 app.run(scene)。
const count = 16384;
const text = await sampleAirTextShape({ text: 'AIR', count, size: 6, seed: 42 });
const geometry = primitives.sphere(2);
const sphere = sampleAirTriangleShape({
    positions: new Float32Array(geometry.positions),
    normals: new Float32Array(geometry.normals!),
    indices: new Uint32Array(geometry.indices!),
    count,
    seed: 42,
});
const field = createAirMorphField({ parent: scene, targets: [text, sphere], mode: 'points', size: 0.03 });
field.setTransition(0, 1, 0.5); // 0=文字，1=球体；业务用原生时钟/动画驱动进度
field.setIntensity(2); // 线性 HDR 增益，配合 createAirPostProcess 使用
field.setSurface('polished', 0.18); // 可选的演示棚反射；默认仍为 unlit
```

## 数据与采样

- `AirPointShape` 的 `positions` 和 `colors` 均为 `Float32Array`，每样本三个分量；位置在 field 节点的局部空间，颜色为非负线性 RGB，可大于 1。所有形态的样本数和数组长度必须一致。对应关系由相同索引决定，当前不做自动最优匹配。
- 可选 `normals` 是同长度的有限、非零局部法线。网格采样可传入顶点法线，按重心插值并归一化；未提供时从三角形生成。无形态法线时使用 +Z 平面。法线以八面体编码放入两张 atlas 原来空闲的通道，不增加纹理数量；变形时同步插值法线。
- `sampleAirImageShape({rgba,width,height,count,size,seed})` 按 alpha 加权采样；排除透明像素，将 RGB 从 sRGB 解码为线性，图像顶部映射到正 Y。`size` 指宽度，高度保留图像比例；位置以图像中心为原点。输入是已解码 RGBA 字节，不负责下载或跨域图像读取。
- `sampleAirTriangleShape()` 按三角形面积采样并插值可选的线性顶点颜色。支持 Uint16/Uint32 索引或连续三角形，跳过退化面；全部退化、非法索引和非有限数据明确失败。采样使用原始顶点数据，不自动应用模型节点变换、蒙皮或 Morph。
- `sampleAirTextShape()` 等待 `document.fonts.load` 后光栅化单行文字，再走图像采样。默认 `bold 160px sans-serif`；可指定页面已部署的字体。空白/多行文字与过大栅格拒绝；临时 canvas 总在 finally 清零。字体、浏览器和系统影响字形，所以 seed 只能保证相同像素输入的采样重复性。测试需要固定字体环境，不能用不同机器的字体字节作为跨平台真值。
- 固定数量，不隐式截断、复制或补零较短形态。改变样本数、目标列表、图元模式或 size 时创建新场并释放旧场。调用方可释放或复用原始形态数组；场在创建完成后不再引用它们。

## 图元、边界与限制

`points` 是面向相机的圆形实例 quad，每实例 6 个索引，具有深度测试与写入；不是 `gl.POINTS`，不受设备点尺寸范围限制。`voxels` 为每实例 36 个索引的 cube。两者默认保持原来的不透明 unlit 表现。

可选 `surface: 'polished'` 使用随视角变化的反射、高光、边缘 Fresnel 与清漆亮带；点图元补充微珠法线，体素结合面法线。`roughness` 范围 `[0.04,1]`，默认 0.2，可通过 `setSurface()` 修改而无需重建批次。法线按父变换的逆转置变换，反射方向随旋转改变。抛光模式把 RGB 作为 `[0,1]` 基色，`intensity` 仍作为最终线性 HDR 增益。

该抛光效果采用程序化摄影棚环境，并不读取场景 DirectionalLight、实际环境贴图或屏幕反射，也不是完整 PBR/IBL。微珠仍为平面深度的 impostor，无真实球面深度。没有透明排序或投影阴影；需要这些语义时使用原生 Mesh/Material 路径。

每个实例矩阵编码所有目标形态的保守 envelope，GPU 从纹理读取其归一化位置。`getWorldBounds()` 因而覆盖整个变形路径和图元尺寸，支持父节点移动、旋转和非均匀缩放。点图元通过局部逆变换保持朝向相机；父级零缩放时隐藏图元。这里没有基于动态 GPU 位置的射线拾取接口，不暴露 F01 的静态几何拾取作为替代。

首批要求显式初始化的 WebGL2、至少两个顶点纹理单元、RGBA32F 采样和 F01 实例属性能力。形态 atlas 不得超过设备纹理维度。`maxGpuBytes` 默认 256 MiB，限制形态纹理与实例流的分配预算，不包含固定图元、材质、程序缓存或驱动分配；超过预算会在 GFX 分配前报错。1..1,048,576 的样本数是分配护栏，不是性能承诺。未验收 WebGPU 后端。

`info.gpuBytes` 汇总自有图元、实例流和形态纹理；`cpuBytes` 为持有的实例暂存/已提交数组，排除业务自有输入和驱动缓存。`initialDataBytes` 是资源数据大小，不能当作所有初始化传输次数的测量。`transitionDataBytes=0` 仅表示进度更新不重传形态/实例数据；**原生 uniform/相机缓冲上传仍会发生**。CPU 调用结束、GPU 完成、合成器展示和连续帧间隔是不同观测，本示例不报告通用 FPS 达标。

`dispose()` 幂等释放自己的实例流、Mesh、Material 和两张纹理；直接销毁 `field.node` 同样清理这些资源。原始形态数组不属于场，共享 effect/program 缓存仍由引擎持有。创建中途失败也清理已创建的纹理和部分资产。重新创建可复用相同输入。

## 示例与验证

运行 `npm run dev -- --example morph-field`，打开开发服务器的 `/morph-field/`。FORM / MATTER 提供 16,384 个样本、文字/球体/圆环/原创图像、点/体素、原色/抛光、粗糙度、手动进度、自动往返、暂停、拖动旋转与现有 HDR 输出。

`tools/verify/morph-field.cjs --bundle=<candidate.js> --out=output/playwright/new-morph-attempt` 使用真实 Chromium 保留截图与报告，检查源映射、实际 indexed instancing、进度关键像素、纹理跨行寻址、实际上传流量、文字、资源删除、失败清理和示例控件。要求可解析的 Playwright、匹配浏览器、pngjs 和 esbuild；只写新的本地目录，不覆盖失败或发布正典 Gallery 证据。报告是定向子集，不代表全浏览器或发布就绪。
