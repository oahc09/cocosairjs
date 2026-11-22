# WebGPU partial clear: Dawn software diagnostic

The browser acceptance test is `tools/verify/webgpu-partial-color-clear-browser.cjs`.
The optional Dawn diagnostic is complementary, not a replacement. It extracts
the committed clear helper and render-pass methods with the TypeScript parser,
supplies minimal host-side framebuffer and resource-lifecycle doubles, and runs
the resulting commands on a real Dawn Vulkan device. It checks every texel of
two 4×4 color attachments across mixed CLEAR/LOAD, A→B→A framebuffer reuse,
LOAD/LOAD, and a native full-area HDR reference. A separate RGBA32Uint /
RGBA32Sint pair verifies both mixed directions and LOAD/LOAD with raw signed and
unsigned readback, preserving the 12 outside texels and exercising values above
float32's exact integer range and near both 32-bit limits. The SwiftShader
diagnostic cross-checks every integer native readback with the committed Cocos
byte-row copy path, including padded strides and guarded offsets; host lifecycle
doubles remain in use. It neither loads the browser
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

## Bundled browser lanes

Use a fresh source-bound CocosAirJS bundle inside the checkout (with its adjacent
source map and source receipt). The original float probe remains the default.
Run the integer probe separately so lack of integer coverage cannot overwrite a
float result:

```sh
node tools/verify/webgpu-partial-color-clear-browser.cjs --browser=chromium --headed=1 --bundle=output/pr21-rebuilt/cocosair.module.js > mrt-float.json
node tools/verify/webgpu-partial-color-clear-browser.cjs --browser=chromium --headed=1 --bundle=output/pr21-rebuilt/cocosair.module.js --lane=integer > mrt-integer.json
```

The integer lane uses the engine's public texture/render-pass/readback path for
sample-1 RGBA32Uint and RGBA32Sint, with exactly 32 attachment bytes per sample.
It checks all 16 pixels of each attachment after full native seeding, both mixed
partial CLEAR/LOAD directions, and a partial LOAD/LOAD preservation control.
The signed and unsigned destinations use independent 32-bit typed views and
expect exact odd integers above the float32 precision boundary. The JSON names
the lane, adapter, source binding, fetched bundle hash and raw values. Exit 2 is BLOCKED (no adapter
or unsupported integer attachment pair); validation/pixel mismatch is a failure,
not BLOCKED. A Dawn source-bridge or CPU test does not substitute for either
browser result or establish physical-hardware coverage.
