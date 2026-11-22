# WebGPU partial clear: Dawn software diagnostic

The browser acceptance test is `tools/verify/webgpu-partial-color-clear-browser.cjs`.
The optional Dawn diagnostic is complementary, not a replacement. It extracts
the committed clear helper and render-pass methods with the TypeScript parser,
supplies minimal host-side framebuffer and resource-lifecycle doubles, and runs
the resulting commands on a real Dawn Vulkan device. It checks every texel of
two 4×4 color attachments across mixed CLEAR/LOAD, A→B→A framebuffer reuse,
LOAD/LOAD, and a native full-area HDR reference. It neither loads the browser
bundle nor verifies a physical GPU, canvas, swapchain, or full engine lifetime.

Use a separate installation of the official `webgpu@0.6.2` npm package.
It is deliberately not a project dependency or a default CI requirement.
For a software lane, point the process at an existing trusted software
Vulkan ICD and confirm that the reported adapter is a fallback device:

```sh
VK_ICD_FILENAMES=/path/to/software_icd.json node \
  tools/verify/webgpu-partial-color-clear-dawn.cjs \
  --dawn-module=/path/to/node_modules/webgpu/index.js > mrt-dawn.json
```

The JSON records the adapter, fallback status, Dawn package and native add-on
fingerprint, source file digests, and raw attachment readbacks. Exit 2 means no
adapter; exit 1 means failure. A successful software readback cannot close the
separate native browser gate.
