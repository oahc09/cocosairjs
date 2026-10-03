# 篝火夜景

按公开E06 Scene Spec原创构建：14棵树、20只萤火虫、32片火苗、48个火星；没有第三方资产。
PointLight真实照亮周围地面，日夜3秒连续渐变，环绕相机可暂停，reset不刷新页面。

```bash
npm run build
npm run dev -- --example campfire-night --port 7454
```

`__bench.getState()`读取实际动画状态；`__nightProbe`提供明确调用的冻结与HDR单位标定；
`__probe()`返回当帧计数/单位/分区像素。
MeshRenderer.receiveShadow使用原生ShadowReceivingMode枚举，不与bakeSettings中的boolean同名属性混用。
资源释放重建由`__lifecycle()`验证。光照与阴影的实测范围见 [单位标定](../../docs/manual/lighting-units.md)
和 [阴影矩阵](../../docs/manual/shadow-support-matrix.md)，不宣称当前PointLight可以投影ShadowMap。
