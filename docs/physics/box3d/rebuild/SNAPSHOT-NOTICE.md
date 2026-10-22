# Verified main source import, not recovered Box3D

This new repository starts with a newly authored import commit. It does not recreate or invent the lost Box3D history or the upstream parent chain.

Imported source: oahc09/cocosairjs main commit `b573be0741db9e2a13d38ce7e65870b97a1f5fbc`, upstream tree `13626c455aaadfea31bab1d9e634e0692045bc18`. Every imported file was read by its original blob SHA, recomputed as a Git blob, and recorded with SHA-256. No uncommitted content or subsequent upstream-update branch commits were imported.

The import contains 3,428 available upstream blobs, including all 1,493 files under src/. Another 6,796 upstream paths, primarily historical evidence and documentation but also build inputs and some vendor/test files, were unavailable in the current cache and were NOT represented by empty files or stubs. Their original paths, sizes, modes and SHA values are recorded in baseline-source-manifest.json inside the portable local recovery checkpoint. The remote branch retains the complete upstream tree and does not delete these paths. This is not a complete main checkout or a proven build closure.

The local baseline is an honest, portable source starting point. Before product development, obtain missing required build/test/license inputs by their recorded hashes and declare the selected build closure. Existing upstream evidence is historical; it does not establish any current Box3D PASS.

## Checkpoint 7 clarification

The initial 3,428-file / 6,796-missing count above is the immutable import boundary, not the latest checkout count. By source commit `37a74a767a1f3ec504e06aec940f985bf0206b02`, 445 additional exact-main files had been restored with per-file receipts; 6,351 original main paths still remained absent from the tracked local snapshot. Three runtime variants and the default declarations were actually generated. This establishes only those recorded commands, not every build, package or acceptance closure.

The remote branch preserves pre-existing upstream `build/` artifacts unless a checkpoint explicitly replaces them. Those retained upstream bundles/declarations are **not** the newly tested Box3D build and must not be used as evidence of current feature support. Checkpoint 7's actual generated runtime bytes are in Library `libfile_1bd16f266d908191b90831c71d5a2423`; the default declaration companion is in source checkpoint archive `libfile_6b8b759339308191be6e7fce03601308`. Both have recorded download/hash verification. Use their exact manifests or rebuild from the corresponding source and locked inputs. The branch is a work-in-progress source checkpoint, not a published ready-to-consume package.

Subsequent source changes invalidate affected prior runtime results. In particular the C21 generation-basis candidate after checkpoint 7 changes the ABI schema and patch-chain identity: old g WASM cannot qualify it even if an older runtime bundle still exists on disk. Keep every generation's original artifacts and receipts distinct.
