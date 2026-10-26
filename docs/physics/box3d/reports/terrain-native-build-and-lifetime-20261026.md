# Terrain ST build and native lifetime — 2026-10-26

## Result and limits

**Fresh limited ST build and finite production mesh-bridge lifetime checks passed. Public Terrain acceptance did not run.** Native storage remains a cooked triangle mesh, not a native heightfield shape.

| Attempt        | Source producer                            | Standard product gates                                           | Overall supervisor result                                                            | Duration |
| -------------- | ------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------- |
| ST 1           | `2a75272ffca5facf7a12a985c6f5bea2ad0e6a19` | PASS; 33 commands, 79 inputs, audit PASS, limited-consumer READY | **FAIL_OR_PARTIAL**: six new toolchain `.pyc` files breached frozen input protection | 86.712 s |
| ST 2           | `ae0803c0c3e85aa627666f76eef29c4e62ab2e93` | PASS; 33 commands, 79 inputs, audit PASS, limited-consumer READY | **PASS_LIMITED_ST_BUILD**; zero protected-input drift                                | 85.377 s |
| Terrain bridge | `ae0803c0c3e85aa627666f76eef29c4e62ab2e93` | Fresh ST production facade, three lifetime orders                | **PASS_LIMITED_NATIVE_TERRAIN_BRIDGE**; zero protected-input drift                   | 1.481 s  |

Each process tree closed with `ECHILD_AND_NO_GROUP_MEMBERS`. ST 2 protected 67,410 entries; the scoped bridge protected 996. Both ST runs used exactly the same ordered 79 input paths/hashes, and all four product assets are byte-identical between runs. The audit covers 82 compiled source entries. `consumer-ready.json` explicitly retains `acceptancePassed: false`.

Attempt 1 remains failed overall. Attempt 2 used a new explicit authorization and frozen baseline; it did not erase the six-file drift, broaden attempt 1 exclusions, overwrite evidence, or retroactively change its result.

## Native lifetime observations

The hash-bound `native-terrain-lifetime.mjs` invokes the real production mesh bridge on the independent 3×3 terrain triangles. It checks six rays/source faces, copied input/result ownership, static-only rejection, leases/borrows, stale capabilities and cleanup. Per-order deltas were:

| Order       | Cook count | Destruction first permitted at             | Final destruction count | Final core live bytes |
| ----------- | ---------- | ------------------------------------------ | ----------------------- | --------------------- |
| cache-first | 1          | Last native shape borrow released          | 1                       | 0                     |
| cache-last  | 1          | Last cache lease released after all shapes | 1                       | 0                     |
| world-last  | 1          | World teardown with two remaining borrows  | 1                       | 0                     |

Earlier intermediate stages report zero destructions; idempotent cleanup leaves the count at one. The probe counts successful native mesh cooks and completed `b3DestroyMesh` calls, including production rollback paths. These observed cases are **not individual malloc/free invocation counts**, a global zero-leak guarantee, or proof that every rollback path was exercised. The separate standard native mesh contract reports 677 checks and four release orders; it is not substituted for the terrain fixture.

**C19:** finite production mesh-bridge lifetime/destruction evidence only; public TerrainCollider cohort still requires its own run. **C17/public Terrain:** NOT_RUN; the native report says `NOT_QUALIFIED_NATIVE_ONLY`. No fresh production ESM, browser cohort, falling-ball public test or full acceptance is credited here.

## Identity and recovery boundary

- ABI schema SHA256: `ce98aca1a40c4999df838c1eaab2b08b0533c85adca9866eb48180c6190575d6`.
- Patch-chain SHA256: `4c9d057fe6d7403f6f2c7672c4a7abe38041d845942540a6b5c5abbc6f4bc45c`.
- Task-local toolchain: Emscripten 6.0.2, CMake 4.4.4, Ninja 1.13.2, Node 22.16.0; exact toolchain/source receipts are indexed in the JSON report.
- Later head `1ebcdd` restores the JS counter only; it must not be backfilled as either ST producer. These ST/bridge runs neither build production ESM nor consume a runtime JS build number.
- Original SDK223 artifacts were not recovered. The recovered producer `5e507bf` / counter 221 archive and retained SDK222 material remain historical; no old PASS was relabeled as fresh evidence.

## Original evidence index

The [companion JSON](terrain-native-build-and-lifetime-20261026.json) records original relative paths, byte lengths and SHA256 digests for controls, authorizations, reports, logs, protected inventories, source/ABI files and toolchain receipts. Paths use the external task-workspace base `box3d-resume-20261025T1146/`, not a promise that the raw files live in this repository.

Only these two summary reports are proposed for commit. Full raw logs, binaries, inventories and toolchain archives are **not bundled**; this report is **not a self-contained replay package**. Preserve and retrieve the indexed originals before attempting independent replay. Reporting work did not modify raw evidence, source assets, or historical attempts.
