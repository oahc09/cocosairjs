# Code First 加载 Tiled 地图

`loadTiledMap` 将有限大小的 TMX 地图、外链 TSX 和图片装成原生 `TiledMapAsset`。
TSX 内的图片路径以 **TSX 自己的位置**为基准，不是 TMX 的位置。两个 TSX 可以分别
引用各自目录下的 `tiles.png`，不会把图像混用。只有加载器内存里的 XML 副本会替换
查找键；源 TMX 和 TSX 字节不变。

```js
import { AssetBank, TiledMap, loadTiledMap } from 'cocosair.js';

const bank = new AssetBank();
const handle = await loadTiledMap('./maps/room.tmx', { bank });
const map = mapNode.addComponent(TiledMap); // 放在正常的 Canvas / UI 场景中
map.tmxAsset = handle.asset;

// 不再使用时，把对应图层从场景分离，再释放此地图的资源。
mapNode.removeFromParent();
mapNode.destroy();
handle.dispose();
```

- 默认相对 `document.baseURI` 查找地图，也可以传入 `baseURL`。
- 地图和依赖必须是 HTTP(S)；图片和 TSX 必须和地图同源。首版支持 PNG、JPEG、WebP，
  每张地图最多 256 个不同依赖。无限地图、TSX 嵌套引用和嵌入图片不在支持范围。
  地图内容仍受原生 Tiled 解析器的支持范围限制。
- 每次调用返回独立句柄。同一个 `AssetBank` 可共享底层图片请求；销毁一张图
  不会释放另一张图的订阅。局部加载失败会回滚这次调用已取得的订阅。
- 可传入 `signal` 取消这张图的等待，不取消其他调用，也不承诺中断底层网络请求。
  `dispose()` 可重复调用。若多个 `TiledMap` 使用同一个 `handle.asset`，先将它们全部分离，
  再调用 `dispose()`；共享 bank 不应在地图还在使用时调用 `releaseAll()`。
- 对象坐标和类查询仍走原生 [Tiled 对象查询](./tiled-object-queries.md)；加载器不自动实例化对象节点。
