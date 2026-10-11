# Glass（E09）原生 RTT 与片元透镜

子相机在256² RGBA8 RenderTarget写预乘不对称图案，主相机材质执行固定上游Glass的解析平板数学与九点Vogel fallback模糊（色散时27点）。不实施Gaussian compute前置、不支持3D/volumetric/SDF贴图。source先alpha-safe unpremultiply，独立shader/CPU算法后输出straight RGBA，一次OETF预览。CLAMP+NEAREST与固定子RT分辨率是本地适配差异。19参数控制折射/blur/色散/高光/轮廓/tint；仅两个解析形状，固定中心与白色高光/Fresnel。

零跨越blur/aberration或shape切换真实重建材质变体，其余uniform更新。mesh/material/effect和child的三份引用共6份，解绑采样器、detach相机与dispose RT分别观察；释放Promise幂等，GLASS_DISPOSED。Gallery桥接已实现，独立Gallery验收NOT_RUN。

实际六维范围由[独立交付记录](../../docs/effects/glass-validation-delivery.md)和固定身份报告判定，本文件不自行声明PASS。查看index.html依赖仓库SDK/开发服务器；无需上游runtime/TypeGPU或额外canvas。来源及MIT通知见UPSTREAM.md、LICENSE.reference.txt。实体设备/长时/Agent Gate未验。

性能冻结为blur=8、aberration=0.5（27 tap片元fallback），保留子场景与主材质两遍真实绘制；透明RT读回不进入计时窗口。不是Gaussian compute路线或完整上游平台。
