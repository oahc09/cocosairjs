# 原生Billboard

默认公共入口直接导出已有 `Billboard`，不经过3D粒子聚合入口。它使用内建 `default-billboard-material`，在着色器中令纹理矩形朝向当前相机；节点 `lookAt` 是另一种姿态配方，不会提供该组件的尺寸和technique行为。

```ts
import { Billboard, Node } from 'cocosair.js';

const node = new Node('Billboard');
scene.addChild(node);
const billboard = node.addComponent(Billboard);
billboard.texture = texture;
billboard.width = 2;
billboard.height = 1;
billboard.rotation = 30; // 原生API为角度，绕纹理中心旋转
billboard.technique = 0; // 当前内建效果只有add这一项；超出范围会截断到0
```

默认width/height为0，必须设置可见尺寸。原生API不新增AIR参数校验层；technique按原生效果数量截断。应用保留输入Texture2D的所有权并在最后一个使用者退役后释放它。组件创建的Model、Mesh、Material独占，改变technique与节点销毁会清理旧实例并归还原生模型池；不会销毁共享输入纹理。停用只是退出渲染场景，重新启用会重新挂接模型。

`node tools/verify/air-billboard-browser.cjs --out=<新.json>` 检查三个相机角度、中心90°旋转以及场景释放；专用组件无需导入完整ParticleSystem。范围决议见[owner第13节](../reference/owner-decisions.md#13-端口缺口范围决议2026-10-04)，当前实测见[台账](../../ai/ledgers/port-gap-remediation.md)。

覆盖率库存与专项验收分别记录。此新公开组件的11个单元尚无当前Gallery逐API执行证明，库存明确标为documented-only，不增加verified计数；专项像素/安装消费结果仍按台账的实际候选与范围读取。实例通过Node.addComponent创建，onLoad/onEnable/onDisable/onDestroy由引擎按生命周期调用，业务不直接调用这些回调。
