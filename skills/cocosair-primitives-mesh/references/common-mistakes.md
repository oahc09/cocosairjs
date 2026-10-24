Derived from the cocosair-primitives-mesh skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

### Current dynamic-mesh contract (2026-10-24 automatic synchronization)

Use `mesh.updateSubMesh(0, geometry)` with no manual renderer notification. After a successful
update commits buffers, counts and bounds, all bound renderers synchronously refresh their
model bounds and input-assembler draw info. Shared meshes work with each node's world transform.
Rebinding or destroying a renderer releases its old subscription; invalid updates do not notify.
The public `renderer.onGeometryChanged()` remains compatible but is unnecessary for this path.
Direct struct/buffer mutations are outside this automatic contract.

The regression checks both the stale-frustum case and actual indexed draw counts (6→3→0→6).
See `test/smoke/dynamic-mesh-renderer-sync.test.ts` and `tools/verify/effect-runtime-contracts.cjs`.
Historical E02/E04 attribution is still unconfirmed without the original arm inputs.

<details>
<summary>Historical pre-fix workaround and reproduction; superseded by the automatic contract above</summary>

### [HIGH] Updating an attached dynamic mesh without notifying its renderer

`createDynamicMesh` requires a device (`await createAirApp()` first), typed geometry channels and
sufficient `maxSubMeshVertices/maxSubMeshIndices`. Use `indices16/indices32`, not the static
`indices` key. Current `Mesh.updateSubMesh()` derives bounds from updated positions when explicit
`minPos/maxPos` are absent; supplying struct bounds alone is not a renderer notification.

After changing geometry already attached to a renderer, call:

```ts
mesh.updateSubMesh(0, geometry);
renderer.onGeometryChanged();
```

The second call updates the model bounds and submodel geometry state. Notify every renderer that
shares the mesh. Do not claim that all missing draws share this cause: also check the actual draw
counts, camera/layers, material topology, shader attributes and frustum. The E02/E04 historical
root cause remains unconfirmed without their original source; an engine-local reproduction is a
separate, bounded observation. See `src/cocos/3d/assets/mesh.ts` and
`src/cocos/3d/framework/mesh-renderer.ts`.

The 2026-10-24 engine-local Chromium control observed 20736 green pixels on initial creation without
a notification; after moving the model outside the frustum, returning positions with explicit mesh
bounds but no notification produced 0 pixels and left model centre X at 100. A notification reset
model centre X to 0 and restored 20736 pixels. This confirms the attached-model stale-bounds case,
not a general initial-creation failure. Reproduce with `tools/verify/effect-runtime-contracts.cjs`
against a freshly built candidate; supply a fresh `--out` directory.

</details>

### [HIGH] Assigning the createPrimitiveGeometry result straight to MeshRenderer.mesh

Wrong:

```js
const geometry = createPrimitiveGeometry({ type: 'cylinder', radiusTop: 0.2, radiusBottom: 0.2, height: 2 });
renderer.mesh = geometry;   // geometry.initialize is not a function -> TypeError
```

Correct:

```js
const geometry = createPrimitiveGeometry({ type: 'cylinder', radiusTop: 0.2, radiusBottom: 0.2, height: 2 });
renderer.mesh = utils.MeshUtils.createMesh(geometry);   // IGeometry -> Mesh asset
```

The setter assigns `const mesh = this._mesh = val;` first (`src/cocos/3d/framework/mesh-renderer.ts:489`) and only then calls `mesh?.initialize()` on it (`:490`), ahead of every other side effect; a plain `IGeometry` is truthy but has no `initialize`, so optional chaining clears the null guard and then throws a `TypeError`. An agent writes it because the call already looks like a geometry constructor, and three.js `mesh.geometry = bufferGeometry` is directly assignable.

### [HIGH] Passing a shape outside the four-type whitelist to createPrimitiveGeometry

Wrong:

