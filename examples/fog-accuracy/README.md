# 精确unlit雾

大三角的顶点均超出fogEnd，但内部可见点仍在范围内；比较原生顶点雾、native accurate开关与Air专用effect。

```bash
npm run build
npm run dev -- --example fog-accuracy --port 7454
```

固定中点灰度分别为0、255和156；节点z平移+1及instancing路径均为180。
`__probe()`保留真实像素读数，参数bypass保持同一宏；`__fogProbe.cacheCycles(20)`
检查重复GPU创建销毁的shader identity、registry和buffer计数。
`__lifecycle()`释放重建5份资产。工厂独立拥有EffectAsset，使用内容派生program key，不共享可被任意业务destroy的全局Effect对象。
组合验证与原生材质边界见 [运行时雾合同](../../docs/manual/fog-runtime-contract.md)。
