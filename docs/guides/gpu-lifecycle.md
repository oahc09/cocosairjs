# GPU 丢失、异步工作与会话所有权

AIR 的 context health 提供受控失败与重载。WebGL2 的 native context 即使恢复，既有纹理、程序、buffer 与状态缓存也没有被完整重建；本页继续拒绝资源创建/上传/读回，错误码为 `WEBGL2_CONTEXT_LOST`。使用 `app.contextHealth.requestReload()` 重载，不能通过 resume 把它当作透明恢复。

WebGPU 初始化会在异步 shader translator 加载后重新检查设备。失效设备上的资源创建、上传和读回以 `WEBGPU_DEVICE_LOST` 结束。设备丢失后的 context health 为 failed，渲染停止；不自动切到 WebGL2。详情见 [WebGPU 指南](webgpu.md)。

## 应用关闭与设备丢失不同

`app.close()` 释放会话自有资源并关闭应用时钟，但保留共享 GFX 设备。不要为了结束一个请求而销毁共享设备，也不要把共享缓存保留直接判为泄漏。

异步读回提交时固定全部 region 的源纹理，resize 不混合新旧结果。所有 staging 映射成功、设备与源 texture/view 仍有效后才写目标缓冲。源被释放报 `WEBGPU_READBACK_TEXTURE_DESTROYED`；已确认 native device 失效报 `WEBGPU_DEVICE_LOST`；通知顺序尚未确认设备丢失的映射取消报 `WEBGPU_READBACK_ABORTED`。错误保留 cause，失败不交付部分缓冲，staging 由引擎释放。

## 场景自己的加载请求

独立后台资产和全局共享缓存有独立所有权，不应一概绑定某个场景。对于场景私有加载，显式传 AbortSignal，并在交付前验证 session token。下面代码放在 `app.run(scene)` 之后；`app` 与 `parent` 来自当前应用和场景。

```ts
import { GLTFLoader, type GLTFAsset, type GLTFInstance } from 'cocosair.js';

async function loadSceneModel(url: string): Promise<GLTFInstance | undefined> {
    const scope = app.session;
    const token = scope.token();
    if (!token.isCurrent()) throw new Error('Run the owning scene before loading its model.');
    const controller = new AbortController();
    const offSession = scope.onChange((change) => {
        if (!change.active) controller.abort();
    });
    const offHealth = app.contextHealth.onChange((health) => {
        if (health.state !== 'healthy') controller.abort();
    });
    let asset: GLTFAsset | undefined;
    let instance: GLTFInstance | undefined;
    let adopted = false;
    try {
        asset = await new GLTFLoader({ signal: controller.signal }).loadAsync(url);
        if (!token.isCurrent() || controller.signal.aborted) return;
        instance = asset.instantiate();
        parent.addChild(instance.root);
        scope.own(() => {
            instance?.dispose();
            asset?.destroy();
        }, 'scene model');
        adopted = true;
        return instance;
    } finally {
        offSession();
        offHealth();
        if (!adopted) {
            instance?.dispose();
            asset?.destroy();
        }
    }
}
```

该加载器配置包含 signal，采用独立解析所有权；示例只销毁它自己持有的实例与资产。取消以 AbortError 拒绝，业务可以结束本次交互；其他异常应保留并报告。不得捕获所有异常后返回一个貌似成功的模型，也不得在 late callback 中重新挂载到已关闭场景。glTF 取消、解码器与共享资源边界见 [运行时加载说明](../gltf/gltf-runtime.md)。

## 定向复验

`tools/verify/webgpu-texture-retirement.cjs` 使用真实 Chromium、隔离 SDK 与新输出目录。它覆盖 native submit 前资源替换、MSAA resolve、读回等待中的 resize/源释放/设备丢失、初始化中丢失及 glTF 图片的取消/晚到。具体参数见 [工具入口](../../tools/README.md)。结果是定向 GPU 资源证据，不等于全量视觉或发布验收；逻辑字节与 destroy 调用也不等于物理显存测量。
