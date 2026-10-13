# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - the router and the Code First discipline this skill applies.
- [cocosair-ui-2d](../../cocosair-ui-2d/SKILL.md) - `Canvas`, UI camera and layer setup, `UITransform` sizing and draw order that every subsystem here except `Billboard` sits on top of.
- [cocosair-assets](../../cocosair-assets/SKILL.md) - `assetManager.loadRemote` with an explicit extension, `Texture2D` and `SpriteFrame` ownership, and the `ImageAsset` to `Texture2D` wrap these asset constructors need.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - `active` toggling that forces a TiledLayer rebuild, deferred `destroy()`, and the node transforms `Billboard` and `ArmatureDisplay` read.
- [cocosair-materials-effects](../../cocosair-materials-effects/SKILL.md) - `builtin-billboard` and `SpineMaterialType` sit in the same effect registry; technique and blend-state overrides happen on the material.
- [cocosair-camera](../../cocosair-camera/SKILL.md) - TiledMap culling projects through the camera that resolves at run time, and `Billboard` needs a 3D camera visibility, not the UI one.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which symbol each entry file exports and how the `cocosair` importmap alias is wired.
