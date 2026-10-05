# Responsive board recipes

运行 `npm run dev` 后打开 `/examples/responsive-board-recipes/`。本地无外部资源：原生 Graphics 棋盘、Label、Input、UITransform 和 Scene。

- 容器为 CSS 正方形；720×720 设计坐标保持不变，buffer 使用有效 DPR。
- 4×4、10×20、16×16 切换、点击高亮、Pause/Restart、单行/多行文字。
- 主点击只消费 TOUCH_START；键盘单次动作走原生动作适配器，字符输入使用 DOM。
- Restart 复用场景对象，视觉缓存包括量化 pulse，不停留在规则 snapshot。

[合同与测试说明](../../docs/manual/responsive-board-recipes.md)。`?test=1` 才开放 fixture/单时钟控制面；生产页面不提供任意状态修改入口。该例是独立配方，尚未晋级为完整 Gallery API 覆盖证明。

代码及程序化资源采用仓库 MIT License，无下载的第三方模型或字体。截图使用系统字体，不能据此认证所有 CJK 字体排版。
