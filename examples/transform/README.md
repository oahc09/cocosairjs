# transform — 层级与局部/世界变换（V0.5.1 T2）

## 演示内容

- Node 层级 `scene → root → child → grandchild`，世界变换 = 各级 local 变换复合；
- `position` / `rotation` / `scale` 的 local 语义（相对父节点）；
- `worldPosition` 与 local `position` 的区别：root 旋转时 grandchild 的 local 不变、world 持续变化；
- 用 `Component.update(dt)` 驱动动画（AirApp 不暴露帧回调，动画一律走组件）。

## 前置 DOM

`index.html` 中 `<canvas id="GameCanvas">`（引擎 ScreenAdapter 按 id 查找画布）。

## 启动

```bash
npm run dev -- --example transform
# → http://127.0.0.1:7454/transform/
```

## 预期操作与观察

- 三个立方体组成层级，root 旋转带动全部子层级，child 同时左右摆动并缩放；
- 打开浏览器控制台，每秒打印一行 grandchild 的 `local` 与 `world` 坐标对照；
- 无外部资源、无输入依赖。

## 能力边界

仅演示场景图变换语义，不涉及相机切换（见 camera 示例）与输入（见 input 示例）。
