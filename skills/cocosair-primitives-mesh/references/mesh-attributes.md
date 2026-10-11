Derived from `src/cocos/3d/assets/mesh.ts`, `src/cocos/3d/misc/create-mesh.ts`, `src/cocos/3d/misc/index.ts`, `src/cocos/3d/index.ts`, `src/cocos/3d/framework/mesh-renderer.ts`, `src/cocos/gfx/base/define.ts`, `examples/mesh-attributes-indices/src/main.ts`, `examples/interactive-geometry/src/main.ts`, `tools/verify/consumer-acceptance.cjs`, `docs/manual/custom-buffergeometry.md`, `docs/evidence/examples-verified.json`, `build/cocosair.module.js`, `build/cocosair.module.d.ts` (as of 2026-10-09)

# Mesh struct and vertex attribute read/write

A `Mesh` is a plain `Asset` that stores a declarative `struct` plus one flat `Uint8Array` of interleaved bytes. `Mesh` is `class Mesh extends Asset` (`src/cocos/3d/assets/mesh.ts:281`) and is in-bundle.

## Struct type map (`src/cocos/3d/assets/mesh.ts:62-268`)

| Type                 | Fields (required unless marked `?`)                                                                                                                                                                                                                                    | Line       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `Mesh.IStruct`       | `vertexBundles: IVertexBundle[]`, `primitives: ISubMesh[]`, `minPosition?: Vec3`, `maxPosition?: Vec3`, `jointMaps?: number[][]`, `morph?: Morph`, `dynamic?: IDynamicStruct`, `quantized?: boolean`, `encoded?: boolean`, `compressed?: boolean`, `cluster?: boolean` | `:182-249` |
| `Mesh.IVertexBundle` | `view: IBufferView`, `attributes: Attribute[]`                                                                                                                                                                                                                         | `:75-91`   |
| `Mesh.ISubMesh`      | `vertexBundelIndices: number[]` (note the misspelling "Bundel"), `primitiveMode: PrimitiveMode`, `indexView?: IBufferView`, `jointMapIndex?: number`, `cluster?: IMeshCluster`                                                                                         | `:104-134` |
| `Mesh.IBufferView`   | `offset: number`, `length: number`, `count: number`, `stride: number`                                                                                                                                                                                                  | `:63-68`   |
| `Mesh.ICreateInfo`   | `struct: IStruct`, `data: Uint8Array`                                                                                                                                                                                                                                  | `:255-267` |

One `ISubMesh` is one index group and one material slot. `utils.createMesh` and every primitive generator produce a struct with exactly one vertex bundle and one primitive, so a `box` (six faces) still yields a single draw group (`src/cocos/3d/misc/create-mesh.ts:227-230` builds `vertexBundles: [vertexBundle]` and `primitives: [primitive]`). Multiple materials require authoring multiple `primitives` entries.

## Mesh instance methods

| Member            | Signature                             | Behavior                                                                                                       |
| ----------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `struct` (getter) | `get struct(): Mesh.IStruct`          | returns the live internal struct (`mesh.ts:324`)                                                               |
| `reset`           | `reset(info: Mesh.ICreateInfo): void` | replaces struct + data, destroys rendering meshes, zeroes hash (`mesh.ts:676`)                                 |
| `assign`          | `assign(struct, data): void`          | deprecated alias calling `reset({struct,data})` (`mesh.ts:664`)                                                |
| `initialize`      | `initialize(): void`                  | builds GPU buffers; a dynamic struct with no `gfxDevice` fails with `AIR_E_MESH_NOT_READY` (`mesh.ts:412,416`) |

## Attribute and format vocabulary

`Attribute` is a class with a private `_token: never` (`src/cocos/gfx/base/define.ts:1498-1499`), so a struct attribute MUST be `new gfx.Attribute(...)`; a plain object is rejected by the type system and is not a supported input. Constructor parameters, in order, with defaults (`define.ts:1501-1508`): `name = ''`, `format = Format.UNKNOWN`, `isNormalized = false`, `stream = 0`, `isInstanced = false`, `location = 0`. `Attribute.copy(info)` overwrites these fields in place (`define.ts:1510-1518`).

`Attribute`, `Format`, `AttributeName`, `PrimitiveMode` and `FormatInfo` are NOT top-level names in the `build/cocosair.module.js` export block; import them through the `gfx` namespace as `gfx.Attribute`, `gfx.Format.RGB32F`, `gfx.AttributeName.ATTR_POSITION`. The `gfx` namespace IS in-bundle.

