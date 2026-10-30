# AFTERLIGHT / Light studies 001

一个纯程序化的交互光学装置：钛合金外环、冷暖发光轨道、液体玻璃核心（可切换黑曜石）与湿润玄武岩地面。场景使用原生 MeshRenderer、自定义线性材质、镜像相机和公共 HDR 后处理链；不依赖外部模型、贴图或 CDN。

仓库根目录运行 `npm run dev -- --example afterlight`，打开 `http://127.0.0.1:7454/afterlight/`（也可直接访问服务器首页）。开发服务器以 `examples/` 为网站根目录，URL 不包含 `/examples/` 前缀。主 bundle 必须包含 `createAirPostProcess`；源码更新后用 `npm run build` 重建。

- 拖拽环绕、滚轮拉近；Reset view 恢复构图。
- Core surface 切换液体玻璃/黑曜石；液体玻璃使用动态顶点与法线起伏、背景折射、厚度吸收和细微 RGB 色散。
- 切换 Bloom、ACES/Reinhard 和曝光，观察发光体外的光晕及暗部层次。
- Pause motion 暂停装置运动；系统偏好减少动态时默认暂停。
- 镜像相机优先渲染到 RGBA16F，再投影采样到地面；地面使用单独 layer 排除于反射捕获。这是水平面的镜像捕获，不是 SSR 或任意平面裁剪实现。

主体的发光输入保持线性 HDR 值，只有主输出执行 tone mapping 与 sRGB 编码。Bloom 没有替代材质或构图：少量强发光体、暗色核心与负空间共同构成视觉层次。详见 [HDR 指南](../../docs/guides/hdr-post-processing.md)。

运行 `node tools/verify/afterlight-example.cjs --out=output/new-afterlight-attempt` 采集桌面/竖屏截图，验证实际像素差异、反射 HDR、暂停恢复、轨道控制和资源释放。需 Playwright、可用浏览器、pngjs、esbuild；`--bundle=<candidate.js>` 可指定候选。输出保留为本地定向证据，示例仍为 draft，不等于完整 Gallery 或多浏览器验收。

精细版增加了金属护边、陶瓷灯槽、紧固件和分层刻纹底座。金属与核心使用解析摄影棚光源塑造高光；这是程序化材质近似，不宣称完整环境贴图 PBR。地面仍使用真实镜像相机捕获，叠加受控模糊与衰减；主输出申请 4×MSAA，实际采样数以 `post.info.samples` 为准。

玻璃采用屏幕空间单次折射近似，不是完整体积光线追踪。独立背景相机先捕获线性 HDR，排除玻璃本身和反射地面，随后执行镜像捕获和主渲染，避免纹理自采样与循环依赖。销毁时释放新增背景目标及绑定。

几何、材质、版式均为本仓库原创，使用仓库 MIT 许可。
