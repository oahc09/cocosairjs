# 音频、视频与 WebView（Web 条件与释放）

> **状态：FULL（Web 条件下）。** 官方 [audio-system/overview]、[audiosource]、[videoplayer]、[webview]
> 三块的 AIR 落法。AIR 是 Web 运行时：**音频要用户手势解锁、视频编解码由浏览器决定、WebView 是
> DOM overlay**——每一条都有可复跑示例背书（v11 链 53/53）。

## 1. 音频：AudioSource 与手势解锁

Web 环境自动播放受限：**只有在用户手势回调内启动的播放才有声音**。AIR 的 pal 层在首次手势时
`resume()` 音频上下文（挂 `touchend`/`mouseup` 捕获监听）。两条合法通路
（`examples/audio-basic/main.js` 实测注释）：

- **手势回调内 `play()`**：`playOnAwake=false`，在 `TOUCH_START` 回调里启动（`srcB` 路线）；
- **首次手势后的播放**：pal 已完成解锁，常规 `play()` 即可（`srcA` 路线）。

资产加载与组件挂接（逐字节）：

```js
function loadRemote(url) {
  return new Promise((resolve, reject) => {
    assetManager.loadRemote(url, (err, asset) => {
      if (err) {
        reject(err);
      } else {
        resolve(asset);
      }
    });
  });
}

clip = await loadRemote(CLIP_URL);
```

```js
srcA = audioNode.addComponent(AudioSource);
srcB = audioNode.addComponent(AudioSource);
for (const s of [srcA, srcB]) {
  s.playOnAwake = false;
  s.clip = clip;
}
```

该示例的 8 阶段读回覆盖：运行时资产/解码 PCM（`AudioPCMDataView`）/手势解锁/播放头/音量/seek
判尾/循环；`AudioSource.EventType.STARTED/ENDED` 事件计数可回读。

## 2. 视频：VideoPlayer（DOM 元素挂载、全屏、透明）

`VideoPlayer` 往 `game.container` 追加真实 `<video class="cocosVideo">` 元素；换源先
`removeVideoPlayer` 再重建。`examples/video-basic/main.js` 覆盖挂载/事件回调/播控/透明视频
（`macro.ENABLE_TRANSPARENT_CANVAS`）/解码出图/换源/判尾/循环/全屏双向，8+1 阶段逐字段读回。

```js
player = hostNode.addComponent(VideoPlayer);
player.resourceType = VideoPlayer.ResourceType.LOCAL;
```

```js
player.clip = c; // LOCAL 分支：syncClip → createVideoPlayer(clip.nativeUrl)
await waitFor(() => player.state === VideoPlayer.EventType.READY_TO_PLAY, 1000);
```

全屏注意（实测）：`player.fullScreenOnAwake` 只有在 **clip 装载之前**设置才有效（awake 路在
`readyState!==4` 时直接生效）；点击画布切换全屏的交互见该示例 interaction.steps。
编解码由浏览器决定（headless 与移动端差异属环境条件，不属引擎能力）。

## 3. WebView：DOM overlay 的边界与释放

`WebView` 把 iframe 挂进 `game.container`——**DOM overlay，不在 canvas 里渲染**；几何跟随
`UITransform`（每帧 `syncMatrix()`），输入穿透按命中测试开关。释放语义（实测）：
`removeWebView()` 只在 wrapper 真的还挂在 container 里时才摘——**DOM 里 `#webview-wrapper`
的个数是真实的泄漏计数器**；销毁后 `nativeWebView` 必须为 null。

```js
 *   `removeWebView()` 只在 wrapper 真的还挂在 container 里时才摘（:96-102）⇒
 *   「DOM 里 `#webview-wrapper` 的个数」是真实的泄漏计数器。销毁后 `nativeWebView` 必须是 `null`、
```

`examples/webview-basic/main.js` 的 P1~P9 覆盖挂载/事件（load/loading/error + EventHandler
回调线）/几何/evaluateJS/命中与 enabled/error 语义/卸载重建，iframe 内点击 0→1 可回读。
⚠️ `evaluateJS` 的失败路径在该示例里**故意不触发**（impl 的 catch 会刷屏）——错误路径用法见其注释。

## 4. 验证与运行

| 示例                                                     | 内容                           | 条件                                                           |
| -------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| [examples/audio-basic/](../../examples/audio-basic/)     | 手势解锁→8 阶段读回            | 需要真实手势事件（矩阵 pointer click）；`assets/tone.wav` 自产 |
| [examples/video-basic/](../../examples/video-basic/)     | 挂载/回调/播控/透明/全屏       | 编解码依赖浏览器；`assets/clip.mp4` 自产                       |
| [examples/webview-basic/](../../examples/webview-basic/) | iframe 挂载/事件/几何/卸载重建 | `assets/page.html` 自产                                        |

运行：`npm run dev` 后访问 `http://127.0.0.1:7454/examples/<id>/`。
video-basic 的 webkit 行在三引擎矩阵是 F-135 在册间歇（复跑即绿），非能力缺陷。
卸载后的泄漏检查（无遗留 DOM/音频）以各示例的 `window.__probe` 读回为准。

---

上一篇：[Physics 2D and 3D 碰撞、层与后端](./physics-2d-and-3d.md) ｜ 下一篇：[2D 资产与效果](./2d-assets-and-effects.md)
