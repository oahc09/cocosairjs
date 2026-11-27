# Bone-2D runtime for Cocos AIR

**Status: playback, skin selection, mesh deformation, single- and two-bone IK, and transform constraints, not full Bone-2D parity.** Bone-2D remains the visual authoring tool. AIR consumes the native Save Project JSON (`.bone2d` format/version 1); it does not run the editor, read Spine JSON/binary, or ship a Spine runtime. The inspected authoring baseline is [Bone-2D 30bee4a](https://github.com/iamgatz/Bone-2D/tree/30bee4a7e348107877707596e0b702f60dce5369).

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

For multi-skeleton files, omit `skeletonIndex` to select the saved active rig, or pass its zero-based index in editor order. `player.skeletonNames` lists that order. Rigid skin overlays use `player.setSkins(['overlay-id'])`; the first authored skin is the default, and the last distinct overlay adding an attachment wins. A clip's time and event cursor stay unchanged on skin changes. Only the selected skeleton is compiled. Skin-required bones are activated by the selected overlays and their listed bones’ ancestors. The fallback skin supplies attachments but does not activate bones by itself. Descendants of a skin-required bone are also skin-required; listing an ancestor alone does not activate those descendants. Slots on inactive bones do not draw or answer geometry queries. The pure sampler’s optional fourth argument takes the overlay IDs. Skin-required IK is enabled only when a selected overlay lists it and the target and first constrained bone are active. An inactive second bone still contributes its setup offset to the solve but does not render. Overlay changes recalculate the ordered constraints without rewinding playback.

Meshes use the AIR UI mesh renderer and can coexist with sprites in the same draw order. Weighted offsets are per influence. Use embedded PNGs or untrimmed atlas regions for meshes. This stage accepts at most 1,024 vertices and 1,365 triangles per attachment; trimmed mesh atlases and chunking larger meshes remain open. Linked meshes select their own image and tint while reusing source topology, with either shared or independent deform.

Numbered picture sequences select the setup frame until their first key, then use the authored hold, once, loop or ping-pong mode (including reverse modes). Supply every numbered image under its exact name as an embedded PNG or atlas frame. A skin override does not inherit a sequence timeline merely by sharing the attachment name. A linked mesh owns its own picture sequence even when it inherits deformation.

Use `player.getAttachmentGeometry(slotId)` to read the current point, bounding box, or path without drawing it. Results use the player's root coordinates (before the root's scene transform). The point's rotation is in degrees; bounding boxes return a packed polygon, and paths return packed in-handle/anchor/out-handle triplets plus the closed and constant-speed flags. Polygon and path vertices reflect skinning and the current deform keys. Visible images and empty slots return `null`. For world coordinates, apply the player's node transform. The API returns the solved pose, including IK. It does not draw a mask or run a path constraint.

Clipping attachments are rendered with the AIR stencil mask. The mask starts after its own slot, applies through the named end slot (inclusive), and otherwise lasts through the remaining draw order. A second clipping attachment does not nest inside an active mask. Masks follow bone motion. By default the mask ignores its deform keys, matching the pinned editor; `{ deformClipping: true }` opts into the AIR extension that applies them. Concave simple outlines keep their shape; convex and inverse mode use the hull. Self-intersecting outlines have not been verified against Bone-2D's even-odd stencil renderer.

Slots support normal, additive, multiply and screen blending on both sprites and meshes with straight-alpha images. Additive blending accumulates destination alpha; the other modes attenuate it. Two-color tint uses the slot's setup dark RGB and keyed `rgba2` values, with independent state per slot. A sampled `rgba2` key takes precedence over the ordinary light `rgba` channels. Its dark channels apply only to slots with a setup dark color.

All five Bone-2D bone inheritance modes and setup/keyed shear are supported. Combined shear keys can be overridden on each axis by the corresponding split timeline. Rigid sprites retain their atlas UVs and trimming, even with a reflected or sheared basis. Sprites, mesh and clipping vertices, and attachment queries use the same root-relative transform for these rigs.

Two-bone IK follows the authored constraint order and accepts a parent followed by its direct child. Bend chooses the elbow side, softness eases the approach to full reach, and stretch may straighten the child's local offset even when the endpoint is already reachable. Like the pinned editor, AIR leaves chains with non-normal inheritance or no grandparent unsolved. Degenerate chains use finite fallback poses.

