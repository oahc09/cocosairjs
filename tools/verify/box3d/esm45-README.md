# Bounded actual ESM / DTS consumption candidate

This input-closure revision is SOURCE ONLY. The preserved earlier attempt-a invoked the bounded builder but failed its builtin-assets preflight before either buildEngine call: licenses/LICENSE_builtin_source.txt was absent from the disposable copy. No ESM graph, DTS, typed consumer, loader preparation, or application runtime ran in that attempt. This revision has only syntax/AST and file/hash checks, not runtime evidence.

## Core unfinished production integration

The actual selected production `physics-box3d` feature imports `feature.ts`, which installs a lazy loader factory but does not register a world adapter. The actual `prepareBox3D` rejects `AIR_E_BOX3D_UNSUPPORTED` before loader construction or transport. This fixture must retain and demonstrate that refusal, not turn it into an integration success.

The positive is named `TEST-ONLY-explicit-adapter`. It is an internal Node + jsdom HEADLESS consumption check of freshly built ESM and unchanged real N4 WASM. It explicitly registers the existing real adapter in the same bundled singleton graph. It is not browser transport, public entry integration, rendering, or release qualification.

## Exactly bounded work

- Two serial actual `@cocos/ccbuild.buildEngine` development ESM builds, matching `tools/build/build.cjs`: BUILD / HTML5, SUPPORT_JIT=false, source maps, Chrome 66 target, original default feature list plus `physics-box3d`.
- One real `tools/build/build-dts.cjs` invocation, in a disposable copied source tree. AIR_OUT_DIR does not redirect DTS; this tool writes `build/`, `src/__dts_before_bundle`, and may move/clean intermediates. Full stdout/stderr and original exits are retained. Even exit zero is rejected when bundler/TS errors were logged. A source-frozen preload observes original console.error calls because ccbuild prints some TypeScript errors without TS codes; it neither suppresses nor changes diagnostics or compiler behavior. Missing diagnostic capture is also a failure.
- One strict/noEmit TS4.9.5 consuming typecheck through the actual generated `types@<5.0` legacy entry and generated SDK declaration. `skipLibCheck:true` is fixed BEFORE execution to match the existing consumer-acceptance contract. This checks consumer code and three required negative @ts-expect-error controls, not all internal SDK declarations. TraceResolution/listFiles are retained.
- Two fresh Node runtime processes: unchanged production-selected refusal, then explicit TEST-ONLY adapter positive with exactly three fixed-clock N4 steps, actual Node motion, same-system/class/selector identities, and app.close resource release.
- No default/minified/Spark/System build, package prepare, npm installation, native rebuild, activation grid expansion, or remote mutation. 2128 cells and nine Gates remain NOT_RUN. Existing native receipts are verified inputs, never relabelled as current broad PASS.

## Unchanged product and test-only seams

No product file, public entry, compile flag, or build-number file is changed. The bounded builder uses existing asset verification/staging, metadata, line-ending and ESM-helper plugins. It does not increment the release build counter. Its injected metadata uses the next observed number only as bounded test metadata; it is not a release identity.

The production graph has no fixture transform. The separate TEST-ONLY graph has exactly two in-memory transforms, both recorded: append a clearly named internal export to the air aggregation, and pass the declared test-only loader dependency object as createBox3DSTLoader's third argument. The original lazy feature and preparation registry remain the same canonical modules. The appended entry imports the actual selector, PhysicsSystem, registration factory and binding facade from that same build graph. No second engine, TS/Jest engine import, fake native method, or fake physics result is permitted.

HTTP(S) options remain intact. The TEST-ONLY fetch seam returns byte-exact local manifest/MJS/WASM with proper MIME; loadModule imports the exact local N4 MJS. The real loader hashes the bytes and the real built facade initializes the real unchanged WASM. Observers call original binding methods and return their actual values. This is expressly NOT browser loading/SRI/network evidence.

## Source freeze and execution handoff

The baseline records original commit `7d0fd0c65473fea3e98ac79910c78b54b6d7eccd`, 1531 product source files, tool/vendor inputs, complete installed dependency file bytes and N4 artifact tree. Later fixture-only commits do not erase that baseline. Execution anchors the exact new clean source commit from the parent's Git + Library freeze receipt and verifies every installed fixture against that commit and the source ZIP before invoking any builder.

Install all esm45-* source files under tools/verify/box3d, review and commit them, upload/round-trip verify the source ZIP, then provide a JSON receipt with:

