---
name: cocosair-math
description: Do vector, matrix, quaternion, rect, size and color arithmetic with the original Cocos math types in Cocos AIR - the math namespace and top-level exports, Vec2/Vec3/Vec4, Mat3/Mat4, Quat, Rect, Size and Color plus v2/v3/v4/quat/mat4/color factories, the out-first static convention (Vec3.add(out, a, b)), frozen constants like Vec3.UP via Object.freeze, Mat4 column-major m00..m15 layout and S->R->T composition with fromSRT/toSRT, Quat euler degrees versus radians, Mat3/Mat4 inverse and mirror handling, epsilon comparison with approx, scalar utilities clamp/clamp01/lerp/inverseLerp/repeat/pingPong, randomRange/pseudoRandom, floatToHalf encoding, bits helpers and easing curves. Use when normalizing or projecting a direction, composing or decomposing a node transform matrix, picking a quaternion or euler rotation, packing a Color or hex value, choosing an easing curve for a manual tween, hitting a TypeError from writing Vec3.UP, seeing -0 or NaN in a position, or getting an all-zero matrix from Mat4.invert.
---

# Cocos AIR math

Compute with the value types the scene graph itself consumes: mutable instance fields, static operations that write into their first `out` argument, and matrices the `Node` transform pipeline reads back.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, Vec3, Quat, Mat4, Color, math, easing, lerp, clamp01 } from 'cocosair'; // page alias, not the package name

const app = await createAirApp({ canvas: '#GameCanvas' }); // canvas must exist before this import
const scene = new Scene('Main');
const camNode = new Node('Main Camera');
scene.addChild(camNode);
camNode.setPosition(new Vec3(0, 1.5, 5));
camNode.setRotationFromEuler(-15, 0, 0);   // DEGREES; composed by Quat.fromEuler in YZX order
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
const box = new Node('Box');
scene.addChild(box);

const scratch = new Vec3();                       // owned by this scope only, so in-place writes are safe
const dir = Vec3.normalize(scratch, Vec3.RIGHT);  // statics write the first argument; Vec3.RIGHT is only READ
const rot = new Quat();
const local = new Mat4();
Quat.fromEuler(rot, 0, 30, 0);                    // degrees in, quaternion out
Mat4.fromSRT(local, rot, scratch, Vec3.ONE);      // scale -> rotation -> translation, i.e. out = T * R * S
box.matrix = local;                               // the Node.matrix setter decomposes it back with Mat4.toSRT

const tint = new Color(255, 128, 0, 255);         // channels are 0-255 bytes, not 0-1 floats
tint.fromHEX('#ff8000');
console.log(tint.toCSS('rgba'));                  // "rgba(255,128,0,1.00)"

const y = lerp(0, 2, easing.cubicInOut(clamp01(0.5))); // easing is a top-level namespace, not math.ease*
box.setPosition(dir.x * 2, y, dir.z);
console.assert(math.equals(y, 1), 'midpoint of the cubic curve maps to the midpoint of the range');

