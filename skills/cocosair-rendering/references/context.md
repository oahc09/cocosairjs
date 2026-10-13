# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-camera](../../cocosair-camera/SKILL.md) - the `Camera` component an offscreen pass needs: `priority`, `rect`, `visibility`, `targetTexture`.
- [cocosair-materials-effects](../../cocosair-materials-effects/SKILL.md) - authoring the effect and setting a material's `sampler2D`; this skill owns only the texture color contract and target bindings.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - node activation order, `layer` bits and camera `visibility` masks, which decide what a shadow pass or an offscreen camera sees at all; `Vec3` directions come from [cocosair-math](../../cocosair-math/SKILL.md).
- [cocosair-application](../../cocosair-application/SKILL.md) - when the scene and its native render scene exist, which gates every light query below.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry exposes a symbol, and variant-build options such as `AIR_FEATURES`.

Offscreen passes for 2D and DOM content belong to [cocosair-graphics-and-dom](../../cocosair-graphics-and-dom/SKILL.md). glTF loading, primitive geometry, animation, UI, input, physics, audio and broad performance work belong to the cocosair-gltf, cocosair-primitives-mesh, cocosair-animation-tween, cocosair-ui-2d, cocosair-input-action, cocosair-physics, cocosair-audio-video and cocosair-performance skills; load the matching existing skill only for the task's direct dependencies.
