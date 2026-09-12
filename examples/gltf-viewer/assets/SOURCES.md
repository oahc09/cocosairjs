# 示例模型来源

以下 Khronos glTF Sample Assets 文件于 2026-09-12 获取，模型数据未经修改。运行示例和测试只请求本地文件。

| 文件 | 作者与许可 | 上游 |
|---|---|---|
| BoxTextured.glb | Cesium，CC BY 4.0；Cesium 标志另受商标声明约束 | [原目录](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BoxTextured) · [署名](BoxTextured.LICENSE.md) |
| SimpleSkin.gltf、SimpleSkin_*.bin | Marco Hutter，CC0 1.0 | [原目录](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SimpleSkin) · [署名](SimpleSkin.LICENSE.md) |
| AnimatedMorphCube.glb | Microsoft，CC0 1.0 | [原目录](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/AnimatedMorphCube) · [署名](AnimatedMorphCube.LICENSE.md) |
| combined.glb、diagnostics.glb | 本项目原创，MIT | [生成脚本](../../../tools/verify/generate-gltf-fixtures.cjs) |
| official/SimpleSparseAccessor.gltf | Marco Hutter，CC BY 4.0 | [署名与固定版本](official/SimpleSparseAccessor.LICENSE.md) |
| official/InterpolationTest.glb | Khronos，CC0 1.0 | [署名与固定版本](official/InterpolationTest.LICENSE.md) |
| official/VertexColorTest.glb | Ed Mackey / Analytical Graphics, Inc.，CC BY 4.0 | [署名与固定版本](official/VertexColorTest.LICENSE.md) |
| official/Material_AlphaBlend_00.gltf、.bin | Khronos Group，MIT | [官方来源](https://github.com/KhronosGroup/glTF-Asset-Generator/tree/3d99767e9a67fbfe109f0d298c1e8d909bcac9db/Output/Positive/Material_AlphaBlend) · [许可](official/AssetGenerator.LICENSE.txt) |

文件校验值见 [SHA256.json](SHA256.json)。原创 fixtures 可从仓库根目录运行 `node tools/verify/generate-gltf-fixtures.cjs` 重建，不需要网络。

追加的官方测试文件使用独立的 [manifest.json](official/manifest.json)，记录来源 URL、固定 revision、字节数和 SHA-256；可运行 `node tools/verify/fetch-official-gltf.cjs` 重新获取。前三项固定在 glTF-Sample-Assets 的 `90d7ede14c7e280af263824604b427a1ca02cb66`，透明混合测试固定在 glTF-Asset-Generator 的 `3d99767e9a67fbfe109f0d298c1e8d909bcac9db`。下载只使用官方 GitHub API，不改写文件内容。

许可正文：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode)、[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode)、[Cesium 标志声明](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/LICENSES/LicenseRef-LegalMark-Cesium.txt)。
