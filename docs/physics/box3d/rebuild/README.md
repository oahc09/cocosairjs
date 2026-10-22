# Box3D rebuild checkpoint

This directory records the provenance of a new, partial main-source import. It is not the recovered Box3D implementation and does not establish build reproducibility.

Start with [the rebuild plan](../../../../ai/plans/box3d-rebuild.md), then the [unchanged v1.2 contract](../../../../ai/plans/box3d-v1.2-reference.md) (Library identity libfile_335495eb4e208191bf8025631fdd1b33). Read [SNAPSHOT-NOTICE.md](SNAPSHOT-NOTICE.md) before using the source. The compact baseline.json records both the actual upstream identity and local import boundary. The full source/missing manifest is carried in the portable recovery checkpoint, not required for the complete remote tree.

The [state ledger](../../../../ai/ledgers/box3d-rebuild-state.json) deliberately initializes all 35 implementation tasks, 9 Gates and 91 main test categories without inheriting historical PASS results. It is not the final expanded inventory. The [recovery source manifest](../recovery/source-manifest.json) preserves exact Library inputs and their limitations.

The required recovery procedure creates a Git bundle, clones it into an independent temporary repository, verifies Git connectivity and every tracked file, and writes the recovery receipt. The Library round-trip is a separate required delivery step. Run node tools/verify/box3d/rebuild-checkpoint.cjs --output /absolute/new-directory from a clean committed snapshot. The helper has four passing recovery/negative-control tests; this is not a physical acceptance PASS. --committed-only explicitly excludes and reports ongoing uncommitted work.

## Reconstructed native foundation

The fixed core and binding-reference sources are now preserved under vendor/box3d, with exact upstream blob and SHA-256 identities. See tools/physics/box3d/README.md and its evidence/index.json for the limited new C17 wire ABI and actual native runs. Debug and Release diagnostics passed; ASan/UBSan failed on the original SSE2 load alignment. The isolated candidate patch is retained but not applied. Emscripten is currently unavailable, so WASM, browser, strict CSP and the complete M1 gate remain untested.

The M0 contract design in ../contracts maps 166 actual Cocos spec members and drafts 84 required child cases under 91 parent categories. The final environment/variant-expanded inventory is not frozen. C16-DURATION-1 is explicitly a new seven-endpoint/100 ms definition and must not be mistaken for recovered historical acceptance.
