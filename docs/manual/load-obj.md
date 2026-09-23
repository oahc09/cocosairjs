# Load an .OBJ file（加载 OBJ 文件）

> 状态：**N/A** —— AIR 的模型加载面是 glTF，不含 OBJ 解析器，本篇给实测证据与替代路线，不配示例。

## 1. 实测结论：无 OBJ 解析器

- 全量 grep `build/cocosair.module.d.ts` 与 `build/cocosair.module.js`：`OBJLoader`、`parseObj`、
  `.obj` 后缀路由**零命中**。模块导出表（module.js 导出清单）里加载器家族只有
  `GLTFLoader` / `registerGLTFLoader` / `configureGLTFLoaderDefaults` / `loadAssetAsync` / `loader` / `assetManager`。
- 资产管线取向：cocos 系引擎以 glTF（`.gltf`/`.glb`）为 interchange 格式，配 Draco / Meshopt / KTX2
  三个可选解码器工厂（`createDracoDecoder` / `createMeshoptDecoder` / `createKTX2Transcoder`，d.ts 33096 起）；
  OBJ 不在管线内，不是"没暴露"而是"没有"。

## 2. 替代路线（按推荐序）

1. **离线转 glTF**：OBJ 是静态网格+材质描述，任何 DCC 工具或 CLI 转换器的"导出 glTF/GLB"都能覆盖
   （法线/UV/多材质分组的语义 glTF 都有对应物）。转完后走 [load-gltf](load-gltf.md) 的加载路线。
   本篇不点名具体工具版本，避免承诺未实测的转换保真度。
2. **代码建网格**：若 OBJ 只是"一份顶点数据"，直接解析文本后喂 `utils.createMesh` / 自定义 `Mesh`
   （见 [custom-geometry](custom-buffergeometry.md) 的顶点布局写法）。OBJ 文本格式简单（`v/vn/vt/f` 行），
   应用层写个百行解析器可行——但那是应用代码，不是引擎能力，本手册不内置。
3. **primitives 顶替**：演示用途常用盒/球/柱/环面等内建图元（[primitives](primitives.md)），零资产零解析。

## 3. 升级条件（何时能把本篇改 FULL）

1. 导出表出现 OBJ 解析入口（`OBJLoader` 类或 `parseObj` 函数）；
2. `loadAssetAsync` / `assetManager` 的后缀路由表登记 `.obj`；
3. 有可运行示例（内嵌 OBJ 文本或 data URI）通过本仓库验证器。

三条任一满足前，本篇保持 N/A；模型加载的实测内容集中在 [load-gltf](load-gltf.md)。

---

上一篇：[在 Worker 中使用 OffscreenCanvas（Using OffscreenCanvas in a Web Worker）](offscreencanvas.md) ｜ 下一篇：[加载 glTF 文件（Load a .GLTF file）](load-gltf.md)
