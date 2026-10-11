Derived from `src/cocos/primitive/box.ts`, `src/cocos/primitive/sphere.ts`, `src/cocos/primitive/cylinder.ts`, `src/cocos/primitive/cone.ts`, `src/cocos/primitive/plane.ts`, `src/cocos/primitive/quad.ts`, `src/cocos/primitive/torus.ts`, `src/cocos/primitive/capsule.ts`, `src/cocos/primitive/circle.ts`, `src/cocos/primitive/define.ts`, `src/cocos/primitive/index.ts`, `src/cocos/primitive/primitive.ts`, `src/cocos/primitive/transform.ts`, `src/cocos/primitive/utils.ts`, `src/exports/primitive.ts`, `src/cocos/gfx/base/define.ts`, `src/cocos/3d/misc/create-mesh.ts`, `docs/manual/primitives.md`, `docs/evidence/examples-verified.json`, `build/cocosair.module.js` (as of 2026-10-09)

# Primitive shape generators

The generators live in the `primitives` namespace object (`src/exports/primitive.ts:4-6` re-exports `import * as primitives from '../cocos/primitive'`). Every generator returns a plain `IGeometry` object, not a `Mesh`. `IGeometry` fields are `positions`, `normals?`, `uvs?`, `tangents?`, `colors?`, `attributes?`, `customAttributes?: { attr: Attribute, values: number[] }[]` (`src/cocos/primitive/define.ts:125-128`, folded into the vertex bundle by `utils.createMesh` at `src/cocos/3d/misc/create-mesh.ts:143-145`), `boundingRadius?`, `minPos?`, `maxPos?`, `indices?`, `primitiveMode?`, `doubleSided?` (`src/cocos/primitive/define.ts:76-185`).

## Namespace surface (9 generators + transforms)

| Generator  | Call form                                             | Default scale / axis                                         | Emits                                      | primitiveMode |
| ---------- | ----------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ | ------------- |
| `box`      | `box(options?)`                                       | 1 x 1 x 1, centered at origin                                | positions, normals, uvs, tangents, indices | TRIANGLE_LIST |
| `sphere`   | `sphere(radius?, opts?)`                              | radius 0.5, `sphere.ts:46`                                   | positions, normals, uvs, indices           | TRIANGLE_LIST |
| `cylinder` | `cylinder(radiusTop?, radiusBottom?, height?, opts?)` | 0.5 / 0.5 / height 2, `cylinder.ts:55`                       | positions, normals, uvs, indices           | TRIANGLE_LIST |
| `cone`     | `cone(radius?, height?, opts?)`                       | radius 0.5, height 1, `cone.ts:40-45`                        | positions, normals, uvs, indices           | TRIANGLE_LIST |
| `plane`    | `plane(options?)`                                     | width 10 x length 10, XOZ plane, normal +Y, `plane.ts:63-64` | positions, normals, uvs, indices           | TRIANGLE_LIST |
| `quad`     | `quad(options?)`                                      | fixed unit quad, `quad.ts:34`                                | positions, normals, uvs, indices           | TRIANGLE_LIST |
| `torus`    | `torus(radius?, tube?, opts?)`                        | radius 0.4, tube 0.1, `torus.ts:49-52`                       | positions, normals, uvs, indices           | TRIANGLE_LIST |
| `capsule`  | `capsule(radiusTop?, radiusBottom?, height?, opts?)`  | 0.5 / 0.5 / height 2, `capsule.ts:52`                        | positions, normals, uvs, indices           | TRIANGLE_LIST |
| `circle`   | `circle(options?)`                                    | unit radius fixed, XY plane, normal +Z, `circle.ts:85-91`    | positions, indices only                    | TRIANGLE_FAN  |

All eight non-circle generators default to TRIANGLE_LIST; `circle.ts:91` sets `primitiveMode: PrimitiveMode.TRIANGLE_FAN` explicitly. `PrimitiveMode` enum is `src/cocos/gfx/base/define.ts:613`; reach a member as `gfx.PrimitiveMode.TRIANGLE_LIST`.