```js
const g = createPrimitiveGeometry({ type: 'capsule', radius: 0.4, height: 1 });   // RangeError AIR_E_PRIMITIVE_DESCRIPTOR
```

Correct:

```js
const g = createPrimitiveGeometry({ type: 'cylinder', radiusTop: 0.2, radiusBottom: 0.4, height: 1 });
const cap = primitives.capsule(0.4, 0.4, 0.8);   // capsule/torus/plane/quad/circle are only on primitives.*
```

The `primitives` namespace exposes nine generators, so an agent expects the descriptor to take all nine; `createPrimitiveGeometry` checks `type` against a four-key map and throws for anything else, and the thrown object is a `RangeError` (`src/air/primitive-geometry.ts:43-44`).

### [HIGH] Calling primitives.cone with an options object

Wrong:

```js
const g = primitives.cone({ radius: 0.5, height: 1, radialSegments: 16 });   // radius becomes the object
renderer.mesh = utils.MeshUtils.createMesh(g);   // mesh builds, positions are NaN, nothing renders
```

Correct:

```js
const g = primitives.cone(0.5, 1, { radialSegments: 16 });   // cone(radius, height, opts) is positional
renderer.mesh = utils.MeshUtils.createMesh(g);
```

`box` and `plane` take an options object, so an agent assumes every generator does; `cone` is `cone(radius = 0.5, height = 1, opts)` delegating to `cylinder(0, radius, height, opts)` (`src/cocos/primitive/cone.ts:40-45`), and cylinder's torso math multiplies `radiusBottom` numerically (`src/cocos/primitive/cylinder.ts:127,136,146-148`), so the object yields `NaN` positions. The shipped `examples/mesh-prim-compare/src/main.ts:75` makes this exact call, and no error is thrown at assign time.

### [MEDIUM] Expecting includeNormal to strip a channel from a descriptor shape

Wrong:

```js
const g = createPrimitiveGeometry({ type: 'box', width: 1, height: 1, length: 1, includeNormal: false });
// g.normals is still a full array; a lighting assumption built on "no normals" is wrong
```

Correct:

```js
const g = createPrimitiveGeometry({ type: 'box', width: 1, height: 1, length: 1 });
delete g.normals;   // to actually drop a channel, delete it before createMesh or hand-build the Attribute list
```

The flags are validated as booleans and forwarded, but `box`/`sphere`/`cylinder`/`cone` never read them (`src/air/primitive-geometry.ts:48-53`); among the non-descriptor generators only `plane` and `quad` consume them (`src/cocos/primitive/plane.ts:120,145,156`, `src/cocos/primitive/quad.ts:55,63`), while `circle` hands them to `applyDefaultGeometryOptions` (`src/cocos/primitive/circle.ts:45`, `src/cocos/primitive/define.ts:57-67`) and never reads either one (`src/cocos/primitive/circle.ts:85-92`), so `includeNormal: false` is accepted and silently ignored on every shape reachable here.

### [MEDIUM] Reading an attribute with a gfx.ATTRIB_POSITION constant

Wrong:

```js
const pos = mesh.readAttribute(0, gfx.ATTRIB_POSITION);   // no such constant -> undefined name -> null
const n = pos.length;                                      // TypeError reading length of null
```

Correct:

```js
const pos = mesh.readAttribute(0, gfx.AttributeName.ATTR_POSITION);   // 'a_position'
```

`readAttribute` matches `attributes.findIndex(a => a.name === attributeName)` (`src/cocos/3d/assets/mesh.ts:1309`), so an `undefined` name finds nothing and returns `null` rather than throwing. Attribute names are the string enum values `gfx.AttributeName.ATTR_*` (`src/cocos/gfx/base/define.ts:2074-2095`); `examples/mesh-attributes-indices/src/main.ts:80` reaches for the non-existent `gfx.ATTRIB_POSITION`, so its probe lands on the null branch.
