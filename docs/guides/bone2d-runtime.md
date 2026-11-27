# Bone-2D runtime for Cocos AIR

**Status: rigid-player and skin selection milestones, not full Bone-2D parity.** Bone-2D remains the visual authoring tool. AIR consumes the native Save Project JSON (`.bone2d` format/version 1); it does not run the editor, read Spine JSON/binary, or ship a Spine runtime. The inspected authoring baseline is [Bone-2D 30bee4a](https://github.com/iamgatz/Bone-2D/tree/30bee4a7e348107877707596e0b702f60dce5369).

## Play a project

Use this after the AIR app and a UI canvas have been initialized:

```ts
const response = await fetch('./clawbot.bone2d');
if (!response.ok) throw new Error('Cannot load Clawbot');
const player = await createAirBone2dPlayer(uiRoot, await response.text());
player.play('idle', true); // use the stable animation ID, not its display label

// Your frame callback supplies elapsed seconds:
function update(dt: number) {
    for (const marker of player.advance(dt)) {
        if (marker.id === 'ev-impact') showImpactFlash();
    }
}

// On input: player.play('attack');
// For preview: player.pause(); player.seek(0.5);
// On scene teardown, before releasing the atlas: player.dispose();
```

`parseBone2dProject` and `sampleBone2dProject` are usable without a browser and return the validated data and pose. The player renders through AIR UI sprites and uses the caller's clock. Time zero fires on the first positive advance; thereafter forward playback emits markers in `(previous, next]`. A loop boundary finishes the old iteration before its new time-zero markers. Seek does not emit markers. The host alone binds stable IDs to effects, audio assets, or other behavior. Imported method names and audio paths never execute or load.

Embedded PNGs are decoded without following external paths. For an external libGDX atlas, use `loadAtlas` with an `AssetBank`, then pass `{ atlas }` to the player. Atlas regions must match the project's image names and original size. Rotated entries use the Bone-2D exporter convention by default; pass `atlasRotation: 'air'` for pages packed in AIR’s native clockwise convention. AIR owns embedded textures; the supplied atlas is borrowed and must outlive the player. `dispose()` is idempotent. Use `{ signal }` to cancel pending construction. The node’s destruction also releases the player resources; explicit disposal is recommended before closing the app or immediately releasing a borrowed atlas. Optional packaged ZIPs should first be extracted by the authoring/build tool.

For multi-skeleton files, omit `skeletonIndex` to select the saved active rig, or pass its zero-based index in editor order. `player.skeletonNames` lists that order. Rigid skin overlays use `player.setSkins(['overlay-id'])`; the first authored skin is the default, and the last distinct overlay adding an attachment wins. A clip's time and event cursor stay unchanged on skin changes. Only the selected skeleton is compiled. Skin-required bones and constraints are not implemented yet.

## Full runtime acceptance matrix

A native project must either play with its intended semantics or report a specific unsupported feature. Silently dropping a runtime feature is not compatibility. Editor-only fields (selection, locks, guides, notes, viewport) do not affect exported runtime state.

| Capability                                                                                                         | Milestone                | Required acceptance                                                                                            |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Native project v1, stable references, load/rollback, embedded and atlas textures                                   | R0 rigid                 | Valid project and invalid reference/version cases; visual and resource checks                                  |
| Hierarchical normal-inheritance TRS, rigid attachments, slot swaps and RGBA, draw order, timeline easing           | R0 rigid                 | Setup and multiple sampled poses; rendered overlap order; nonuniform-scale affine control                      |
| Playback, pause, seek, loop, typed events                                                                          | R0 rigid                 | Boundary/hitch/wrap order; seek silent; renamed label keeps host binding                                       |
| Multi-skeleton selection, rigid skin composition                                                                   | R0 extension             | Select saved/indexed skeleton; verify fallback, overlay order and skin swap during playback                    |
| Skin-required bones and constraints, picture sequences                                                             | R1 attachment parity     | Animate each legal selection; exact slot/texture/sequence frames                                               |
| Mesh weights, linked meshes, per-vertex/per-influence deform, clipping, point/path/bounding-box attachment queries | R1 geometry parity       | Editor-reference vertices, indices and UVs; clipping outside pixels; absence of unintended draws               |
| Shear tracks, all inheritance modes, draw-order folders and two-color tint                                         | R1 pose and color parity | Mirrored/nonuniform nested rig; folder ordering; color and alpha pixel controls                                |
| Normal/additive/multiply/screen blends, alpha/premultiply handling, image formats supported by the pinned editor   | R1 rendering parity      | Composited native pixel comparisons; image failure and texture-release controls                                |
| IK, transform, sliders, path and physics constraints                                                               | R2 solver parity         | Pinned pure solver differential checks, including constraint order, reset and fixed-step advance               |
| Crossfades, mixed tracks, playback range and ping-pong, lifecycle across several instances                         | R2 playback parity       | Blend/interrupt/control cases; isolated events and resources; real-browser performance and lifecycle tests     |
| Latest compatible editor project corpus and real workloads                                                         | R3 sign-off              | Browser/device matrix and editor-reference results for every supported field; documented format/version limits |

To extend past R0, compare the reusable MIT authoring solver against AIR output before adding a second independent full solver. Keep it separate from React and editor WebGL, and verify any imported notice and dependency provenance. The lightweight R0 UI nodes are not a performance representation of weighted/cropped meshes. No full-parity or Spine license claim is made by this milestone.

## Focused verification

```sh
npm test -- --runInBand test/smoke/air-bone2d.test.ts
npm run build
node tools/verify/air-bone2d-browser.cjs webkit /tmp/bone2d-fresh.json
```

The browser probe serves a synthetic two-bone authoring-format fixture with embedded PNGs, asserts real WebGL2 render pixels and affine transforms, checks event timing and releases resources. It does not update canonical example evidence or establish WebGPU/physical-device support.
