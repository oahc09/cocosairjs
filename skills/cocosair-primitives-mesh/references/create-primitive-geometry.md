Derived from `src/air/primitive-geometry.ts`, `src/cocos/primitive/define.ts`, `src/cocos/primitive/plane.ts`, `src/cocos/primitive/quad.ts`, `src/cocos/primitive/circle.ts`, `src/exports/air.ts`, `src/index.ts`, `docs/manual/primitive-descriptors.md`, `docs/evidence/examples-verified.json`, `test/smoke/port-gap-primitive-descriptor.test.ts`, `tools/verify/consumer-acceptance.cjs`, `build/cocosair.module.js`, `build/cocosair.module.d.ts` (as of 2026-10-09)

# `createPrimitiveGeometry(descriptor)` contract

## Signature and return type

`createPrimitiveGeometry(descriptor: AirPrimitiveDescriptor): IGeometry` (`src/air/primitive-geometry.ts:42`). It validates named parameters, strips `type`, and forwards the remaining fields to the native `box` / `sphere` / `cylinder` / `cone` generator (`:45,62,67,78,83`). The return value is a plain `IGeometry` object (`positions`, `normals`, `uvs`, `indices`, `minPos`, `maxPos`, `boundingRadius`, sometimes `tangents`) - it is NOT a `Mesh` and cannot be assigned to `MeshRenderer.mesh` directly.

`IGeometry` is defined in `src/cocos/primitive/define.ts:76-185`. `AirPrimitiveDescriptor` is a discriminated union on `type` (`primitive-geometry.ts:8-15`); the union resolves by symbol name in `build/cocosair.module.d.ts` (currently :56818) and, being a type, has no runtime name in the JS export block.

## Accepted `type` values and field whitelist

Only four `type` values exist: `box`, `sphere`, `cylinder`, `cone`. The check `Object.prototype.hasOwnProperty.call(fields, descriptor.type)` (`:44`) throws for anything else, including `capsule`, `plane`, `torus`, `quad`, `circle` and `undefined`.

| `type`     | Allowed numeric/boolean fields (whitelist, `:18-22`)                                       |
| ---------- | ------------------------------------------------------------------------------------------ |
| `box`      | `width`, `height`, `length`, `widthSegments`, `heightSegments`, `lengthSegments`           |
| `sphere`   | `radius`, `segments`                                                                       |
| `cylinder` | `radiusTop`, `radiusBottom`, `height`, `radialSegments`, `heightSegments`, `capped`, `arc` |
| `cone`     | `radius`, `height`, `radialSegments`, `heightSegments`, `capped`, `arc`                    |

Every key other than `type` is checked against the whitelist: a key that is not allowed and is not `includeNormal` or `includeUV` throws (`:47-49`, reason `is not a <type> parameter`). So `capped` is valid only for `cylinder`/`cone`; `radius` is invalid for `box`; `segs` (a three.js habit) is invalid for every type.

`includeNormal` and `includeUV` are accepted on all four types (`:7,48`) and validated as optional booleans (`:50-53`), then forwarded in `options`. They are forwarded verbatim, but `box`, `sphere`, `cylinder` and `cone` never read them. Among the native generators only `plane` and `quad` branch on the flags (`src/cocos/primitive/plane.ts:120,145,156`, `src/cocos/primitive/quad.ts:55,63`); `circle` passes its options through `applyDefaultGeometryOptions` (`src/cocos/primitive/circle.ts:45`), which only defaults the two fields to `true` (`src/cocos/primitive/define.ts:57-67`), and then never reads either one, so no flag value changes circle's output and the result is always `{ positions, indices, minPos, maxPos, boundingRadius, primitiveMode }` with no normals and no UVs (`src/cocos/primitive/circle.ts:85-92`). Setting `includeNormal: false` on a descriptor-reachable shape therefore validates fine and changes nothing: all four still emit positions, normals and UVs.

## Numeric validation

Two helpers drive every range rule:

- `number(value, field, minimum, inclusive = false)` (`:28-33`): `undefined` passes; a value throws unless it is finite and (when `inclusive`) `>= minimum` or (default, exclusive) `> minimum`.
- `segments(value, field, minimum)` (`:34-39`): runs `number(..., inclusive)` then throws unless the value is `undefined` or an integer no greater than `1024`. So `<= 1024` is an upper cap on each named segment field, and the lower bound is `>= minimum` (box segments minimum `1`; sphere/cylinder/cone radial segments minimum `3`; cylinder/cone heightSegments minimum `1`).

