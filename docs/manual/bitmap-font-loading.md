# 加载文本 BMFont

`parseFnt(text)` 解析 BMFont 文本，返回冻结的页面、字形 rect/offset/advance 和偶距配置。
首批范围是未打包到分色通道的单页字体，page id 为0，字符/偶距使用BMP码点。
XML、二进制、多页、packed、越界字形和计数不一致会明确拒绝；不静默忽略页面。

已持有页面资源时，`createBitmapFont(data, pageSpriteFrame)` 装配并 `onLoaded()` 初始化原生 `BitmapFont`。
页面必须是整张纹理：无旋转、无裁切、无offset，尺寸匹配 `.fnt` 的 scaleW/scaleH。
不把 atlas 中的 trimmed region 当作整页字体；也不为每个字形烘焙 canvas。

常规加载使用 `AssetBank`：

```ts
import { AssetBank, loadBitmapFont } from 'cocosair.js';

const bank = new AssetBank();
const controller = new AbortController();
const handle = await loadBitmapFont('/assets/font.fnt', { bank, signal: controller.signal });
label.font = handle.font;
label.fontSize = handle.data.fontSize;
label.lineHeight = handle.data.commonHeight;

// 从应用/场景中移除使用者，归还其他显式font.addRef()后释放。
label.font = null;
handle.dispose();
```

浏览器中相对 `.fnt` URL 先按 document.baseURI 定位，页面再相对字体URL解析。
绝对字体URL可在没有document的环境使用；`baseURL` 可显式指定页面的绝对基址。
这个加载器接受 PNG 页面，其他原生支持的格式可自行取得整页 SpriteFrame 后交给工厂。
`signal` 取消 bank 中本次 text/page 订阅，底层请求是否可停止仍按 AssetBank 的能力披露。

handle 持有 font、页面 SpriteFrame 和 Texture2D 的引用；原生 FontAtlas 另有自己的纹理引用。
dispose 先移除 FontAtlas 的纹理引用，再归还自身引用，加载器还归还其 text/image bank 订阅。
失败归还已经取得的订阅并销毁本次独占的中间 texture/frame。
dispose 可重复调用。额外字体引用未归还时抛 `AIR_E_FNT_IN_USE`，保持handle和订阅可用，
归还后可重试。绑定在 Label 上的资源请先解绑，不能以refCount自动推断所有UI使用者。
直接调用 font.destroy() 或 force-release 不能代替此拥有句柄的释放合同。

首次 `app.run(scene)` 会接管初始化 session 中准备的资源；因此可在首次运行前登记清理。
后续场景使用新的 session；登记时读取当前 `app.session`，清理时先解绑 Label。

BMFont 页面/字形 x/y 使用纹理左上坐标，工厂直接交给原生 SpriteFrame/字体 assembler。
libGDX 游戏的左下业务原点应通过节点与相机的坐标转换处理；不要在parser中再翻转字形页。
字体大小按 Label.fontSize / 文件字号缩放；0.8/1.0/1.2使用同一页面，不重采样生成三套字体。

错误包括 `AIR_E_FNT_FORMAT`、`AIR_E_FNT_DATA`、`AIR_E_FNT_PAGES`、`AIR_E_FNT_PACKED`、
`AIR_E_FNT_PAGE_TEXTURE`、`AIR_E_FNT_BASE_URL`、`AIR_E_FNT_IN_USE`，网络/订阅错误保持 AssetBank 的代码。
原生双字符末尾偶距已修复，避免 AV 最后一对被置零；当前定向证据和范围见
[端口台账](../../ai/ledgers/port-gap-remediation.md)，加载选项详见 [AssetBank](./asset-bank-loading.md)。
