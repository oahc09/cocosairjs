# 动态实例批次

`createAirInstanceBatch()` 为固定索引三角网格创建一个原生 Node/Model、共享几何与独立实例缓冲。无需为每个实例创建 Node。当前支持 WebGL2；先调用 `createAirApp()`。

```ts
import { createAirInstanceBatch, Mat4, Vec3, Vec4 } from 'cocosair.js';

const batch = createAirInstanceBatch({ parent: scene, mesh, capacity: 256, count: 3 });
for (let i = 0; i < 3; i++) {
    batch.setMatrix(i, Mat4.fromTranslation(new Mat4(), new Vec3(i * 2, 0, 0)));
    batch.setColor(i, new Vec4(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0, 1));
}
batch.commit();
app.run(scene);
```

## 更新合同

- `setMatrix`、`setColor` 先写 CPU 暂存数据；`commit()` 才提交所有脏区间。`commit(start, count)` 只发布指定连续区间，不把其他待提交内容偷偷提交。
- `getMatrix(index, out)`、`getWorldBounds()` 和 `raycast(ray, maxDistance)` 使用已提交状态。实例矩阵相对于批次 `node`，父节点的平移、旋转、缩放继续生效。
- `setCount(n)` 即时设置有效实例数，范围为 0 到 capacity。零实例不提交普通绘制，不会在原点冒出一个实例。
- `reserve(newCapacity)` 显式扩容并保留已提交与暂存状态。超过容量的写入不会静默截断。当前容量上限为 1,048,576，用于限制分配；不是保证该数量可达到某帧率。
- `commit()` 返回本次上传字节数，`info` 报告容量、有效数量、待提交实例数、CPU/GPU 自有字节和设备属性上限。这不是 GPU 完成耗时或 compositor 呈现指标。
- 当前逐实例拾取为 CPU 三角形检测，不是 GPU picking；大规模交互应测量实际查询成本。奇异矩阵实例可绘制为退化形状，但不作为可逆射线变换候选。

## 材质与网格

省略 material 时创建专用不透明、双面 unlit 材质。颜色为线性 RGBA，RGB 可大于 1；普通输出做 sRGB 编码，接入 `createAirPostProcess` 后保留线性 HDR，避免重复编码。alpha 存储在属性中，但默认材质不提供透明混合。

自定义材质须显式声明公开 `AIR_INSTANCE_ATTRIBUTES` 的四个 instanced RGBA32F 属性：`i_airMat0`、`i_airMat1`、`i_airMat2`、`i_airColor`。前三项分别存储实例矩阵前三列的 xyz 和对应平移 x/y/z，第四项为颜色。默认 shader 使用 location 8–11；设备属性限制会验证。不要同时启用原生 `USE_INSTANCING` 自动合批，否则会混淆两套实例数据来源。不会自动改写任意用户材质。

当前接受固定索引 `TRIANGLE_LIST` 网格及其多个 submesh；不支持动态网格或 Morph 网格。不要在批次存活期间外部 reset/destroy/re-upload 共享网格缓冲。每个 submesh/pass 仍产生相应原生绘制，不承诺多材质网格也只有一次 draw。

## 生命周期

批次可在 `app.run(scene)` 前创建，原生 Model 在所属场景可用后挂载。直接销毁批次 Node 或调用 `dispose()` 均释放该批次的模型、IA、实例缓冲和 CPU 数据；重复释放安全。借用的 mesh/material 保留引用，释放时不会主动销毁；省略 material 时生成的材质由批次拥有。固定 effect/shader 缓存按内建资源方式共享。

## 验证

示例：`npm run dev -- --example instance-batch` 后打开 `http://127.0.0.1:7454/instance-batch/`。可操作扩容、范围更新、零实例、恢复和点击选择。

CPU：`npx jest --runInBand --runTestsByPath test/smoke/instance-batch-data.test.ts`。

浏览器：`node tools/verify/instance-batch.cjs --out=output/new-instance-attempt`，可用 `--bundle=<candidate.js>` 选择候选。需要 Playwright、浏览器和 pngjs；示例转译还需 esbuild。脚本记录实际 `drawElementsInstanced` 的索引/实例数量、颜色像素、范围更新、包围盒/拾取、扩容、零实例、HDR 和借用资源复用，写新目录并保留失败，不发布 Gallery 规范证据。
