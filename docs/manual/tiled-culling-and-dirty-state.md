# Tiled 裁剪与更新标记

Tiled 图层的裁剪范围与渲染数据更新是两个步骤。原生
`src/cocos/tiledmap/assembler/simple.ts` 的 `updateRenderData()` 先调用 `updateCulling()`，
再检查颜色、culling/user-node 脏标记、动画、TiledNode 和节点变换，决定是否重建数据；
重建后清除 culling/user-node 标记。业务不必因为使用 Tiled 就在每个 update 中再调用一次裁剪。

`TiledLayer.updateCulling()` 在启用裁剪时重新查找相机，以图层世界矩阵的逆矩阵将相机屏幕角点
转到局部空间，再更新可见网格范围。图层、父节点和已绑定相机的变换/尺寸事件已有订阅。
运行时替换实际相机时可显式调用一次，使裁剪重新查找相机；暂停且没有渲染帧时，
CPU 属性更新不承诺马上刷新屏幕。

`enableCulling = false` 会标记更新，关闭后使用整个网格范围，不会关闭 tile 动画。

`setTileGIDAt(gid, column, row, flags)` 和 `setTilesGIDAt(gids, column, row, columns)`
通过同一路径更新瓦片数据、标记裁剪和请求渲染数据刷新。图层启用且有下一帧时，
填充、替换或清空格子无需移动相机或重新激活图层。一次批量编辑中的多次请求由引擎的
UI 渲染队列按图层合并。`setCullingDirty(true)` 本身仍只置标记，不是刷新 API。

翻转标记需要第四参数：输入 GID 的高位先被移除，不能把 CSV 中合并了标记的整数直接当成
完整 setter 合同。查询用 `getTileGIDAt()` 和 `getTileFlagsAt()` 分别读取。

依据为上述 assembler、
`src/cocos/tiledmap/tiled-layer.ts` 的 setter、裁剪和生命周期路径，以及
[tiledmap-basic](../../examples/tiledmap-basic/) 的 P5/P6/P8 原生数据和三浏览器渲染合同。
对象/瓦片的数据查询见 [Tiled 查询](./tiled-object-queries.md)。
