# 动态quad网格

预分配typed arrays与网格容量，用Mesh.updateSubMesh提交波动的quad顶点，本例单primitive/material实际1draw。

```bash
npm run build
npm run dev -- --example batching-dynamic --port 7454
```

query `count` 可选1–100000，默认256；超过65536顶点使用Uint32索引。
每帧仍有CPU计算与上传，bounds必须覆盖完整运动范围；1draw不等于零更新成本。
`__probe()`读取真实draw、vertex和像素；`__batchProbe.measure(120)`分开记录CPU更新、提交与rAF间隔。
`__lifecycle()`停止更新并释放重建。完整路线与预算限制见 [统一Recipe](../../docs/manual/batching-recipes.md)。
