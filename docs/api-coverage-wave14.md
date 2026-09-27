# API coverage Wave 14 — Animation lifecycle, clips, and tween system

Wave 14 adds **30 verified Important units with 0 removals** against Wave 13. The planned animation/tween probes cover 29 units; trace improvements also promote the already-claimed `EffectAsset.shaders` unit.

## Scope and implementation

`anim-position` now verifies the `Animation` lifecycle (`playOnLoad`, `EventType`, `onLoad`, `start`, `onEnable`, `onDisable`, `onDestroy`) through a real `Animation` subclass and component lifecycle. Its clip contract covers `AnimationClip.WrapMode`, sprite-frame clip construction, `sample`, `speed`, `wrapMode`, `isAdditive_experimental`, `onLoaded`, and the complete experimental auxiliary-curve add/read/rename/remove lifecycle.

`tween-basic` now constructs `Tween` directly and exercises `TweenSystem` construction, ID, runtime instance, action manager, and update. `model-character-interaction` now reads clip wrap mode after setting it, so the loaded `GLTFAsset.animations` case has direct read evidence too.

API trace now registers own data fields for `Animation`, `AnimationClip`, and `EffectAsset`; it instruments registered instances inside arrays returned by traced getters/functions. This observes the `AnimationClip[]` returned by `GLTFAsset.animations` without patching arbitrary component method receivers.

## Evidence

The canonical V1.1 browser run passed 140/140 (1 promoted, 0 demoted), with 4,053 verified API/example bindings, 66 attested, and 0 unproven. The V1.1 candidate remains `7f3b89f6ac076cbf`. DevTools passed 5/5 with the runtime bundle boundary passing. Gallery passed 216/216 with 145 examples and 50 lifecycle contracts.

Strict specification validation remains 145/145 frozen. Compliance remains 0 failures / 1 documented Draco decoder-availability warning. The V1.2 matrix remains 39/39 on the current engine bundle and contract. Typecheck, format, trace self-test, test inventory, and documentation-reference checks passed.

## Coverage and release status

Important coverage increased from 165/272 to **195/272 (71.7%)**, a net gain of 30 and no removals. Core remains 963/963 (100%), and Advanced remains 149/3,130 (4.8%). Important has 77 unverified units still needing either behavior proof or an explicit status. Advanced has 2,981 uncovered units and remains the dominant release blocker.

Next, close the remaining Important groups: skinned/skeletal runtime APIs, UI Widget/renderer lifecycle, cube textures, and the remaining EffectAsset surface. Preserve all coverage thresholds.
