# Tiled 裁剪与更新标记

Tiled 图层的裁剪范围与渲染数据更新是两个步骤。原生
`src/cocos/tiledmap/assembler/simple.ts` 的 `updateRenderData()` 先调用 `updateCulling()`，
再检查颜色、culling/user-node 脏标记、动画、TiledNode 和节点变换，决定是否重建数据；
重建后清除 culling/user-node 标记。业务不必因为使用 Tiled 就在每个 update 中再调用一次裁剪。

`TiledLayer.updateCulling()` 在启用裁剪时重新查找相机，以图层世界矩阵的逆矩阵将相机屏幕角点
转到局部空间，再更新可见网格范围。图层、父节点和已绑定相机的变换/尺寸事件已有订阅。
运行时替换实际相机时可显式调用一次，使裁剪重新查找相机；暂停且没有渲染帧时，
CPU 属性更新不承诺马上刷新屏幕。

`enableCulling = false` 会标记更新，关闭后使用整个网格范围。它不关闭 tile 动画，
也不代表每次修改瓦片数据都会自动重建所有渲染批次。

`setTileGIDAt(gid, column, row, flags)` 更新瓦片数据/顶点簿记并置 `_cullingDirty`。
`setCullingDirty(true)` 也只置标记；它们不能等同于所有路径都已申请 render-data 更新。
现有静态图层向空格添加瓦片，或关闭裁剪后改图的路径有刷新限制：数据查询已变化，
仍可能没有新像素。已有示例通过图层重新激活重建做显式对照；连续 tile 动画使用 TSX animation
和原生每帧更新路径。不要通过每帧调用 `updateCulling()` 或读到新 GID 就声称已刷新画面。

翻转标记需要第四参数：输入 GID 的高位先被移除，不能把 CSV 中合并了标记的整数直接当成
完整 setter 合同。查询用 `getTileGIDAt()` 和 `getTileFlagsAt()` 分别读取。

本页只解释当前实现与已知边界，不修改原生刷新机制。依据为上述 assembler、
`src/cocos/tiledmap/tiled-layer.ts` 的 setter、裁剪和生命周期路径，以及
[tiledmap-basic](../../examples/tiledmap-basic/) 的 P5/P6/P8 原生数据和三浏览器渲染合同。
对象/瓦片的数据查询见 [Tiled 查询](./tiled-object-queries.md)。
