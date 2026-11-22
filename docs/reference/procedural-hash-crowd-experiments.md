# Optional procedural hash and crowd pose experiments

Isolated probes from the 2026-11-18 engine review. None changes CocosAirJS APIs, existing shader programs, benchmark baselines, or engine defaults.

## 07. Procedural texture integer hash

```sh
node tools/verify/procedural-uint-hash.cjs webkit /tmp/air-procedural-hash-webkit.json
```

This direct WebGL2/GLSL ES 3.00 experiment draws four fixed seeds (`0`, `1`, `2³¹`, and `2³²−1`) into a 64×64 RGBA8UI texture. It compares every byte with an independent CPU `Math.imul`/unsigned-shift oracle and then repeats the draw to check determinism. Integer storage and integer readback isolate the hash from color conversion, dithering, filtering, and normalized framebuffer rounding. The `sin`-based sample is a separate comparator, not an identical image target; its illustrative seed mapping retains only 16 bits. A digest mismatch between algorithms is expected and not a quality verdict.

GPU costs are separate disjoint-safe elapsed-query batches, and are omitted when unavailable or invalid. They measure repeated draw batches in this tiny workload, not ordinary frame duration. Compare at least two independently identified _physical_ devices before concluding portability; matching browsers or masked renderer strings do not imply a second GPU. Same integer results do not certify perceptual distribution, WGSL, or parity for an existing material. No new material opts in yet.

## 08. Scripted native crowd pose

```sh
node tools/verify/crowd-pose-browser.cjs webkit /tmp/air-crowd-pose-webkit.json
```

Use `--bundle=output/<candidate>/cocosair.module.js` to test a newly built SDK instead of the default `build/cocosair.module.js`. An explicit candidate requires a matching compiler-map source receipt, and the collector checks the actual module response bytes. Both modes require matching Playwright/browser tooling and a real WebGL2 context. The collector records bundle and fixture hashes. It uses 200 native instances of one authored glTF skinned primitive and samples the existing Cocos animation clip through public APIs. Two warmups, then an ABBA replay, compare all-actor sampling with a conservative camera-neighborhood selection. Both use the same absolute time and camera path; reentry must not produce stale visible pixels at sampled first/last frames of each segment. Non-blank and changing RGBA hashes, zero WebGL errors, nonzero reentries, and fewer clip samples must all hold. CPU P95 is pose sampling only, and excludes selection, GPU and readback; these samples are diagnostic only and do not establish a speedup.

The 200-actor experiment does not include shadow-only actors or animation events. Run these cases separately against a matching, explicit candidate bundle:

```sh
node tools/verify/crowd-pose-events-browser.cjs webkit /tmp/air-crowd-events.json output/<candidate>/cocosair.module.js
node tools/verify/crowd-pose-shadow-browser.cjs webkit /tmp/air-crowd-shadow output/<candidate>/cocosair.module.js
```

- **Events:** scheduled looping playback checks each marker's exact step across wrap boundaries. The conservative reference policy keeps event-bearing clips on full native playback. Skipping off-camera samples can delay delivery even if the total count matches.
- **Shadows:** the authored skin uses only the skeletal track and an opaque lit material with a shadow-caster pass. The engine verifies its bounds are outside the camera frustum, inside the fixed-area directional light frustum, and admitted by the layer mask without hiding the actor. The receiver region must change with casting and between poses, while a nearby reference region stays stable. Camera-only skipping must preserve the stale shadow and diverge from full sampling. The shadow-aware fixture policy must preserve the newer shadow and match the first frame after reentry byte for byte. The collector saves both raw RGBA crops and a hashed report to a new output directory.

Do not ship the fixture rules as a production scheduler. These correctness checks do not cover animated bounds crossing the light frustum between samples, cascades, morph shadows, motion continuity between readbacks, or hardware performance. No hidden animation update is skipped in the actual engine.

Report files are new paths only; these are focused probes and never update canonical Gallery or benchmark evidence.
