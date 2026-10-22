# Optional Box3D ST build assets

The `physics-box3d` feature is opt-in. Default `AIR_FEATURES`, the default `air` barrel, and builtin/Cannon selection remain unchanged. An unselected build does not read or copy Box3D inputs. The feature currently registers lazy preparation only; it has no fake world. Until T09 supplies the actual engine world adapter, selecting it reports explicit unsupported status before requesting assets.

A selected build requires `AIR_BOX3D_ST_BUILD_DIR` to identify a current successful audited ST native build. `tools/build/box3d-assets.cjs` verifies the exact current 21-input inventory, original vendor/source closure, patch identity, generated artifact bytes, static facade bytes, compile-input hashes and the current audit's eight evidence hashes. It does not download or compile anything. A stale e artifact cannot be relabelled with the new g schema.

After validation it copies the four generated artifacts, the unchanged manifest and official core license into `<AIR_OUT_DIR>/physics/box3d/st/`. It records a separate distribution receipt. It never copies an MT variant. Source/output ancestor overlaps, symlink output parents/files, foreign existing destination entries and stale inputs are rejected before any output bytes change. Test corruption is confined to separate copies.

The optional build plugin injects a manifest/facade/native-identity descriptor into the AIR-owned feature entry and resolves the directory relative to the built runtime URL. No user-supplied digest or fetched manifest is treated as its own trust anchor. Module evaluation registers only a factory; module construction, fetch and native world creation are not performed then. The descriptor does not assert browser SRI for dynamic imports.

Current evidence: six focused staging groups passed, including 13 corrupt/incomplete-input cases, output path guards, exact copied-byte checks, and one actual generated Release WASM load/60-step/dispose cycle through the production loader with explicit Node filesystem transport. The same schema also has a separate 20-cycle production-loader run. These are not a whole engine build, application world integration, browser/CSP, tarball, or full WASM-08 result.

The initial overlap regression is preserved under `assets-staging-20261022-h1`; it created a new nested copy only and did not overwrite original build artifacts. That subtree was moved into a separate diagnostic output, the four original artifact hashes were rechecked, and corrected guards were rerun in new h2/h3 records. No old result was relabelled.
