# Finite component observation review

This independent Python consumer rechecks retained observations from two actual Node/Jest/JSDOM HEADLESS executions, `lifecycle-b` and `lifecycle-lead-a`, against their 84 named frozen input files. Those executions use AIR source checkpoint d and the qualified l2 Release WASM. Later e/f adapter changes are not covered by relabelling these results.

The consumer derives compound mass centroid and principal inertia from the declared box/sphere dimensions and the parallel-axis theorem. It independently calculates 60 four-substep semi-implicit Euler samples for initial height 20 m and gravity -6 m/s². Maximum recorded position error is 0.000005392 m. It compares six physical checkpoint payloads exactly between the two executions and verifies distinct component-owner and final world/module release boundaries. Before final world destruction, allocator/scratch bytes remain; after native teardown the recorded owned core/bridge counters are zero. General runtime and shared caches remain retained.

`controls.json` records one positive review and ten deliberately modified-data rejections. They are verifier controls, not ten additional physics executions. The original application attempts, fixture bytes and raw observations remain unchanged in their source directories. No browser/GPU, global zero-memory, T10/T11/C36, public feature activation, or complete acceptance claim follows from this finite check.

Reproduce using Python 3 and the two recorded source directories:

- `tools/verify/box3d/component-observation-review.py <lifecycle-b-directory> <lifecycle-lead-a-directory>`
- `tools/verify/box3d/component-observation-review.test.py <lifecycle-lead-a-directory>/native-and-app.raw.json`