Default formats `utils.createMesh` assigns when the geometry carries a channel but no matching `Attribute` (`src/cocos/3d/misc/create-mesh.ts:34-40`):

| Channel   | Attribute name                    | Format    | Byte size / component count               |
| --------- | --------------------------------- | --------- | ----------------------------------------- |
| positions | `ATTR_POSITION` = `'a_position'`  | `RGB32F`  | 12 bytes, 3 components (`define.ts:2155`) |
| normals   | `ATTR_NORMAL` = `'a_normal'`      | `RGB32F`  | 12 bytes, 3 components (`define.ts:2155`) |
| uvs       | `ATTR_TEX_COORD` = `'a_texCoord'` | `RG32F`   | 8 bytes, 2 components (`define.ts:2143`)  |
| tangents  | `ATTR_TANGENT` = `'a_tangent'`    | `RGBA32F` | 16 bytes, 4 components (`define.ts:2168`) |
| colors    | `ATTR_COLOR` = `'a_color'`        | `RGBA32F` | 16 bytes, 4 components (`define.ts:2168`) |

`AttributeName` full enum values (`define.ts:2074-2095`): `ATTR_POSITION='a_position'`, `ATTR_NORMAL='a_normal'`, `ATTR_TANGENT='a_tangent'`, `ATTR_BITANGENT='a_bitangent'`, `ATTR_WEIGHTS='a_weights'`, `ATTR_JOINTS='a_joints'`, `ATTR_COLOR='a_color'`, `ATTR_COLOR1='a_color1'`, `ATTR_COLOR2='a_color2'`, `ATTR_TEX_COORD='a_texCoord'` through `ATTR_TEX_COORD8='a_texCoord8'`, `ATTR_BATCH_ID='a_batch_id'`, `ATTR_BATCH_UV='a_batch_uv'`. There is no `gfx.ATTRIB_POSITION` constant; the example `examples/mesh-attributes-indices/src/main.ts:80` reaches for `gfx.ATTRIB_POSITION`, which is `undefined`.

Index format is chosen by magnitude: `R16UI` (2-byte stride) by default, promoted to `R32UI` (4-byte stride) when any index exceeds `0xFFFF` (`create-mesh.ts:179-186`).

## Interleaving and copy rules

- `createMesh` interleaves every channel into ONE vertex bundle: for each channel it records `offset = <running stride>` at the `channels.push` site (`create-mesh.ts:71,88,105,122,139,149`) and then grows the row on the NEXT line at the `stride += info.size` site (`create-mesh.ts:72,89,106,123,140,150`, where `149-150` is the `customAttributes` loop), so attribute byte offsets follow declaration order within a single row of width `stride`.
- Vertex data is copied into ONE freshly allocated `ArrayBuffer` of `vertCount * stride` bytes for the whole interleaved bundle (`create-mesh.ts:158`), and `create-mesh.ts:160-162` writes every channel into that same buffer at its recorded offset via `writeBuffer(vertexBufferView, channel.data, channel.attribute.format, channel.offset, stride)`; there is no per-channel buffer. The returned `Mesh` owns that `Uint8Array` and does not alias the source `IGeometry` arrays (only `positions` is defensively `.slice()`-d at `create-mesh.ts:57`).
- Attribute names inside a struct must equal the `AttributeName` string value; `readAttribute`/`copyAttribute`/`readAttributeFormat` look up `attributes.findIndex(a => a.name === attributeName)` (`mesh.ts:1309`), so a mismatched or `undefined` name finds nothing.

## Read / copy API

| Method                | Signature                                                                                    | Returns / fails                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `readAttribute`       | `readAttribute(primitiveIndex, attributeName): TypedArray \| null`                           | allocates a new typed array per call; `null` when the primitive index or attribute is absent (`mesh.ts:1149`)                                   |
| `copyAttribute`       | `copyAttribute(primitiveIndex, attributeName, buffer: ArrayBuffer, stride, offset): boolean` | writes components into a raw `ArrayBuffer` at the given stride/offset; `false` on miss (`mesh.ts:1192`)                                         |
| `readIndices`         | `readIndices(primitiveIndex): Uint8Array \| Uint16Array \| Uint32Array \| null`              | returns a VIEW over the mesh data (no copy), typed by `indexView.stride` (`mesh.ts:1242,1250-1252`); `null` when the submesh has no `indexView` |
| `copyIndices`         | `copyIndices(primitiveIndex, outputArray: number[] \| ArrayBufferView): boolean`             | `false` when the primitive is out of range or has no indices (`mesh.ts:1262`)                                                                   |
| `readAttributeFormat` | `readAttributeFormat(primitiveIndex, attributeName): FormatInfo \| null`                     | returns the frozen `FormatInfos[format]` entry (`mesh.ts:1286`)                                                                                 |

