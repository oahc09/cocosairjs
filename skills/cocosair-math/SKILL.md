---
name: cocosair-math
description: "Do vector, matrix, quaternion, rect, size and color arithmetic with the original Cocos math types in Cocos AIR - the math namespace and top-level exports, Vec2/Vec3/Vec4, Mat3/Mat4, Quat, Rect, Size and Color plus v2/v3/v4/quat/mat4/color factories, the out-first static convention (Vec3.add(out, a, b)), frozen constants like Vec3.UP via Object.freeze, Mat4 column-major m00..m15 layout and S->R->T composition with fromSRT/toSRT, Quat euler degrees versus radians, Mat3/Mat4 inverse and mirror handling, epsilon comparison with approx, scalar utilities clamp/clamp01/lerp/inverseLerp/repeat/pingPong, randomRange/pseudoRandom, floatToHalf encoding, bits helpers and easing curves. Use when normalizing or projecting a direction, composing or decomposing a node transform matrix, picking a quaternion or euler rotation, packing a Color or hex value, choosing an easing curve for a manual tween, hitting a TypeError from writing Vec3.UP, seeing -0 or NaN in a position, or getting an all-zero matrix from Mat4.invert."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, math"
  description_en: "Do vector, matrix, quaternion, rect, size and color arithmetic with the original Cocos math types in Cocos AIR - the math namespace and top-level exports, Vec2/Vec3/Vec4, Mat3/Mat4, Quat, Rect, Size and Color plus v2/v3/v4/quat/mat4/color factories, the out-first static convention (Vec3.add(out, a, b)), frozen constants like Vec3.UP via Object.freeze, Mat4 column-major m00..m15 layout and S->R->T composition with fromSRT/toSRT, Quat euler degrees versus radians, Mat3/Mat4 inverse and mirror handling, epsilon comparison with approx, scalar utilities clamp/clamp01/lerp/inverseLerp/repeat/pingPong, randomRange/pseudoRandom, floatToHalf encoding, bits helpers and easing curves. Use when normalizing or projecting a direction, composing or decomposing a node transform matrix, picking a quaternion or euler rotation, packing a Color or hex value, choosing an easing curve for a manual tween, hitting a TypeError from writing Vec3.UP, seeing -0 or NaN in a position, or getting an all-zero matrix from Mat4.invert."
  description_zh: "使用 Cocos 数学类型进行向量、矩阵、四元数、颜色和插值计算。用于坐标变换、旋转、颜色处理、缓动或确定性随机。"
---

# Cocos AIR math

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Compute with the value types the scene graph itself consumes: mutable instance fields, static operations that write into their first `out` argument, and matrices the `Node` transform pipeline reads back.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "Normalize / length / dot / cross a direction" -> `Vec3.normalize`, `Vec3.len`, `Vec3.dot`, `Vec3.cross` (`src/cocos/core/math/vec3.ts:329`, `:360`); table in [value-types.md](references/value-types.md).
- "Angle between two vectors" -> `Vec3.angle(a, b)` RADIANS (`src/cocos/core/math/vec3.ts:753`), `Vec2.angle` (`src/cocos/core/math/vec2.ts:438`); the signed form is `Vec3.signedAngle` (`src/cocos/core/math/vec3.ts:791`, table in [value-types.md](references/value-types.md)) and there is no `Vec2.signedAngle`.
- "Build a transform matrix / read TRS back out" -> `Mat4.fromSRT(out, q, v, s)` (`src/cocos/core/math/mat4.ts:964`) and `Mat4.toSRT(m, q, v, s)` (`:878`); there is no `Mat4.decompose`. Element layout in [transforms.md](references/transforms.md).
- "Rotate a quaternion" -> `Quat.fromEuler` degrees YZX (`src/cocos/core/math/quat.ts:557`), `Quat.fromAxisAngle` radians (`:475`), `Quat.rotationTo` (`:104`).
- "Point / rect hit test" -> `Rect.contains(point: Vec2)` (`src/cocos/core/math/rect.ts:414`), `Rect.intersects` (`:399`), `Rect.fromMinMax` (`:56`).
- "Color from a design token string" -> `new Color('#ff8000')`, `Color.fromHEX` (`src/cocos/core/math/color.ts:150`), `toCSS`/`toHEX` (`:497`, `:561`).
- "Interpolate a scalar over time" -> `lerp`/`inverseLerp`/`clamp01`/`repeat`/`pingPong` (`src/cocos/core/math/utils.ts:157`, `:307`, `:146`, `:279`, `:293`).
- "Pick an easing curve" -> `easing.cubicOut` and the rest of the 44 functions (`src/cocos/core/algorithm/easing.ts`, inventory in [easing-random.md](references/easing-random.md)).
- "Deterministic random" -> `pseudoRandom(seed)` (`src/cocos/core/math/utils.ts:227`); "non-reproducible" -> `random`/`randomRange` (`:182`, `:203`).
- "Texture-size rounding / bit math / pack a scalar to 16-bit" -> `bits.nextPow2`, `bits.log2`, `bits.isPow2` (`src/cocos/core/math/bits.ts:151`, `:101`, `:93`) and `floatToHalf`/`halfToFloat` (`src/cocos/core/math/utils.ts:417`, `:421`).

## Contracts

Static math operations use the out-first convention; avoid mutating frozen constants. Matrices are column-major and child world transforms compose parent world with child local.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Writing through a frozen vector constant
- [HIGH] Sharing one Vec3 between owners and then mutating it
- [MEDIUM] Expecting static operations to allocate a new vector
- [MEDIUM] Feeding 0-1 fractions into Color channels
- [MEDIUM] Mixing degrees and radians across euler and axis-angle APIs

## References

- [value-types.md](references/value-types.md) - construction and factory signatures, the static/instance mutation contract per type, frozen constant tables, `ValueType` family, `Color` byte and hex/CSS conversions, `Rect`/`Size` operations.
- [transforms.md](references/transforms.md) - `Mat4` element layout, `fromSRT`/`toSRT` and the deprecated RTS aliases, multiply order, inverse/degenerate and mirror handling, quaternion euler/axis units, `Mat3`/`Mat4` interplay, how `Node` consumes these.
- [easing-random.md](references/easing-random.md) - the 44 easing functions with formulas and boundary values, scalar utilities, random/pseudoRandom ranges and the global generator swap, `bits` helpers and their integer coercion, half-float encoding.

## Canonical docs

`docs/manual/matrix-transformations.md`, `docs/reference/api-stability.md`.
