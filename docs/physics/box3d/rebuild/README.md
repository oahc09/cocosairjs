# Box3D rebuild checkpoint

This directory records the provenance of a new, partial main-source import. It is not the recovered Box3D implementation and does not establish build reproducibility.

Start with [the rebuild plan](../../../../ai/plans/box3d-rebuild.md), then the [unchanged v1.2 contract](../../../../ai/plans/box3d-v1.2-reference.md) (Library identity libfile_335495eb4e208191bf8025631fdd1b33). Read [SNAPSHOT-NOTICE.md](SNAPSHOT-NOTICE.md) before using the source. The compact baseline.json records both the actual upstream identity and local import boundary. The full source/missing manifest is carried in the portable recovery checkpoint, not required for the complete remote tree.

The [state ledger](../../../../ai/ledgers/box3d-rebuild-state.json) deliberately initializes all 35 implementation tasks, 9 Gates and 91 main test categories without inheriting historical PASS results. It is not the final expanded inventory. The [recovery source manifest](../recovery/source-manifest.json) preserves exact Library inputs and their limitations.

The required recovery procedure creates a Git bundle, clones it into an independent temporary repository, verifies Git connectivity and every tracked file, and writes the recovery receipt. The Library round-trip is a separate required delivery step. Run node tools/verify/box3d/rebuild-checkpoint.cjs --output /absolute/new-directory from a clean committed snapshot. The helper has four passing recovery/negative-control tests; this is not a physical acceptance PASS. --committed-only explicitly excludes and reports ongoing uncommitted work.