## Per-shape parameters and defaults (from source)

- `box` (`box.ts:92-100`): `width`, `height`, `length` fall back to `1` via `options.width || 1`; `widthSegments`, `heightSegments`, `lengthSegments` fall back to `1` via `|| 1`. Returns `positions, normals, uvs, tangents, indices, minPos, maxPos, boundingRadius` (`box.ts:195-204`). The six faces are merged into a single flat buffer; `box` always writes tangents.
- `sphere` (`sphere.ts:46-47`): `radius` default `0.5`; `segments` default `32` read as `opts.segments !== undefined ? opts.segments : 32`. Sphere subdivides with one `segments` count for both latitude and longitude.
- `cylinder` (`cylinder.ts:55-60`): `radiusTop`/`radiusBottom` default `0.5`, `height` default `2`; `radialSegments` default `32` (`|| 32`), `heightSegments` default `1` (`|| 1`), `capped` default `true`, `arc` default `2 * Math.PI`.
- `cone` (`cone.ts:45`): implemented as `cylinder(0, radius, height, opts)`, so `radiusTop` is forced to `0`; shares cylinder's `radialSegments`, `heightSegments`, `capped`, `arc` keys.
- `plane` (`plane.ts:63-66`): `width`/`length` default `10`, `widthSegments`/`lengthSegments` default `10`. Plane lies in the XOZ plane with normal `+Y`. `plane` honors `includeNormal`/`includeUV` (`plane.ts:120,145,156`).
- `quad` (`quad.ts:34-63`): takes only `IGeometryOptions` (`includeNormal`, `includeUV`), no size parameters. Emits normals unless `includeNormal === false` (`quad.ts:55`) and UVs unless `includeUV === false` (`quad.ts:63`).
- `torus` (`torus.ts:49-64`): `radius` default `0.4`, `tube` default `0.1`; `radialSegments` default `32`, `tubularSegments` default `32`, `arc` default `2 * Math.PI`.
- `capsule` (`capsule.ts:52-66`): `radiusTop`/`radiusBottom` default `0.5`, `height` default `2`; `sides` default `32` (`opts.sides || 32`), `heightSegments` default `32`, `arc` default `2 * Math.PI`.
- `circle` (`circle.ts:44-95`): four source-level quirks an agent must not rely on the docs for:
  - `applyDefaultCircleOptions` assigns `options.segments = 64` unconditionally (`circle.ts:46`); a caller-supplied `segments` is overwritten, so circle is always 64 segments.
  - The returned object carries `positions` and `indices` only; `normals` is absent (`circle.ts:85-92`), so a standard-lit circle renders black until normals are supplied.
  - `minPos: { x: 1, y: 1, z: 0 }` and `maxPos: { x: -1, y: -1, z: 0 }` are written reversed (`circle.ts:88-89`); the AABB is inverted before `createMesh`.
  - `includeNormal`/`includeUV` are defaulted by `applyDefaultGeometryOptions` (`circle.ts:45`, `define.ts:57-67`) but `circle.ts` never reads either flag, so no flag value changes its output; unlike `plane` (`plane.ts:120,145,156`) and `quad` (`quad.ts:55,63`), `circle` is not a flag-consuming generator.

`docs/manual/primitives.md` tabulates a `circle` `{ radius, segments }` option set, but `circle.ts` never reads a `radius` field (positions are the unit circle, `circle.ts:71-76`) and overwrites `segments`, so treat those doc cells as the intended API shape rather than the shipped behavior.

## Geometry transforms (`src/cocos/primitive/transform.ts`)

