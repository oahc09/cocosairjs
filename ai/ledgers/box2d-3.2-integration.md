# Box2D 3.2 integration

Branch: `feat/box2d-3.2-wasm`. User authorized development and complete acceptance on 2026-10-20.

## Scope and acceptance

- Preserve the default JavaScript backend. Add explicitly selected `box2d-v3-wasm` behind existing Cocos 2D components.
- Pin upstream v3.2.0 sources and compiler; ship separate Web-only WASM assets with portable provenance.
- Cover every sample registered by the pinned official sample sources. Preserve original sample constructors and simulation logic; document any replacement of the desktop host, unavailable desktop interaction, and additional scenario-specific assertions. Compilation or enumeration alone is not acceptance.
- Add AIR component integration: bodies, colliders, queries, filters, contact controls, all eight joint components, transform synchronization, loading errors, scene release and world teardown.
- No change to project version, default backend, canonical example campaign or unrelated source. No commit/push requested.

## Dynamic plan

1. complete Freeze source and official case inventory; establish reproducible single-thread WASM build.
2. complete Implement native bridge and Cocos backend, startup selection and teardown.
3. complete Implement official-case browser runner and AIR integration examples/assertions.
4. complete Format, build JS/declarations, run focused static and browser gates, fix failures.
5. complete Archive complete evidence and reconcile documentation with delivered compatibility.

## Current verification

**Accepted: PASS.** Baseline worktree was clean; branch created successfully. Emscripten installation is task-local under ignored `output/box2d/toolchain/`. Historical progress notes below are retained; the final record follows them.

- Frozen upstream: `178495ba35695aefe9c321e569d2277f06db3b90`; 186 retained original files compared byte-for-byte with the downloaded source; 147 registered official samples compiled unchanged.
- Initial runtime: 56,145-byte JS and 376,730-byte WASM. That candidate's clean builds matched byte-for-byte; `output/box2d/repro-result.json`. Final bytes and receipts are recorded below.
- First complete official discovery run: all 147 scenario rows passed; aggregate correctly rejected because source changed during collection. Retained at `output/box2d/acceptance/2026-10-19T16-42-34-443Z-chromium-official/`.
- Initial AIR browser run: 40 component/physics assertions plus real mouse drag and world/physical browser shutdown passed before subsequent regression additions. This is historical exploratory evidence, not final acceptance.
- Focused bootstrap/config/release regression: 3 suites, 16 tests passed. Typecheck and file-map passed. License registry: no failures; pre-existing Spark attention remains unrelated.
- Retained failures include Node default-heap exhaustion, Playwright installer directory-lock failures, an AABB-margin mismatch, and contact-callback mutation assertions. Browser binaries were obtained from the exact Playwright download URLs without changing system installation.
- At that checkpoint final acceptance was still pending. It is now completed by the frozen runs below.

## Final acceptance

- [Complete evidence record](../../docs/evidence/box2d3-acceptance/README.md): all three engines passed all 147 official default scenarios and all 47 AIR component assertions, plus real-pointer drag, compositor/debug checks, loading failures, default-backend preservation, scene/world release and exact browser exit/close collection within the original four-second budget.
- Frozen reports: `output/box2d/acceptance/2026-10-19T17-28-20-666Z-{chromium,firefox,webkit}-all/report.json`. All are `pass:true`, `complete:true`, `subset:false`, with matching input fingerprints and zero page errors.
- Final native artifacts: JS 56,145 bytes; WASM 376,818 bytes. The second-source-root rebuild matches both exactly; `output/box2d/repro-final-result.json`.
- Determinism: Falling Hinges and Rollback both produce sleep step 299 and hash `0x465F3DF4` on all three engines.
- Static gates: `output/box2d/final-static-gates.json`, all eight checks passed, including 3 suites / 16 bootstrap, configuration and scene-release tests.
- Delivered tarball: `output/box2d/cocosair.js-1.0.0.tgz`; asset hashes/license and extracted TypeScript consumer passed. Both extracted development and minified runtimes passed real-browser collision and teardown checks; `output/box2d/package-browser.json`.
- Retained fixes include geometric AABB bounds, native-unlock mutation flushing, one-tick contact disabling, zero-frequency rigid spring semantics, stable minimum joint distances, transformed-Canvas mouse projection, debug rendering/clearing and release after destroyed debug nodes. Replay's supplied recording now includes a ground, and compositor checks compare actual painted coverage instead of an arbitrary pixel-area minimum that rejected sparse official scenes.
- No project version change, Git commit/push, release, canonical evidence publication or default-backend replacement was performed. There are no remaining acceptance items within the documented single-thread, float, default-scenario scope.

## Main integration follow-up

User authorized the merge-review recommendations on 2026-10-20, including saving the implementation commit,
integrating current main, rebuilding, rerunning affected checks and making original evidence portable.
The preceding acceptance is historical and is not a PASS for the merged candidate.

1. complete Save the original candidate as `ac59bafd`; merge main `aaf58b14`, preserving math exports and async packaging.
2. complete Rebuild development/minified/maps/declarations and Spark; retain original 1359 artifacts in checked tar volumes.
3. blocked Validate merged candidate: CPU/package/math/static gates passed; actual browser launch fails before page load on this Windows host. Fresh browser acceptance and Linux CI remain required.
4. complete Record portable merged-candidate evidence and explicitly retain NOT_RUN/failed attempts. Merge readiness remains blocked; no main merge is performed.

The official five-example custody collector and its `/proc` process proofs require Linux, as specified by
`docs/reference/example-evidence-campaign.md`. Windows component/browser evidence cannot replace that CI receipt.
Failures from initial Windows test attempts remain in `output/box2d/merge-main/`.

See `docs/evidence/box2d3-merge-main/README.md`: 137 runtime, 42 SDK/math, 50 CI-policy and 22 portable evidence-tool tests passed.
The two Linux/privilege-dependent evidence-tool controls are not counted as passed. Current browser attempts execute zero
official cases because launch fails; previous 147/47 browser results remain historical only. Native sources and assets are
unchanged, and tarball assets match their pinned receipt. The actual tarball, logs and failed launches are archived with hashes.
