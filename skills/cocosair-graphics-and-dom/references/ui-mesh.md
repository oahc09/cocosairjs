Derived from src/air/ui-mesh.ts and docs/manual/graphics-and-dom.md (as of 2026-10-10)

# AirUIMesh custom UI geometry

`AirUIMesh` is a native `UIRenderer` component that renders an arbitrary textured quad mesh in
the UI batcher. It shares Sprite materials, stencil masks, sibling order, and batch buffers, so
it participates in normal 2D sorting (`src/air/ui-mesh.ts:80-83`). It requires a `UITransform`
(`@requireComponent(UITransform)`) and is added with `node.addComponent(AirUIMesh)`.

## Geometry contract

`setGeometry({ positions, uvs, indices })` copies and freezes the arrays and validates them,
throwing `AIR_E_UI_MESH_GEOMETRY` with the offending field on any violation
(`src/air/ui-mesh.ts:106`, `:17-20`):

- `positions` are local XY pairs; vertex count is `positions.length / 2`.
- Vertex count must be an integer in `3..1024`; a bounded chunk fits the default native UI
  buffer, and larger meshes must be partitioned explicitly (`src/air/ui-mesh.ts:23-25`).
- `uvs` needs exactly one pair per vertex, each component finite and within `[0,1]`, addressing
  the frame with `(0,0)` at its bottom-left (`src/air/ui-mesh.ts:10`, `:26-28`).
- `indices` are integers referencing an in-range vertex; the count must be `3..4095` and a
  multiple of 3, i.e. `1..1365` triangles (`src/air/ui-mesh.ts:29-30`).

All coordinates must be finite numbers or validation fails (`src/air/ui-mesh.ts:27`).

## Frame binding

Assign a `SpriteFrame` through the `spriteFrame` setter. It rejects an invalid frame or a frame
without a valid texture (`AIR_E_UI_MESH_FRAME`), keeps leases on the packed texture and the
original page through dynamic-atlas restoration, and re-marshals vertices when frame UVs change
(`src/air/ui-mesh.ts:91-105`, `:120-133`). The assembler maps local positions plus `[0,1]` UVs
through the frame's UV quad and the node world matrix, then writes color per vertex
(`src/air/ui-mesh.ts:34-61`).

## Lifecycle

```js
const node = new Node('WarpQuad');
node.layer = Layers.Enum.UI_2D;                 // the bit lives on Layers.Enum; Layers.UI_2D is undefined
const mesh = node.addComponent(AirUIMesh);
mesh.spriteFrame = frame;                       // borrow a valid SpriteFrame with a texture
mesh.setGeometry({
    positions: [0, 0, 100, 0, 100, 100, 0, 100],
    uvs:       [0, 0, 1, 0, 1, 1, 0, 1],
    indices:   [0, 1, 2, 0, 2, 3],              // 2 triangles
});

mesh.clear();      // drop geometry, destroy render data
mesh.dispose();    // clear this renderer and release frame/texture leases
```

`clear()` empties the geometry and destroys the render data (`src/air/ui-mesh.ts:110`).
`dispose()` clears the renderer and releases the frame/texture leases but does not destroy the
node or shared assets; after dispose, the geometry/frame setters throw `AIR_E_UI_MESH_DISPOSED`
(`src/air/ui-mesh.ts:88`, `:111-116`). `_canRender()` requires a live, undisposed renderer with a
frame and at least one triangle, so an empty mesh draws nothing (`src/air/ui-mesh.ts:118`).

## When to reach for it

Use `AirUIMesh` when you must hand-place or warp textured UI vertices. For solid or rich fills
prefer the command path in [commands.md](commands.md) and [raster.md](raster.md); for plain
textured display prefer `createAirTextureSprite` in [texture-sprite.md](texture-sprite.md).