| Function     | Signature                             | Mutation                                                                                                                                                                                               |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `translate`  | `translate(geometry, { x?, y?, z? })` | adds offset to every position and to `minPos`/`maxPos` (`transform.ts:36-59`), returns the same object                                                                                                 |
| `scale`      | `scale(geometry, { x?, y?, z? })`     | multiplies positions, bounds and `boundingRadius` (`transform.ts:70-112`); a negative axis swaps that axis's min/max (`transform.ts:99-107`)                                                           |
| `wireframed` | `wireframed(geometry)`                | converts a TRIANGLE_LIST (or undefined-mode) geometry into `LINE_LIST` edge indices (`transform.ts:122-153`); leaves any other `primitiveMode` unchanged and returns it as-is (`transform.ts:129-131`) |

`translate`/`scale`/`wireframed` mutate the passed `IGeometry` in place and return it; call them before `utils.createMesh`.

## Deprecated helpers on the same namespace (`src/cocos/primitive/utils.ts`)

`wireframe` (`utils.ts:31`), `invWinding` (`utils.ts:56`), `toWavefrontOBJ` (`utils.ts:67`), `normals` (`utils.ts:98`) are each marked `@deprecated` (`utils.ts:29,54,65,96`) but stay on the `primitives` namespace. `toWavefrontOBJ` returns an empty string only when `indices`, `uvs` or `normals` are missing, or when `primitiveMode` is present AND is not TRIANGLE_LIST: the guard is `(primitive.primitiveMode !== undefined && primitive.primitiveMode !== PrimitiveMode.TRIANGLE_LIST)` (`utils.ts:71`, whole check `utils.ts:68-73`), so a geometry with an undefined topology, e.g. `box` (`box.ts:195-204` returns no `primitiveMode` field; `utils.createMesh` then substitutes TRIANGLE_LIST at `src/cocos/3d/misc/create-mesh.ts:194`), still exports rather than failing. `applyDefaultGeometryOptions` is exported from `define.ts:57` and only fills `includeNormal`/`includeUV` to `true` when undefined (`define.ts:61-66`).

## `Primitive` serialized asset (`src/cocos/primitive/primitive.ts`)

`Primitive extends Mesh` (in-bundle). `PrimitiveType` ordinals: BOX=0, SPHERE=1, CYLINDER=2, CONE=3, CAPSULE=4, TORUS=5, PLANE=6, QUAD=7 (`primitive.ts:31-40`); there is no CIRCLE entry. Fields are `type: number` (`:60`) and `info: Record<string, number>` (`:70`); `onLoaded()` resolves a factory via `PrimitiveType[this.type].toLowerCase()` and calls it with `this.info` as its sole argument, then hands the result to `createMesh(...)` (`primitive.ts:83-86`). Because `info` is typed `Record<string, number>`, it cannot carry `capped`/`includeNormal`/`includeUV` booleans; the descriptor helper or direct `primitives.*` calls are the runtime-appropriate path.

## Capability layers

- Source export: all nine generators, the three transforms, the four deprecated helpers, and `Primitive` are declared under `src/cocos/primitive/` and re-exported through `src/exports/primitive.ts`.
- Default-bundle reachable: the namespace `primitives` and the class `Primitive` each appear as a name in the single `export { ... }` block of `build/cocosair.module.js` (626 names parsed). The bare per-shape names (`box`, `sphere`, ...) are NOT top-level bundle exports; import them as `primitives.box`, `primitives.sphere`, and so on.
- Browser evidence for a recorded candidate: `docs/evidence/examples-verified.json` records `primitives-geometry-ops`, `primitives-shapes-extra`, `primitives-wireframe-obj`, `mesh-cylinder`, `mesh-sphere`, `mesh-plane`, `mesh-torus` and `mesh-prim-compare` as `result: "PASS"`. The fingerprint fields sit at two levels: the FILE object carries `measuredAt` plus a file-level `candidateFingerprint`, while every `results[]` entry carries its OWN `candidateFingerprint` and no `measuredAt`. In this snapshot the two levels coincide: all 154 entries report `2f089f6ce25eaccd`, the same value the file records alongside `measuredAt` `2026-10-04T05:52:32.537Z`. That proves the generators ran in a past recorded candidate, not the current bytes.
