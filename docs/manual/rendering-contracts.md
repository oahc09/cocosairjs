# 渲染目标的浏览器验证

`AirRenderTarget` 使用原生 `RenderTexture`、`Camera` 和 `Material`。格式和 MSAA 能力由设备决定；一个有效的 TypeScript 参数或 `info` 字段不能证明 GPU 已按请求分配资源。

```ts
const target = createAirRenderTarget({
    width: 960,
    height: 640,
    scale: 0.5,
    colorFormat: 'rgba16f',
    depthFormat: 'depth24-stencil8',
    samples: 4,
    sampleFallback: 'error',
});
const detach = target.attachCamera(sourceCamera);
const unbind = target.bindColor(displayMaterial, 'colorSource');

// width/height 是 backing pixel 的基准尺寸，scale 会再次乘进去。
target.resize(1280, 720);
// 等待该相机完成本帧后读取；浮点格式返回 Float32Array。
const pixel = target.readColor({ x: 0, y: 0, width: 1, height: 1 });

unbind();
detach();
target.dispose(); // 重复调用安全。
```

`attachCamera()` 在相机结束时解析 MSAA；下一台相机可在同一帧采样 `target.texture`。`bindColor()` 和 `bindDepth()` 会在 resize 后重新绑定底层附件，解绑或 dispose 时恢复先前材质属性。查看 `info.requested` 和 `info.effective` 确认请求与实际选择；只有明确设置 `sampleFallback: 'lower'` 才允许降低采样数。

`attachCamera(camera, beforeRender)` 的回调在相机剔除和Camera UBO上传前执行,适合更新反射/折射相机与斜裁剪。它晚于RenderScene的模型更新:在此回调改材质参数后要显式调用相关`material.passes[].update()`；不能假设晚改模型变换也会自动重新上传。`calculateObliqueMat` 接收view-space平面,当前实现不修改传入向量,并更新投影及其逆矩阵/视锥。每帧应基于当前相机重算平面。

`texture`/`depthTexture` 是稳定的原生TextureBase借用视图,不能独立释放其底层GPU资源。resize成功后`renderTexture` getter指向新的原生写入目标；使用`attachCamera`的相机会自动重绑,直接赋值`camera.targetTexture`的业务需自己跟随新对象。非法尺寸在分配前失败,新附件创建失败不会先销毁旧附件。

## 专属验证工具

先由集成负责人构建并冻结候选 bundle。工具使用只读 HTTP server，不调用 build、不写已有正式报告、不安装浏览器。需要当前环境已配置 Playwright、`pngjs` 和匹配浏览器二进制；没有本仓依赖时可设置 `NODE_PATH` 指向工具运行环境。

```powershell
# 对原生旧接口仅作观察，不能解释成新合同通过。
node tools/verify/rendering-contracts.cjs --baseline --browser=chromium --out=output/rendering/baseline-01.json

# 三浏览器依次运行，避免相互占用 GPU。
node tools/verify/rendering-contracts.cjs --browser=all --out=output/rendering/attempt-01.json

# 可单独使用系统 Chrome；该结果仍属于 Chromium 子集。
node tools/verify/rendering-contracts.cjs --browser=chromium --channel=chrome --out=output/rendering/chrome-01.json
```

`--out` 必填且不得覆盖已有文件。截图写入同名 `-artifacts/` 目录。报告保存 bundle 与 probe 源码 SHA256；运行期间任一指纹改变都会失败。单浏览器报告明确标记 `subset: true`。

手工查看页面时，访问 `/tools/debug/probes/rendering-contracts/`，先运行目标合同，再点击 **Resize + rebind** 和 **Change sampled contrast**。它们改变实际材质与纹理采样画面。自动工具也点击这些按钮，解析 canvas 截图中心区域的 RGB，防止仅凭事件或状态字段验收。

## 检查内容与边界

每个格式组合及深度、resize 阶段都会读取 `gl.getError()`。即使旧纹理保留正确像素，出现非法操作也必须失败，不能只凭颜色读回成功验收。

