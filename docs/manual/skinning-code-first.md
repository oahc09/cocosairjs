# Code First 蒙皮：根空间、首帧与手动驱动

蒙皮仍使用原生 `Skeleton`、`Mesh`、`SkinnedMeshRenderer` 和关节 `Node`，动画剪辑使用原生 `SkeletalAnimation`。本页说明端口接入合同；验证范围见[端口台账](../../ai/ledgers/port-gap-remediation.md)。

## 合法网格与绑定

`utils.createMesh` 接收 geometry，返回原生 Mesh。位置每顶点3分量，joints/weights每顶点4分量；当前 WebGL2 配方使用 `gfx.Format.RGBA32F`，与内置shader的浮点关节输入一致。每个非零权重对应整数 joint，索引必须落在 bindposes 数组内。权重有限且非负；应用负责把每顶点权重归一化，不能把未归一化数据当正常显示合同。

Skeleton 的 `joints` 是相对 `skinningRoot` 的路径，`bindposes` 是对应的逆绑定矩阵。使用中的路径必须能定位到关节 Node，使用中的矩阵和顶点必须有限；没有权重的关节允许没有bounds，缺少该关节节点不会误报。网格须提供可计算的min/max，模型/世界bounds用于裁剪。

完成 `await createAirApp` 后才能初始化材质。赋值可以在禁用组件时进行，再启用并挂入场景：

```ts
const renderer = meshNode.addComponent(SkinnedMeshRenderer);
renderer.enabled = false;
renderer.mesh = mesh;
renderer.skeleton = skeleton;
renderer.skinningRoot = armature;
renderer.setSharedMaterial(material, 0);
renderer.enabled = true;
```

`AIR_E_SKINNING_JOINT_INDEX`、`AIR_E_SKINNING_JOINT_PATH`、`AIR_E_SKINNING_WEIGHT`、`AIR_E_SKINNING_BINDPOSE`、`AIR_E_SKINNING_ATTRIBUTE_LAYOUT`、`AIR_E_SKINNING_BOUNDS` 和 `AIR_E_SKINNING_CAPACITY` 区分数据问题。绑定校验失败发生在替换旧模型绑定前；这并不承诺所有组件setter回滚，也不能捕获设备内存分配失败。原生 `onLoad` 会捕获并记录异常；直接绑定或活动setter可能抛出，不能只用包围 `app.run` 的 try/catch 判断是否成功。打开 `diagnostics: 'warnings'` 可观察原生材质警告。

## 变换作用在哪一层

蒙皮模型的 `transform` 是 `skinningRoot`。关节相对根的矩阵乘 bindpose 后驱动顶点，根的世界矩阵再进入模型变换。因此对SMR所在节点单独设置缩放，不会覆盖根空间；对根或共同祖先设置缩放会影响网格及世界bounds。

负缩放是反射，会改变三角形绕序。双面效果或适合该绕序的剔除设置才能看到背向面；`180° yaw` 是旋转，法线与深度语义不等同反射。对共享 Material 应在 `initialize({ states: { rasterizerState: ... } })` 设置状态；运行期 `overridePipelineStates` 只支持 MaterialInstance。不要通过移动bounds掩盖实际绕序问题。

本轮三浏览器对非对称三角形验证了实时/烘焙模式、SMR/root/ancestor的正负缩放、有限bounds与像素。新增[真实TRS夹具](../../test/fixtures/skinning-transforms/main.ts)将关节TRS乘逆绑定矩阵的顶点，与独立构造的刚性网格逐帧对照；根/祖先的非均匀缩放、反射及yaw还使用 `builtin-standard` 与逆转置法线参考对照光照。绕序另由既有BACK剔除夹具观察。两模式都通过，反射与180° yaw的法线/照明不同。该结果限于所测单关节与内置效果，不认证多关节混合后非均匀骨缩放的法线或所有自定义shader。

## 手动关节与暂停首帧

