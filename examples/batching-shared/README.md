# 共享网格节点

默认256个节点共享一份quad mesh和一个unlit材质；共享资源不等于合并draw。

```bash
npm run build
npm run dev -- --example batching-shared --port 7454
```

query `count` 可选1–4096。`?instancing=1` 显式启用原生USE_INSTANCING：本轮256实例1draw、2048实例2draw。
默认入口保持非实例化比较，256节点实际256draw。
`__probe()` 返回实际计数、draw和像素；`__batchProbe.measure(120)` 是固定CPU/rAF观测，
`__lifecycle()` 释放重建mesh/material。参数、分组、所有权和测量限制见 [统一Recipe](../../docs/manual/batching-recipes.md)。
