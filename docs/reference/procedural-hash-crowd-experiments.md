# Optional procedural hash and crowd pose experiments

Two isolated probes from the 2026-11-18 engine review. Neither changes CocosAirJS APIs, existing shader programs, benchmark baselines, or engine defaults.

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

Do not ship this geometric rule as production animation culling. This first pass does not cover real shadow-only actors, animation events, motion continuity between readbacks, arbitrary animated bounds, or hardware performance. Add shadow/event fixtures and repeated physical-device measurements before considering a policy. No hidden animation update is skipped in the actual engine.

Report files are new paths only; these are focused probes and never update canonical Gallery or benchmark evidence.
