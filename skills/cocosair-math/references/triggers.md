# Cocos AIR math triggers

Source annotations refer to the AIR checkout.

## When to use what

- "Normalize / length / dot / cross a direction" -> `Vec3.normalize`, `Vec3.len`, `Vec3.dot`, `Vec3.cross` (`src/cocos/core/math/vec3.ts:329`, `:360`); table in [value-types.md](value-types.md).
- "Angle between two vectors" -> `Vec3.angle(a, b)` RADIANS (`src/cocos/core/math/vec3.ts:753`), `Vec2.angle` (`src/cocos/core/math/vec2.ts:438`); the signed form is `Vec3.signedAngle` (`src/cocos/core/math/vec3.ts:791`, table in [value-types.md](value-types.md)) and there is no `Vec2.signedAngle`.
- "Build a transform matrix / read TRS back out" -> `Mat4.fromSRT(out, q, v, s)` (`src/cocos/core/math/mat4.ts:964`) and `Mat4.toSRT(m, q, v, s)` (`:878`); there is no `Mat4.decompose`. Element layout in [transforms.md](transforms.md).
- "Rotate a quaternion" -> `Quat.fromEuler` degrees YZX (`src/cocos/core/math/quat.ts:557`), `Quat.fromAxisAngle` radians (`:475`), `Quat.rotationTo` (`:104`).
- "Point / rect hit test" -> `Rect.contains(point: Vec2)` (`src/cocos/core/math/rect.ts:414`), `Rect.intersects` (`:399`), `Rect.fromMinMax` (`:56`).
- "Color from a design token string" -> `new Color('#ff8000')`, `Color.fromHEX` (`src/cocos/core/math/color.ts:150`), `toCSS`/`toHEX` (`:497`, `:561`).
- "Interpolate a scalar over time" -> `lerp`/`inverseLerp`/`clamp01`/`repeat`/`pingPong` (`src/cocos/core/math/utils.ts:157`, `:307`, `:146`, `:279`, `:293`).
- "Pick an easing curve" -> `easing.cubicOut` and the rest of the 44 functions (`src/cocos/core/algorithm/easing.ts`, inventory in [easing-random.md](easing-random.md)).
- "Deterministic random" -> `pseudoRandom(seed)` (`src/cocos/core/math/utils.ts:227`); "non-reproducible" -> `random`/`randomRange` (`:182`, `:203`).
- "Texture-size rounding / bit math / pack a scalar to 16-bit" -> `bits.nextPow2`, `bits.log2`, `bits.isPow2` (`src/cocos/core/math/bits.ts:151`, `:101`, `:93`) and `floatToHalf`/`halfToFloat` (`src/cocos/core/math/utils.ts:417`, `:421`).