Transform constraints map one source property to one or more properties of each target bone in authored order. Source and target spaces are independent. World-source translation offsets follow the source basis; negative world-source headings read on the 0–360° branch. Mappings support offset, multiplier, ascending or descending clamping, and additive or absolute writes. Each target property has a separately keyed mix; later constraints read the edited pose.

## Full runtime acceptance matrix

A native project must either play with its intended semantics or report a specific unsupported feature. Silently dropping a runtime feature is not compatibility. Editor-only fields (selection, locks, guides, notes, viewport) do not affect exported runtime state.

| Capability                                                                                               | Milestone           | Required acceptance                                                                                            |
| -------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Native project v1, stable references, load/rollback, embedded and atlas textures                         | R0 rigid            | Valid project and invalid reference/version cases; visual and resource checks                                  |
| Hierarchical normal-inheritance TRS, rigid attachments, slot swaps and RGBA, draw order, timeline easing | R0 rigid            | Setup and multiple sampled poses; rendered overlap order; nonuniform-scale affine control                      |
| Playback, pause, seek, loop, typed events                                                                | R0 rigid            | Boundary/hitch/wrap order; seek silent; renamed label keeps host binding                                       |
| Multi-skeleton selection, rigid skin composition                                                         | R0 extension        | Select saved/indexed skeleton; verify fallback, overlay order and skin swap during playback                    |
| Skin-required bones                                                                                      | R1 skin slice       | Activate a listed descendant and its required ancestors, at unchanged time and marker cursor                   |
| Skin-required IK                                                                                         | Implemented         | Overlay membership and active target; same-time resampling                                                     |
| Picture sequences                                                                                        | R1 sequence slice   | Exact frames in all seven modes; skin swaps; linked mesh alongside shared deform                               |
| Weighted and unweighted meshes, linked meshes, vertex and influence deform                               | R1 geometry slice   | Compare root-space positions to independent controls, and pixels before/after deformation                      |
| Point, path and bounding-box attachment queries                                                          | R1 query slice      | Verify coordinate frames, deform, active skin/slot selection and no draw                                       |
| Clipping attachments (simple outlines)                                                                   | R1 geometry parity  | Test the inclusive end slot, weights/deform, convex and inverse masks and absence of unintended draws          |
| Draw-order folders                                                                                       | R1 pose slice       | Demonstrate folder swaps that preserve surrounding slot seats                                                  |
| Shear tracks and all inheritance modes                                                                   | R1 pose parity      | Mirrored/nonuniform nested rig with exact transformed positions                                                |
| Setup and animated two-color tint                                                                        | R1 color slice      | Separate dark slot colors before and after keys over a fractional-alpha texture                                |
| Normal/additive/multiply/screen blend factors                                                            | R1 blend slice      | Compare all RGBA channels on a partially transparent native target; neighboring modes stay independent         |
| Premultiplied texture alternatives and additional image formats                                          | R1 rendering parity | Image format, upload and texture-release controls                                                              |
| Single-bone IK                                                                                           | Implemented         | Authored order, mix keys, compression/stretch flags and Y scale modes; shared solved pose                      |
| Two-bone IK                                                                                              | Implemented         | Off-axis joint, signed and nonuniform scale, bend/softness keys, joint and tip agreement in the rendered pose  |
| Transform constraints                                                                                    | Implemented         | Local/world cross-property mapping, signed transforms, channel mixes, and ordered interaction with IK          |
| Slider, path and physics constraints                                                                     | R2 solver parity    | Pinned pure solver differential checks, including constraint order, reset and fixed-step advance               |
| Crossfades, mixed tracks, playback range and ping-pong, lifecycle across several instances               | R2 playback parity  | Blend/interrupt/control cases; isolated events and resources; real-browser performance and lifecycle tests     |
| Latest compatible editor project corpus and real workloads                                               | R3 sign-off         | Browser/device matrix and editor-reference results for every supported field; documented format/version limits |

Compare AIR results against the pinned authoring runtime with independent fixtures. Keep the implementation independent of editor/Spine code and verify file-level provenance before adopting any third-party implementation. The lightweight R0 UI nodes are not a performance representation of weighted/cropped meshes. No full-parity or Spine license claim is made by this milestone.

## Focused verification

```sh
npm test -- --runInBand test/smoke/air-bone2d.test.ts
npm run build
node tools/verify/air-bone2d-browser.cjs webkit /tmp/bone2d-fresh.json
```

The browser probe serves a synthetic two-bone authoring-format fixture with embedded PNGs, asserts real WebGL2 render pixels and affine transforms, checks event timing and releases resources. It does not update canonical example evidence or establish WebGPU/physical-device support.
