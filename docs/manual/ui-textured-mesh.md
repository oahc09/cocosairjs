# UI贴图三角形

`AirUIMesh` 是原生 `UIRenderer` 的AIR薄组件，使用现有2D batcher、Sprite材质、UI层级和Mask stencil。它适合任意带UV三角形，不包含Spine时间线或骨骼动画；本轮Spine 2.1明确不支持。

```ts
import { AirUIMesh, Node, UITransform } from 'cocosair.js';

const node = new Node('Triangle');
node.layer = canvasNode.layer;
canvasNode.addChild(node);
const mesh = node.addComponent(AirUIMesh); // 自动需要原生UITransform
node.getComponent(UITransform)!.setContentSize(120, 100);
mesh.spriteFrame = frame;
mesh.setGeometry({
    positions: [-60, -50, 60, -50, 0, 50],
    uvs: [0, 0, 1, 0, 0.5, 1],
    indices: [0, 1, 2],
});
```

`positions` 是节点局部XY，遵循Node变换；改变UITransform尺寸/anchor不自动缩放或重新定位顶点。`uvs` 是帧内归一化坐标，左下为(0,0)、右上为(1,1)，映射原生SpriteFrame四角UV，支持旋转图集帧和动态图集。图片裁剪偏移应由业务生成顶点时决定；UITransform的矩形命中范围与实际三角形不同。

每次 `setGeometry` 校验并复制冻结三组数组，修改调用方数组不会改变渲染。每组件限3..1024顶点、1..1365三角形；超大内容由调用方显式拆分节点。缺UV、非有限坐标、越界或小数索引、越界UV及容量错误抛 `AIR_E_UI_MESH_GEOMETRY`，附 `field`，有效旧几何保留。清空使用 `clear()`。本入口是Web-only组件，容量假定默认原生UI缓冲；不要降低 `macro.BATCHER2D_MEM_INCREMENT` 到无法容纳单组件的值。

`color`、`customMaterial`、父级 `UIOpacity`、enabled与兄弟顺序沿用UIRenderer。默认材质可与同纹理Sprite合批；不同材质、纹理或Mask stencil会按原生规则分批。自定义材质须遵守原生UI位置/UV/颜色顶点布局与stencil合同，不能任意使用3D effect。业务独占材质仍由业务释放；session清理回调须检查组件isValid再解绑，因为原生场景销毁可能已完成。不要在同一个Node添加另一个UIRenderer；Mask使用父节点。

组件持有SpriteFrame、原始页及用到的动态图集纹理的独立引用，绑定替换或 `dispose()` 只释放这些引用，不强制销毁共享资源。动态图集保留原始页便于恢复，手动重设同一帧的纹理会保留已用纹理直到解绑；需要立即释放旧纹理时解绑再设置。`dispose()` 幂等，清空几何/渲染数据并使组件终止；后续赋帧或几何抛 `AIR_E_UI_MESH_DISPOSED`。原生节点销毁自动执行；业务仍须维护其他共享资产所有者，不能强制销毁正在被组件使用的帧。

运行验证入口：`node tools/verify/air-ui-mesh-browser.cjs --out=<新.json>`。结果与范围见[实施台账](../../ai/ledgers/port-gap-remediation.md)；声明或headless通过不替代Mask/混排像素。