app.run(scene);
</script>
```

Entry choice, the importmap alias and the install are owned by [cocosair-project-setup](../cocosair-project-setup/SKILL.md); `createAirApp`/`run` by [cocosair-application](../cocosair-application/SKILL.md).

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - `Node` position/rotation/scale setters that consume `Vec3`/`Quat`/`Mat4` and the dirty-flag propagation.
- [cocosair-camera](../cocosair-camera/SKILL.md) - `Mat4.perspective`/`ortho`/`lookAt` consumers and screen-to-world conversions returning `Vec3`.
- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - which entry exposes these symbols.

Material property packing (`Vec4`/`Color` into effects) belongs to the cocosair-rendering skill and curve application inside `tween().easing(...)` to the cocosair-animation-tween skill; neither exists yet, so route through the router.

## When to use what

- "Normalize / length / dot / cross a direction" -> `Vec3.normalize`, `Vec3.len`, `Vec3.dot`, `Vec3.cross` (`src/cocos/core/math/vec3.ts:329`, `:360`); table in `references/value-types.md`.
- "Angle between two vectors" -> `Vec3.angle(a, b)` RADIANS (`src/cocos/core/math/vec3.ts:753`), `Vec2.angle` (`src/cocos/core/math/vec2.ts:438`); the signed form is `Vec3.signedAngle` (`src/cocos/core/math/vec3.ts:791`, table in `references/value-types.md`) and there is no `Vec2.signedAngle`.
- "Build a transform matrix / read TRS back out" -> `Mat4.fromSRT(out, q, v, s)` (`src/cocos/core/math/mat4.ts:964`) and `Mat4.toSRT(m, q, v, s)` (`:878`); there is no `Mat4.decompose`. Element layout in `references/transforms.md`.
- "Rotate a quaternion" -> `Quat.fromEuler` degrees YZX (`src/cocos/core/math/quat.ts:557`), `Quat.fromAxisAngle` radians (`:475`), `Quat.rotationTo` (`:104`).
- "Point / rect hit test" -> `Rect.contains(point: Vec2)` (`src/cocos/core/math/rect.ts:414`), `Rect.intersects` (`:399`), `Rect.fromMinMax` (`:56`).
- "Color from a design token string" -> `new Color('#ff8000')`, `Color.fromHEX` (`src/cocos/core/math/color.ts:150`), `toCSS`/`toHEX` (`:497`, `:561`).
- "Interpolate a scalar over time" -> `lerp`/`inverseLerp`/`clamp01`/`repeat`/`pingPong` (`src/cocos/core/math/utils.ts:157`, `:307`, `:146`, `:279`, `:293`).
- "Pick an easing curve" -> `easing.cubicOut` and the rest of the 44 functions (`src/cocos/core/algorithm/easing.ts`, inventory in `references/easing-random.md`).
- "Deterministic random" -> `pseudoRandom(seed)` (`src/cocos/core/math/utils.ts:227`); "non-reproducible" -> `random`/`randomRange` (`:182`, `:203`).
- "Texture-size rounding / bit math / pack a scalar to 16-bit" -> `bits.nextPow2`, `bits.log2`, `bits.isPow2` (`src/cocos/core/math/bits.ts:151`, `:101`, `:93`) and `floatToHalf`/`halfToFloat` (`src/cocos/core/math/utils.ts:417`, `:421`).

## Contracts

- `math` is a namespace object, not a class bag: `src/cocos/core/index.ts:28` does `import * as math from './math'` and `:36` exports it, so `math.Vec3`, `math.bits`, `math.clamp01` are the same bindings as the top-level ones. The namespace surface is exactly `src/cocos/core/math/index.ts:34-49` (`bits` `:34`, the value types with their factories `:35-43`, `./utils` `:44`, `./type-define` `:45`, `./math-base` `:46`). `easing` and the top-level `bits` come from elsewhere: `easing` is `src/cocos/core/algorithm/index.ts:29`, and `math.easing` does NOT exist.
- Every static operation on every value type is `out`-first: it writes fields of `out` and returns `out`; none of them allocate except the `clone` family (`Vec3.add<Out extends IVec3Like>(out, a, b): Out`, `src/cocos/core/math/vec3.ts:112-117`). Passing a frozen constant as `out` throws; passing a live node-owned vector as `out` mutates the node's stored data.
- Frozen constants are a hard boundary. `freezeVec3` (`src/cocos/core/math/vec3.ts:48-50`) is `Object.freeze(new Vec3(...))`, module-local and not exported, and backs the nine statics at `:57-65` (`UNIT_X/UNIT_Y/UNIT_Z`, `RIGHT/UP/FORWARD/ZERO/ONE/NEG_ONE`) typed `Readonly<Vec3>`. Equivalent helpers/inline freezes exist per type: `vec2.ts:50-51` with five statics (`:59-63`), `vec4.ts:46-47` with seven (`:55-61`), `color.ts:45-46` with ten (`:56-65`), `Mat4.IDENTITY` `mat4.ts:63`, `Mat3.IDENTITY` `mat3.ts:45`, `Quat.IDENTITY` `quat.ts:54`, `Size.ZERO/ONE` `size.ts:36-37`. `Rect` has no frozen statics. Bundled ESM is always strict mode, so both `Vec3.UP.x = 5` and `Vec3.UP.set(...)` throw `TypeError` in the strict-mode bundle; the same writes in a sloppy script silently do nothing.
- Instance fields are plain mutable numbers (`public declare x: number`, `src/cocos/core/math/vec3.ts:884`), so a `Vec3` is only as private as its holder. The scene graph stores its own private `_lpos/_lrot/_lscale` and hands them out as `Readonly<Vec3>` getters; a returned `Readonly` reference to a node's own storage is a TS marker only and is still mutable at runtime.
- Color channels are bytes: `Color` stores `private _data = new Uint8ClampedArray(4)` (`src/cocos/core/math/color.ts:340`) and the `r/g/b/a` accessors index it directly (`:346-387`), with defaults `0/0/0/255` in `set` (`:721-743`). Writing `0.5` into a channel is a byte coercion (clamped and rounded), not 50 percent; the 0-1 view is the compatibility accessors `x/y/z/w` (`:390-397`) and `Color.toVec4`/`fromVec4` (`:113`, `:131`). There is no `premultiply` member on `Color` in this runtime.
- Composition order is documented as "S->R->T applied in order", which in the column-major storage of `Mat4` means `out = T * R * S` (`Mat4.fromSRT`, `src/cocos/core/math/mat4.ts:964-1000`; translation lands in `m12/m13/m14`). `fromRTS` (`:951`) and `toRTS` (`:865`) are deprecated aliases that forward to `fromSRT`/`toSRT` - the letters in the name are not an order. `Mat4.multiply(out, a, b)` is `out = a * b` (`:316`), and the manual asserts child world = `parent.worldMatrix * childLocal` (`docs/manual/matrix-transformations.md:7`).
- Angles: the euler entry points take DEGREES (`Quat.fromEuler` multiplies by `halfToRad = 0.5 * PI / 180`, `src/cocos/core/math/quat.ts:557-560`, `:934`; `Node.setRotationFromEuler`, `src/cocos/scene-graph/node.ts:2506-2514`), while every axis-angle, `Mat4.rotate*` and `Mat3.toEuler` entry point takes radians (`quat.ts:475`, `mat4.ts:441`, `mat3.ts:649`). Unit mixing does not throw - it silently rotates by a factor of about 57.
- Degenerate input is answered silently, never by a throw: `Mat4.invert` writes an ALL-ZERO matrix when the determinant is exactly 0 (`src/cocos/core/math/mat4.ts:254-255`, documented at `:229` - the old contents are lost), `Vec3.normalize` writes `(0,0,0)` for a zero-length input (`src/cocos/core/math/vec3.ts:329-345`), `Quat.invert` produces the zero quaternion (`src/cocos/core/math/quat.ts:384-398`), and `Mat4.toSRT` returns identity rotation when any scale is 0 (`:894-899`). Mirror matrices are handled by taking the sign into the scale: after normalizing the three column vectors, `toSRT` computes `Mat3.determinant` and on a negative value negates `s.x` and column 0 before `Quat.fromMat3` (`src/cocos/core/math/mat4.ts:914-927`).
- Capability layers, stated separately (source export / default-bundle reachable / browser-verified): the delivered bundle `build/cocosair.module.js` exports `math`, `easing`, `bits`, the ten value classes, their factory functions (`v2/v3/v4/quat/mat4/rect/size/color`), all of `./utils` (`lerp`, `clamp`, `randomRange`, `pseudoRandom`, `floatToHalf`, ...), `EPSILON/HALF_PI/TWO_PI` and `ValueType`/`MathBase`, so all of them are importable from the main entry; `preTransforms` is engine-internal (`src/cocos/core/math/index.ts:49`). `srgbToLinear`/`linearToSrgb`/`linearToSrgb8Bit` (`src/cocos/core/math/color.ts:781`, `:793`, `:800`) and `AffineTransform` (`src/cocos/core/math/affine-transform.ts:38`) are source exports that are NOT in the bundle export list, and `Vec3.random`/`Vec2.random` are reachable only as statics. `perlin`, `fp32`/`fp16` and `toRgba8`/`fromRgba8` are not present in the declaration. All 40 `examples/math-*` Gallery apps are recorded PASS for Chromium in `docs/evidence/examples-verified.json` (`measuredAt` 2026-10-04T05:52:32Z, `candidateFingerprint` 2f089f6ce25eaccd) - that is captured browser evidence for that candidate, not for the bundle in `build/` today.

## Common Mistakes

### [HIGH] Writing through a frozen vector constant

Wrong:

```js
Vec3.UP.x = 5;                       // TypeError: Cannot assign to read only property 'x'
Vec3.UP.set(0, 10, 0);               // TypeError too - set() assigns to frozen fields
const dir = new Vec3(1, 1, 0);
Vec3.normalize(Vec3.ZERO, dir);      // the constant passed as out is frozen
```

Correct:

```js
const dir = new Vec3(1, 1, 0);
const up = new Vec3();
Vec3.copy(up, Vec3.UP);
up.y = 10;
const dirOut = new Vec3();
Vec3.normalize(dirOut, dir);      // pass a private, mutable out target
```

Agents copy the constant because it reads like a default value; every static here writes its first argument, and `freezeVec3`/`Object.freeze` makes those constants non-writable, so a write (direct or through `set`) throws `TypeError` in bundled ESM instead of quietly producing a wrong vector.

### [HIGH] Sharing one Vec3 between owners and then mutating it

Wrong:

```js
const sharedOffset = new Vec3(1, 0, 0);
const holderA = { offset: sharedOffset };  // holder A stores the reference, not a copy
const holderB = { offset: sharedOffset };  // holder B stores the same reference
sharedOffset.set(9, 9, 9);                 // both holders now read 9,9,9
```

Correct:

```js
const sharedOffset = new Vec3(1, 0, 0);
const holderB = { offset: Vec3.clone(sharedOffset) }; // give each owner its own instance
const gravity = new Vec3(0, -9.8, 0);
const tmp = new Vec3();                              // mutate tmp, which nothing else holds
Vec3.add(tmp, sharedOffset, gravity);
```

Reusing one instance across frames is the engine's own style, so an agent hoists a `Vec3` to module scope and keeps writing it; because instance fields are mutable and only copied where a setter copies, the holders that kept a reference all observe the last write.

### [MEDIUM] Expecting static operations to allocate a new vector

Wrong:

```js
const a = new Vec3(1, 0, 0); const b = new Vec3(0, 1, 0);
const mid = Vec3.lerp(a, b, 0.5);   // intent: midpoint of a and b
console.log(mid.x);                 // NaN - and `a` itself was overwritten in place
```

Correct:

```js
const a = new Vec3(1, 0, 0); const b = new Vec3(0, 1, 0);
const mid = new Vec3();
Vec3.lerp(mid, a, b, 0.5);          // signature is lerp(out, a, b, t)
const other = Vec3.clone(a);        // clone is the allocating member of the family
```

Array-style math libraries return fresh values, so an agent shifts the arguments left; the real signature is `lerp(out, a, b, t)` (`src/cocos/core/math/vec3.ts:373`), which reads `b.x` off the number `0.5` - property access on a number is `undefined`, not an error, so the write produces `NaN` in `out` and nothing throws.

### [MEDIUM] Feeding 0-1 fractions into Color channels

Wrong:

```js
const tint = new Color(0.5, 0.5, 0.5);   // bytes: 0.5 rounds to 0 -> solid black, alpha 255
```

Correct:

```js
const tint = new Color(128, 128, 128, 255); // 0-255 channel convention
const half = new Color();
half.x = 0.5;                               // the x/y/z/w accessors take fractions (byte 128)
```

`Color` writes its channels into a `Uint8ClampedArray` (`src/cocos/core/math/color.ts:340`), so 0-1 input collapses to 0 or 1 and out-of-range numbers clamp; an agent that reads "normalized color" from the shader side does the division a second time and gets a solid black or solid white tint with no warning.

### [MEDIUM] Mixing degrees and radians across euler and axis-angle APIs

The two families are split by entry point, not by type: `Quat.fromEuler`/`Node.setRotationFromEuler`/`Quat.toEuler` take degrees, while `Quat.fromAxisAngle`/`Mat4.rotate*`/`Mat3.toEuler`/`Quat.getAxisAngle` take radians, so the object just spins at the wrong speed and nothing reports it. Wrong and Correct snippets plus the per-entry unit table are in `references/transforms.md`.

## References

- `references/value-types.md` - construction and factory signatures, the static/instance mutation contract per type, frozen constant tables, `ValueType` family, `Color` byte and hex/CSS conversions, `Rect`/`Size` operations.
- `references/transforms.md` - `Mat4` element layout, `fromSRT`/`toSRT` and the deprecated RTS aliases, multiply order, inverse/degenerate and mirror handling, quaternion euler/axis units, `Mat3`/`Mat4` interplay, how `Node` consumes these.
- `references/easing-random.md` - the 44 easing functions with formulas and boundary values, scalar utilities, random/pseudoRandom ranges and the global generator swap, `bits` helpers and their integer coercion, half-float encoding.

## Canonical docs

`docs/manual/matrix-transformations.md`, `docs/reference/api-stability.md`.
