# K0 R2 Porting Contracts — 原生合同交互示例

演示 AIR 原生合同的关键行为，可交互切换四种模式。不覆盖全部 17 项合同。

## 模式

| 模式 | 合同 | 关键 API |
|---|---|---|
| 顶点色 | N8 | `USE_VERTEX_COLOR` + `a_color` 属性 |
| 混合 | N12 | `Material.initialize({ states: { blendState, depthStencilState: { depthWrite: false } } })` — alpha / additive |
| 动态网格 | N3 | `createDynamicMesh` + positions-only `updateSubMesh` + `renderer.onGeometryChanged()` |
| Billboard | N14（独立缩放边界） | `Billboard.width / height`（非 `node.scale`）+ 确定性 2×2 Texture2D |

## 操作

- 四个模式按钮切换演示
- **暂停/恢复**：暂停演示动画（引擎时钟保持运行，界面仍可用）
- **重置**：释放当前模式资源后重建
- **释放**：先解绑 renderer mesh/材质、Billboard texture，再退出场景销毁节点，最后归还自有资产 decRef/destroy

## 合同来源

- 完整 17 项合同：[k0-r2-porting-contracts.md](../../docs/manual/k0-r2-porting-contracts.md)
- 动态网格合同：[engine-contract-hardening.md](../../docs/manual/engine-contract-hardening.md)
- 绘制线条（顶点色宏）：[drawing-lines.md](../../docs/manual/drawing-lines.md)
- Billboard 合同：[billboard.md](../../docs/manual/billboard.md)

## 由其他示例/探针覆盖

| 合同 | 覆盖方 |
|---|---|
| glTF 蒙皮 / 动画循环 | `gltf-skin` 示例（`instance.setAnimationLoop(true)`） |
| 大容量 / 空索引 / 错键拒绝 | K0 R2 探针（`tools/verify/k0-r2-rendering.cjs`） |
| 剔除/绕序/负缩放 | K0 R2 探针 |
| 多方向光主光选择 | K0 R2 探针 |
| Fog on/off/restore | K0 R2 探针 |
| 蒙皮/实例化/Billboard 面积 | K0 R2 探针 |

## `__k0Example` 观测接口

只读快照（`Object.freeze`），`errors` 返回冻结拷贝。

```ts
window.__k0Example.mode               // 'vertex-color' | 'blend' | 'dynamic-mesh' | 'billboard'
window.__k0Example.paused             // 演示动画暂停状态
window.__k0Example.released           // 是否已释放（幂等，重复释放不产生新效果）
window.__k0Example.dynamicUpdateCount // 动态网格更新次数
window.__k0Example.ownedAssetCount    // 当前自有资产数
window.__k0Example.ownedAssets        // [{name, beforeRefCount, afterRefCount, isValid}]
window.__k0Example.releasedAssets     // [{name, beforeRefCount, afterRefCount}]
window.__k0Example.errors             // readonly string[]（冻结拷贝）
```

## 技术要点

- `#GameCanvas` 在引擎导入前存在
- 单一引擎时钟：`director EVENT_BEFORE_UPDATE` 驱动动态网格更新与状态刷新（不自建 rAF）
- 释放顺序：解绑 renderer mesh/材质 → Billboard texture=null → 节点退出场景并 destroy → 资产 decRef + destroy
- 自有资产每份显式 `addRef` 一份；`beforeRefCount`/`afterRefCount` 记录归还前后
- 动态网格 positions-only 更新后调用 `renderer.onGeometryChanged()`（保留旧 indices/UV/normals）
- Billboard 尺寸由 `width/height` 属性控制；纹理为确定性 2×2 彩色 Texture2D（不假定默认 texture 有像素）
- 顶点色使用 `USE_VERTEX_COLOR`（非旧宏 `USE_COLOR`）
- 混合使用 `Material.initialize({ states: {...} })`（非暗含 MaterialInstance 的 `renderer.material`）
- `pagehide` 关闭 app、解绑 UI 监听（AbortController）、释放资产

## 运行与验收

`npm run dev -- --example k0-r2-porting-contracts`。此示例已登记 Gallery，状态为 validated；没有用限定采集替代全仓晋级证据。

Lead 的 [三浏览器记录](../../docs/evidence/examples/k0-r2/examples-verified.json) 同时验证本例及已有动态批处理、SimpleSkin、手册线条示例。CH/FF/WK 均有真实颜色像素、暂停前后相同 PNG、动态变化、默认 glTF 材质和实例循环、引用归还。UI 在移动视口中可见。完整17项与安装包验证仍由前述 K0 探针覆盖；此例不重复所有合同。

释放时解绑 Director 回调，重建时重新订阅；`__k0Example.subscribed` 和 `ownedNodeCount` 可只读观察。`releasedAssets` 保存已归还记录，不能用已清空的资产数组冒充释放证据。
