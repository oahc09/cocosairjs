# Small interactive consumer kit

These are generated copies of five repository examples, shipped with the manual in the local npm tarball. Author sources live under examples/<id>. manifest.json binds every copied source byte, including the shared lifecycle runtime and declarations. The independent consumer receipt binds the actual installed SDK and tarball; source copies do not carry build-time runtime hashes. Do not edit these copies.

Install the chosen local cocosair.js tarball into a fresh project (offline installation is supported when the tarball is available). Map cocosair to the installed cocosair.js main package, then bundle each src/main.ts with your normal browser bundler. Preserve the corresponding index.html DOM and asset paths. Pass the selected canvas to createAirApp; canvas creation after main import is supported. The container example delays engine import until its host has positive dimensions.

Run npm scripts from the SDK repository only; this kit does not install a development toolchain automatically. tools/verify/interactive-kit-consumer.cjs demonstrates an actual offline consumer, installed declarations and package entry resolution without workspace /build fallback.

Examples: multipass capture/mip; dynamic mesh/projection; mixed Canvas/HTML input; container readiness; 18-group motion and a new 16.2s WebAudio track. Each provides reset/cancel/release controls and state receipts. JavaScript runtime and TypeScript declarations are verified independently by the consumer.

Use statuses in manifest.json and the repository manual. These are teaching recipes: 18 groups, a local 499-second endpoint, restricted cutting and shader/geometry scopes, not full reference replicas or all-platform certification. Historical WebKit layout/audio limitations do not establish current browser capability; inspect fresh receipts. No GPU physical-memory or hardware performance certification.

All program geometry/effect data are authored in the project under its MIT license. The timeline waveform is newly authored; assets/LICENSE.md specifies generation and avoids claiming the original music.
