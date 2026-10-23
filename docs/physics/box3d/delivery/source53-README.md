# Box3D source53 delivery · 2026-10-23

## GitHub implementation

The source-first implementation commit is [`d8e2c328ec653cb996801929fb1a94aef28bc613`](https://github.com/oahc09/cocosairjs/commit/d8e2c328ec653cb996801929fb1a94aef28bc613) on `feat/box3d-rebuild-20261022`, with real parent `53f8885c0aa15b6c8d2fd76f1f6bd6d3e3a1707e`. It was advanced without force; main was not changed.

Its 65 changed files were read back by remote blob SHA and matched the implementation source frozen at local commit `f75f0f48e97db3053676cfe4433faf53071ed6b0`. `source53-files.json` records the exact set. All changed engine `src`, native bridge/build and EX01 implementation files are included. Historical test harnesses and raw evidence are not claimed to be completely mirrored by this source-first commit; their full source/recovery chain is retained in the source53 Library archive.

## Implemented and built

- Normal optional `physics-box3d` production feature registers the actual Box3D adapter. The default backend is not silently changed.
- Generic native callback ray queries back public all/closest queries, with filtering before closest selection, copied inputs/results and current collider identity mapping.
- Normal AIR exports `registerBox3DBeforeStep`, attached to the existing owned physics clock rather than a second simulation scheduler.
- Original EX01 has a 100-brick wall, sphere impulses, pause/reset, mass/friction/restitution controls and copied native diagnostics. The new spring input uses actual ray picking and public fixed-tick `applyForce` for one centered dynamic Box/Sphere collider. Release removes spring force without inventing velocity or pose animation.
- New native Debug/Release and limited real Cocos query/force integration tests passed. Normal production ESM build52 and fresh declarations completed with exit0. The actual scene declaration consumer passed strict/noEmit with `skipLibCheck=true`, without augmentation. The declaration producer's two TemplateLiteralType and two deprecation warnings remain in the original raw logs.

## Not complete or qualified

The runnable candidate has not been executed in a browser. Rendering, visible pick alignment, drag stability/feel, release behavior and wall collision correctness remain unverified. Capsule/hull and the original full shape set, arbitrary COM/compound dragging, true joints, public collision events/native debug drawing, multi/auto modes, 100-cycle resource recovery, full numeric acceptance and real video/screenshots are still unfinished or unverified.

All **2128 formal matrix cells and 9 Gates remain NOT_RUN**. Earlier failures retain their original scope, including the historical internal-consumer 7/8 result. Native disposal is not relabelled as whole-app cache release. A successful build or a static archive check is not scene acceptance.

## Exact outputs and recovery

The normal runtime52 producer source is `00e93c0718684293304bc279ec77a6746c53a9b4`, tree `3af80164148c1d8e3cebd0e28461c52ea6c24ee2`, build number206. Its ESM SHA256 is `c3a7c22e845f6d05dfda5c0820908ec8de2040bca2c01953c1e2a7a720aa8a00`; new Release WASM is `014bed800a5ecf0bc13b1db68885469fa846c1786e3764bfdb8b7561e0114218`; generated DTS is `ec92e8131b8bce2fc4730e28818eea2f159b3608a0f9f1fdcae0e1209754fb42`.

`source53-artifacts.json` names the exact Library IDs, archive filenames, byte counts and SHA256 values. Each was actually downloaded and verified. The full source53 increment contains `base-chain.json`: download those ordered predecessors, verify each archive hash, then apply the source bundles in order. The current independent verification upgraded an already restored base; it is not described as a new empty-directory full-chain restore. Do not omit the required base or substitute workspace-only objects.

The candidate52b Windows ZIP contains the static `web` tree and local serving instructions. Extract it, serve that folder with an installed Python HTTP server bound to `127.0.0.1`, then use a WebGL2-capable browser. It is not a hosted deployment. Exact runtime/native/DTS raw stays in the listed archives, not in this Git commit. Known old auxiliary-evidence gaps are retained rather than fabricated or hidden.

## Supplemental historical verification sources

This supplement contains 86 files under `tools/verify/box3d/`. Their exact frozen source identities are recorded in `source53-files.json` under `supplementalVerificationSources`, separately from the already verified 65-file implementation manifest. This static inventory does not encode live branch status: verify the containing Git commit and compare its blobs with the listed identities. The supplement contains source, configuration, rosters and fixed-input manifests, not original execution raw.

`esm45-baseline.json` is a required fixed input manifest, not a test result. It locks 15,843 input rows to historical product commit `7d0fd0c65473fea3e98ac79910c78b54b6d7eccd`, including 13,045 installed dependency paths and 454 N4 artifact/input rows. Its original byte archive and the two-input correction archive both remain separately preserved in Library. The declared environment is Node `v24.19.0` and TypeScript `4.9.5`; the hashes and original symlink identities must not be relaxed.

The owner/lifecycle harnesses admit the old N4 WASM SHA256 `4b9494dc2d3c46b4cbacf8d12a8119df5e91a27e19f90b946d50f6467b7adf8f` and check its binding to the corresponding historical source inputs. The ESM46 no-rebuild continuation additionally reads original fixture bytes with `git show` at producer commit `86c0882e78e969f86162832e2536f979adfdfb76`. Its exact failed attempt-c archive still exists in Library, with a 73-member identity lock in `esm46-consume-artifacts.json`. The original attempt-c failure and historical internal-consumer 7/8 result remain unchanged.

Restore these harnesses in an isolated historical checkout, not by running them against the newest source53 files. Follow the source53 archive's ordered `base-chain.json` prerequisites to recover the original Git objects, then restore the named input archives and verify their archive/member hashes. `source53-artifacts.json` now supplies the baseline archives, failed attempt-c archive and selected source44/46b/46c/46d locators under `historicalHarnessRecovery`. Those selected source ZIPs are increments and require their earlier chain. Bind proof paths to the actual files restored on the new machine only after verification; do not copy stale machine paths or fabricate fresh verification.

The static audit rechecked all 15,843 baseline members in existing downloaded input archives and the 73 locked attempt-c members. This was not a new remote availability check, fresh full-chain restore, build, runtime test or browser run. Do not substitute the new Release WASM or latest product source for the frozen inputs, weaken qualification checks, or describe these historical tools as current source53 acceptance. Original raw remains in the identified Library archives rather than this supplemental Git batch.

## Package-command scope and existing issues

The 48 existing `package.json` scripts have no newly omitted explicit repository entries or statically resolved source dependencies from this supplemental batch. The historical Box3D harnesses remain direct CLI tools; this documentation does not add npm commands or claim those commands were executed.

Two existing `format` / `format:check` targets are absent from both the old base and source53: `docs/manual/script-component-workflow.md` and `docs/manual/custom-shaders.md`. This is a pre-existing command-target issue, not a missing file introduced by the Box3D synchronization. It is recorded separately and is not repaired or hidden by this delivery.
