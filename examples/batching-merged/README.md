# 静态合并网格

所有quad顶点预先放入同一空间，使用一个primitive、一个material/pass，因此本例实际1draw。

```bash
npm run build
npm run dev -- --example batching-merged --port 7454
```

query `count` 可选1–100000，默认256；节点变换不再逐quad独立，剔除粒度也变为合并bounds。
多primitive、材质、pass、相机或阴影会改变draw数量，不能推广为任意合并恒1draw。
原始draw/vertex/像素由`__probe()`读取，`__lifecycle()`实际释放重建。
决策、容量和历史规模样本见 [统一Recipe](../../docs/manual/batching-recipes.md)。
