# Main runtime entry

The only public package entry is cocosair.js. It exports the full default browser engine, createAirApp, and the experimental HTML texture helpers. Repository pages use the cocosair importmap alias for build/cocosair.module.js.

| Purpose             | File                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| Development runtime | build/cocosair.module.js and its map                                   |
| Minified runtime    | build/cocosair.module.min.js and its map                               |
| Modern TypeScript   | build/cocosair.module.d.ts                                             |
| TS <5.0             | build/cocosair.legacy.d.ts, which re-exports the main declarations     |
| npm runtime         | build/npm/cocosair.module.js; source-map-free copy prepared by prepack |

Main is browser-only, but it may be imported before creating a canvas. Supply the selected canvas and pixelRatioCap to createAirApp; no pre-import globals are needed. For deferred loading, use an application-owned dynamic import('cocosair.js'). There are no independent bootstrap/html-source package entries and no Node/SSR import promise for the full runtime.

build generates development JS; build:min generates minified JS; build:dts generates declarations; build:all prepares all default files and the two npm JS copies. These builds remove the explicitly retired standalone entries, preserving decoders and optional Spark artifacts. Do not hand-edit generated files.

See [contracts](contracts.md) and the repository docs/reference/npm-scripts.md for scope and write behavior.
