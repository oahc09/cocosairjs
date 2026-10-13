# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - `Node` position/rotation/scale setters that consume `Vec3`/`Quat`/`Mat4` and the dirty-flag propagation.
- [cocosair-camera](../../cocosair-camera/SKILL.md) - `Mat4.perspective`/`ortho`/`lookAt` consumers and screen-to-world conversions returning `Vec3`.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry exposes these symbols.

Material property packing (`Vec4`/`Color` into effects) belongs to [cocosair-materials-effects](../../cocosair-materials-effects/SKILL.md) and curve application inside `tween().easing(...)` to the cocosair-animation-tween skill; load the matching existing skill when applying these values to a material or animation.
