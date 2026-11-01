# Box3D pinned sources

These are unmodified, hash-verified source selections, not prior lost implementation
files and not a full upstream Git checkout.

- `core/`: complete core `include/` and `src/`, root CMake, README and original MIT
  license at `erincatto/box3d@efca0c184d40fd6a82016983f1601c4d23965867`.
- `binding-base/`: selected original binding/build/test and license files from
  `isaac-mason/box3d.js@5d5a3af049cccd9948b2b55bac4342414af0ef64`, reference only.
  No old dist WASM or JS binary is included or used.
- `old-core-review/`: selected headers/license/internal comparison inputs from the
  binding's pinned old core `8441b4a06d6d09dcfb0b0f704df4d847d1437b92`, review only.
- `source-manifest.json`: original blob identity, selected revision, length and
  SHA-256 for every imported source. Tree and comparison responses preserve exact
  upstream provenance. Upstream copyright/license files remain unchanged.

Do not edit these source files to make a build pass. Isolate any future reviewed
patch and bind its hash to the version lock. Build the host project in
`tools/physics/box3d/`, not the upstream root directly. Read its `abi-review.md` for
compatibility decisions and current validation limits.
