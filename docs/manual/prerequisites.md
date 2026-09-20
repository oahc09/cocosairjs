# Prerequisites 前置知识

> **META 篇**：开始读手册前你需要会什么。本篇不教这些，只列清单与"不会的话去哪补"。

## 必须具备

- **JavaScript ES Module**：`import` / `export`、裸说明符 + importmap。AIR 只有 ESM 构建，没有 UMD/CJS（见 [Installation](./installation.md) §1）。
- **顶层 await**：手册所有 `main.ts` 都是顶层 await 的 ES module（`createAirApp` 是异步的）。浏览器需支持 top-level await（现代浏览器均可）。
- **DOM 基础**：`document.querySelector`、canvas 元素、事件监听。`#GameCanvas` 必须在引擎 import 前存在（见 [Creating a Scene](./creating-a-scene.md) §1）。
- **npm / Node 命令行**：`npm install`、`npm run build`、`npm run dev`。构建产物与 dev server 都走 npm scripts（见 [Setup](./setup.md)）。

## 强烈建议

- **基本 3D 数学直觉**：向量、坐标、欧拉角、"相机看向某点"。不需要会推矩阵，[Matrix Transformations](./matrix-transformations.md) 会讲需要的部分。
- **WebGL 大致概念**：知道"draw call / 顶点 / 索引 / 纹理"这些词即可；不需要会写 GLSL（要写再看 [Debugging GLSL](./debugging-glsl.md)）。
- **PBR 材质直觉**：baseColor / metallic / roughness / emissive 各管什么。[Uniform Types](./uniform-types.md) 与 [Materials](./materials.md) 会按 AIR 的属性名展开。

## 不需要

- **不需要会 Cocos 编辑器**：AIR 是 code-first 运行时，没有场景编辑器、没有 .prefab 资产管线；一切用代码建。
- **不需要任何 3D 引擎经验**：手册通篇直接面向 Cocos AIR 叙述，属性名、API、实测结论都以 AIR 自身为准，零基础也能直接读。

## 下一步

环境就绪：[Setup 环境搭建](./setup.md)。第一个场景：[Creating a Scene 创建场景](./creating-a-scene.md)。
