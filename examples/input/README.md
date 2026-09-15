# input — 键盘 / 鼠标 / 触摸交互（V0.5.1 T2）

## 演示内容

`input.on(Input.EventType.*)` 的三类已支持交互（不引入手势框架）：

- `KEY_DOWN` / `KEY_UP`：维护按键集合，`Component.update` 中按集合平移方块（WASD）；
- `MOUSE_WHEEL`：滚轮推拉相机（限制最小/最大距离）；
- `TOUCH_START/MOVE/END/CANCEL`：拖拽旋转方块（引擎将指针设备的鼠标按下/移动/抬起映射为触摸事件，因此同一处理器同时覆盖触摸与鼠标拖拽）。

## 前置 DOM

`index.html` 中 `<canvas id="GameCanvas">`；键盘事件需要页面获得焦点。

## 启动

```bash
npm run dev -- --example input
# → http://127.0.0.1:7454/input/
```

## 预期操作与观察

- 按 W/A/S/D：方块前后左右平移；
- 滚轮：相机推近/拉远（3～20 范围内）；
- 在画布上按住并拖动（鼠标或触摸）：方块旋转。

## 能力边界

不演示游戏手柄、加速度计与多指手势。