- status: SOURCE_GIT_AND_LIBRARY_FROZEN
- gitCommit: actual clean frozen commit
- libraryFileId: actual returned Library ID
- libraryRoundTripVerified: true, only after actual verification
- sourceArchivePath: local original or downloaded verified source ZIP
- sourceArchiveSHA256 and libraryRoundTripSHA256: identical verified SHA-256
- sourceArchivePrefix: exact prefix before tools/verify/box3d/ in ZIP, usually empty

The launcher does not itself assert remote Library state; the parent owns that verification. It verifies the supplied receipt, actual archive hash/content, current Git commit/content and baseline locally. Never fabricate a freeze receipt or run before the parent approves runtime.

Full baseline input preservation is a separate mandatory proof, not the source ZIP receipt. The corrected baseline's 15,843 rows are hashes, not preserved bytes. The disposable node_modules symlink and output FULL-MANIFEST do not make those dependencies independently recoverable. The parent must first preserve the complete inputs (including actual dependency bytes) in official Library archives, fetch them back and verify every member. The launcher re-verifies downloaded archive contents before execution.

The input-closure correction keeps all 15,841 original rows unchanged and adds exact existing bytes for `licenses/LICENSE_builtin_source.txt` (1478 bytes, SHA-256 `3500cfeb93ef67b550f5acf92793d428fc9b8d0186c384c97db5e6ebce6c9daa`) and `babel.config.js` (348 bytes, SHA-256 `7eea5c4c63bb20ddaf8def8ead54f611bb5bde0d864041d5a191835db7f0b893`). The license is a declared builtin manifest output that verify() reads. The root Babel configuration is discovered by the actual ccbuild input Babel plugin; omitting it changes configuration discovery even without ENOENT. This is an input-copy correction, not a product/configuration edit. No builder, runner, consumer or acceptance threshold changes. The unchanged multi-archive proof verifier supports the previously restored 79,580,241-byte base ZIP plus a two-file delta ZIP; each expected input must occur exactly once across both. Update baselineManifestSHA256 and re-freeze all 12 fixture sources before a new attempt. The failed attempt-a remains FAIL and is not overwritten.

Pass --input-roundtrip with schema box3d-esm45-input-roundtrip-v1, status VERIFIED_LIBRARY_INPUT_ROUNDTRIP, baselineManifestSHA256, and:

- archives: one or more { libraryFileId, localPath, sha256, libraryRoundTripSHA256, libraryRoundTripVerified: true, memberPrefix } records. localPath is the actual downloaded/round-trip verified ZIP. Each baseline file appears exactly once across all ZIPs at memberPrefix + its original relative path, with its dereferenced actual bytes.
- symlinks: the exact { path, symlinkTarget } rows from the baseline. Preserved bytes alone do not erase original link identity.

Every file's decompressed bytes, size and SHA are checked, including 13,045 installed dependency paths and N4 artifacts. The proof and per-member archive mapping are retained with raw output. Library IDs remain the durable recovery locations; output alone is not advertised as a standalone archive of the linked dependencies.

Approved command, only AFTER both source and complete input preservation:

    python tools/verify/box3d/esm45-capture.py --root /absolute/frozen/worktree --out /absolute/new-attempt-outside-worktree --freeze-receipt /absolute/verified-freeze.json --input-roundtrip /absolute/verified-input-roundtrip.json

The outer capture preserves the complete runner stdout/stderr and original exit even if preflight fails before the attempt directory exists. The new attempt directory is never overwritten. It retains disposable source, build outputs/maps, DTS files/intermediates, all command launch/exit records, exact stdout/stderr, raw native calls, before/after input inventories, final scope-limited outcome, and a full output manifest. The original source checkout and dependencies are re-hashed afterwards. Output preservation is intentional, with no cleanup command.

Failure is terminal for that attempt, not permission to relax controls. Keep every failed attempt, diagnose, revise source, re-freeze Git + Library, and ask the lead before any new runtime attempt.

## Evidence limits

A successful report can only say bounded ESM/DTS consumption succeeded and the production missing-adapter refusal was verified. It must prominently retain UNFINISHED_LOADER_ONLY. It does not claim public Box3D integration or any 2128-cell/nine-Gate acceptance. The original remote operation 41 create_tree remains UNKNOWN; this fixture does not retry it or substitute a write.
