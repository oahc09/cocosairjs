# Sphere–Capsule generation geometry and public-event slice

Status: **SOURCE CANDIDATE; new native/WASM and public SDK execution NOT_RUN**. This increment does not reinterpret SDK230 or its completed APP230 100-scene observable subset. Do not repeat that recovery campaign to qualify this new pair.

## Product change and identity

The pinned core already registers capsule/sphere contacts and creates their manifold in `src/convex_manifold.c:b3CollideCapsuleAndSphere`; the existing generation-basis patch captures its transforms and COMs after contact generation. No core/vendor physics change or new native offset is needed.

This slice admits the previously rejected native sphere/capsule family in `native/geometry.c` and the corresponding exact public `SphereCollider`/`CapsuleCollider` descriptor pair in `collision-events.ts`. Native wire remains 25 words, and existing copied geometry/handle lifetimes remain mandatory. The main ABI schema hash changes: a new facade must not accept an older module merely because the wire size agrees. An exact-zero Capsule segment is an actual native sphere, so its affected pairing with a positive Capsule is included in the public boundary test, not silently left unqualified.

`AVAILABLE` means that a real cached-generation basis exists. It is not permission to use current Node transforms as old manifold anchors, fabricate geometry, deliver an incomplete batch, or widen admission to arbitrary Hull/Mesh/compound/heightfield events. The existing raw separation, velocities and impulses retain their own sampling semantics. Regeneration, recycling and reading are separate epochs.

## Native WASM oracle

`wasm-sphere-capsule-contract.mjs` loads the actual product module and facade. It retains body poses **before** a real step, maps complete native body/shape identities, and writes every asserted contact to a fresh `sphere-capsule-samples.raw.jsonl`.

The fixed 18-case set is three capsule axes × cylindrical side / negative cap / positive cap × two creation orders. Creation order is varied without assuming that the native canonical A/B pair order must reverse; all comparisons use actual complete A/B identities. Bodies have nontrivial rotations and offset shape centers. `oracle.mjs` uses independent double-precision segment projection, explicit rotation matrices and the actual float32 endpoint construction; it calls no Box3D distance/manifold routine and uses no debug or hit-event point as an oracle. Each sample checks full identity, exact retained generation poses, one actual manifold point, both world points, both local points, opposite world normals, both local-frame normals and generation separation. Tolerances remain 0.00002 for points, normal components and separation; retained basis floats compare exactly. These finite nondegenerate cases do not claim a unique analytic normal at coincident sphere/segment centers or exhaustive geometry coverage.

Further real-WASM controls require repeated read immutability, real heap growth, stale capabilities after step/mutation/destruction, foreign-world/invalid-contact/short-output no-partial writes, and final same-module tracked core bytes plus **native GLOBAL** bridge query restored separately. They are not a complete all-handle/whole-heap census. Audit and SDK admission must rehash the sample artifact and independently rerun its analytic checks, not trust a `PASS` string or stored expected values.

The older geometry fixture retains all prior sphere/box oracles. Its former real sphere/capsule exclusion test is replaced by a real still-unsupported Mesh–Sphere contact, preserving explicit fail-closed geometry behavior without demanding rejection of the newly admitted family.

## Public API boundary

`public-contract.mjs` is called with the new, proof-bound SDK and an app created through the unchanged public host/loader/factory. It does not substitute a module, import SDK230, or invent a build lock. The public contract covers both receiver directions, enter/stay/natural exit, detached contact equations, the exact-zero Capsule reduction and destruction from a callback with subsequent cleanup and normal close. Its CPU controls execute real TypeScript dispatcher/contact-equation source with explicitly synthetic snapshots; those tests are not physics evidence.

Run the public consumer only after the new producer's standard ST/WASM gates and independent sphere/capsule oracle pass, followed by a real newly numbered ESM/DTS build. Bind actual producer/runtime/fixture hashes and preserve failed attempts. An owned headless clock is not browser/GPU presentation evidence. No C20 baseline, original fixture, threshold or world identity is changed by this increment.

## Remaining original scope

The original `CocosAirJS-Box3D-Development-Plan-v1.2.md`, §8.5 / T15 (Library `libfile_335495eb4e208191bf8025631fdd1b33`), requires broader contact/sensor batch snapshots, transient sensors, pair handling and deferred callback mutation, with C21–C25 and additional target-tick/WASM event completion conditions. This is one T15 collision/contact product slice, not all T15, C21–C25 or G0–G8. Unsupported families, the broader original shape matrix, complete global census, after-close observation, browser/device/MT qualification and all other unfinished original tasks remain separate. Source/CPU approval may protect code in Git; it must not be reported as new native or public-runtime qualification.