把SMR放在根的后代，并在根上不安装启用的 `SkeletalAnimation`，原生关联流程选择实时蒙皮。业务直接修改关节 Node 的TRS，在下一渲染帧更新姿态。没有新建平行骨骼系统，也不需要把bindpose作为当前姿态矩阵上传。

```ts
// 在业务更新中修改真实关节，正常引擎帧完成bounds与GPU上传。
bone.setPosition(x, y, z);
bone.setRotationFromEuler(0, angleDegrees, 0);
bone.setScale(scaleX, scaleY, scaleZ);
```

已有 SkeletalAnimation 时，由其 `useBakedAnimation` 管理关联模式。`setUseBakedAnimation(..., true)` 是internal重建入口，不是持久锁定；生命周期可能再次按关联配置选择模式。

96种公开接入组合在每个浏览器实际绘制：六种mesh/skeleton/root赋值顺序、最初启用/禁用、无动画/实时动画/烘焙动画/禁用的烘焙动画，分别在场景激活前及运行后赋值。未使用internal force固定结果。不完整绑定保持模型不可绘制；三项齐备后刷新原生子模型描述符，解决活动场景中root→mesh→skeleton的空索引异常。更换skeleton/root也刷新资源绑定；uniform→texture→uniform的实时往返在本轮有实际GPU对照。

两个模式的真实剪辑还验证了首帧、`state.time`＋`state.sample()`定位、pause/resume和公开偏好往返切换。先烘焙后实时的原生状态现在会补建节点曲线求值器，避免模式已切换而关节停在原位。模式选择仍由根上的动画关联管理；本页不新增另一套模式开关。

暂停主循环后，需要一次真实渲染才能观察GPU首帧。测试使用 `game.pause(); director.tick(0)`，不推进动画时间，同时完成变换、bounds和上传；三浏览器的当前姿态首帧已通过。单纯绑定完成没有立刻提交绘制的承诺，不应要求屏幕在没有渲染帧时更新。

## 容量与只读观察

实时蒙皮根据设备UBO容量选择uniform或关节纹理；自动切纹理仍是实时模式。当前原生纹理布局固定为256个关节槽。实际使用的槽必须小于所选传输容量，超出时 `AIR_E_SKINNING_CAPACITY` 给出网格、根、全局关节、局部palette、slot与容量，建议拆分局部关节表。300关节骨架使用局部 `[299]` 映射到槽0是合法的；没有使用的骨架尾部也不会被误拒。不要用骨架总数或“绑定数/总关节数”推断绑定成功率。

[独立容量探针](../../tools/verify/air-skinning-capacity-browser.cjs)记录实际设备uniform上限、回退纹理格式和GPU像素。本机三个浏览器均为256个uniform槽，合法局部palette触发的纹理格式为RGBA32F。未强迫模拟RGBA8设备，GPU分配量为unavailable。

开发工具 `AgentSession.inspectNode(...).visual.mesh.skinning` 复用[只读观察器](../../tools/debug/skinning-inspector.ts)，提供请求偏好、有效模型/传输、实际加权绑定数量（可观察时）、palette容量、根空间bounds和世界矩阵反射标志。没有模型时明确返回NOT_READY，不猜测；palette最多展示80项并披露截断。工具不创建材质实例、不加资产引用、不渲染、不改模式，默认运行包不导出它。内部数组观察仅适用于当前固定引擎版本，不是稳定的原生私有API或GPU测量。

## 修改资产后的缓存

同一Mesh的 `reset`、`updateSubMesh`、`merge` 路径会失效骨空间bounds。原地改变 Skeleton 的bindpose后，即使原生hash未改变，下一次bounds查询也重新计算。直接改 `mesh.data` 字节不属于自动失效入口，应使用reset或dynamic更新。

这只保证bounds查询，不自动重绑已运行的renderer，也不更新所有烘焙动画池。应用应构造新的骨架资产，或按原生绑定/模式重建流程重新绑定，并成对归还旧mesh/skeleton/material的引用。节点销毁不能代替最后资产所有者的释放。
