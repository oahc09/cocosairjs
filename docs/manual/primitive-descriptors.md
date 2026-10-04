# 几何描述与原生签名

`createPrimitiveGeometry()` 用具名参数调用原生四种图元，返回 `IGeometry`。
渲染器需要 `Mesh`，仍通过 `utils.createMesh()` 转换：

```ts
import { createPrimitiveGeometry, utils } from 'cocosair.js';

const geometry = createPrimitiveGeometry({
    type: 'cylinder', radiusTop: 0.25, radiusBottom: 0.5, height: 2,
    radialSegments: 16, heightSegments: 2, capped: true, arc: Math.PI * 2,
});
const mesh = utils.createMesh(geometry);
```

| type | 参数 | 原生默认值 |
| --- | --- | --- |
| box | width、height、length；各自的 widthSegments/heightSegments/lengthSegments | 尺寸1，段数1 |
| sphere | radius、segments | 半径0.5，段数32 |
| cylinder | radiusTop、radiusBottom、height、radialSegments、heightSegments、capped、arc | 半径均0.5，高2，段数32/1，封盖，2π |
| cone | radius、height、radialSegments、heightSegments、capped、arc | 半径0.5，高1，其余同cylinder |

`includeNormal`/`includeUV` 作为原生选项转发；实际输出仍遵循对应原生函数，不增加第二套几何生成规则。
尺寸和球/锥半径必须有限且正。圆柱两端半径允许零，但不能同时为零。
arc 为弧度，范围 `(0, 2π]`。段数为整数：球/径向至少3，其他至少1；各项最多1024，预测顶点数最多100万。
这是描述入口的分配上限；需要更大网格时显式使用原生 API 并承担资源预算。
错误字段、错形状参数、非布尔选项和非法范围在生成前抛 `AIR_E_PRIMITIVE_DESCRIPTOR`，含 `field`。

现有公共名字与调用行为保持：

| API | 使用合同 |
| --- | --- |
| `primitives.box(options)` | options对象，返回geometry |
| `primitives.sphere(radius, options)` | 位置参数半径，返回geometry |
| `primitives.cylinder(radiusTop, radiusBottom, height, options)` | 位置参数两半径/高度，返回geometry |
| `primitives.cone(radius, height, options)` | 位置参数半径/高度，返回geometry |
| `utils.createMesh(geometry)` | geometry转原生Mesh；应用负责拥有和释放 |
| `Node.addChild(node)` | 返回void，不可链式构造子节点 |
| `Scene.addComponent()` | 原生弃用入口；在Scene内创建Node后给Node加组件 |
| `AirAppImpl` | 保留已发布导出和旧构造方式；推荐通过createAirApp初始化 |
| `cocosair.js/bootstrap` | 无DOM时可导入；调用时先验证canvas，再动态加载原生入口 |

`node tools/verify/air-signature-usage.cjs --types <file.ts|file.js>` 可查指定业务文件的签名误用。
描述入口采用 TypeScript discriminated union，四种默认/自定义输出均用完整geometry数据对照原生函数；
该一致性测试不是GPU像素或独立安装包验收。

消费者的 DOM 类型与编译器版本选择见 [TypeScript DOM 声明](./typescript-dom-compatibility.md)。
