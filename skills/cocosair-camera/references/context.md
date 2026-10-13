# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - `node.layer` bits and the `visibility` mask values this camera tests against ([layers.md](../../cocosair-scene-graph/references/layers.md) there).
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry exposes `Camera` and `frameObject`.

Rendering pipeline, lights, shadows and post-process belong to the cocosair-rendering skill; UI canvas and design-resolution input handling belong to the cocosair-ui-2d and cocosair-input-action skills - load the matching existing skill only when the task crosses that boundary.
