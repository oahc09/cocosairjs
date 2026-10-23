# Capsule implementation and EX01 source progress

## Scope and present status

Capsule native/public implementation is a candidate on the Box3D feature branch. Formal 2,128-cell and nine-Gate acceptance remains NOT_RUN; prior historical failures are not overwritten.

Source generation 58 (`6e228ccf3692e2cb4663a75be8bcedaa934c0817`) passed a fresh single-threaded SIMD WASM Release build with Emscripten 6.0.2 and Node 22.16.0, 70 audited compile units, and the exact artifact consistency gate. The native WASM32 Capsule contract covered three axes, analytic mass/inertia, exact-zero sphere behavior, 24 rejection cases, command/motion paths, debug geometry, and 128 lifetimes.

A separate real Cocos source-component integration test passed 9 recorded checkpoints: scaled/offset CapsuleCollider, real native ray identities/distances, setter generation replacement, native rejection atomicity, owned-clock force consumption and cleanup. This used the actual loader/facade and new WASM in Node/JSDOM HEADLESS, not a renderer or a compiled production ESM acceptance test. The close receipt was released with physics core/bridge allocations zero; runtime, scheduler and shared asset caches remained explicitly retained. This does not supersede the earlier internal 7/8 RED close test.

The subsequent EX01 source adds a centered Y-axis Capsule projectile (radius 0.42 m, cylinder 1 m, visual total height 1.84 m), matching mesh/collider, restricted single-centered-shape spring dragging, separate counts, and sphere-to-capsule automatic demo. Eight source/CPU checks passed. EX01 actual browser behavior, picking/visual alignment, wall behavior and 100 add/remove cycles remain NOT_RUN. Hull is still unsupported, not silently removed from the original requirements.

## Exact external evidence

Large raw data is in Library, not this Git commit.

| Package | Library ID | ZIP bytes | SHA-256 |
|---|---|---:|---|
| Native/public source56 | libfile_99b919e34c1c819199d04397883dad34 | 301163 | 2e9fcda90afb61b20a915876f25c661686b7c17d1b9ca731d9984705516fb4e4 |
| Full gate/source58 increment | libfile_38c44a205e248191a51943de4ff8c68f | 160598 | 97d39f1436df6257faca26c5038c8f45ce0c8b34ec0ab2aab5d9430d6986bf74 |
| Host Debug original evidence | libfile_0a07a79d2ff48191807926983e501118 | 13849834 | 469ac83d94ac7b06573e7014d99fd483e2121b8be264feab207bbbf7ad526d81 |
| WASM Release original evidence | libfile_b034b967479c8191b5b52627287647b6 | 5319970 | 871a8aff191fea9a2b4f0c856028de90235b4001ba6aebf537133e123e99f15b |
| Real Cocos public evidence | libfile_a1f30f4ef56c81919e8e1d43c3732403 | 532186 | 0e2ae0c1623cd8d840f16e590dd3351c95ff997fb644c46193596b3c9c73bf54 |

Each ZIP was actually downloaded and every archive member checked against its manifest. Source58's base-chain.json supplies the ordered source Library chain, including source57, exact hashes and prerequisite commits/trees. The public-evidence package also includes that chain and a proof that all 1,748 frozen source inputs were read from the independently restored Git object database. This was an incremental verification on the previously restored base, not a new empty-directory full-chain restoration. Generated .o/.a and Jest caches are explicitly excluded as regenerable; original assertion streams, final executables and receipts are preserved. Installed third-party dependencies must be recreated from the exact package-lock using official packages.

## Reproduction boundaries

Use the committed Capsule fixture README and its included source lock; do not rerun freeze on an unchanged checkout. Use a fresh full Release output directory, run audit-artifacts.mjs, and require verifySTBuild before the real Capsule fixture. Do not substitute the older query/N4 WASM: its schema and Capsule support do not match. A changed source lock establishes a new generation; it never changes the identity of the preserved source58 run.
