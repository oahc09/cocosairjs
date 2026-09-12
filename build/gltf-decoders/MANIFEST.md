# glTF decoder assets (V0.5)

Decoders are **never** bundled into `cocosair.module.js`. They are published as standalone
assets here and injected by the application:

```ts
import { GLTFLoader, createMeshoptDecoder, createDracoDecoder } from 'cocosair';

const loader = new GLTFLoader()
    .setMeshoptDecoder(createMeshoptDecoder(MeshoptDecoder))
    .setDRACODecoder(createDracoDecoder(() => DracoDecoderModule()));
```

Regenerate the geometry fixtures after changing a decoder:

```
node tools/fixtures/gen-geometry-fixtures.cjs
```

## meshopt — meshoptimizer 1.2.0 (MIT)

Source: `npm pack meshoptimizer@1.2.0` (github.com/zeux/meshoptimizer), MIT licence in
`meshopt/LICENSE.md`.

| file | bytes | sha256 |
|---|---|---|
| meshopt/LICENSE.md | 1079 | f03037ca7bad1e3eb7f4a63fa6084a8baabd5ba30d3c239a9a7f35705d873e26 |
| meshopt/meshopt_decoder.cjs | 29400 | fedf06f101ff2ba59d66335578230b7e8f5fac5057dee084be64c67444ac6c12 |
| meshopt/meshopt_decoder.mjs | 29059 | cb08bf53ad8ad9693d8bb759b2dbade350eb38bcce63d005385e225b564c5f6a |
| meshopt/meshopt_encoder.mjs | 24348 | f82f201a778333291ba1ca63035321f1c6d2770ef52d219e69e13f6cb2098429 |
| meshopt/index.js | 199 | 0afb975db2733391c2d0cabfbe707ee6d9a9651dddc221aeda5d819379958a89 |

`meshopt_encoder.mjs` is only used by the fixture generator, never at runtime.

## draco — draco3d 1.5.7 (Apache-2.0)

Source: `npm pack draco3d@1.5.7` (github.com/google/draco). The npm package ships no licence
file; Draco is distributed under the Apache License 2.0 — see `draco/LICENSE.md`.

| file | bytes | sha256 |
|---|---|---|
| draco/draco3d.js | 246 | 7bb70f3edb3c32a21fbd3ea90d85f6f816a3394061c445ac4e867d23fa2f9dca |
| draco/draco_decoder.wasm | 285948 | 2516a4e43526d71787bf2f678f951329f7f858f8f15f42d4bc9e370b31a0da3a |
| draco/draco_decoder_nodejs.js | 58763 | e8049906ef3f8f75d3456c22a3f31bfdfe5b5b5bd09ccdec613b9e9a49d554d8 |
| draco/draco_encoder.wasm | 370188 | d2a3ac80c91980d5d321c116454834ff36264825c6d1794cc84e42288f158958 |
| draco/draco_encoder_nodejs.js | 49007 | 8434adecd1446459601763e499be3697546056bca90b286a538ae0483a00845a |

## Follow-ups tracked for T7 (release)

- Vendor the **browser** Draco distribution (`draco_wasm_wrapper.js` + `draco_decoder.wasm`
  from `draco3dgltf`) so web applications do not need the Node build.
- Add the full Apache-2.0 licence text for Draco (currently the short notice + canonical URL).
- Wire decoder loading (dynamic import URL / worker pool) into `decoder/draco.ts`.
