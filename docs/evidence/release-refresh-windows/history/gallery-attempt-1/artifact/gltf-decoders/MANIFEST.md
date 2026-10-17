# glTF decoder assets (V0.5, T7 packaging)

Decoders are **never** bundled into `cocosair.module.js`. They ship as standalone files in this
directory (included verbatim by `npm pack` through the package `files` field) and are injected
by the application through the provider API:

```ts
import { GLTFLoader, createMeshoptDecoder, createDracoDecoder, createKTX2Transcoder } from 'cocosair';

const loader = new GLTFLoader()
    .setMeshoptDecoder(createMeshoptDecoder(MeshoptDecoder))         // meshopt_decoder.cjs/.mjs
    .setDRACODecoder(createDracoDecoder(() => DracoDecoderModule())) // draco3d.js + .wasm
    .setKTX2Transcoder(createKTX2Transcoder(() => BASIS()));         // basis_transcoder.js + .wasm
```

Gate G5-build verification (machine-readable JSON report; exit 1 on any drift):

```
node tools/verify/decoder-audit.cjs
```

## meshopt - meshoptimizer 1.2.0 (MIT)

Source: `npm pack meshoptimizer@1.2.0` (github.com/zeux/meshoptimizer). The encoder variants
are used only by fixture generation (`tools/verify/generate-gltf-fixtures.cjs`,
`tools/fixtures/gen-geometry-fixtures.cjs`), never at runtime.

| file | bytes | sha256 |
|---|---|---|
| meshopt/meshopt_decoder.cjs | 29400 | fedf06f101ff2ba59d66335578230b7e8f5fac5057dee084be64c67444ac6c12 |
| meshopt/meshopt_decoder.mjs | 29059 | cb08bf53ad8ad9693d8bb759b2dbade350eb38bcce63d005385e225b564c5f6a |
| meshopt/meshopt_encoder.js | 24348 | f82f201a778333291ba1ca63035321f1c6d2770ef52d219e69e13f6cb2098429 |
| meshopt/meshopt_encoder.mjs | 24348 | f82f201a778333291ba1ca63035321f1c6d2770ef52d219e69e13f6cb2098429 |
| meshopt/index.js | 199 | 0afb975db2733391c2d0cabfbe707ee6d9a9651dddc221aeda5d819379958a89 |
| meshopt/LICENSE.md | 1079 | f03037ca7bad1e3eb7f4a63fa6084a8baabd5ba30d3c239a9a7f35705d873e26 |

## draco - draco3d 1.5.7 (Apache-2.0)

Source: `npm pack draco3d@1.5.7` (github.com/google/draco). The npm package ships no license
file; Draco is distributed under the Apache License 2.0 - the full text is vendored below the
attribution notice in `draco/LICENSE.md`.

**Browser-side Draco decision:** `draco3dgltf@1.5.7` (the glTF-oriented npm package) contains
only the Node build; Google distributes the browser wrapper exclusively through GitHub
releases, which offers no hash-pinned npm provenance. Consistent with the standing rule that
the engine never embeds decoders, web applications inject their own browser Draco assets via
`setDRACODecoder(...)`; the offline-loadable Node build shipped here covers the smoke suite and
Node consumers. This is a deliberate trade-off, not an outstanding task.

| file | bytes | sha256 |
|---|---|---|
| draco/draco3d.js | 246 | 7bb70f3edb3c32a21fbd3ea90d85f6f816a3394061c445ac4e867d23fa2f9dca |
| draco/draco_decoder_nodejs.js | 58763 | e8049906ef3f8f75d3456c22a3f31bfdfe5b5b5bd09ccdec613b9e9a49d554d8 |
| draco/draco_decoder.wasm | 285948 | 2516a4e43526d71787bf2f678f951329f7f858f8f15f42d4bc9e370b31a0da3a |
| draco/draco_encoder_nodejs.js | 49007 | 8434adecd1446459601763e499be3697546056bca90b286a538ae0483a00845a |
| draco/draco_encoder.wasm | 370188 | d2a3ac80c91980d5d321c116454834ff36264825c6d1794cc84e42288f158958 |
| draco/LICENSE.md | 12203 | e09df5ca32827edf0aa4d9c94a8852cad7353eae00e709204c03ca91db4699b9 |

## basis - Basis Universal transcoder, three r168 build (Apache-2.0)

Source: `npm pack three@0.168.0` -> `examples/jsm/libs/basis/` (three.js ships the Binomial
LLC Basis Universal transcoder build; Apache License 2.0 - full text vendored in
`basis/LICENSE.md`). Injected via `createKTX2Transcoder`; the same module handles KTX2 zstd.

| file | bytes | sha256 |
|---|---|---|
| basis/basis_transcoder.js | 62337 | 48a0ef319a28bf0224ee88ded34f74eaf97c175bba9eb18b47fb9720510ad6c4 |
| basis/basis_transcoder.wasm | 499935 | 79ae97d781e10a566659c689b7bb1de91726453f55f9f5e3bcc07a4e3904070f |
| basis/LICENSE.md | 12400 | 08155e638b63603f65012c64ee1ca7dc947934b408ffaaea0f75669160792b9e |

## Serving / MIME

- dev server (`tools/dev/dev-server.cjs`) and the glTF asset server
  (`tools/verify/serve-gltf.cjs`) serve `.js/.mjs/.cjs -> text/javascript` and
  `.wasm -> application/wasm`.
- The offline static staging (`tools/verify/prepare-static.cjs`) copies this directory next
  to the bundle so a plain static server can load every decoder offline.

## Package module scope

Local packaging metadata (MIT, cocosair.js V0.6): keeps vendored CommonJS decoders
loadable inside the ESM build directory. It is not a third-party decoder binary.

| file | bytes | sha256 |
|---|---|---|
| package.json | 25 | 8005a3491db7d92f36ac66369861589f9c47123d3a7c71e643fc2c06168cd45a |
