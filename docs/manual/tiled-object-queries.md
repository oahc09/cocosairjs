# Tiled 对象与瓦片查询

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
