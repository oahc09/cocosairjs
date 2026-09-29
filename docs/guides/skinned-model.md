# 骨骼工具

> 使用 `buildSkeletonTree`、`restoreBindPose` 和 `frameObject` 组装及查看模型。

## 背景（V0.1 L13 经验）

V0.1 蒙皮动画修复沉淀了三条已验证事实：

1. `Skeleton.joints` 是**相对 skinningRoot 的路径**（引擎用 `getChildByPath` 解析），
   层级骨骼必须写完整路径（如 `'bone0/bone1'`），而不是节点名。
2. `Skeleton.bindposes[i]` = inverse(第 i 个关节在静止姿势下的世界矩阵)。
3. `UBOSkinning` 绑定槽位为 3；glsl4 fixture 对 u32vecN 需降写为 vecN。

V0.2 将上述逻辑正式化为可复用 helper（不读取 Prefab / 不依赖 Editor）。

## API

### `buildSkeletonTree(root: Node, jointPaths: string[]): Skeleton`

- 从骨骼节点层级构建 Skeleton 资产；`joints` 与 `bindposes` 顺序一一对应。
- joint 路径不存在 → throw（含路径与 root 名）。
- 捕获时机即静止姿势：构建后不要再移动骨骼再取 bindpose。

### `restoreBindPose(root: Node, skeleton: Skeleton): void`

- 将骨骼复位到 bindposes 记录的静止姿势。
- 算法：`world_i = inverse(bindpose_i)`；`local_i = inverse(parent.world) * world_i`，
  分解为 SRT 后设置节点 —— 父级自身有变换时依然正确。
- 与 `buildSkeletonTree` 必须使用同一个 skinningRoot。
- 按层级深度先恢复父关节，再恢复子关节；不会改变 joints/bindposes 的索引对应。
- 此 helper 捕获的是构建时的世界矩阵约定；不能将其当作任意外部格式的 bindpose 转换器。

### `frameObject(camera: Camera, target: Node, fallbackDistance = 6): void`

- 按目标世界包围盒（MeshRenderer.model.worldBounds 并集）自动取景；
  无几何时退回 fallbackDistance。透视相机按 fov 计算距离，正交相机按包围盒设置 orthoHeight。
- 同时考虑 fovAxis、视口宽高比和相机父节点。程序化 Mesh 需要实际 bounds；例如 `utils.createMesh(geometry, undefined, { calculateBounds: true })`。

## 示例（examples/skinned-animation 骨架）

```ts
const armature = /* root node with bones */;
const skeleton = buildSkeletonTree(armature, ['bone0', 'bone0/bone1', 'bone0/bone1/bone2']);

// 动画播放后复位：
restoreBindPose(armature, skeleton);

// 相机自动取景
frameObject(camera, skinnedMeshRoot);
```

## 覆盖测试与示例

- 单测：`test/smoke/smoke-06-skeleton-utils.test.ts`（构建/复位往返/缺失路径报错）
- 示例：`examples/skinned-animation/`（浏览器验证 202 draws，0 错误）
