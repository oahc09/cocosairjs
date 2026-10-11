---
name: cocosair-primitives-mesh
description: Builds and attaches procedural geometry in a Cocos AIR Code First scene - the nine primitives.* shape generators and their parameter defaults, the createPrimitiveGeometry(descriptor) helper whose box, sphere, cylinder, cone whitelist, integer segment cap of 1024, predicted-vertex cap and arc range throw RangeError AIR_E_PRIMITIVE_DESCRIPTOR, turning the returned IGeometry into a Mesh with utils.createMesh, hand-authoring a Mesh struct from gfx.Attribute and Format rows and reading or copying vertex attributes and indices, and driving MeshRenderer hooks such as bakeSettings, setInstancedAttribute and morph setWeight. Use when generating a box, sphere, cylinder or cone without a Creator asset, wiring a BufferGeometry-style object to a renderer, hitting AIR_E_PRIMITIVE_DESCRIPTOR, choosing new Mesh plus struct versus primitives.box, reading mesh vertex attributes, or exporting geometry as OBJ or wireframe.
---

# Cocos AIR primitives and mesh authoring

Generate procedural geometry in code, convert it into a renderable `Mesh` asset, and know exactly where a `MeshRenderer` will accept it.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, Material, MeshRenderer,
         Layers, Color, Vec3, primitives, utils, createPrimitiveGeometry } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
const scene = new Scene('Main');
const camNode = new Node('Main'); scene.addChild(camNode);
camNode.setPosition(new Vec3(0, 2, 8)); camNode.lookAt(new Vec3(0, 1, 0));
camNode.addComponent(Camera);
const lightNode = new Node('Key'); scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0); lightNode.addComponent(DirectionalLight);

// 1. descriptor helper: validated named parameters, returns IGeometry (NOT a Mesh)
const geometry = createPrimitiveGeometry({ type: 'cylinder', radiusTop: 0.2, radiusBottom: 0.5, height: 2, radialSegments: 16 });
const nodeA = new Node('Cyl'); nodeA.layer = Layers.Enum.DEFAULT; nodeA.setPosition(new Vec3(-1.5, 1, 0)); scene.addChild(nodeA);
const a = nodeA.addComponent(MeshRenderer);
a.mesh = utils.MeshUtils.createMesh(geometry);                         // IGeometry -> Mesh asset is the only renderable hand-off

// 2. native generator with positional arguments (cone is cone(radius, height, opts), not an options object)
const nodeB = new Node('Cone'); nodeB.layer = Layers.Enum.DEFAULT; nodeB.setPosition(new Vec3(1.5, 1, 0)); scene.addChild(nodeB);
const b = nodeB.addComponent(MeshRenderer);
b.mesh = utils.MeshUtils.createMesh(primitives.cone(0.5, 1.3, { radialSegments: 32 }));

