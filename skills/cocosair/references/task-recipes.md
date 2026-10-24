# AIR task cookbook

中文入口：粒子与点精灵、无后处理辉光、拾取与 HUD、动态网格、天空与环境。

Choose the task first, then follow only the needed owner links. These are composition routes; exact contracts remain in their existing references. Use the [visual loop](visual-feedback.md#minimal-visual-feedback-loop) to check the result. Neither a route nor a copied shader establishes visual acceptance.

Each subsystem Quick Start is a standalone example and repeats app/scene/camera setup. When combining recipes in an already working page, reuse those objects and read the topic needed for the next change. Use an app or camera Quick Start when that setup is still missing; loading another subsystem does not require assembling another complete page.

## Particles and point sprites

Choose [Billboard](../../cocosair-2d-subsystems/references/billboard.md) for camera-facing textured quads, [ParticleSystem2D](../../cocosair-2d-subsystems/references/particle-2d.md) for that subsystem, or a custom POINT_LIST mesh via [mesh layout](../../cocosair-primitives-mesh/references/mesh-attributes.md) and [custom GLSL](../../cocosair-materials-effects/references/custom-glsl.md). For points write gl_PointSize; do not assume a thick-line or billboard route is equivalent. Check size, texture ownership, topology and a visible pixel result before scaling the particle count. For many repeated meshes, choose [batching](../../cocosair-performance/references/batching-routes.md) after the small case renders.

## Glow without post-processing

Start with visible opaque geometry, then add a soft alpha texture or shader falloff using [numeric blend states](../../cocosair-materials-effects/references/custom-glsl.md#runtime-state-and-empty-block-traps). Read [material instances and map macros](../../cocosair-materials-effects/references/common-mistakes.md) before animating brightness. This route simulates luminous surfaces/halos; it does not spread HDR highlights across the rendered image like Bloom. If the task allows real post-processing, the owner is [HDR/Bloom](../../cocosair-rendering/references/pipeline-reachability.md). Verify ordering, depth/occlusion and saturation in the final frame rather than compensating for a black object with higher intensity.

## Picking and HUD

Choose [native input](../../cocosair-input-action/references/native-input.md), convert screen coordinates with the [camera ray contract](../../cocosair-camera/references/screen-world.md), then use the appropriate hit test and present the selected result through the [UI owner](../../cocosair-ui-2d/SKILL.md). Do not mix DOM CSS pixels, framebuffer pixels and UI local coordinates. For wheel-controlled cameras, choose the native MOUSE_WHEEL route or an explicitly owned DOM listener; keep page-scroll capture scoped to the interaction surface. Check [focus and default-event policy](../../cocosair-input-action/references/action-input.md#focus-editable-targets-and-preventdefault) for action adapters rather than assuming every backend captures wheel or prevents scrolling. Remove listeners on disposal.

## Dynamic mesh

Use the [creation/update checklist](../../cocosair-primitives-mesh/references/common-mistakes.md#dynamic-mesh-creation-and-update-checklist), pair it with the [complete effect template](../../cocosair-materials-effects/references/custom-glsl.md#complete-minimal-effect-template) only if a custom shader is needed, then [frame the bounds](../../cocosair-camera/references/camera-projection.md#framing-a-generated-scene-before-tuning-its-appearance). First verify a few vertices and one update. Choose [batching](../../cocosair-performance/references/batching-routes.md) when actual workload measurements justify it; a missing draw is not a batching diagnosis.

For continuous deformation, go directly to the [Component.update(dt) example](../../cocosair-animation-tween/references/quick-start.md#per-frame-geometry-updates). For controlled captures, use the [step clock](../../cocosair-animation-tween/references/step-clock.md). The implementation loop and the capture clock serve different steps; a mesh animation alone does not require reading the tween/clip examples.

## Sky and environment

Choose [scene globals](../../cocosair-scene-graph/references/scene-globals.md) for skybox, fog and ambient configuration, [lighting units](../../cocosair-rendering/references/lighting-units.md) for exposure/physical magnitudes, and [camera framing](../../cocosair-camera/references/camera-projection.md) for scene scale. Confirm a readable scene with fog and extra effects disabled, then tune the environment incrementally. A dark frame does not identify a missing light, excessive fog or exposure on its own; compare the [symptom checks](visual-feedback.md#start-from-the-visible-symptom).
