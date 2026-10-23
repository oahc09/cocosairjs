# Actual persistent target fixture, source candidate

Status: SOURCE_ONLY_NOT_RUN. This new fixture does not inherit teleport PASS rows. The frozen named roster is `owner-target-real-wasm-roster.json`. All 2,128 formal cells and nine Gates remain NOT_RUN. No public helper or supported-capability export is enabled by this fixture.

## Frozen cases and evidence

1. `motion-idle-zero`: one small translation with fixed identity orientation, nonzero COM, zero damping, float32 dt and four substeps. Independent arithmetic computes center, velocity and origin. Capture requested, predicted, native planned, actual immediate operation, post-step native origin, Node pose and errors. Exactly one validate/apply/step per tick; no reset or alternate motion batch, no origin correction in command apply. The next tick contains only an idle paired zero.
2. `clear-dispose-protected`: actual initial nonzero linear and angular target velocities; clear retains Node/public/direct-adapter velocity protection. Dispose removes target motion but retains a non-target user clear for explicit cancellation. Cancellation removes that user record, never the protected cleanup. Before completion, vector getters are unread and reacquisition is rejected. Writeback listeners still see protected guards. Only full tick completion admits fresh velocity and a fresh target; the old handle never revives.
3. `disable-collider-survives`: actual RigidBody disable while its collider remains enabled. Native op13 before/after observations prove both velocities become zero while native type remains kinematic and native enabled remains true, with unchanged force/torque, awake and tick. Unrelated accepted impulse survives. Re-enable requires a fresh target.
4. `type-away-reacquire`: actual kinematic-to-dynamic change. Paired native zero must precede native type change. Return to kinematic accepts a new target only, and unrelated accepted work is retained.
5. `component-recreate`: actual RigidBody destroy and deferred destruction, followed by replacement on the same Node while collider/native body survives. Capture old and new component UUIDs, unchanged actual body count and native ID. Exact old target cannot claim the replacement.
6. `compound-covering-writeback`: two child target owners cover a shared, rotated, independently moving dynamic physics ancestor. Observe original Node setters without replacing behavior. Exactly one successful setter per operation and Node. Every listener attempts the same ancestor setter and is rejected. Independent inverse-rotation child-local calculation, native/world pose and unchanged parent rotation check the basis.
7. `caught-revoked-set`: a current producer queues a provisional impulse and catches an old target's rejected set. The current candidate aborts with that same error identity, no native validate/apply/step and no caller pose getter reads. Earlier accepted current target survives; deliberate retry consumes it without the provisional impulse.
8. `caught-revoked-clear`: the same current-owner latch control using the revoked clear method, independently isolated in a fresh process.
9. `listener-completed-step-failure`: an explicitly labelled real JavaScript transform listener throws after native command commit and completed step. World faults, completed native tick stays counted, pending is retired, retry cannot replay, and app.close must free native core/bridge resources despite persistent guards.

Every case checks real RigidBody/shape adapter reflection for no shared-body/native control exposure, frozen target handle shape, no public promotion, final actual app.close resource diagnostics, and terminal stale-handle behavior. Instrumentation forwards actual calls/results. No mock supplies physics, and no native recompilation occurs.

## Deliberate exclusions and risks

Full persistent-scene transfer, unrelated-scene release, Game pause versus intentionally owned manual clock, and cross-world/multiple-app routing are NOT_RUN. The existing headless `game.pause()` plus manual PhysicsSystem step is only a scheduling seam, not application lifetime proof. No browser evidence, formal full damping/cap/lock/CCD/constraint matrix, native fault injection, or universal lifetime/leak proof follows from these cases.

The transparent preload makes extra read-only native bodyState/stepDiagnostics calls immediately around op13/type/enable. It records observation errors rather than changing a native delegate's dispatch or return. Node setter wrappers count calls and invoke the original once. The compound case counts successful writeback invocations separately from intentionally refused reentrant invocations.

No case has run against target41 yet. The adapter private-getter assertion intentionally requires both RigidBody and shape hardening to land. A natural native failure, unsupported seam, changed source, wrong artifact, or missing external input proof must stay a failure; do not weaken assertions or reuse prior PASS results.

## Qualification order

1. Review/copy this entire `owner-target-real-wasm*` source family, plus target41 product changes. Format, commit and actually round-trip the small source archive through Library before authorizing any native run.
2. Source-only input preparation, through the direct-stream wrapper:

   `python3 tools/verify/box3d/owner-target-real-wasm-run.py tools/physics/box3d/output/command-wasm-release-20261022-n4 /absolute/new-campaign/inputs --prepare`

   This emits an exact deterministic `frozen-inputs.tar.gz` and `receipt.json` without loading WASM or running Jest. Preserve preparation stdout/stderr too.

3. Save that exact tar.gz to Library, actually download it to a different path and verify SHA-256. Write an external proof JSON with `library_file_id`, `file_id`, `file_name`, `actual_download_verified: true`, `sha256`, `prepared_receipt`, `downloaded_path`, and the exact lead-authorized `authorized_source_head`. Paths identify real files; never invent verification fields.
4. After explicit lead authorization, invoke one frozen named case through the same wrapper:

   `python3 tools/verify/box3d/owner-target-real-wasm-run.py tools/physics/box3d/output/command-wasm-release-20261022-n4 /absolute/new-campaign/01-motion-idle-zero motion-idle-zero /absolute/new-campaign/input-roundtrip.json`

   Collector verifies external downloaded bytes, source hashes, native artifact identity, frozen roster and HEAD before launching actual AIR/N4. One fresh output directory per attempt. Never overwrite failed attempts. All wrappers capture original subprocess stdout/stderr directly, not tool-response reconstructions.

5. Immediately after each case or small batch, package actual raw directories with the explicit-input packager:

   `python3 tools/verify/box3d/owner-target-real-wasm-package.py /absolute/new-campaign/Box3D-target41-raw-01.zip /absolute/new-campaign/input-roundtrip.json /absolute/new-campaign/01-motion-idle-zero`

   Each raw batch includes launcher metadata, wrapper stdout/stderr, collector/Jest/raw native outputs, before/after exact source manifests and every referenced transitive runtime CAS object. The already externalized exact input tar is referenced by Library ID and SHA, not recursively repackaged. Source/archive packaging must use explicit inventories and must not recursively include old package manifests or archives.

6. Save each raw ZIP to Library and verify actual downloaded SHA and ZIP member hashes before further long qualification. Retain failed attempts alongside later runs. Package preparation logs and input receipt with the first raw batch as separate explicit files if needed; do not claim they were already contained in the input tar.

The frozen restored WASM SHA-256 is `4b9494dc2d3c46b4cbacf8d12a8119df5e91a27e19f90b946d50f6467b7adf8f`. Changed product/fixture bytes require a new input preparation and external proof. No Git or remote operations are performed by these source tools, other than read-only HEAD observation.