| 检查                     | 实际证据                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| RGBA8 / RGBA16F，1× / 4× | 查询真实 framebuffer 附件完整性、组件类型、色位宽和 renderbuffer 采样数。                  |
| HDR 浮点值               | 原生网格向目标输出 `(4, 2, 0.5)`，`readColor()` 必须读出大于 1 的红色值。                  |
| MSAA resolve 与采样      | 第二台原生相机通过 `sampler2D` 显示解析后的纹理；截图必须出现预期亮度。                    |
| scale、resize、重新绑定  | 尺寸与 generation 更新后绘制全新颜色，目标读回及显示画面都必须更新，旧纹理无法通过。       |
| 深度重建                 | 将平面绘制在相机前 3 个单位，GPU 采样原始深度并按 near/far 重建距离，颜色读回应接近 3。    |
| 深度比较                 | 使用 `createAirDepthSamplerTemplate()` 的 `manual-compare`，检查遮挡参考深度的可见性为 0。 |
| 交互                     | 真实点击按钮，比较截图 RGB；截图中的 HTML 状态栏在取样时隐藏。                             |

深度附件使用原始 `sampler2D` 的 `.r`，不是 `sampler2DShadow`。WebGL 深度值位于 `[0, 1]`；透视相机的重建距离为 `near * far / (far - depth * (far - near))`。工具通过 GPU 转成颜色后读回，不承诺直接 `readPixels()` 深度，也不把手动单点比较称为 PCF 阴影。

上述near/far公式仅适用于普通透视投影；斜裁剪或其他修改后的投影必须使用实际`matProjInv`，以`vec4(uv*2-1, depth*2-1, 1)`反投影并除以w。水面示例按实际相机矩阵重建,不能把普通投影公式套在反射/折射裁切通道上。

`UNSUPPORTED` 必须同时有真实设备能力查询和明确错误码，不能由任意异常推断。它表示该组合没有执行成功；报告可在其余必测合同全部成功时通过支持边界，但不能据此宣称设备支持该组合。`lower` 的结果独立记录实际采样数；没有有效回执就失败。浏览器缺失、着色器失败、黑图、深度重建失败均为失败，不转换成 unsupported。

耗时分开记录：`startupWallMs` 是启动墙钟；`cpuSubmitMs` 是受控原生帧提交墙钟，包含 JavaScript/驱动工作，不能当作纯 CPU 指令时间；`gpuMs` 来自 `EXT_disjoint_timer_query_webgl2`；截图 `wallMs` 包含浏览器截图和传输。GPU timer 不可用、disjoint 或超时时为 `null` 并带原因。这里没有显示器 present 计量，不以这些值代替实际屏幕呈现帧率。

## 查看原生实际排序队列

`inspectAirMaterial()` 给出材质状态，不能证明实际提交顺序。仓库可选工具 `tools/debug/render-queue.ts` 在原生 `RENDER_CAMERA_END` 时复制 legacy pipeline 已排序、已记录的队列：

```ts
// 本仓开发服务器将 tools 下的 TS 按需转成 JS；工具不在默认 SDK/npm 入口中。
const { attachAirRenderQueueObserver } = await import('/tools/debug/render-queue.js');
const detach = attachAirRenderQueueObserver(director.root, (snapshot) => {
    if (snapshot.status === 'unavailable') console.warn(snapshot.reason);
    else console.table(snapshot.queues.flatMap((queue) => queue.entries));
});
// 调试结束时解除监听。
detach();
```

快照保存相机、flow/stage、透明标记、原数组顺序、model/node/submodel/pass 索引、priority、depth、program、blend 和 depthWrite。工具不会根据这些字段重新排序；只读取 `CachedArray.length` 个有效元素，忽略尾部缓存。字段依赖已固定的 `ForwardStage._renderQueues`、`RenderQueue._passDesc` 和 `CachedArray.array/length`；字段变化或无法映射当前相机模型时返回 `unavailable`。

这证明的是各原生排序队列中的实际顺序，范围不包括 custom pipeline、instancing/batching、UI 或队列外辅助绘制，不把多个队列拼成全帧 GPU draw trace。直接调用 `inspectAirRenderQueues(root, nativeCamera)` 只获取当时数据，标记 `caller-snapshot`；需证明排序完成的相机边界时使用 observer。
