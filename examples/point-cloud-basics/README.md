# 原生点与线

真实POINT_LIST点阵与LINE_LIST线段，示例同时匹配mesh和effect pass的图元。
POINT_LIST=0被保留；只设置mesh primitiveMode的入口尚未实现。

```bash
npm run build
npm run dev -- --example point-cloud-basics --port 7454
```

`__probe()` 返回实际mesh/pass枚举与AFTER_DRAW像素计数。
启动时pointSize从8改为16，实测覆盖约4倍；`__lifecycle()` 释放并重建6份资产。
生成声明和JSON位于本目录，生成器与支持子集见 [自定义Shader手册](../../docs/manual/custom-shaders.md#7-从声明表生成-effect-json)。
静态部署从document.baseURI解析JSON，避免入口打包到例根后的路径漂移。

本例没有texture sampler或glyph sampler，只证明原生方形点图元；不把该结果称为纹理point-sprite验收。
更多空间、pointSize单位和PSO限制见 [图元合同](../../docs/manual/custom-shaders.md#8-原生点和线的图元合同)。
