# Pinned Three.js WebGPU timestamp pool: Dawn software control

This opt-in check runs the actual pre-/post-batching query pools from
[the isolated lock](../../tools/benchmark/upstream/three-experiment-2026-11-18.json)
with a timestamp-query-capable software Dawn device. It does not start a browser,
run either renderer's full animation loop, measure hardware performance, or
modify the protected Three.js reference, Agent scores, defaults, or goldens.

## Run

Use clean Git source checkouts at `57ffc61a36d3d1cea5f2064dd212ce162acf7087`
and `0d2bd4858657f02c7ef14e988ee585cf0574cafd` ([Three.js #35519](https://github.com/mrdoob/three.js/pull/35519)).
A sparse shallow partial checkout retaining `/src/` and `/package.json` is sufficient.
Use the repo's esbuild dependency and an already-installed official WebGPU for Node
module `webgpu@0.6.2`. No upstream bundles are consumed or vendored.
Point Vulkan at a software implementation that exposes `timestamp-query`; the
tested environment used Chromium's SwiftShader 5.0.0 Vulkan ICD.

```sh
VK_ICD_FILENAMES=/path/to/vk_swiftshader_icd.json \
  node tools/benchmark/upstream/three-timestamp-dawn.mjs \
  --before=/path/to/three-before --after=/path/to/three-after \
  --dawn=/path/to/node_modules/webgpu/index.js --out=output/three-dawn-new
```

The output path must not already exist. The probe checks both exact commits,
matches consumed source bytes against their Git blobs, emits bundles and build
metadata, and records raw begin/end timestamps in `result.json`. A missing feature,
wrong adapter class, validation errors, lost queries, or an incomplete drain fails
rather than substituting zeros or silently using another backend.

## Interpret

The host submits five real render/compute passes in one logical frame with a
four-query-slot pool capacity, then pumps the exact old or new resolver during a
bounded drain without more measured work. The two legacy pools can have two maps
pending globally. The new shared pool maps three batches of 32, 32, and 16 bytes,
one map at a time, and resolves its timer only after all five pairs are read. The
diagnostic instruments the real readbacks and matches each pair by logical pass,
not by slot number alone; slots can be reused.

Pass duration sum is the sum of the five end-minus-begin intervals. Elapsed
span is earliest measured begin to latest measured end, including gaps. Sixteen
untimed compute passes form a gap control between the second and third measured
passes. The old pool's latest-frame sum and the new end-to-end timer are not
interchangeable. This harness derives both from paired timestamps, in integer
nanoseconds, before converting the new API value to compare it with the span.
Equal endpoints are retained as quantized samples, not treated as lost rows or
as evidence of a zero-cost pass. If sum and span cannot be distinguished at adapter
precision, the duration observation stays inconclusive.

Observed counts, overlap and matching are software queue/lifecycle evidence for this
stress case only. Native browser WebGPU, physical GPU performance, elapsed-frame
timing, display presentation, and Cocos/Three benchmark scoring remain unverified.
