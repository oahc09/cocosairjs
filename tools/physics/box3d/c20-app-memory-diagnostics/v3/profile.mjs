/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// This is a source-only adapter profile, not a new physics fixture or build receipt.
export const PROFILE = 'c20-app-v2-readonly-memory-observer-sdk228-v3';
export const DIAGNOSTIC_PROFILE = 'air-box3d-memory-diagnostics-v2';
export const SCHEMA_SHA256 = 'f5df4fae8476651b11ae3a952cb418ee987767ae1cfad0f5bb3c8f8e071bae28';
export const NATIVE_PRODUCER_COMMIT = 'fb825da65c8cd259ee8912adb24b7caaa0a64b6a';
export const NATIVE_RESULT_SHA256 = 'b9955e162e6154d2378c86d3e44edc4545bbbd8ad42c76396a24ebdf81e1021a';
export const NATIVE_RELATIVE_OUTPUT = 'tools/physics/box3d/output/production-st-fb825da-attempt-3';
export const HISTORICAL_REPLAY = Object.freeze({
    status: 'UNAVAILABLE_ORIGINAL_RAW_NOT_RECOVERED',
    originalJournalSha256: '64ca22991a9945df10dcb6d879ce9797cc27c375d267d40ed24fa075830827bf',
    outcome: 'Historical SDK225 strict FAIL remains unchanged; not replayed or requalified here',
    scope: 'Separate historical evidence gap, not current runtime identity; any full DoD requiring it remains open',
    syntheticControls: 'Validator CPU controls only; never a replacement or reconstruction of the missing raw',
});
export const ORIGINAL_FIXTURE_COMMIT = 'f1380eb96809c3a24e7f2ec024f4cdeebefb327e';
export const EXPECTED_RUNTIME_BUILD_NUMBER = 228; // Required SDK228 build, NOT an observed compilation.
export const NATIVE_IDENTITY = Object.freeze({
    coreSha: 'efca0c184d40fd6a82016983f1601c4d23965867',
    bindingBaseSha: '5d5a3af049cccd9948b2b55bac4342414af0ef64',
    patchChainSha256: 'fce7869b3888ff9bfd417095e70ce72591893b2c3add1802e1a5bc32ca918bfe',
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
    historicalRuns: 'NO_RETROACTIVE_REPAIR_OR_PRECISE_ATTRIBUTION_OF_SDK225_226_227_FAILURES',
    rowCounts: 'Storage lengths are not live native entity/handle counts',
    ledger: 'World capacity ledger, not module tracked bytes, WASM heap or RSS',
    module: 'Same live-world getter returns module core tracked requested bytes separately',
    bridge: 'Native world/global bridge categories stay separate; no summing into worldLedger',
    runtimeAdmission: 'PENDING_FRESH_NEW_ST_AND_ESM228_DTS228_RECEIPTS_AND_REVIEWED_INPUT_LOCK',
});
