# Capsule56 limited real Cocos fixture, source fixture

This fixture reuses the Query50 finite real-Cocos harness shape, with a separate namespace, result status, raw observations, and output directory. It uses actual Cocos `CapsuleCollider`, `RigidBody`, `Node`, public `PhysicsSystem.raycast/raycastClosest`, public before-step registration, the owned step clock, actual loader source, and a freshly built native Capsule WASM generation. No native return values, poses, hits, IDs, or counters are fabricated.

## Freeze and run only after merged source and a fresh full Release build

This repository includes `source-lock.json` for the frozen source inputs. Do not rerun the freeze command for an unchanged checkout; run the fixture with the included lock and a matching fresh full Release build. The lock records the commit visible before its own commit, while its per-file hashes bind the actual source bytes. For a new source generation, preserve the previous lock and raw evidence first, then explicitly freeze a new lock:

    node tools/verify/box3d/capsule-real-wasm/freeze-source.mjs

This writes a source-only lock, refuses to overwrite it, and is not a PASS result. It binds all product `src/`, native bridge/contract sources, the exact full asset-gate dependency closure and its declared build inputs, pinned vendor bytes, test setup/configuration, and the complete fixture. Run with the same official Node 22 tooling used by Query50:

    node tools/verify/box3d/capsule-real-wasm/run.mjs <fresh-full-release-artifact-directory> <new-output-directory> full

The output directory must not exist. The existing receipt qualifier is retained, and the complete current `verifySTBuild` asset gate is explicitly awaited before loading and after the attempt. The Release receipt must include `capsule_contract.c` in its input closure. Artifact audit must be PASS. There is no narrow, stale, or old-N4 fallback. The current production facade and real loader enforce the new schema/patch identity. Source hashes are checked before, at checkpoints, and after the attempt. Preserve any failing attempt; if source changes, use a new source lock/attempt rather than rewriting an old result.

## Bounded coverage

- Actual public CapsuleCollider construction, selector registration and native kind-2 calls for X/Y/Z axes.
- Positive nonuniform self-scale with maximum perpendicular radius scaling, axial segment scaling, and offset center.
- Analytic public bounds corroborated by real native ray entry distances and actual shape-generation identity.
- Short positive cylinder rejection before any native call or public-cache change.
- Finite huge-radius rejection by actual native mass/inertia preflight, immutable not-mutated phase, same old native shape ID, same body mass state/counts, retained public fields, and successful subsequent public queries.
- All three accepted public setters replace the actual native shape generation and retain requested body mass.
- Explicit zero cylinder produces sphere mass/inertia and equal-radius three-axis native ray hits. The separate native C Capsule contract, not a synthetic public label, asserts the actual native sphere shape type.
- A real before-step callback cannot mutate Capsule geometry but applies a force through the existing owned command path; one manual clock step produces the expected velocity. Pause does not add steps.
- Actual app close disposes the hook/world and returns observed native/core resources to zero.

## Boundaries

This is Node/JSDOM HEADLESS source integration, not renderer/browser, production asset deployment, EX01 visual acceptance, the formal 2128 matrix, 9 Gates, or full release readiness. Positive self-scale is covered; negative scale, sheared parent transforms and external Node synchronization remain unsupported and are not enabled by this fixture. Native post-create/readback fault injection is not included; conservative fault behavior is retained in the source. The full Release build qualifier does not expand this fixture's behavioral scope.

Delivery checks only: JS syntax, TypeScript syntax parse, formatting. Typecheck, fixture execution, native/ESM build, browser and formal acceptance: NOT_RUN.
