# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - `Node` position/rotation/scale setters that consume `Vec3`/`Quat`/`Mat4` and the dirty-flag propagation.
- [cocosair-camera](../../cocosair-camera/SKILL.md) - `Mat4.perspective`/`ortho`/`lookAt` consumers and screen-to-world conversions returning `Vec3`.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry exposes these symbols.

Material property packing (`Vec4`/`Color` into effects) belongs to [cocosair-materials-effects](../../cocosair-materials-effects/SKILL.md) and curve application inside `tween().easing(...)` to the cocosair-animation-tween skill; load the matching existing skill when applying these values to a material or animation.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Compute with the value types the scene graph itself consumes: mutable instance fields, static operations that write into their first `out` argument, and matrices the `Node` transform pipeline reads back.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Writing through a frozen vector constant
- [HIGH] Sharing one Vec3 between owners and then mutating it
- [MEDIUM] Expecting static operations to allocate a new vector
- [MEDIUM] Feeding 0-1 fractions into Color channels
- [MEDIUM] Mixing degrees and radians across euler and axis-angle APIs

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Do vector, matrix, quaternion, rect, size and color arithmetic with the original Cocos math types in Cocos AIR - the math namespace and top-level exports, Vec2/Vec3/Vec4, Mat3/Mat4, Quat, Rect, Size and Color plus v2/v3/v4/quat/mat4/color factories, the out-first static convention (Vec3.add(out, a, b)), frozen constants like Vec3.UP via Object.freeze, Mat4 column-major m00..m15 layout and S->R->T composition with fromSRT/toSRT, Quat euler degrees versus radians, Mat3/Mat4 inverse and mirror handling, epsilon comparison with approx, scalar utilities clamp/clamp01/lerp/inverseLerp/repeat/pingPong, randomRange/pseudoRandom, floatToHalf encoding, bits helpers and easing curves. Use when normalizing or projecting a direction, composing or decomposing a node transform matrix, picking a quaternion or euler rotation, packing a Color or hex value, choosing an easing curve for a manual tween, hitting a TypeError from writing Vec3.UP, seeing -0 or NaN in a position, or getting an all-zero matrix from Mat4.invert.

### Keywords

Cocos AIR, cocosair.js, math

## References

- [value-types.md](value-types.md) - construction and factory signatures, the static/instance mutation contract per type, frozen constant tables, `ValueType` family, `Color` byte and hex/CSS conversions, `Rect`/`Size` operations.
- [transforms.md](transforms.md) - `Mat4` element layout, `fromSRT`/`toSRT` and the deprecated RTS aliases, multiply order, inverse/degenerate and mirror handling, quaternion euler/axis units, `Mat3`/`Mat4` interplay, how `Node` consumes these.
- [easing-random.md](easing-random.md) - the 44 easing functions with formulas and boundary values, scalar utilities, random/pseudoRandom ranges and the global generator swap, `bits` helpers and their integer coercion, half-float encoding.

## Canonical docs

`docs/manual/matrix-transformations.md`, `docs/reference/api-stability.md`.
