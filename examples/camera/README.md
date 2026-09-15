# camera — 透视 / 正交相机与取景（V0.5.1 T2）

## 演示内容

- `Camera.ProjectionType.PERSPECTIVE` / `ORTHO` 切换：透视下近大远小，正交（`orthoHeight`）下同尺寸；
- `utils` 平面外的 `frameObject(camera, node)` helper：按包围盒自动取景；
- 页面 DOM 按钮控制，不依赖键盘（键盘/触摸见 input 示例）。

## 前置 DOM

`index.html` 中 `<canvas id="GameCanvas">`；运行时在页面左下角注入两个按钮。

## 启动

```bash
npm run dev -- --example camera
# → http://127.0.0.1:7454/camera/
```

## 预期操作与观察

- 一排沿 Z 轴退后的 5 个立方体：透视模式下近大远小；
- 点击「切换正交/透视」后所有立方体呈现相同大小；
- 点击「frameObject 取景」后相机自动移动到恰好框住整组立方体。

## 能力边界

不演示双相机/渲染纹理（见 gltf-viewer 与 transmission 相关示例）。
