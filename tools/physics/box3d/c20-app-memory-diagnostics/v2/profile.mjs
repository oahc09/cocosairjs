/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// This is a source-only adapter profile, not a new physics fixture or build receipt.
export const PROFILE = 'c20-app-v2-readonly-memory-observer-sdk227-v2';
export const DIAGNOSTIC_PROFILE = 'air-box3d-memory-diagnostics-v1';
export const SCHEMA_SHA256 = '3a1c552650979c205898c90c4d862483810b66dc5c875f155c80e92fb15618da';
export const DIAGNOSTIC_SOURCE_MANIFEST_SHA256 = '98a5a8faf357be69708a8f832b10124990c5e26de67d74d23c1043bd46b227a5';
export const ORIGINAL_FIXTURE_COMMIT = 'f1380eb96809c3a24e7f2ec024f4cdeebefb327e';
export const EXPECTED_RUNTIME_BUILD_NUMBER = 227; // Required SDK227 build, NOT an observed compilation.
export const NATIVE_IDENTITY = Object.freeze({
    coreSha: 'efca0c184d40fd6a82016983f1601c4d23965867',
    bindingBaseSha: '5d5a3af049cccd9948b2b55bac4342414af0ef64',
    patchChainSha256: '4c9d057fe6d7403f6f2c7672c4a7abe38041d845942540a6b5c5abbc6f4bc45c',
    schemaSha256: SCHEMA_SHA256,
    abiVersion: 1,
    variant: 'st-simd',
});
export const ORIGINAL_FILES = Object.freeze(
    [
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/fixture.mjs',
            bytes: 14977,
            sha256: 'b3be1f22bd37fc712a133039525c59b50b032ccc7ac42af0c21160fdcf4ea51a',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/contract.mjs',
            bytes: 10894,
            sha256: '191b7081f438200ba0c8f1a2be2d9a033f0c21ecfe96390b23a8b6605909f210',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/host.mjs',
            bytes: 4543,
            sha256: '10205d33d67ca3002eb5860aef9047688873423d910964eebf5269b0ef5d367b',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/consumer.mjs',
            bytes: 8449,
            sha256: 'f2e9ad7cbb18c088c2bc861f3b9d06ba4c66b14be4074199ec03201a891798c5',
        },
        {
            path: 'tools/physics/box3d/c20-app-scene-cycles/v2/inputs.mjs',
            bytes: 7907,
            sha256: 'abc6ea1d468112a245ff871ef05defa4a1e9518b56fc000efb2aadc2d424d3f3',
        },
    ].map(Object.freeze),
);
export const SAFE_RECORDS = Object.freeze([
    'original-pre-scene-baseline',
    'nonempty-native-scene',
    'released-cycle-before-validation',
]);
export const BOUNDARIES = Object.freeze({
    strictC20: 'UNCHANGED_ORIGINAL_APP_V2_ASSERTIONS; diagnostic completeness is independent',
    afterAppClose: 'UNAVAILABLE; no getter, module access, replacement factory or second module',
    historicalRuns: 'NO_RETROACTIVE_REPAIR_OR_PRECISE_ATTRIBUTION_OF_SDK225_226_FAILURES',
    rowCounts: 'Storage lengths are not live native entity/handle counts',
    ledger: 'World capacity ledger, not module tracked bytes, WASM heap or RSS',
    module: 'Same live-world getter returns module core tracked requested bytes separately',
    bridge: 'Native world/global bridge categories stay separate; no summing into worldLedger',
    runtimeAdmission: 'PENDING_FRESH_NEW_ST_AND_ESM227_DTS227_RECEIPTS_AND_REVIEWED_INPUT_LOCK',
});
