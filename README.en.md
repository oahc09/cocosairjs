# Cocos AIR (cocosair.js)

[简体中文](README.md) | **English**

**Cocos Agent-first Interactive Runtime** — a TypeScript Web engine based on cocos4. Create scenes, nodes, cameras, materials, and animations directly in code, without Cocos Creator, its Editor, scene files, or an editor asset pipeline.

The default renderer requires WebGL 2. Desktop Web applications can explicitly select the experimental WebGPU backend; failures do not trigger an automatic fallback. Startup, rendering, and HTML texture APIs share the main entry point, which requires a browser DOM and does not support Node/SSR execution. CPU-only math is available separately through `cocosair.js/math`, without a DOM or engine initialization. See the [support policy](docs/webgl2-only.md) and [verification and release checks](docs/reference/verification.md).

2D physics uses the existing JavaScript backend by default. You can explicitly select the [Box2D 3.2 WASM backend](docs/guides/box2d3.md) while continuing to use Cocos rigid-body, collider, and joint components. Its WASM assets are deployed separately and loaded on demand.

3D physics also has an explicitly selected [experimental single-threaded Box3D variant](docs/physics/box3d/integration-20261031.md). Include `physics-box3d` in the build, deploy the matching `physics/box3d/st/` assets, and set `physics: 'box3d'`. The default distribution retains builtin / Cannon and does not download Box3D. This experimental variant does not establish acceptance of the original nine examples or the complete validation matrix.

For direct SDK deployment, start with the [minimum build file set](build/README.md). A regular browser application needs one main JS bundle, plus any optional backend or decoder assets it uses. Declarations, source maps, build receipts, and the Gallery are not runtime dependencies of every application.

## Visual showcase

The following images and video are project concept art and promotional material, not screenshots captured from the engine.