Per-shape numeric rules with their source lines:

| `type`             | Rule                                                                                                                                               | Line     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `box`              | `width`, `height`, `length` finite and `> 0`                                                                                                       | `:56`    |
| `box`              | `widthSegments`, `heightSegments`, `lengthSegments` integer, `>= 1`, `<= 1024`                                                                     | `:57`    |
| `box`              | predicted verts `2 * ((x+1)(y+1) + (x+1)(z+1) + (y+1)(z+1)) <= 1_000_000` (`x/y/z` default 1)                                                      | `:58-61` |
| `sphere`           | `radius` finite and `> 0`; `segments` integer `>= 3`, `<= 1024`                                                                                    | `:65`    |
| `sphere`           | `((segments ?? 32) + 1) ** 2 <= 1_000_000`                                                                                                         | `:66`    |
| `cylinder`, `cone` | `height` finite and `> 0`; `radialSegments` integer `>= 3`, `<= 1024`; `heightSegments` integer `>= 1`, `<= 1024`                                  | `:69-71` |
| `cylinder`, `cone` | `arc` finite and `> 0`, and `<= 2 * Math.PI` (so `arc` in `(0, 2pi]`)                                                                              | `:72-73` |
| `cylinder`, `cone` | predicted verts `(radial+1)(height+1) + 4*radial + 2 <= 1_000_000` (`radial` default 32, `height` default 1; `4*radial+2` covers capped end discs) | `:74-75` |
| `cone`             | `radius` finite and `> 0`                                                                                                                          | `:77`    |
| `cylinder`         | `radiusTop`, `radiusBottom` finite and `>= 0` (inclusive)                                                                                          | `:80-81` |
| `cylinder`         | `radiusTop` and `radiusBottom` may not BOTH be `0` (defaults `0.5`)                                                                                | `:82`    |

The `1_000_000` figure is a predicted-vertex guard computed from the segment fields, not the literal emitted vertex count and not a hard Mesh ceiling; each shape uses its own formula. Larger meshes are the caller's responsibility via the native API, per `docs/manual/primitive-descriptors.md`. The upper bound on `arc` is `<= 2pi` (only `> 2pi` throws), and the lower bound is `> 0` (from `number(..., 0, exclusive)`), so `arc: 0` and `arc: 2pi + 0.1` both throw while `arc: 2pi` is accepted.

## Failure mode

Every rejection goes through `invalid(field, reason)` (`:23-27`), which constructs and THROWS a `RangeError` whose message is `AIR_E_PRIMITIVE_DESCRIPTOR: <field> <reason>` and which carries `error.code = 'AIR_E_PRIMITIVE_DESCRIPTOR'` and `error.field = <field>`. Nothing warns or silently coerces; out-of-range or off-whitelist parameters throw before any geometry is produced.

## Reachability

- Source export: `createPrimitiveGeometry` and the `AirPrimitiveDescriptor` type are defined in `src/air/primitive-geometry.ts` and surface through `src/exports/air.ts:42` (`export * from '../air'`) and the narrow source entry `src/index.ts`.
- Default-bundle reachable: `createPrimitiveGeometry` appears as a name in the single `export { ... }` block of `build/cocosair.module.js` (626 names parsed), so `import { createPrimitiveGeometry } from 'cocosair'` (or `'cocosair.js'` against the installed package) resolves at build level.
- Test coverage, not pixel coverage: `test/smoke/port-gap-primitive-descriptor.test.ts` asserts `createPrimitiveGeometry({ type: 'box', ...options })` deep-equals `primitives.box({...options})` and the sphere/cylinder/cone equivalents (`:14,17,19-21`) and that invalid descriptors throw (`:31`). `tools/verify/consumer-acceptance.cjs:139,182` checks the name is importable from the installed bundle and matches the native generator. No example under `examples/` calls `createPrimitiveGeometry`, and no entry in `docs/evidence/examples-verified.json` exercises it, so it is source-exported and default-bundle-reachable plus jsdom/consumer-tested, NOT browser-pixel verified. The `primitives.*` generators it wraps ARE browser-PASS in recorded candidates (see [primitive-shapes.md](primitive-shapes.md)).
