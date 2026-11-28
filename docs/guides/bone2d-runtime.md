# Bone-2D runtime for Cocos AIR

**Status: playback, skin selection, mesh deformation, single- and two-bone IK, transform, slider, path, and physics constraints, not full Bone-2D parity.** Bone-2D remains the visual authoring tool. AIR consumes native Save Project JSON (`.bone2d` format/version 1) and the character JSON extracted from a Bone-2D v1.5 Web Game export; it does not run the editor, read Spine JSON/binary, or ship a Spine runtime. The inspected authoring baseline is [Bone-2D 30bee4a](https://github.com/iamgatz/Bone-2D/tree/30bee4a7e348107877707596e0b702f60dce5369).

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

Embedded static PNG, JPEG, WebP, and GIF pictures are checked for their format and dimensions before browser decoding. Import animated images as authored picture sequences; animated PNG, WebP and GIF containers are not implicit animation clocks. For an external libGDX atlas, use `loadAtlas` with an `AssetBank`, then pass `{ atlas }` to the player. Atlas regions must match the project's image names and original size. Rotated entries use the Bone-2D exporter convention by default; pass `atlasRotation: 'air'` for pages packed in AIR’s native clockwise convention. AIR owns embedded textures; the supplied atlas is borrowed and must outlive the player. `dispose()` is idempotent. Use `{ signal }` to cancel pending construction. The node’s destruction also releases the player resources; explicit disposal is recommended before closing the app or immediately releasing a borrowed atlas. Optional packaged ZIPs should first be extracted by the authoring/build tool.

For Web Game exports, extract and pass the character JSON (for example, `kit.json`), not the ZIP, its sample page, or `bone2d.js`. AIR derives dimensions from the embedded pictures and honors the export's `smooth` flag with linear mip filtering for AIR-owned textures. Missing images name the required asset in the error. When packaging uses relative image URLs, the host can provide verified embedded data URIs by name via `webGameImages: new Map([['picture', dataUri]])`. Untrusted paths from a file are never requested; AIR does not run the exported JavaScript. AIR provides its own player API; it does not execute or expose the exported player's JavaScript. See below for Web Game crossfading.

Use `player.play(id, { useSavedSettings: true })` to use the clip's saved loop, ping-pong, and playback range. Override them with `loop`, `pingPong`, and `range`; `speed` must be positive and `direction` may start at either endpoint. The legacy boolean overload still plays forward over the whole clip. `player.direction` reflects the next leg at a ping-pong turn. A reverse leg emits markers in descending time, preserving authoring order for ties; the turn marker is not repeated. A seek clamps to the current range without emitting events. Reverse playback starts physics from rest instead of integrating backward.

For native Save Project input, `player.crossfade(id, { duration, holdPrevious, playback })` uses the saved directed mix pair or default if no duration is specified. The old bone channels move toward the new ones via the shortest rotation arc. The new clip controls attachments, colors, deform, draw order and constraints from the start. `holdPrevious` keeps an unkeyed destination bone channel through the transition, then releases it at the end. Interrupting a fade uses the current mixed bone pose as its source; seeking ends the fade.

For Web Game input, `crossfade()` uses the destination’s saved playback range and a 0.2-second default. It blends light and dark slot colors, same-attachment deform, and continuous constraint inputs; attachments and draw order follow the destination, and IK switches change at half fade. Native Save Project preview retains its existing bone-only fade behavior.

Use `playNext(id, options)` to queue a clip after the current one-shot or loop round; a ping-pong round includes the return leg. It takes the same options as `crossfade`. Unused host time advances the incoming clip at its own speed. An immediate `play` or `crossfade` clears the queue; a pause or seek leaves it intact. A host-owned `onEnd` callback receives the ID once after a non-looping finish and after the frame pose has been applied. Loops do not trigger it. Imported markers still do not invoke code.

For live controls, `setAttachment(slotId, name)` pins a project attachment, `null` hides it, and `undefined` restores animation. `bone(id)` reads solved position, heading and tip length in player-root coordinates; `moveBone(id, x, y)` holds a Web Game target at that location until `releaseBone(id)`. `bounds()` measures active picture geometry in player-root coordinates before tint or stencil, not the opaque pixel box. `resetPhysics()` puts springs at rest without rewinding the clip, changing held bones or replaying markers.

`player.setLayers([{ id, weight, additive, loop, time }])` sets up to eight extra Preview layers over the main pose. Their clocks advance with the player and they only affect keyed bone channels and keyed light-color tracks. A non-additive layer switches its keyed attachment at weight 0.5 (and clears the slot's previous deformation); an additive layer does not switch it. Layer and outgoing clips do not emit markers. The separate slider constraint retains its own attachment switching rule.

For multi-skeleton files, omit `skeletonIndex` to select the saved active rig, or pass its zero-based index in editor order. `player.skeletonNames` lists that order. Rigid skin overlays use `player.setSkins(['overlay-id'])`; the first authored skin is the default, and the last distinct overlay adding an attachment wins. A clip's time and event cursor stay unchanged on skin changes. Only the selected skeleton is compiled. Skin-required bones are activated by the selected overlays and their listed bones’ ancestors. The fallback skin supplies attachments but does not activate bones by itself. Descendants of a skin-required bone are also skin-required; listing an ancestor alone does not activate those descendants. Slots on inactive bones do not draw or answer geometry queries. The pure sampler’s optional fourth argument takes the overlay IDs. Skin-required IK is enabled only when a selected overlay lists it and the target and first constrained bone are active. An inactive second bone still contributes its setup offset to the solve but does not render. Overlay changes recalculate the ordered constraints without rewinding playback.

Meshes use the AIR UI mesh renderer and can coexist with sprites in the same draw order. Weighted offsets are per influence. Meshes accept embedded images and trimmed or rotated atlas frames. For trimmed frames, triangles are cut at the original-image crop edges before remapping UVs, so removed transparent geometry does not stretch the cropped image. The trimmed mesh shader clamps base-level sampling to the packed texel centers to stop neighboring colors at antialiased edges. Use padded/extruded atlases for mipmapped pages. A cropped geometric edge may antialias differently from the transparent border of a full texture. Cut vertices follow the skinned and deformed source triangles. Expanding a crop can require several native UI draws; those draws preserve triangle order. The source attachment limit remains 1,024 vertices and 1,365 triangles. A page marked `pma: true` must be supplied with premultiplied RGB bytes. The player decodes the filtered sample before slot tint and blending and skips fully transparent texels. Straight and premultiplied pages may share a handle; no texture upload flags or caller-owned frames are changed. Linked meshes select their own image and tint while reusing source topology, with either shared or independent deform.

Numbered picture sequences select the setup frame until their first key, then use the authored hold, once, loop or ping-pong mode (including reverse modes). Supply every numbered image under its exact name as an embedded PNG or atlas frame. A skin override does not inherit a sequence timeline merely by sharing the attachment name. A linked mesh owns its own picture sequence even when it inherits deformation.

Use `player.getAttachmentGeometry(slotId)` to read the current point, bounding box, or path without drawing it. Results use the player's root coordinates (before the root's scene transform). The point's rotation is in degrees; bounding boxes return a packed polygon, and paths return packed in-handle/anchor/out-handle triplets plus the closed and constant-speed flags. Polygon and path vertices reflect skinning and the current deform keys. Visible images and empty slots return `null`. For world coordinates, apply the player's node transform. These queries read the solved pose, including IK and path following, without drawing geometry.

Clipping attachments are rendered with the AIR stencil mask. The mask starts after its own slot, applies through the named end slot (inclusive), and otherwise lasts through the remaining draw order. A second clipping attachment does not nest inside an active mask. Masks follow bone motion. By default the mask ignores its deform keys, matching the pinned editor; `{ deformClipping: true }` opts into the AIR extension that applies them. Concave simple outlines keep their shape; convex and inverse mode use the hull. Self-intersecting outlines have not been verified against Bone-2D's even-odd stencil renderer.

Slots support normal, additive, multiply and screen blending on both sprites and meshes with straight-alpha images. Additive blending accumulates destination alpha; the other modes attenuate it. Two-color tint uses the slot's setup dark RGB and keyed `rgba2` values, with independent state per slot. A sampled `rgba2` key takes precedence over the ordinary light `rgba` channels. Its dark channels apply only to slots with a setup dark color.

All five Bone-2D bone inheritance modes and setup/keyed shear are supported. Combined shear keys can be overridden on each axis by the corresponding split timeline. Rigid sprites retain their atlas UVs and trimming, even with a reflected or sheared basis. Sprites, mesh and clipping vertices, and attachment queries use the same root-relative transform for these rigs.

Two-bone IK follows the authored constraint order and accepts a parent followed by its direct child. Bend chooses the elbow side, softness eases the approach to full reach, and stretch may straighten the child's local offset even when the endpoint is already reachable. Like the pinned editor, AIR leaves chains with non-normal inheritance or no grandparent unsolved. Degenerate chains use finite fallback poses.

Transform constraints map one source property to one or more properties of each target bone in authored order. Source and target spaces are independent. World-source translation offsets follow the source basis; negative world-source headings read on the 0–360° branch. Mappings support offset, multiplier, ascending or descending clamping, and additive or absolute writes. Each target property has a separately keyed mix; later constraints read the edited pose.

Sliders sample a second animation at a keyed time or at a time driven by a bone property. A nonzero mix blends keyed values onto the current constrained pose and applies keyed attachment, picture, and draw-order changes discretely. Changing an attachment resets its picture to setup and keeps deformation only for a shared deform owner. Slider clips do not emit markers; only playback of the main clip does.

Path constraints follow the active path attachment in the target slot, including skin changes, weighted controls and vertex deform. They support fixed or percent position, fixed/length/percent/proportional spacing, and tangent/chain/chainScale rotation. Setup-distance mode retains setup curve measurement; constant-speed mode remeasures live geometry and approximates equal distances. Open curves extend along their endpoint tangents; closed curves wrap. AIR independently resolves decreasing station values instead of reusing a forward-only lookup, so negative spacing farther back on the path can differ from the pinned editor.

Physics constraints maintain separate fixed-step spring state per player. Authored channel weights affect translation, rotation, X scale and X shear; Y scaling may stay unchanged, follow X, or preserve area. The parameter tracks can target one constraint or all active constraints that opted into that parameter. A global reset restarts **all active** constraints regardless of those flags. Named resets restart only the named active constraint. Reset keys cross on `(previous, current]` in each part of a wrap and never emit host markers. Skin deactivation drops that constraint's history. Earlier sliders blend spring parameters (only wind and gravity are additive); resets come from the playing clip, not driven slider clips.

A newly played clip, `seek()`, and an advance longer than 0.25 s start spring state at rest. A pause or same-time attachment query does not integrate. The pure sampler always returns the unconstrained-by-physics pose and sampled spring parameters. The solver is AIR-owned. Web Game angular-only springs at ordinary stiffness track the prior displayed tip direction and interpolate the most recent fixed-step batch. Native Save Project and combined translation/scaling constraints retain the existing bounded spring solver; post-reset, hitch, unusually stiff and combined endpoint-motion responses can differ. AIR limits simulation to positive FPS up to 240 and uses a stable implicit integration step for unusually stiff springs.

## Full runtime acceptance matrix

A native project must either play with its intended semantics or report a specific unsupported feature. Silently dropping a runtime feature is not compatibility. Editor-only fields (selection, locks, guides, notes, viewport) do not affect exported runtime state.

| Capability                                                                                               | Milestone                 | Required acceptance                                                                                                    |
| -------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Native project v1, stable references, load/rollback, embedded and atlas textures                         | R0 rigid                  | Valid project and invalid reference/version cases; visual and resource checks                                          |
| Hierarchical normal-inheritance TRS, rigid attachments, slot swaps and RGBA, draw order, timeline easing | R0 rigid                  | Setup and multiple sampled poses; rendered overlap order; nonuniform-scale affine control                              |
| Playback, pause, seek, loop, typed events                                                                | R0 rigid                  | Boundary/hitch/wrap order; seek silent; renamed label keeps host binding                                               |
| Multi-skeleton selection, rigid skin composition                                                         | R0 extension              | Select saved/indexed skeleton; verify fallback, overlay order and skin swap during playback                            |
| Skin-required bones                                                                                      | R1 skin slice             | Activate a listed descendant and its required ancestors, at unchanged time and marker cursor                           |
| Skin-required IK                                                                                         | Implemented               | Overlay membership and active target; same-time resampling                                                             |
| Picture sequences                                                                                        | R1 sequence slice         | Exact frames in all seven modes; skin swaps; linked mesh alongside shared deform                                       |
| Weighted and unweighted meshes, linked meshes, vertex and influence deform                               | R1 geometry slice         | Compare root-space positions to independent controls, and pixels before/after deformation                              |
| Point, path and bounding-box attachment queries                                                          | R1 query slice            | Verify coordinate frames, deform, active skin/slot selection and no draw                                               |
| Clipping attachments (simple outlines)                                                                   | R1 geometry parity        | Test the inclusive end slot, weights/deform, convex and inverse masks and absence of unintended draws                  |
| Draw-order folders                                                                                       | R1 pose slice             | Demonstrate folder swaps that preserve surrounding slot seats                                                          |
| Shear tracks and all inheritance modes                                                                   | R1 pose parity            | Mirrored/nonuniform nested rig with exact transformed positions                                                        |
| Setup and animated two-color tint                                                                        | R1 color slice            | Separate dark slot colors before and after keys over a fractional-alpha texture                                        |
| Normal/additive/multiply/screen blend factors                                                            | R1 blend slice            | Compare all RGBA channels on a partially transparent native target; neighboring modes stay independent                 |
| Premultiplied atlas texture alternatives                                                                 | R1 rendering parity       | Image format, upload and texture-release controls                                                                      |
| Web Game v1.5 character JSON, static PNG/JPEG/WebP/GIF                                                   | Asset import implemented  | PNG export consumed, paired filter pixels, named missing/linked image rejection and host override                      |
| Single-bone IK                                                                                           | Implemented               | Authored order, mix keys, compression/stretch flags and Y scale modes; shared solved pose                              |
| Two-bone IK                                                                                              | Implemented               | Off-axis joint, signed and nonuniform scale, bend/softness keys, joint and tip agreement in the rendered pose          |
| Transform constraints                                                                                    | Implemented               | Local/world cross-property mapping, signed transforms, channel mixes, and ordered interaction with IK                  |
| Slider constraints                                                                                       | Implemented               | Authored order, manual and driven time, signed scale blending and linked attachment/sequence/deform switches           |
| Path constraints                                                                                         | Implemented               | Both speed modes, live skinning, closed wrap, open extension and visible followers; reverse lookup behavior documented |
| Physics constraints                                                                                      | Implemented, limits noted | Fixed-step pose, force/torque/stretch, global and named routing, skin transitions, with documented cadence differences |
| Crossfades, extra tracks, playback range and ping-pong                                                   | Implemented               | Saved settings, marker boundaries, short-arc / Hold Previous blending, visible switch thresholds and interruption      |
| Lifecycle across several active players                                                                  | R3 sign-off               | Real workload performance and independent resources across instances                                                   |
| Latest compatible editor project corpus and real workloads                                               | R3 sign-off               | Browser/device matrix and editor-reference results for every supported field; documented format/version limits         |

Compare AIR results against the pinned authoring runtime with independent fixtures. Keep the implementation independent of editor/Spine code and verify file-level provenance before adopting any third-party implementation. The lightweight R0 UI nodes are not a performance representation of weighted/cropped meshes. No full-parity or Spine license claim is made by this milestone.

## Focused verification

```sh
npm test -- --runInBand test/smoke/air-bone2d.test.ts
npm run build
node tools/verify/air-bone2d-browser.cjs webkit /tmp/bone2d-fresh.json
```

The browser probe serves a synthetic two-bone authoring-format fixture with embedded PNGs, asserts real WebGL2 render pixels and affine transforms, checks event timing and releases resources. It does not update canonical example evidence or establish WebGPU/physical-device support.

## Real Kit export pixel gate

Run the comparable WebGL 2 canvas check after building AIR's development SDK. In a separate local checkout of the original Bone-2D repository, check out `34a5fecd89428b84a1030d4a017d313a192eeb8a` (v1.5) and install its locked development dependencies. The gate needs Node.js, Playwright Chromium and `unzip`; it does not add CI jobs or bundle the editor.

```sh
npm run build
NODE_PATH=<playwright-node_modules> AIR_CHROMIUM_PATH=<chrome-headless-shell> \
  node tools/verify/air-bone2d-kit.cjs <pinned-editor-checkout> <new-evidence-dir>
```

The gate generates a fresh real Web Game ZIP with the editor and loads only its character JSON in AIR. It compares all 198 frames of idle, walk, wave and jump at 30 Hz on matching transparent, antialiased WebGL 2 canvases. A visible pixel differs if any premultiplied RGBA channel differs by more than 6; every frame must stay below 0.2%. The gate also compares 12 paired controls with springs removed from both inputs. Keep the export, source-bound receipt and raw pixels together; they are evidence, not redistributable fixtures. The matching canvas test does not assert that a single-sample RenderTexture and a multisampled canvas have the same edges, or that all exporters and spring channel combinations have been covered.