`_accessAttribute` returns silently (leaving the caller's result `null` or `false`) for an out-of-range `primitiveIndex` (`mesh.ts:1302`) or a missing attribute (`mesh.ts:1310`); it never throws. The `attributeName` argument is the `AttributeName` enum value, not a numeric format.

## MeshRenderer hooks that consume the Mesh

| Member                  | Declaration                                                                                                                                                                                   | Behavior on the Web runtime                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bakeSettings`          | `public bakeSettings = new ModelBakeSettings();` (`src/cocos/3d/framework/mesh-renderer.ts:333`), decorated `@serializable` `@editable` `@disallowAnimation` `@displayOrder(3)` at `:329-332` | a per-component object you read and mutate through the field; `class ModelBakeSettings extends EventTarget` is declared at `:125` and is NOT a name on the `build/cocosair.module.js` export block, so it is unreachable by import and never constructed by name from the package                                                                                                                                                 |
| `setWeight`             | `public setWeight (weight: number, subMeshIndex: number, shapeIndex: number): void` (`:720`)                                                                                                  | returns with no throw and no warn when `subMeshIndex >= this._subMeshShapesWeights.length` (`:722-724`) or `shapeIndex >= shapeWeights.length` (`:726-727`); a surviving call writes the slot and uploads it via `this._uploadSubMeshShapesWeights(subMeshIndex)` (`:729-730`). The weight table is (re)built by the `mesh` setter, which calls `this._initSubMeshShapesWeights()` (`:491`), so replacing the mesh resets weights |
| `setInstancedAttribute` | `public setInstancedAttribute (name: string, value: ArrayLike<number>): void` (`:733`)                                                                                                        | returns immediately when `this.model` is falsy (`:734-736`), i.e. writing an instance attribute before the model exists is a silent no-op; the JSB branch at `:738-740` is native-only, the Web branch iterates `this.model.subModels` and their `instancedAttributeBlock` from `:741`, matching on `attributes[i].name === name` and copying into `views[i]`                                                                     |

Skinning weight binding (joint/vertex attributes) is out of scope here; only the three hooks above are the `MeshRenderer` contract this skill owns. These three members resolve by symbol name against `build/cocosair.module.d.ts` (a declaration lookup, not browser verification).

## Reachability

- `Mesh` and the `utils` and `gfx` namespaces each appear in the `build/cocosair.module.js` export block (in-bundle). `createMesh`, `MeshUtils`, `Attribute` and `ModelBakeSettings` are NOT names on that block's top-level face (parsed: 626 entries, 92 aliases), so they resolve only through a namespace: `utils` is `import * as utils from './misc'` (`src/cocos/3d/index.ts:25`) and that barrel re-exports exactly `export { createMesh, MeshUtils } from './create-mesh';` (`src/cocos/3d/misc/index.ts:28`). Reach the static converter as `utils.MeshUtils.createMesh(geometry)` (`src/cocos/3d/misc/create-mesh.ts:406`) and the dynamic one as `utils.MeshUtils.createDynamicMesh(primitiveIndex, geometry, out?, options?)` (`src/cocos/3d/misc/create-mesh.ts:419`). The module-level `function createDynamicMesh` (`src/cocos/3d/misc/create-mesh.ts:262`) is NOT exported by that barrel, so the `utils` namespace has no `createDynamicMesh` member of its own and calling one throws a `TypeError`; the same-named static on `MeshUtils` is the live entry, as shipped in `examples/interactive-geometry/src/main.ts:155` and as asserted by the consumer gate `tools/verify/consumer-acceptance.cjs:180`, which fails the installed package when `mod.utils?.MeshUtils?.createDynamicMesh` is not a function. The barrel's free `createMesh` is marked `@deprecated` (`src/cocos/3d/misc/create-mesh.ts:44-46`), so prefer the `MeshUtils` statics for both calls.
- `Mesh.readAttribute` / `copyAttribute` / `readIndices` / `copyIndices` / `readAttributeFormat` resolve by symbol name in `build/cocosair.module.d.ts` (a declaration lookup, not browser verification); the instrumentation notes in `docs/evidence/examples-verified.json` list them as "no own descriptor on static", consistent with `examples/mesh-attributes-indices` exercising them under a recorded `PASS` candidate.
