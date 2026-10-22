# Verified main source import, not recovered Box3D

This new repository starts with a newly authored import commit. It does not recreate or invent the lost Box3D history or the upstream parent chain.

Imported source: oahc09/cocosairjs main commit `b573be0741db9e2a13d38ce7e65870b97a1f5fbc`, upstream tree `13626c455aaadfea31bab1d9e634e0692045bc18`. Every imported file was read by its original blob SHA, recomputed as a Git blob, and recorded with SHA-256. No uncommitted content or subsequent upstream-update branch commits were imported.

The import contains 3,428 available upstream blobs, including all 1,493 files under src/. Another 6,796 upstream paths, primarily historical evidence and documentation but also build inputs and some vendor/test files, were unavailable in the current cache and were NOT represented by empty files or stubs. Their original paths, sizes, modes and SHA values are recorded in baseline-source-manifest.json inside the portable local recovery checkpoint. The remote branch retains the complete upstream tree and does not delete these paths. This is not a complete main checkout or a proven build closure.

The local baseline is an honest, portable source starting point. Before product development, obtain missing required build/test/license inputs by their recorded hashes and declare the selected build closure. Existing upstream evidence is historical; it does not establish any current Box3D PASS.
