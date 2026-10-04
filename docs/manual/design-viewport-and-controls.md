# 设计视口、渲染密度与控制方向

978×846虚拟舞台使用原生EXACT_FIT。宽高分别拉伸到画布，完整设计矩形保持可见；原生UI相机和触点转换共用同一投影，不需要再写 `uiToDesign`。EXACT_FIT会改变图案长宽比；要求等比时选择SHOW_ALL或NO_BORDER并接受其留白或裁切规则。

```ts
import { createAirApp } from 'cocosair.js/bootstrap';

const app = await createAirApp({
    canvas: '#GameCanvas',
    pixelRatioCap: 1.25,
    designResolution: { width: 978, height: 846, policy: 0 }, // ResolutionPolicy.EXACT_FIT
});
const { Scene, createUICanvas, Node, UITransform, Vec3 } = await import('cocosair.js');
const scene = new Scene('Stage');
const ui = createUICanvas(scene, 'UI', { designWidth: 978, designHeight: 846 });
const button = new Node('Button'); button.layer = ui.layer; ui.addChild(button);
button.addComponent(UITransform).setContentSize(40, 40);
button.setPosition(948 - 978 / 2, 816 - 846 / 2);
button.on(Node.EventType.TOUCH_START, (event) => {
    const design = event.getUILocation(); // 左下原点的设计坐标，不是CSS client坐标
    console.log(design.x, design.y);
});
app.run(scene);
```

纯UITransform可接输入，无需Sprite。UI根anchor默认0.5，因此子节点局部坐标等于设计坐标减半宽/半高；改变anchor或父变换后应使用UITransform的原生转换，不能继续假定该减法适用。`event.getLocation()` 是左下原点的物理屏幕坐标；传给 `camera.screenToWorld(new Vec3(x,y,0))` 后，用 `ui.getComponent(UITransform)!.convertToNodeSpaceAR(world)` 得到根局部坐标。不要把getUILocation再传screenToWorld，也不要对它乘第二次DPR。CSS client坐标是左上原点，手工转换须考虑canvas矩形、上下反转和有效DPR；优先使用原生事件。

`Camera.orthoHeight` 与新增 `orthoWidth` 都是世界半轴，完整宽高分别为两倍。`orthoWidth=0`（默认）保持原生 `orthoHeight * aspect`；正有限值独立指定半宽，负数/非有限值抛 `AIR_E_ORTHO_WIDTH`，旧值保留。透视模式忽略它。普通相机自动纵横比保持；screen-aligned Canvas拥有UI相机的两轴配置，在resize/设计分辨率变化后更新。targetTexture路径保留自动纵横比。应用自行控制正交相机时可以设置半宽/半高，projection、inverse、ray和hitTest会使用同一矩阵。

密度与设计分辨率独立：有效DPR为 `min(devicePixelRatio, pixelRatioCap)`，默认cap=2，旧 `__CCDPR_CAP__` 兼容。物理缓冲宽高按 `Math.round(CSS窗口尺寸 * 有效DPR)` 取整，首次初始化和resize共用PAL规则；小数取整可能使原生输入与投影差小于一个物理像素。cap须是有限正数，不能用0关闭渲染。通过安全入口在引擎import前设置；使用eager主入口时不同DPR配置报 `AIR_E_PIXEL_RATIO_IMPORT_ORDER`，需改用安全入口或在import前配置旧全局。入口不修改body/CSS，页面负责布局。

## 三种控制方向

Cocos使用Y-up，Camera沿局部-Z观察，Node的 `forward` 也是世界旋转下的局部-Z；`right` 为+X、`up` 为+Y。Euler API用度，不能把弧度直接传 `setRotationFromEuler`。模型的几何鼻尖可沿其他轴，必须明确建模朝向；yaw旋转不是镜像，signed scale的反射另见[蒙皮手册](./skinning-code-first.md)。

| 模式 | 前进方向 | 相机转动后的行为 |
| --- | --- | --- |
| world-relative | 固定世界方向，例如(0,0,-1) | 方向不变，屏幕投影会变 |
| vehicle-relative | 车辆Node.forward或约定的建模鼻尖轴 | 随车辆姿态转动，与相机无关 |
| screen-relative（地面XZ） | 相机forward/right投影到地面后归一化 | 相机水平旋转后仍分别朝屏幕上/右 |

```ts
const flatten = (axis: Vec3) => {
    const result = new Vec3(axis.x, 0, axis.z);
    if (result.lengthSqr() < 1e-8) throw new Error('Camera is vertical; select a fixed heading.');
    return result.normalize();
};
const screenForward = flatten(cameraNode.forward);
const screenRight = flatten(cameraNode.right);
const movement = screenRight.multiplyScalar(horizontalAxis)
    .add(screenForward.multiplyScalar(forwardAxis));
if (movement.lengthSqr() > 1) movement.normalize();
vehicle.setPosition(vehicle.position.clone().add(movement.multiplyScalar(speed * fixedDt)));
```

该例明确选择地面投影，不适用于绕相机forward飞行的自由三维控制。正对地面俯视时forward投影退化，业务必须选择固定heading或其他平面；不要归一化零向量后把停滞当引擎输入丢失。动作轴来自[生产动作状态](./input-action-state.md)，在业务固定tick消费，渲染插值与输入边沿分开。

实际范围见[台账](../../ai/ledgers/port-gap-remediation.md)：`air-design-viewport-browser.cjs`验证完整舞台/原生点击/三档DPR与resize；`air-control-basis-browser.cjs`以三种相机角度和真实3D标记像素验证控制方向。外部端口工程未提供，`stage.ts`/`uiToDesign`是否删除仍须端口回归后由owner决定。
