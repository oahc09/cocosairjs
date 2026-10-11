Derived from the cocosair-math skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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

The two families are split by entry point, not by type: `Quat.fromEuler`/`Node.setRotationFromEuler`/`Quat.toEuler` take degrees, while `Quat.fromAxisAngle`/`Mat4.rotate*`/`Mat3.toEuler`/`Quat.getAxisAngle` take radians, so the object just spins at the wrong speed and nothing reports it. Wrong and Correct snippets plus the per-entry unit table are in [transforms.md](transforms.md).
