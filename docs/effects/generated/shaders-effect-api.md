# Effect API Reference (generated)

This documents the EXISTING native CocosAirJS API and each example's parameter contract.
There is no new unified `createEffect` runtime — each example uses the standard
`createAirApp` / `Material` / `MeshRenderer` / `EffectAsset` pipeline directly.

## Selected native API surface

- `createAirApp({ canvas })` — application bootstrap
- `Scene` / `Node` / `Camera` — scene graph
- `MeshRenderer` + `utils.createMesh(...)` — full-screen quad rendering
- `Material.initialize({ effectAsset, defines, states })` — material setup
- `Material.setProperty(name, value)` — uniform upload
- `EffectAsset` — registered effect definitions
- `createAirRenderTarget(...)` — render targets (multi-pass compositions)
- `createStepClock()` — deterministic test stepping

## Per-example pass counts (native rendering passes per frame)

| Example | Passes                         |
| ------- | ------------------------------ |
| E01     | 1                              |
| E02     | 1                              |
| E03     | 1                              |
| E04     | 1                              |
| E05     | 2                              |
| E06     | 1                              |
| E07     | 1                              |
| E08     | 1                              |
| E09     | 2                              |
| C01     | 3                              |
| C02     | 1                              |
| C03     | 2                              |
| C04     | image=1, procedural/rendered=2 |

## Per-example source-attested API claims

- E01: `createAirApp`, `createStepClock`, `EffectAsset`, `Material.initialize`, `Material.setProperty`, `Texture2D`, `MeshRenderer`, `utils.createMesh`
- E02: `Material.initialize`, `EffectAsset.onLoaded`, `MeshRenderer.mesh`, `createAirApp`, `createStepClock`, `createAirRenderTarget`
- E03: `createAirApp`, `createStepClock`, `createAirRenderTarget`, `EffectAsset`, `Material.initialize`, `Material.setProperty`, `MeshRenderer`, `utils.createMesh`, `Camera`, `Node`
- E04: `createAirApp`, `createStepClock`, `createAirRenderTarget`, `EffectAsset`, `Material.initialize`, `Material.setProperty`, `MeshRenderer`, `utils.createMesh`, `Camera`, `Node`
- E05: `createAirApp`, `createStepClock`, `createAirRenderTarget`, `EffectAsset`, `Material.initialize`, `Material.setProperty`, `MeshRenderer`, `utils.createMesh`, `Camera`, `Node`
- E06: `createAirApp`, `createStepClock`, `createAirRenderTarget`, `EffectAsset`, `Material.initialize`, `Material.setProperty`, `MeshRenderer`, `Texture2D`, `utils.createMesh`
- E07: `createAirApp`, `createStepClock`, `createAirRenderTarget`, `EffectAsset`, `Material.initialize`, `Material.setProperty`, `MeshRenderer`, `utils.createMesh`, `Camera`, `Node`
- E08: `createAirApp`, `createStepClock`, `createAirRenderTarget`, `EffectAsset`, `Material.initialize`, `Material.setProperty`, `MeshRenderer`, `utils.createMesh`, `Texture2D`
- E09: `createAirApp`, `createStepClock`, `createAirRenderTarget`, `EffectAsset`, `Material.initialize`, `Material.setProperty`, `MeshRenderer`, `utils.createMesh`, `Camera`, `Node`
- C01: `createAirApp`, `createStepClock`, `createAirRenderTarget`, `EffectAsset`, `Material.initialize`, `Material.setProperty`, `MeshRenderer`, `utils.createMesh`, `Camera`, `Node`
- C02: `createAirApp`, `createStepClock`, `createAirRenderTarget`, `EffectAsset`, `Material.initialize`, `Material.setProperty`, `MeshRenderer`, `utils.createMesh`, `Camera`, `Node`
- C03: `createAirApp`, `createStepClock`, `createAirRenderTarget`, `EffectAsset`, `Material.initialize`, `Material.setProperty`, `MeshRenderer`, `utils.createMesh`, `Camera`, `Node`
- C04: `createAirApp`, `createStepClock`, `createAirRenderTarget`, `EffectAsset`, `Material.initialize`, `Material.setProperty`, `MeshRenderer`, `utils.createMesh`, `Camera`, `Node`

## Per-example parameter interfaces

See [shaders-effect-params.d.ts](../../../tools/generated/shaders-effect-params.d.ts) for the
full TypeScript interfaces generated from each definition.

## Composition patterns

| Pattern                 | Examples                                                                          |
| ----------------------- | --------------------------------------------------------------------------------- |
| Single-pass native      | E01–E04, E06–E08, C02                                                             |
| Two-pass RT composition | E05 Emboss, E09 Glass, C03 GlassTrail; C04 procedural/rendered                    |
| Multi-pass composition  | C01 LaserCard (3-pass), C02 FilmNeon, C03 GlassTrail, C04 InputDissolve (3-route) |
