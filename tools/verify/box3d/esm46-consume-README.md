# Bounded consumption continuation from preserved attempt-c

This is SOURCE ONLY until a new Git plus actual Library source freeze and parent execution authorization. No new build is planned. Original attempt-c remains FAIL and is never overwritten.

## Exact provenance and scope

The two ESM graphs and DTS were generated once by source commit `86c0882e78e969f86162832e2536f979adfdfb76`. That attempt's actual ESM and DTS processes exited 0; it then failed before any consumer because its single-quote text test did not match the generated double-quoted Box3D literal. The immutable Library archive is `libfile_3d9cd9bcc9788191a303c2bfba57d850`, 45,084,448 bytes, SHA-256 `626179bd42f4340089141862581a957d1d0c8356d3dceb4406d1fda9ade78f51`. It was actually retrieved, every payload/mode verified, and restored independently.

`esm46-consume-artifacts.json` lists all 73 exact archive members used: 47 ESM/asset/map/provenance members, 2 generated DTS files, all 12 original fixtures, and 12 original evidence members. Each includes its original archive member, bytes, hash, mode, and new output destination. The producer commit is distinct from the new consumption-tool commit. This is not old PASS reuse: attempt-c has no consumption PASS.

The new tool invokes zero buildEngine and zero DTS builds. It creates a new output/consumer package from the verified archive bytes; it neither resumes into nor edits the old attempt-c directory. It reuses unchanged esm45-run.py run_stage, the original typed consumer and three negative controls, both original Node runtime consumers, strict/noEmit with pre-agreed skipLibCheck:true, actual legacy declaration resolution, original check counts (4 and 8), and original close/resource assertions. Its only acceptance-equivalent adjustment is matching the exact Box3D string literal with either single or double quote style. It does not change the literal value or weaken the API check.

Original DTS stderr is copied with the original evidence. Its two deprecated-API warnings and two TemplateLiteralType handling warnings remain material limits. Zero captured console.error is not zero diagnostics and does not certify the whole SDK declaration surface. A successful strict consuming typecheck only establishes the APIs it actually touches, with skipLibCheck:true excluding full dependency declaration validation.

Production remains UNFINISHED_LOADER_ONLY. Production refusal must still be measured before any transport/acquisition. The separately named TEST-ONLY explicit adapter positive, if successful, is internal Node/jsdom HEADLESS consumption of real N4 WASM, never browser or public integration. 2,128 cells and nine Gates remain NOT_RUN. Remote operation 41 remains UNKNOWN and untouched.

## Freeze and launch

Keep all original 12 esm45 files byte-identical. Add exactly the three esm46-consume files. The new source ZIP must contain all 15 under the receipt's sourceArchivePrefix + tools/verify/box3d/. The unchanged complete input proof remains the 15,843-row base plus two-file delta proof. The separate --build-roundtrip proof is the actual attempt-c failure archive download/verification proof, not the source-freeze receipt.

After parent freeze and authorization:

    NODE_OPTIONS=--max-old-space-size=6144 python tools/verify/box3d/esm46-consume-continuation.py --root /absolute/frozen/worktree --out /absolute/new-consumption-continuation --freeze-receipt /absolute/new-source-freeze.json --input-roundtrip /absolute/esm46b-input-roundtrip/input-roundtrip-proof.json --build-roundtrip /absolute/attempt-c-library-roundtrip-proof.json

The launcher captures its original full stdout/stderr/exit, including preflight failures. It verifies the source Git/ZIP, unchanged original fixture bytes against attempt-c and its producer Git commit, full baseline/current input bytes, full input Library archives, exact attempt-c archive hash, and every selected member. It copies locked files into the new output, invokes only typed-consumer then the two original runtime processes, and rechecks source/archive/artifact stability. All original build warnings, raw exits, source/input proofs, new raw results and complete output manifest are retained. Importing the original Python helpers is main-guarded and bytecode writing is disabled.

The continuation reports only its three new consumption stages. It never adds the prior build stages to its new success count, promotes the prior FAIL, deletes old output, or cleans generated data. A failure is preserved as a new failure, not patched in place or retried without a new approved source freeze.
