# Box3D rebuild checkpoint

This directory records the provenance of a new, partial main-source import. It is not the recovered Box3D implementation and does not establish build reproducibility.

Start with [the rebuild plan](../../../../ai/plans/box3d-rebuild.md), then the [unchanged v1.2 contract](../../../../ai/plans/box3d-v1.2-reference.md) (Library identity libfile_335495eb4e208191bf8025631fdd1b33). Read [SNAPSHOT-NOTICE.md](SNAPSHOT-NOTICE.md) before using the source. The compact baseline.json records both the actual upstream identity and local import boundary. The full source/missing manifest is carried in the portable recovery checkpoint, not required for the complete remote tree.

The [state ledger](../../../../ai/ledgers/box3d-rebuild-state.json) deliberately initializes all 35 implementation tasks, 9 Gates and 91 main test categories without inheriting historical PASS results. It is not the final expanded inventory. The [recovery source manifest](../recovery/source-manifest.json) preserves exact Library inputs and their limitations.

The required recovery procedure creates a Git bundle, clones it into an independent temporary repository, verifies Git connectivity and every tracked file, and writes the recovery receipt. The Library round-trip is a separate required delivery step. Run node tools/verify/box3d/rebuild-checkpoint.cjs --output /absolute/new-directory from a clean committed snapshot. The helper has four passing recovery/negative-control tests; this is not a physical acceptance PASS. --committed-only explicitly excludes and reports ongoing uncommitted work.

## Reconstructed native foundation

The fixed core and binding-reference sources are preserved under vendor/box3d with exact upstream blob and SHA-256 identities. The original SSE2 load alignment defect remains recorded. Its reviewed patch is applied only to a verified build-stage copy; vendor originals remain unchanged. The official Emscripten 6.0.2 toolchain produced fresh Debug/Release ST artifacts. Current g fixtures prove a limited real Node WASM foundation and immutable raw native snapshots, not the full binding or an engine world adapter. The C21 geometry epoch and T09 world integration proposals remain unimplemented at this checkpoint. ASan/LSan and real browser limitations are recorded separately.

Three actual h2 runtime builds now succeed: the optional Box3D dev variant and the default dev/min variants. Only the selected variant includes the ST assets. Eight actual generated-bundle Node VM/JSDOM cases observe zero intercepted resource requests on import and honest pre-engine rejection of unavailable Box3D world support. Default declarations were generated, with bundler warnings retained and without a complete public type-compatibility claim. Fresh source typechecking, 31 lifecycle/design tests and 15 restored HEADLESS bootstrap tests pass; the earlier missing-vendor, missing-bundle and missing-declaration failures remain in their original receipts.

The actual 41 runtime artifact files are independently preserved and download-verified in Library libfile_1bd16f266d908191b90831c71d5a2423; see library-runtime-artifacts-20261022-h2.json. Generated runtime bytes are not substituted for source or packaged-release verification. The local tracked snapshot still omits 6,351 original main paths and must not be described as a full clone.

The M0 contract design in ../contracts maps 166 actual Cocos spec members and drafts 84 required child cases under 91 parent categories. The final environment/variant-expanded inventory is not frozen. C16-DURATION-1 is explicitly a new seven-endpoint/100 ms definition and must not be mistaken for recovered historical acceptance.