| From idea to visible feedback                                                                                                                 | Creative 3D interaction                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![From idea to visible feedback](https://github.com/oahc09/cocosairjs/blob/main/assets/cocosairjs-from-idea-to-visible-feedback.png?raw=true) | ![Creative 3D interaction](https://github.com/oahc09/cocosairjs/blob/main/assets/cocosairjs-three-dimensional-interactive-creativity.png?raw=true)                              |
| **Code sculpture stage**                                                                                                                      | **A flowing ring of light, shadow, and materials**                                                                                                                              |
| ![Code sculpture stage](https://github.com/oahc09/cocosairjs/blob/main/assets/cocosairjs-code-sculpture-stage.png?raw=true)                   | ![A flowing ring of light, shadow, and materials](https://github.com/oahc09/cocosairjs/blob/main/assets/cocosairjs-the-flowing-ring-of-light-and-shadow-materials.png?raw=true) |

### Promotional video

[![Watch the promotional video](https://github.com/oahc09/cocosairjs/blob/main/assets/cocosairjs-from-idea-to-visible-feedback.png?raw=true)](https://github.com/oahc09/cocosairjs/blob/main/assets/cocosairjs-promotion.mp4?raw=true)

[Watch or download the promotional video (MP4)](https://github.com/oahc09/cocosairjs/blob/main/assets/cocosairjs-promotion.mp4?raw=true)

https://github.com/user-attachments/assets/689ea4e1-de14-47dd-a104-564cf1005c06

https://github.com/user-attachments/assets/fb91e5d7-f39a-4182-a49c-5047bf190f1b

## Choose how to use AIR

| Your goal                                                      | Approach                                                                                                       | Engine source required?                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Build an application in your own TypeScript/JavaScript project | Install a local SDK tarball, or an officially published npm package                                            | No `src/`, `tools/`, or engine `node_modules/` needed by the application |
| Run directly in a web page without a bundler                   | Copy the main JS bundle and load it through an import map                                                      | No                                                                       |
| Modify the engine or run repository examples                   | Install development dependencies, build, and start the repository dev server                                   | Yes                                                                      |
| Use math only, including in Node or a Worker                   | Import from `cocosair.js/math`                                                                                 | No browser or main-engine startup required                               |
| Use Gaussian Splatting                                         | Build the separate Spark module and share the same main engine, subject to its distribution authorization gate | Required to build locally; not required to run the application           |

## Option 1: use the SDK in your own project (recommended)

### 1. Prepare an installable SDK

If you already have a `.tgz` package supplied by this project, skip to the next step. Otherwise, generate a local installation package from the **engine repository root**. Publishing to the npm registry is not required.

The following build commands use Windows PowerShell:

```powershell
git clone https://github.com/oahc09/cocosairjs.git cocosair.js
cd cocosair.js
npm ci
$env:NODE_OPTIONS = '--max-old-space-size=6144'
npm run build:all
npm pack
```

The current version produces `cocosair.js-1.0.0.tgz`; use the actual filename printed by `npm pack`. `build:all` compiles development and minified bundles and declarations, builds the separate math entry, prepares distribution copies, and checks built-in resources. The `prepack` hook invoked by `npm pack` prepares the distribution copies and math entry again, but does not recompile the main engine or upload anything. The memory limit applies only to this build process and its children.

### 2. Create an application and install the SDK

This example uses Vite's `vanilla-ts` template. Node.js 22.12+ is recommended for the template tools, whose requirements are higher than the SDK's declared Node 18 minimum. See [Vite's installation requirements](https://vite.dev/guide/).

The commands below assume that the engine repository, `cocosair.js/`, and the application, `my-air-app/`, share a parent directory. If your terminal is still inside the engine repository, run `cd ..` first:

```bash
npm create vite@latest my-air-app -- --template vanilla-ts
cd my-air-app
npm install
```

From the new application's root, install the package using its relative path. Adjust the path if your directory layout differs:

```powershell
npm install "../cocosair.js/cocosair.js-1.0.0.tgz"
```

Once an official npm release is available, you can instead use `npm install cocosair.js`. A version in the local `package.json` does not establish that the same version has been published to the registry. Your application needs only the SDK and its own build tools; it does not need Cocos Creator, Three.js, or the engine's development dependencies.

### 3. Replace the page and application code

Replace the application's root `index.html` with the following page. Remove the Vite template's counter page and default stylesheet import.

```html
<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>My Cocos AIR App</title>
        <style>
            html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
            canvas { display: block; width: 100%; height: 100%; }
        </style>
    </head>
    <body>
        <canvas id="GameCanvas"></canvas>
        <script type="module" src="/src/main.ts"></script>
    </body>
</html>
```

Put the following code in the application’s src/main.ts. It creates a blue cube with the unlit `builtin-unlit` material, so no models, textures, or additional resource downloads are needed.

```ts
import { createAirApp, Scene, Node, Camera, Color, Vec3, MeshRenderer, Material, utils, primitives } from 'cocosair.js';

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('Main');

const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(3, 2, 5);
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 24, 35, 255);

const cube = new Node('Cube');
scene.addChild(cube);
const renderer = cube.addComponent(MeshRenderer);
const mesh = utils.createMesh(primitives.box());
const material = new Material();
material.initialize({ effectName: 'builtin-unlit' });
material.setProperty('mainColor', new Color(60, 170, 255, 255));
renderer.mesh = mesh;
renderer.setSharedMaterial(material, 0);

app.session?.own(() => { mesh.destroy(); material.destroy(); }, 'cube-assets');
app.run(scene);
```

Run this command from the **application project** root:

```bash
npm run dev
```

Open the address printed in the terminal. You should see a blue cube on a dark background, with the AIR/Cocos version in the console. An empty scene without a camera does not draw objects. For deployment, run `npm run build` in the application and publish its generated `dist/` directory; you do not need to copy the engine repository.

### 4. TypeScript declarations

The package configures its declaration entries. Import normally from `cocosair.js` rather than importing a `.d.ts` file manually. TypeScript 5.0+ uses the main declarations; TypeScript 4.9 uses legacy-compatible declarations. Package resolution selects the appropriate entry, so application code should not import both. Keep DOM types enabled and set `skipLibCheck: true` as required by the current SDK consumption contract.

The repository examples use `cocosair` as an import-map alias. The installed package is named **cocosair.js**; do not copy that bare alias directly into an SDK application.

### 5. Separate math entry

```ts
import { Vec3, Quat, Mat4 } from 'cocosair.js/math';

const transform = Mat4.fromRTS(new Mat4(), new Quat(), new Vec3(1, 2, 3), new Vec3(1, 1, 1));
```

This entry provides Vec2/3/4, Mat3/4, Quat, Color, Size, Rect, and math utilities for Node, Workers, and browsers. It has separate constructors and random-number state from the main entry. Do not rely on `instanceof` across entries; use the engine's own value types when calling engine APIs. See [the math entry guide](docs/guides/math-entry.md) for build, type, and usage boundaries.

## Option 2: use build files directly without installing the SDK

A regular web page needs only the main JS bundle. Copy the build files into your site, for example:

```text
my-site/
├── index.html
├── main.js
└── vendor/
    ├── cocosair.module.js
    ├── cocosair.module.d.ts        # Optional: TypeScript/editor support
    ├── cocosair.legacy.d.ts        # Optional: retain with main declarations for TS 4.9
    └── cocosair.module.js.map      # Optional: source debugging
```

Use the complete HTML page above, replacing its script section with the following. The import map must appear before the application module:

```html
<script type="importmap">
    { "imports": { "cocosair.js": "./vendor/cocosair.module.js" } }
</script>
<script type="module" src="./main.js"></script>
```

Use the cube code above directly in `main.js`: it is valid JavaScript and does not require TypeScript compilation. Serve the site over HTTP rather than opening a `file://` page. You can use an existing static server. If you only have Node tooling, run the following in `my-site/`; the first invocation needs network access to download this development tool:

```bash
npx --yes http-server . -a 127.0.0.1 -p 8080 -c-1
```

Open http://127.0.0.1:8080/. This example uses [http-server](https://github.com/http-party/http-server), which leaves module imports unchanged so the browser can resolve the import map.

To use the minified bundle, replace the file with `cocosair.module.min.js` and update the import map value. Type paths still point to the main declarations. A bare alias does not automatically locate declarations. For TypeScript 5.0+, you can use this `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"],
    "skipLibCheck": true,
    "paths": { "cocosair.js": ["./vendor/cocosair.module.d.ts"] }
  }
}
```

For TypeScript 4.9, set `moduleResolution` to `node`, point `paths` to `cocosair.legacy.d.ts`, and retain the main declarations alongside it. `paths` affects type resolution only; it does not rewrite JavaScript imports. The browser still uses the import map. You can also import through the actual relative JS path, whose adjacent declarations are resolved automatically.

## Option 3: develop the engine or run repository examples

Run the following from the **engine repository root**, not from an application that merely installs the SDK:

```bash
npm ci
npm run build
npm run dev
```

Open http://127.0.0.1:7454/ to run the default starter. To run the visible cube example:

```bash
npm run dev -- --example hello-cube --port 7454
```

The repository dev server compiles example TypeScript and serves the engine, example assets, and automatic reloads. Engine source changes trigger a rebuild. Run `build:all` separately when you need complete declarations and distribution files. See the [npm script catalogue](docs/reference/npm-scripts.md) for prerequisites, outputs, and write behavior.

## Features that need additional files

| Feature                                                  | What to deploy                                                                                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native scenes, procedural meshes, built-in materials, UI | Main engine JS; the cube on this page has no additional assets                                                                                                         |
| TypeScript development                                   | SDK declarations, resolved automatically by npm or configured as above for copied files                                                                                |
| Your images, audio, glTF/GLB                             | Models and external resources deployed at application URLs; these are separate from engine development dependencies                                                    |
| Draco / Meshopt / KTX2 assets                            | Matching decoder/transcoder resources and loader configuration; see [decoder deployment](docs/gltf/gltf-decoder-deployment.md), including browser factory requirements |
| Spark Gaussian Splatting                                 | Separate Spark module, subject to its authorization gate; absent from the default main engine                                                                          |
| DevTools                                                 | Optional development tools; not needed for normal application execution                                                                                                |

Applications do not need separate `bootstrap.js` or `html-source.js` entries. Those entries have been removed; their APIs remain in the main engine.

Explicit WebGPU requires the `webgpu/` shader translation assets beside the main JS. Box2D 3.2 WASM requires the ESM, WASM, license, and receipt files under `box2d3/`. Builds copy these to `build/webgpu/` and `build/box2d3/`; npm distribution copies live under the corresponding `build/npm/` subdirectories. If a bundler moves the main JS, explicitly configure `assetBaseUrl` as described in each guide.

## Default HDR post-processing

The main entry exports `createAirPostProcess(camera, { levels: 5, toneMapping: 'aces', exposure: 1 })` for linear HDR capture, multilevel Bloom, ACES/Reinhard tone mapping, and unified sRGB output. Create the app before configuring the camera. See [usage and boundaries](docs/guides/hdr-post-processing.md), the [AFTERLIGHT halo installation](https://github.com/oahc09/cocosairjs/blob/main/examples/afterlight/index.html), and the [neon city example](https://github.com/oahc09/cocosairjs/blob/main/examples/neon-city/index.html). The current implementation supports the default WebGL2 ForwardPipeline.

## Dynamic instance batches

Use `createAirInstanceBatch` for dynamic batches: one native Node/Model shares indexed geometry and supports instance transforms/colors, range submissions, explicit capacity growth, bounds, and ray selection. See [dynamic instance batches](docs/guides/instance-batches.md) for usage and WebGL2/material boundaries.

## Code First 3D particles

`createAirParticleSystem` assembles native CPU/GPU particles and modules directly, with code-based emitters, curves, and CPU trails. The `/particles-3d/` example includes jets, sparks, smoke particles, rain, snow, and pause/resume/replay controls. See the [3D particle guide](docs/guides/particles.md) for usage and GPU module boundaries.

## GPU point / voxel morphing

`createAirMorphField` samples text, images, and meshes into shared instance batches. The GPU interpolates shapes and colors, and progress updates do not upload sample data again. The `/morph-field/` example provides 16,384 samples, point/voxel switching, and HDR output. See [GPU morph fields](docs/guides/morph-fields.md) for data, device, and release contracts.

## Optional: the separate Spark module

Spark WASM distribution authorization remains pending. The build authorization gate currently refuses `npm run build:spark`. The deployment instructions below apply only after that gate is cleared; see [distribution authorization status](docs/reference/distribution-authorization.md).

Once authorized, run `npm run build:spark` from the engine repository and deploy `spark.module.js` beside the main engine JS:

```js
import * as cc from './vendor/cocosair.module.js';
import { CocosSparkLayer, sparkRuntime, sparkMath } from './vendor/spark.module.js';
```

Spark shares that main engine rather than bundling a second copy of Cocos. The application and Spark must resolve to the same main JS URL. TypeScript projects also need `spark.module.d.ts` and the complete `spark-types/` directory. See [the Spark module guide](docs/reference/spark-optional-entry.md) for layouts and type paths.

After authorization, run the local example with `npm run build:spark` followed by `npm run dev -- --example spark-splats`. Spark is not included in npm `files` or `exports`; there is no directly installable `cocosair.js/spark` entry. Exclusion from npm does not resolve the authorization issues affecting existing public Git files or history.

## Repository layout

```text
cocosair.js/
├── assets/         # README concept images and promotional video
├── build/          # cocosair.module.js / cocosair.module.min.js (ESM)
├── docs/           # Analysis, design, acceptance reports, and evidence screenshots
├── examples/       # Runnable examples
│   ├── hello-cube/          # Camera + Light + rotating Cube
│   ├── static-model/        # Runtime JSON assets + procedural textures + standard material
│   └── skinned-animation/   # Three-joint skinning and skeletal animation
├── skills/         # AIR skills and references shipped with the SDK
├── ai/             # Plans and implementation ledgers; not proof of shipped features
├── src/            # Engine root, preserving upstream cocos4 relative layout
│   ├── air/                 # AIR additions: bootstrap/app/utils/builtin
│   ├── cocos/               # Extracted Cocos core; see docs/UPSTREAM.md
│   ├── exports/             # ccbuild feature entries; air.ts is the bundle entry
│   ├── pal/                 # Web platform abstraction layer
│   └── cc.config.json       # AIR build config derived by tools/analyze/make-air-config
├── vendor/         # Frozen upstream sources: public MIT PAL and optional Spark runtime
├── test/           # Smoke tests (jsdom + HEADLESS rendering)
└── tools/          # build / dev / analyze / verify / baseline
```

## Commands

| Command                         | Purpose                                                                                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                   | Watches engine (`src/cocos\|pal\|exports`), AIR (`src/air`), and examples; engine/AIR changes rebuild, example changes reload; example TypeScript compiles on request with import maps                                   |
| `npm run build`                 | Development ESM bundle and source map → `build/cocosair.module.js`                                                                                                                                                       |
| `npm run build:spark`           | Separate Spark module, declarations, and map; authorization-gated, shares the main engine, excluded from `build:all`, does not advance the main build counter                                                            |
| `npm run build:min`             | Minified local ESM build and source map → `build/cocosair.module.min.js`                                                                                                                                                 |
| `npm run build:dts`             | Declarations → `build/cocosair.module.d.ts` for editor completion and navigation                                                                                                                                         |
| `npm run build:all`             | Builds main development/minified JS and declarations, prepares math and map-free npm copies, checks built-in resources; does not build Spark or collect browser evidence                                                 |
| `npm run typecheck`             | Standalone TypeScript check without Creator                                                                                                                                                                              |
| `npm run verify:web-only`       | Dependency-reachability guard against native/minigame code entering the Web graph                                                                                                                                        |
| `npm run verify:file-map`       | Checks upstream mappings, byte identity, intentional modifications, and `moduleOverrides` replacements                                                                                                                   |
| `npm run verify:licenses`       | Checks distribution authorization and license material integrity; defaults to the repository scope, including known PAL history and Spark blockers                                                                       |
| `npm run verify:browser-matrix` | Per-example screenshots and probe assertions across Chromium/Firefox/WebKit; see `docs/reference/verification.md` for artifact locations; evidence directories are not shipped in npm                                    |
| `npm run verify:wasm-backends`  | Read-only A1–A7 guards for extracted closure completeness, counts, registered byte differences, dynamic Emscripten imports, feature declarations, type-waiver reopening conditions, and registered missing physics files |
| `npm run verify:custom-exports` | Read-only C1–C5 guards for post-processing/custom pipeline entry wiring, subtree bytes, mappings, feature declarations, and default distribution boundaries                                                              |
| `npm run verify:doc-refs`       | Read-only document-link ratchet: local paths must exist; new broken links or obsolete baseline entries fail                                                                                                              |
| `npm run verify:benchmark`      | Benchmark tool type checks, compilation diagnostics, aggregation, isolation, and timeout regressions; does not generate performance scores                                                                               |
| `npm run verify:api-coverage`   | Per-API execution evidence and release thresholds: Core 100%, Important 90%, Advanced 80%; `--check` verifies the report against current inventory, specifications, and evidence                                         |
| `npm run verify:release`        | Release gate for a clean candidate, coverage, example counts, licenses, and example/DevTools/Gallery/browser evidence matching the current build                                                                         |
| `npm test`                      | Smoke tests with jsdom + HEADLESS rendering; see `docs/test-inventory.json` for the current inventory                                                                                                                    |
| `npm run analyze`               | Updates extraction inventories and file mappings; dependency graphs go to `build/reports/`                                                                                                                               |
| `npm run baseline`              | Reproduces the Web baseline in the upstream engine directory; see `AGENTS.md` for prerequisites                                                                                                                          |

Runtime JS builds embed `AIR_BUILD_DATE` in Beijing time and increment `AIR_BUILD_NUMBER`. The two main-engine compilations in `build:all` consume two numbers; declaration generation and packaging do not increment the counter. `AIR_FEATURES` / `AIR_OUT_DIR` select build variants; declaration builds do not follow `AIR_OUT_DIR`. See the [npm script catalogue](docs/reference/npm-scripts.md) for complete commands, prerequisites, outputs, and write behavior.

## Documentation

Most linked guides are currently written in Chinese.

- [Documentation index](docs/README.md) — topics and navigation
- [Developer manual](docs/manual/index.md) — API tutorials and runnable examples
- [Render targets and MSAA](docs/manual/rendering-contracts.md) · [Texture color, offline GGX, and material diagnostics](docs/reference/rendering-color-diagnostics.md)
- [Separate math entry](docs/guides/math-entry.md) · [WebGPU](docs/guides/webgpu.md) · [Box2D 3.2 WASM](docs/guides/box2d3.md) · [Experimental Box3D variant](docs/physics/box3d/integration-20261031.md)
- [Input actions and state](docs/manual/input-action-state.md) · [Scene switching](docs/manual/scene-switching.md) · [Audio readiness and ownership](docs/manual/audio-readiness-ownership.md)
- [Atlas loading](docs/manual/atlas-loading.md) · [Bitmap fonts](docs/manual/bitmap-font-loading.md) · [SDK lifecycle recipes](docs/manual/sdk-lifecycle-recipes.md)
- [Code First introduction](docs/guides/code-first.md) — startup and canvas conventions
- [Asset loading](docs/guides/asset-loading.md) · [Skinning tools](docs/guides/skinned-model.md) · [Development loop](docs/guides/engine-development.md)
- [Runtime inspection](docs/guides/runtime-inspection.md) · [Agent debugging sessions](docs/guides/agent-development.md)
- [glTF / GLB loading](docs/gltf/gltf-runtime.md) · [Extension reference](docs/gltf/gltf-extension-reference.md) · [Decoder deployment](docs/gltf/gltf-decoder-deployment.md)
- [Official model catalogue and comparison preview](docs/gltf/gltf-catalog.md)
- [Web feature scope](docs/reference/web-features.md) · [Verification and release checks](docs/reference/verification.md) · [Optional Spark entry](docs/reference/spark-optional-entry.md)
- [Upstream differences](docs/UPSTREAM.md) · [Third-party licenses](docs/THIRD_PARTY_LICENSES.md) · [Distribution authorization status](docs/reference/distribution-authorization.md)

## Capabilities and support boundaries

Browser rendering requires **WebGL 2** by default. WebGPU has an explicit experimental entry and separate acceptance boundaries. WebGL 1 is unsupported. If WebGL 2 initialization fails, `createAirApp()` rejects with `WEBGL2_REQUIRED`. Explicit HEADLESS mode is for tests and does not produce browser graphics. See [browser support](docs/webgl2-only.md).

### Default runtime

`createAirRenderTarget()` is a thin entry combining native offscreen cameras, color/depth attachments, MSAA resolve, and resize rebinding. Requested and effective formats and sample counts are recorded separately; unsupported floating-point formats are not silently replaced with RGBA8. Full repository examples are available in `examples/water-multipass/` and `examples/hdr-color-pipeline/`. Their focused acceptance does not establish fresh acceptance of the entire legacy Gallery or the complete release gate.

| Capability              | Current scope                                                                                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenes and rendering    | Core/Math, Scene Graph, Component, Game/Director, Camera/Light, Mesh/Material/Texture, WebGL 2, rendering pipelines, and procedural built-in materials/effects                                                                                                             |
| Animation and models    | Animation, Skeleton/Skinning, primitives, tween, glTF/GLB loading, and registered extensions. Compressed assets and texture transcoding need application-configured decoders; see [model loading](docs/gltf/gltf-runtime.md)                                               |
| 2D and UI               | 2D/UI, Mask, Graphics, Sorting2D, TiledMap, and 2D Particle                                                                                                                                                                                                                |
| Browser input and media | Web Input, Web PAL, AudioSource, VideoPlayer, and WebView                                                                                                                                                                                                                  |
| Physics                 | Pure JavaScript Box2D by default for 2D. 3D includes builtin and Cannon: builtin provides discrete collision detection; Cannon provides rigid-body simulation. Select Cannon during initialization with `createAirApp({ physics: 'cannon' })`; builtin remains the default |
| Other modules           | DragonBones, Profiler, GeometryRenderer, intersection-2d, and custom pipeline / post-process exports. Rendering claims depend on the corresponding examples and browser validation                                                                                         |

### AIR helper APIs

The main entry retains native Cocos APIs and adds thin helpers:

| Area                                | Entry points and purpose                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup and lifecycle               | `createAirApp`, `app.session`, `app.releaseScene()`, `app.close()`, `createSessionScope`; register cleanup and reject stale asynchronous results. Recreating the app in the same document after close requires a page reload |
| Input and pages                     | `createActionInput`, `createSessionGate`, `SceneStack`; compose action input, session gates, and native Node pages                                                                                                           |
| UI and resources                    | `createUICanvas`, `spriteNode`, `labelNode`, `AssetBank`, DOM overlays, texture sprites, atlases, BMFont, UI meshes, and glyph tools                                                                                         |
| Model loading                       | Promise-based `GLTFLoader` and registered `assetManager` / `loadAssetAsync` entry points; see the glTF guides for extensions and decoders                                                                                    |
| Audio and rendering                 | `AudioService`, `createAirRenderTarget`, screen passes/effects, bloom/vignette, transmission capture, color contracts, and material diagnostics                                                                              |
| Observation and controlled stepping | `app.diagnostics`, `app.contextHealth`, `createStepClock`; pause native pacing before controlled actions rather than mixing them with real-time frames                                                                       |

The canvas may be a selector or element. Configure `pixelRatioCap`, `screenMode`, `container`, and `designResolution` through `createAirApp`. Context restoration does not establish that GPU resources have been rebuilt; handle failures and page reloads according to the reported health state. Start with the [developer manual](docs/manual/index.md).

### Build features and aggregate exports

Capability names, feature units, and public exports are separate inventories. `src/cc.config.json` currently declares **35** features, of which **27** are selected by default. That configuration and `tools/build/build.cjs` are authoritative.

- Although `audio` is not in the default feature selection, `src/exports/air.ts` statically aggregates it, so audio is included in the default bundle.
- Aggregate exports expose capabilities such as `mask`, `graphics`, `sorting`, `intersection-2d`, `geometry-renderer`, `spine`, and `physics-framework`. A feature switch with the same name is not sufficient to determine inclusion.
- Declared but unselected features are `audio`, `physics-2d-builtin`, `physics-ammo`, `physics-physx`, `physics-2d-box2d-wasm`, `physics-box3d`, `marionette`, `procedural-animation`, and `spark`. Spark uses the separate build entry described above. Other variants use `AIR_FEATURES` and still require validation of the complete dependency graph and runtime assets.

Use `npm run verify:feature-exports` to check declarations, aggregate entry points, and default artifact composition. See [Web feature scope](docs/reference/web-features.md). Source or declaration presence establishes that code has been extracted; it does not replace runtime validation.

### Exclusions and features requiring extra assets

- **WebGPU:** explicitly select the experimental desktop Web backend with `createAirApp({ canvas, renderer: 'webgpu' })`. WebGL2 remains the default and there is no automatic fallback. See [WebGPU deployment and acceptance boundaries](docs/guides/webgpu.md).
- **WASM physics backends:** optional Box2D 3.2 uses `physics2D: 'box2d-v3-wasm'`, with separate assets supplied by builds and the npm package. The default JS backend does not load them. This differs from the older `physics-2d-box2d-wasm` feature; older Box2D WASM and bullet/physx remain constrained by external assets. See the [Box2D 3.2 guide](docs/guides/box2d3.md) and [physics asset provenance](docs/notes/physics-asset-sourcing.md).
- **Spine:** components, declarations, and adapters exist, but the baseline's complete runtime depends on external assets that have not been deployed. This does not establish acceptance of Spine animation execution. See [Spine asset sourcing](docs/notes/spine-asset-sourcing.md).
- **Draco in browsers:** the adapter supports an injected provider. The shipped entry is Node/CommonJS; applications must supply the browser factory separately. See [decoder deployment](docs/gltf/gltf-decoder-deployment.md).
- **Terrain, XR, Light Probes, and related scope items:** outside the current default support surface; see [scope decisions](docs/reference/scope-decisions.md). 3D particles are integrated through `createAirParticleSystem`; current coverage is described separately from historical scope records.
- **MiniGame, Native/JSB, and Creator Editor:** excluded from the Web runtime dependency graph.
- **Spark Gaussian Splatting:** the separate `build/spark.module.js` shares the main engine; `examples/spark-splats/` is its repository example. Spark is excluded from the default bundle. WASM remains inlined from upstream distribution bytes, and the XR/hand-family exclusions remain unchanged. Crate-level distribution authorization is pending, so new Spark builds are currently blocked. It is not included in the default npm package. See [the optional Spark entry](docs/reference/spark-optional-entry.md) and [authorization status](docs/reference/distribution-authorization.md).

## Code First notes

- The main entry requires browser globals, but canvas/container binding and input listeners are deferred until `createAirApp` starts. You do not need to create a canvas or set DPR before importing. See `examples/hello-cube/index.html` for the page structure.
- Native camera visibility already includes `Layers.Enum.DEFAULT`. Configure `visibility` explicitly only when you need separate layers.
- Built-in materials/effects are registered programmatically through `src/air/builtin/register.ts` without Creator's internal database.
- `Skeleton.joints` must contain **complete paths relative to skinningRoot**, resolved with `getChildByPath`. Use `bone0/bone1` rather than `bone1` for nested joints. Missing paths in use report `AIR_E_SKINNING_JOINT_PATH`. See [the skinning recipe](docs/manual/skinning-code-first.md) for root-space, first-frame, and rebinding contracts.
- See `examples/skinned-animation/` for three-joint skinning and skeletal animation, and [skinning tools](docs/guides/skinned-model.md) for helpers.

## Verification scope

`Code quality / quality` selects formatting, types, CPU regressions, builds, and package checks according to the change scope. Its code path also validates five Chromium examples: `shader-driver-pilot`, `glass-refraction`, `gltf-viewer`, `input`, and `spark-splats`. Box2D has separate path-selection regression coverage. The complete example campaign is run manually through `example-evidence.yml`. Current workflows use manual/reusable entry points; see [CI scopes](docs/reference/ci-scopes.md) for retained coverage.

Focused checks, source exports, or historical PASS results do not establish current acceptance of all examples, browsers, or a release. Releases require current candidate fingerprints and complete evidence; see [verification and release checks](docs/reference/verification.md).

## Baseline and upstream

See [UPSTREAM.md](docs/UPSTREAM.md) for the source baseline and intentional differences. `docs/upstream-file-map.json` and `docs/extraction-manifest.json` record file mappings. Run `node tools/compare/baseline-compare.cjs` to regenerate the current comparison at build/reports/baseline-compare.json.

## Licensing

AIR-owned code uses MIT; see `LICENSE`. Embedded third-party code follows its own licenses.

The default bundle includes Spine-related code. Use and redistribution must satisfy the supplied Spine Runtimes License Agreement and its referenced Spine Editor license conditions; the complete bundle cannot be treated as MIT-only.

Current PAL code is generated from a fixed, public MIT-licensed cocos4 source snapshot; the old `@cocos/engine-pal` package is no longer used. Licenses and copyright notices are supplied with the package. This replacement does not close the authorization question for old bytes in public Git history. PAL history authorization and Spark WASM distribution authorization remain pending. See [third-party licenses](docs/THIRD_PARTY_LICENSES.md) and [distribution authorization status](docs/reference/distribution-authorization.md).

## AIR skills routing and maintenance

The [skills guide](skills/README.md) describes Profile A on-demand reading, whole-tree distribution, and budgets. The [generated index](skills/INDEX.md) comes from skill frontmatter and Reference maps; no separate routing table is maintained. After changing those fields, run `node tools/skills/gen-index.cjs --write` and then `--check`.

The SDK ships the skills directory but does not install skills into the host automatically. Phase one retains complete reference content; large-file slicing and per-skill bundles have not been implemented.
