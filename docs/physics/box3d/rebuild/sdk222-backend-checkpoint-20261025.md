# SDK222 backend source checkpoint — 2026-10-25

## Scope and identity

Base: `40910932338eb212af340f3fe8c8ba5dfae1c1fe` on `feat/box3d-rebuild-20261022`. No main merge, vendor replacement, deletion of archive-absent files, or generated runtime upload is part of this checkpoint. The two Game closure source files were committed separately and are not repeated here.

The 76 backend/build/native files and 8 public StaticMesh v4 fixture source files are byte-identical to the recovered SDK222 source package. The restored local snapshot `a45eb68c511fabe9ed6d8cd866ba0fa9158e4244` is provenance only, not a remote Git ancestor. Full retained package: Library `libfile_637e7520959c81919b2206df625299a1`, SHA-256 `e9b9358b64eeae55c9ec8dcfabc0a0ddfa2db338d2ded9f5ac98a9ec901f7663`.

## Evidence boundaries

Historical SDK222 evidence establishes a bounded production build and the public StaticMesh qualified-v4 fixture's 59 checks using its exact ESM/ST-WASM runtime and input lock. Those historical results are not a new execution on this branch. SDK220 business-route results are separate and are not transferred to SDK222. Strict declaration consumption retains 149 known errors; this checkpoint does not assert strict type correctness, fresh branch-wide CI, full physics acceptance, all 2,128 formal cells, or all nine gates.

Current checkpoint checks: all 84 retained source/fixture files match the restored source bytes; 19 changed JavaScript modules pass `node --check`; static relative TS/JS imports resolve against the current base plus this candidate; the v4 fixture's independent scalar-geometry tests pass 2/2 on Node v24.22.1. These two CPU tests do not execute Cocos or native physics. Native contract C files are included as test sources, not claimed newly executed.

## Required external inputs and known limitations

Native compilation requires the existing vendor Box3D source, exact staged-core patches and the declared toolchain. Runtime/gate verification requires exact externally retained native build/audit outputs, configured through the existing explicit build-directory/provenance-root interfaces. Those binary outputs, dependency trees and large raw logs are not committed here; gate logic is not bypassed. The source projection alone omits `vendor/box3d/source-manifest.json`, which exists on the remote base. A current provenance-control replay in that projection passed five path/rejection controls and then stopped at the sixth input-dependent verification with missing vendor manifest, not a successful fresh build.

The retained `tools/physics/box3d/owned-files.json` is historical evidence, not a newly regenerated checkpoint manifest: its recorded bytes/hash differ from the restored source for `src/air/physics/box3d/binding/facade.mjs`, `tools/physics/box3d/command-source-controls.mjs`, `tools/physics/box3d/motion-source-controls.mjs`, and `tools/physics/box3d/wasm-mesh-contract.mjs`. This inconsistency is preserved and unresolved; do not claim a clean complete native ownership audit. The checkpoint's Git tree records the actual current bytes.

The included public StaticMesh v4 runner requires a freshly supplied exact input lock and matching runtime artifacts. It may not reuse a historical lock as though these new Git identities were the old build. The original full closed-Game visibility harness is not duplicated in this backend checkpoint.
