# Code First 3D 粒子

`createAirParticleSystem()` 创建原生 `ParticleSystem`，补齐原来由编辑器保存的模块对象，再激活节点。没有独立播放器或平行模拟系统。先完成 `createAirApp()`；可以在 `app.run(scene)` 前组装，也可以向运行中的场景添加。

```ts
import { createAirParticleSystem, ParticleShapeType, ParticleSpace, ParticleCurveMode } from 'cocosair.js';

const particles = createAirParticleSystem({
    parent: scene,
    configure(p) {
        p.capacity = 256;
        p.startLifetime.constant = 2;
        p.startSizeX.constant = 0.15;
        p.startSpeed.constant = 1.5;
        p.rateOverTime.constant = 40;
        p.simulationSpace = ParticleSpace.World;
        p.shapeModule!.enable = true;
        p.shapeModule!.shapeType = ParticleShapeType.Sphere;
        const size = p.sizeOvertimeModule!;
        size.enable = true;
        size.size.mode = ParticleCurveMode.Curve;
        size.size.spline.assignSorted([
            [0, { value: 1 }],
            [1, { value: 0 }],
        ]);
        p.trailModule!.enable = true; // CPU 粒子支持拖尾
    },
});
```

`configure` 在 inactive、未挂载的节点上同步执行。不要在回调内激活或挂载节点。回调异常时销毁新节点；成功时返回原生组件，通过 `particles.node` 操作变换，通过 `play()/pause()/stopEmitting()/stop()` 控制生命周期。`playOnAwake` 默认开启；需要手动启动时在回调里设为 false。

`pause()` 保留当前粒子与播放时间；`stopEmitting()` 停止生成，已有粒子继续衰减；`stop()` 清空。返回值没有单独的 dispose：销毁 `particles.node`，在原生延迟销毁边界后释放模型和缓冲。共享 Texture、Mesh、Material 仍由业务所有者负责，不能按组件数重复销毁。默认内建材质继续由引擎资源管理器持有。

CPU 拖尾可以初始关闭，稍后通过 `particles.trailModule!.enable = true` 开启；原生下一次 update 会先初始化所属系统、材质和缓冲，再模拟粒子。检查下一帧的实际拖尾画面/索引，不能仅以 enable 已变为 true 作为成功。建议在激活前配置寿命、容量和拖尾曲线；这些值影响原生拖尾缓冲规模。

## CPU、GPU 与空间

- 默认 CPU 支持形状、生命周期颜色/尺寸/速度/力/旋转、噪声、限速、序列帧与拖尾。直接使用已导出的原生模块和 `CurveRange/GradientRange/Burst`，无需 JSON 资产。
- `useGPU: true` 使用原生 GPU 粒子的解析运动与曲线纹理，不等价于任意 GPU 力场或粒子间碰撞。设备不支持时抛 `AIR_PARTICLE_GPU_UNSUPPORTED`；GPU 配置拖尾、噪声或限速时抛 `AIR_PARTICLE_GPU_MODULE`，不能静默忽略。
- 使用 `ParticleSpace.Local` 时粒子随发射节点移动；`World` 保留已发射的世界位置。不要把节点变换再手工烘进粒子坐标。Custom 空间未在本批验收。
- 更改模块开关可走原生 setter；运行中修改 GPU 曲线数据后调用 `particles.processor.updateMaterialParams()` 重新打包。更改模拟模式前先 stop/clear；本批不承诺 CPU/GPU 无损热切换。
- 材质通过原生 `setSharedMaterial(material, 0)` 配置；CPU 使用 `builtin-particle`，GPU 使用 `builtin-particle-gpu`。设置自有纹理时同时负责其释放。不要给 GPU 粒子复用 CPU effect。

示例入口：开发服务器的 `/particles-3d/`。运行 `npm run dev -- --example particles-3d`，点击暂停、继续、停止发射与重播，观察两套原生处理器及 CPU 拖尾。定向采集器 `tools/verify/particles.cjs` 要求新 `--out` 目录和可解析的 Playwright；记录实际画面、时钟、数量和底层资源删除，不代表全浏览器或发布验收。
