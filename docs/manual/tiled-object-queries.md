# Tiled 对象与瓦片查询

需要从 URL 装配地图和外链 TSX 时，见 [Code First 加载 Tiled 地图](./tiled-loader.md)。
渲染刷新与裁剪边界见 [Tiled 裁剪与更新标记](./tiled-culling-and-dirty-state.md)。

`TiledObjectGroup.getObjects()` 保留引擎坐标和可变对象的原有合同。
`getRawObjects()` 返回冻结的 TMX 原始几何快照：`x/y`、尺寸、旋转、形状、`gid`、polygon/polyline 点。
对象数组和点也只读，业务修改换算对象不会改变快照。自定义属性继续从 `getObjects()` 的 `properties` 读取。

```ts
const group = map.getObjectGroup('markers');
if (group) {
    const solids = group.getObjectsByType('solid');
    const polygons = group.getObjectsByType(TiledMap.TMXObjectType.POLYGON);
    const original = group.getRawObjects().find((object) => object.name === 'crate');
}
```

字符串查询匹配 Tiled 的 `class`，没有 `class` 时匹配旧版 `type`；解析后的字段名是 `className`。
数值查询仍匹配原来的几何形状枚举 `type`。两种查询返回原有引擎对象。
TMX 原点在左上；正交地图的引擎 Y 为 `mapHeight * tileHeight - rawY`。
等距地图沿用原生投影：`x = tileWidth/2 * (mapHeight + rawX/tileHeight - rawY/tileHeight)`，
`y = tileHeight/2 * (mapWidth + mapHeight - rawX/tileHeight - rawY/tileHeight)`。
这些是对象层坐标；节点 anchor、对象组 offset 和父级变换仍需应用，不能直接当作屏幕坐标。

同一解析结果重新初始化时，从首次几何快照换算，避免二次翻转点或重复投影。
若要替换原始地图数据，重新解析/替换 `TiledMapAsset`；不要依赖修改换算对象来重写原始 TMX。

瓦片碰撞读取数据即可，无须读取像素：

```ts
const layer = map.getLayer('ground');
if (layer && column >= 0 && row >= 0
    && column < layer.getLayerSize().width && row < layer.getLayerSize().height) {
    const gid = layer.getTileGIDAt(column, row);
    const flags = layer.getTileFlagsAt(column, row);
    const properties = gid ? map.getPropertiesForGID(gid) : undefined;
    const solid = properties?.solid === true;
}
```

列/行使用地图网格坐标，越界先拦截；空格的 GID 为零。翻转标记单独读取。
正交地图可先逆变换到图层局部空间，再按格宽高求列行；等距地图须逆投影，不能套用正交除法。
`solid` 是应用的 TSX 属性约定，这些 API 只提供地图数据，不执行接触、摩擦或单向平台求解。

现有 [tiledmap-basic 示例](../../examples/tiledmap-basic/) 覆盖正交/等距、外链 TSX、对象与瓦片动画。
定向原生测试检查两类地图的原始/换算坐标、字符串/形状查询、快照冻结和重复初始化；
`tools/verify/air-tiled-objects-browser.cjs --out=<new.json>` 对照原始 XML，并复跑该示例现有 P1–P8 合同。

## 从对象 class 创建业务节点

加载并赋值 `map.tmxAsset` 后，用显式注册表创建实例：

```ts
import { Node, instantiateTiledObjects } from 'cocosair.js';

const markers = instantiateTiledObjects(map, new Map([
    ['Player', ({ source, properties }) => {
        const root = new Node(source.name);
        // 在 root 下创建角色 Sprite/组件；可读取 properties 中的 TMX 属性。
        return root;
    }],
]));
// 替换或卸载地图前：markers.dispose();
```

只分派可见的非文字/非瓦片几何标记；未注册的 class 跳过，已有文字/瓦片对象保持由原生引擎管理。
名称按原样匹配，有 `class` 时优先，否则使用旧版 `type`。不会按地图中的名字加载脚本或组件。
工厂同步返回新建、无父节点的 `Node`，或返回 `undefined` 跳过；不要在回调里替换地图或重排对象。
根节点按原生对象组坐标定位并应用 TMX 旋转，受地图 anchor、对象组 offset 和父级变换影响；
如需额外偏移，在根节点之下创建子节点。

每张地图只持有一个活动句柄，两张地图分别实例化。工厂抛错时回滚本次已接管的根节点；
应用仍负责释放工厂未返回的临时资源。先 `dispose()` 再替换 `tmxAsset`，即使新旧地图组同名也不复用旧业务节点；
若从 URL 加载资源，销毁地图后再释放 `loadTiledMap` 的素材句柄。