const material = new Material(); material.initialize({ effectName: 'builtin-standard' }); material.setProperty('mainColor', new Color(200, 210, 230));
a.material = material; b.material = material;
app.run(scene);   // async render loop; the first frame draws on a later tick, so never free the Meshes synchronously here
// Release LATER (on teardown): unbind the renderers first, then destroy the app-owned Meshes.
function teardown() {
    const mA = a.mesh, mB = b.mesh;   // Mesh.destroy() frees GPU buffers synchronously, so grab them before unbinding
    a.mesh = null; b.mesh = null;      // stop the MeshRenderers sampling the geometry
    mA.destroy(); mB.destroy();        // the app owns the Meshes createMesh returned
}
</script>
```

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - `Node`, `Layers.Enum.DEFAULT`, component `enabled` and release ordering a `MeshRenderer` rides on.
- [cocosair-materials-effects](../cocosair-materials-effects/SKILL.md) - the material and `overridePipelineStates` that turn a `Mesh` into pixels; this skill only produces geometry.
- [cocosair-rendering](../cocosair-rendering/SKILL.md) - the camera, lighting and shadow gates that decide whether an attached `MeshRenderer` is drawn at all.
- [cocosair-math](../cocosair-math/SKILL.md) - `Vec3` bounds and transforms used by `translate`/`scale` and by hand-written `minPos`/`maxPos`.

Skinning weight binding (joint attributes), morph target authoring, asset loading and disposal policy, and performance of many instances belong to the cocosair-skinning-morph, cocosair-assets and cocosair-performance skills; none of those exists yet, so route through the router. This skill owns only the `MeshRenderer` write contract below: `bakeSettings`, morph `setWeight` and `setInstancedAttribute`.

## When to use what

- "Draw a cube, sphere, cylinder or cone in code" -> `createPrimitiveGeometry(descriptor)` then `utils.createMesh` (`src/air/primitive-geometry.ts:42`, `src/cocos/3d/misc/create-mesh.ts:46`).
- "Use a shape outside box/sphere/cylinder/cone, or fine-grained sub-division" -> the native `primitives.box|sphere|cylinder|cone|plane|quad|torus|capsule|circle` generators (`src/cocos/primitive/index.ts`).
- "Move, scale or wireframe geometry without a GPU round trip" -> `primitives.translate`, `primitives.scale`, `primitives.wireframed` (in-place `IGeometry` edits, `src/cocos/primitive/transform.ts`).
- "Store a primitive as a serialized asset" -> `new Primitive(); p.type = ...; p.info = {...}; p.onLoaded()` (`src/cocos/primitive/primitive.ts:50-86`); `info` carries only numbers.
- "Author a custom vertex buffer by hand" -> build a `Mesh.IStruct` and call `mesh.reset({ struct, data })` (`src/cocos/3d/assets/mesh.ts:182-267,676`), or hand an `IGeometry` to `utils.createMesh`.
- "Read or copy a mesh's attributes or indices back out" -> `mesh.readAttribute`, `mesh.copyAttribute`, `mesh.readIndices`, `mesh.copyIndices`, `mesh.readAttributeFormat` (`src/cocos/3d/assets/mesh.ts:1149-1295`).
- "Rewrite vertex or index data in place after creation" -> `utils.MeshUtils.createDynamicMesh(0, geometry, out?, options?)` (`src/cocos/3d/misc/create-mesh.ts:419`), the pattern shipped by `examples/interactive-geometry/src/main.ts:155`.
- "Feed a per-instance value into a material" -> `renderer.setInstancedAttribute(name, value)` (`src/cocos/3d/framework/mesh-renderer.ts:733`).

## Contracts

- `createPrimitiveGeometry(descriptor)` returns `IGeometry`, never a `Mesh`; `MeshRenderer.mesh` takes only a `Mesh` asset, so the IGeometry must go through `utils.MeshUtils.createMesh(geometry)` or `new Mesh()` + `reset({ struct, data })` first.
- The descriptor accepts only `type: 'box' | 'sphere' | 'cylinder' | 'cone'`; each shape has a fixed field whitelist, `segments` are integers `<= 1024`, per-shape predicted-vertex caps are `1_000_000`, and `arc` must be in `(0, 2pi]`. Any violation throws a `RangeError` with `code = 'AIR_E_PRIMITIVE_DESCRIPTOR'` and a `field` (`src/air/primitive-geometry.ts:23-39,58-83`). The caps are an allocation guard on this entry point, not a hard Mesh ceiling; larger meshes go through the native generators directly.
- `includeNormal`/`includeUV` validate as optional booleans (`src/air/primitive-geometry.ts:48-53`) but are no-ops for the four descriptor shapes: `box`/`sphere`/`cylinder`/`cone` always emit normals and UVs. Among the native generators only `plane` and `quad` branch on the flags (`src/cocos/primitive/plane.ts:120,145,156`, `src/cocos/primitive/quad.ts:55,63`); `circle` passes its options through `applyDefaultGeometryOptions` (`src/cocos/primitive/circle.ts:45`, `src/cocos/primitive/define.ts:57-67`) and never reads either flag, so no flag value changes circle's output (`src/cocos/primitive/circle.ts:85-92`).
- The `mesh` setter runs side effects on assignment: it calls `val?.initialize()`, resets morph weights, rebuilds models and re-attaches to the scene (`src/cocos/3d/framework/mesh-renderer.ts:487-503`); `initialize()` needs a live device for a dynamic struct, failing with `AIR_E_MESH_NOT_READY` before `createAirApp` resolves (`src/cocos/3d/assets/mesh.ts:416`).
- Converter entry points: use the `MeshUtils` statics, `utils.MeshUtils.createMesh(geometry)` (`src/cocos/3d/misc/create-mesh.ts:406`) and `utils.MeshUtils.createDynamicMesh(primitiveIndex, geometry, out?, options?)` (`src/cocos/3d/misc/create-mesh.ts:419`). The `utils` barrel (`src/cocos/3d/misc/index.ts:28`) also re-exports a free `createMesh`, but that function is marked `@deprecated` (`src/cocos/3d/misc/create-mesh.ts:44-46`). The module-level `function createDynamicMesh` (`src/cocos/3d/misc/create-mesh.ts:262`) is NOT exported by the barrel, so the `utils` namespace has no `createDynamicMesh` member of its own and calling one throws a `TypeError`; the same-named static on `MeshUtils` is the live entry (`examples/interactive-geometry/src/main.ts:155`). Neither `createMesh` nor `MeshUtils` is a name on the `build/cocosair.module.js` export block (626 entries parsed), so both resolve only through the `utils` namespace.
- `renderer.bakeSettings` is the GI-bake settings object the component constructs for you (`src/cocos/3d/framework/mesh-renderer.ts:333`, decorated `@editable`, `@disallowAnimation`, `@displayOrder(3)` at `:330-332`); `class ModelBakeSettings extends EventTarget` (`:125`) is NOT a name on the export block, so reach it only as the field `renderer.bakeSettings`, never imported or constructed by name from the package.
- Morph weights: `renderer.setWeight(weight, subMeshIndex, shapeIndex)` (`src/cocos/3d/framework/mesh-renderer.ts:720`) returns silently, with no throw and no warn, when `subMeshIndex >= this._subMeshShapesWeights.length` (`:722-724`) or `shapeIndex >= shapeWeights.length` (`:726-727`); a surviving call writes the slot and calls `this._uploadSubMeshShapesWeights(subMeshIndex)` (`:729-730`). The weight table is (re)built by the `mesh` setter, which calls `this._initSubMeshShapesWeights()` (`:491`), so replacing the mesh resets weights.
- Instance writes: `renderer.setInstancedAttribute(name, value)` (`src/cocos/3d/framework/mesh-renderer.ts:733`) returns immediately when `this.model` is falsy (`:734-736`), i.e. writing an instance attribute before the model exists is a silent no-op; the JSB branch (`:738-740`) is native-only and the Web branch iterates `this.model.subModels` and their `instancedAttributeBlock` from `:741`.
- Struct attributes must be `new gfx.Attribute(name, format, isNormalized, stream, isInstanced, location)` (`src/cocos/gfx/base/define.ts:1498-1508`); `Attribute` has a private `_token` so a plain object is rejected. `Attribute`, `Format`, `AttributeName`, `PrimitiveMode` and `FormatInfo` reach the runtime only through the `gfx` namespace, not as top-level import names.
- One `ISubMesh` is one index group and one material slot; every primitive generator and `utils.createMesh` produce a single-vertex-bundle, single-primitive struct, so `box`'s six faces share one draw group (`src/cocos/3d/misc/create-mesh.ts:227-230`). Multi-material meshes require authoring several `primitives` entries.
- Ownership: `utils.createMesh` returns a `Mesh` asset the caller must destroy; `createPrimitiveGeometry`'s `IGeometry` is plain data and is copied into the buffer at conversion. `readIndices` hands back a live view over the mesh bytes, `readAttribute` allocates a fresh typed array each call (`src/cocos/3d/assets/mesh.ts:1252,1170`).
- Capability layers: `createPrimitiveGeometry`, `primitives`, `utils`, `Mesh`, `MeshRenderer`, `Primitive` and the `gfx` namespace are default-bundle reachable (names in the `build/cocosair.module.js` export block); the shape generators are browser-PASS in recorded candidates of `docs/evidence/examples-verified.json`, while `createPrimitiveGeometry` itself is covered only by the jsdom smoke test and the consumer-import check, not by a browser-pixel run. A recorded `PASS` proves only the candidate fingerprint stored with it, not today's bytes.

## Common Mistakes

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

## References

- `references/primitive-shapes.md` - the nine `primitives.*` generators with call signatures and source-level defaults, plane orientation, `circle`'s four quirks, the `translate`/`scale`/`wireframed` edits, the deprecated helpers, the `Primitive` asset `PrimitiveType` ordinals, and the three capability layers.
- `references/mesh-attributes.md` - `Mesh.IStruct`/`IVertexBundle`/`ISubMesh`/`IBufferView`/`ICreateInfo` field maps, `reset`/`assign`/`initialize`, the `gfx.Attribute` constructor and `AttributeName` table, default `Format` per channel with byte sizes, index format promotion, interleaving and copy rules, the full read/copy attribute and index API with null-versus-throw behavior, the `MeshRenderer` hook table (`bakeSettings`, morph `setWeight`, `setInstancedAttribute`) and the reachable converter names.
- `references/create-primitive-geometry.md` - the `AirPrimitiveDescriptor` union, per-shape field whitelist, exact numeric and segment caps with source lines, the predicted-vertex formulas and arc range, the `RangeError AIR_E_PRIMITIVE_DESCRIPTOR` failure contract, the includeNormal/includeUV no-op, and reachability plus test coverage.

## Canonical docs

`docs/manual/primitives.md`, `docs/manual/custom-buffergeometry.md`, `docs/manual/primitive-descriptors.md`.
