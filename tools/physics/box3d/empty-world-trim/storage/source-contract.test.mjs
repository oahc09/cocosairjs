// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Source structure / staging tests only. These do not execute C or physics.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, unlinkSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applyStorageProfile, IDENTITY_CHAIN } from './profile.mjs';
import { stageStorage } from './stage.mjs';
import { compareResults, validateHostOOM } from './compare-results.mjs';
const root = process.env.AIR_STORAGE_SOURCE_ROOT;
assert.ok(root, 'AIR_STORAGE_SOURCE_ROOT must be the verified input source');
const candidate = await applyStorageProfile(root);
const control = await applyStorageProfile(root, true);
const source = candidate.files.get('src/physics_world.c').toString();
const owned = [
    'stack',
    'broadPhase',
    'constraintGraph',
    'manifoldAllocators',
    'bodyIdPool',
    'bodies',
    'solverSetIdPool',
    'solverSets',
    'jointIdPool',
    'joints',
    'contactIdPool',
    'contacts',
    'islandIdPool',
    'islands',
    'shapeIdPool',
    'shapes',
    'fatAABBs',
    'hullDatabase',
    'names',
    'sensors',
    'taskContexts',
    'sensorTaskContexts',
    'bodyMoveEvents',
    'sensorBeginEvents',
    'contactBeginEvents',
    'sensorEndEvents[0]',
    'sensorEndEvents[1]',
    'contactEndEvents[0]',
    'contactEndEvents[1]',
    'contactHitEvents',
    'jointEvents',
    'debugBodySet',
    'debugJointSet',
    'debugContactSet',
    'debugIslandSet',
];
function body(text, signature) {
    const start = text.indexOf(signature);
    assert.ok(start >= 0, signature);
    const open = text.indexOf('{', start);
    let depth = 1,
        end = open + 1;
    while (depth && end < text.length) {
        if (text[end] === '{') ++depth;
        if (text[end] === '}') --depth;
        ++end;
    }
    assert.equal(depth, 0);
    return text.slice(start, end);
}
function ordered(text, ...needles) {
    let position = -1;
    for (const needle of needles) {
        const next = text.indexOf(needle, position + 1);
        assert.ok(next > position, `Missing/out of order ${needle}`);
        position = next;
    }
}
function trimRules(text) {
    const trim = body(text, 'b3EmptyTrimResult b3World_TrimEmptyStorage(');
    ordered(
        trim,
        'b3World_IsValid( worldId )',
        'b3GetWorldFromId( worldId )',
        'if ( world->locked )',
        'world->identity.contactExhausted',
        'world->activeTaskCount',
        'world->recording',
        'b3GetIdCount( &world->bodyIdPool )',
        'world->identity.high[i] >= maximum',
        'b3HasRetainedEvents( world )',
        'world->locked = true;',
        'b3CreateEmptyStorage( &replacement, &world->creationCapacity );',
        'b3CreateWorkerContexts( &replacement );',
        'b3World retired = *world;',
        'world->identity.floor[i] = world->identity.high[i];',
        'b3DestroyEmptyStorage( &retired );',
        'world->locked = false;',
        'return b3_emptyTrimSuccess;',
    );
    const preflight = trim.slice(0, trim.indexOf('world->locked = true;'));
    for (const field of [
        'stack.allocation',
        'stack.index',
        'stack.entryCount',
        'userTreeTask',
        'broadPhase.movedSiblings',
        'splitIslandId',
        'hullDatabase',
        'solverSetIdPool',
        'manifoldAllocators',
        'compoundShapeCount',
    ])
        assert.ok(preflight.includes(`world->${field}`));
    assert.ok(preflight.includes('world->identity.floor[i] > world->identity.high[i]'));
    for (const family of ['body', 'shape', 'joint', 'contact'])
        assert.ok(preflight.includes(`generation > world->identity.high[b3_${family}Identity]`));
    const afterLock = trim.slice(trim.indexOf('world->locked = true;'));
    assert.equal((afterLock.match(/return b3_emptyTrim/g) || []).length, 1, 'No recoverable return after mutation');
    assert.ok(!/b3World_Step|b3CreateWorld\(|b3DestroyWorld\(|memset\( world/.test(trim));
    for (const field of owned) assert.ok(trim.includes(`world->${field} = replacement.${field};`), field);
    for (const field of [
        'stepIndex',
        'endEventArrayIndex',
        'generation',
        'worldId',
        'inUse',
        'maxCapacity',
        'profile',
        'inv_h',
        'inv_dt',
        'taskCount',
        'scheduler',
        'workerCount',
        'manifoldAllocatorMutex',
        'userData',
        'creationCapacity',
    ]) {
        assert.ok(!new RegExp(`world->${field}\\s*=`).test(trim), `Must preserve ${field}`);
    }
    assert.ok(!/world->identity\.high\[[^\]]+\]\s*=/.test(trim));
    assert.ok(trim.includes('replacement.stack.maxAllocation = world->stack.maxAllocation;'));
    assert.ok(trim.includes('arena.shared->peakDemand = world->taskContexts.data[i].arena.shared->peakDemand;'));
}
test('exact four-patch prefix plus four-file storage patch; control is identity, not upstream', () => {
    assert.equal(candidate.files.size, 111);
    assert.equal(control.files.size, 111);
    assert.equal(control.patchChainSha256, IDENTITY_CHAIN);
    assert.notEqual(candidate.patchChainSha256, IDENTITY_CHAIN);
    const changed = [...candidate.files]
        .filter(([path, bytes]) => !bytes.equals(control.files.get(path)))
        .map(([path]) => path)
        .sort();
    assert.deepEqual(changed, ['include/box3d/box3d.h', 'src/core.c', 'src/physics_world.c', 'src/physics_world.h']);
});
test('complete preflight precedes event retirement, allocation and identity/container commit', () => trimRules(source));
test('mutation negative: missing owned container transfer', () => {
    for (const field of owned)
        assert.throws(
            () => trimRules(source.replace(`world->${field} = replacement.${field};`, '/* omitted */')),
            undefined,
            `Missing transfer: ${field}`,
        );
});
test('mutation negatives: refusal order, exhaustion and retained lifetime/history', () => {
    for (const [before, after] of [
        ['world->identity.high[i] >= maximum', 'world->identity.high[i] > maximum'],
        ['world->stack.entryCount != 0', 'false'],
        ['world->identity.floor[i] = world->identity.high[i];', 'world->identity.floor[i] = 0;'],
        ['replacement.stack.maxAllocation = world->stack.maxAllocation;', 'replacement.stack.maxAllocation = 0;'],
        [
            'world->locked = true;\n\tb3World replacement',
            'world->stepIndex = 0;\n\tworld->locked = true;\n\tb3World replacement',
        ],
    ])
        assert.throws(() => trimRules(source.replace(before, after)), before);
});
test('constructor and trim share actual capacity/debug floors; metadata counted initially', () => {
    const init = body(source, 'static void b3CreateEmptyStorage(');
    assert.ok(init.includes('capacity->staticBodyCount') && init.includes('capacity->dynamicShapeCount'));
    assert.ok(!/stepIndex|endEventArrayIndex|identity|worldId|generation|scheduler/.test(init));
    assert.equal((source.match(/b3CreateEmptyStorage\( world, &world->creationCapacity \);/g) || []).length, 1);
    assert.ok(source.includes('uint64_t total = sizeof( world->identity ) + sizeof( world->creationCapacity );'));
    assert.ok(candidate.files.get('src/physics_world.h').toString().includes('b3Capacity creationCapacity;'));
    assert.equal((source.match(/b3CreateEmptyDebugStorage\( world \);/g) || []).length, 1);
});
test('ACK checks all nine arrays, both end-buffer roles, without stepping or flipping', () => {
    const ack = body(source, 'static bool b3HasRetainedEvents(');
    const events = [
        'bodyMoveEvents',
        'sensorBeginEvents',
        'sensorEndEvents[0]',
        'sensorEndEvents[1]',
        'contactBeginEvents',
        'contactEndEvents[0]',
        'contactEndEvents[1]',
        'contactHitEvents',
        'jointEvents',
    ];
    for (const field of events) assert.ok(ack.includes(`world->${field}.count != 0`));
    assert.equal((ack.match(/\.count != 0/g) || []).length, 9);
});
test('storage cleanup includes names, nested storage, worker arenas, debug and paired fat AABBs', () => {
    const cleanup = body(source, 'static void b3DestroyEmptyStorage(');
    for (const needle of [
        'b3DestroyWorkerContexts( world )',
        'b3DestroyNameCache( &world->names )',
        'b3HullMap_cleanup',
        'b3Array_Destroy( world->fatAABBs )',
        'b3DestroyBlockAllocator',
        'b3DestroyGraph',
        'b3DestroyBroadPhase',
        'b3DestroyStack',
        'b3Array_Destroy( set->islandSims )',
    ])
        assert.ok(cleanup.includes(needle));
    assert.ok(!/b3DestroyWorld|b3DestroyScheduler|b3DestroyMutex|b3StopRecording|b3DestroySolverSet/.test(cleanup));
    assert.equal(
        body(source, 'void b3DestroyWorld('),
        body(control.files.get('src/physics_world.c').toString(), 'void b3DestroyWorld('),
    );
});
test('fatal allocation policy is unconditional for both existing allocation branches', () => {
    const allocation = body(candidate.files.get('src/core.c').toString(), 'void* b3Alloc(');
    assert.equal((allocation.match(/if \( ptr == NULL \)/g) || []).length, 2);
    assert.equal((allocation.match(/abort\(\);/g) || []).length, 2);
    assert.ok(!allocation.includes('#ifdef NDEBUG'));
});
test('staging refuses overwrite, changed adapter, extra and symlinked core files', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'box3d-storage-source-'));
    try {
        const dest = join(temp, 'candidate');
        assert.equal((await stageStorage('--stage', root, dest)).trimEnabled, true);
        await stageStorage('--verify', root, dest);
        await assert.rejects(stageStorage('--stage', root, dest));
        writeFileSync(dest + '.step-adapter.c', 'changed');
        await assert.rejects(stageStorage('--verify', root, dest));
        writeFileSync(dest + '.step-adapter.c', candidate.identityAdapter);
        writeFileSync(join(dest, 'extra'), 'extra');
        await assert.rejects(stageStorage('--verify', root, dest));
        unlinkSync(join(dest, 'extra'));
        const path = join(dest, 'src/core.c');
        unlinkSync(path);
        symlinkSync(join(dest, 'src/body.c'), path);
        await assert.rejects(stageStorage('--verify', root, dest));
        const prefix = await stageStorage('--stage-control', root, join(temp, 'control'));
        assert.equal(prefix.trimEnabled, false);
        assert.equal(prefix.patchChainSha256, IDENTITY_CHAIN);
        await stageStorage('--verify-control', root, join(temp, 'control'));
    } finally {
        rmSync(temp, { recursive: true, force: true });
    }
});
test('qualification inherits hard Debug/effective-NDEBUG guard, with no production activation', () => {
    const cmake = readFileSync(new URL('./CMakeLists.txt', import.meta.url), 'utf8');
    ordered(
        cmake,
        'if(NOT CMAKE_BUILD_TYPE STREQUAL "Debug"',
        'project(',
        '--check-build-profile',
        'add_compile_options(-include',
        'add_subdirectory(',
    );
    assert.ok(cmake.includes('identity/qualification-guard.h'));
    assert.ok(!cmake.includes('-UNDEBUG'));
});

const contract = JSON.parse(readFileSync(new URL('./native-contract.json', import.meta.url)));
const syntheticControl = {
    profile: contract.controlProfile,
    status: 'PASS',
    checks: 2,
    initialLedgerBytes: 2000,
    trimEnabled: false,
};
const syntheticCandidate = {
    profile: contract.profile,
    status: 'PASS',
    checks: contract.checks,
    initialLedgerBytes: 2020,
    creationCapacityLedgerBytes: 20,
    identityMetadataLedgerBytes: 36,
    fixedMetadataLedgerBytes: 56,
    trimEnabled: true,
    sameWorldCycles: 100,
    moduleAfterClose: 0,
    groups: contract.groups,
};
const syntheticOOM = {
    profile: 'air-box3d-empty-storage-host-oom-v1',
    exitCode: null,
    signal: 'SIGABRT',
    stdout: '',
    stderr: 'STORAGE_OOM_ARMED\nSTORAGE_OOM_RETURN_NULL request=1 size=2048 alignment=32\n',
    physicalClose: 'ECHILD',
};
test('synthetic result parser distinguishes core cycles, initial metadata delta, and fatal OOM', () => {
    const result = compareResults(syntheticCandidate, syntheticControl);
    assert.equal(result.appC20Qualified, false);
    assert.equal(result.creationPolicyLedgerDelta, 20);
    assert.equal(result.worldAndModuleAccountingCombined, false);
    assert.equal(validateHostOOM(syntheticOOM).recoverableOOM, false);
});
test('synthetic result parser rejects historical counts, changed budgets and partial groups', () => {
    for (const change of [
        { profile: 'old' },
        { checks: 170 },
        { status: 'NOT_RUN' },
        { initialLedgerBytes: 2000 },
        { fixedMetadataLedgerBytes: 36 },
        { trimEnabled: false },
        { sameWorldCycles: 99 },
        { moduleAfterClose: 1 },
        { extra: 'unreviewed' },
        { groups: { ...contract.groups, cycles: 0 } },
    ]) {
        assert.throws(() => compareResults({ ...syntheticCandidate, ...change }, syntheticControl));
    }
    assert.throws(() => compareResults(syntheticCandidate, { ...syntheticControl, checks: 4 }));
});
test('synthetic OOM parser rejects normal returns, kills, missing NULL proof and unclosed process', () => {
    for (const change of [
        { signal: 'SIGKILL' },
        { signal: null, exitCode: 0 },
        { stdout: '{"status":"PASS"}' },
        { stderr: 'STORAGE_OOM_ARMED\n' },
        { stderr: syntheticOOM.stderr + 'STORAGE_OOM_UNEXPECTED_RETURN result=0' },
        { physicalClose: 'UNKNOWN' },
    ])
        assert.throws(() => validateHostOOM({ ...syntheticOOM, ...change }));
});
test('native source retains real lifecycle groups and distinguishes private injected event records', () => {
    const native = readFileSync(new URL('./native-contract.c', import.meta.url), 'utf8');
    for (const name of [
        'mixed_scene',
        'hundred_cycles',
        'refusal_integrity',
        'world_isolation',
        'caller_owned_mesh',
        'sleeping_and_disabled',
        'private_event_ack',
    ])
        assert.ok(native.includes(`static void ${name}(`));
    for (const needle of [
        'b3World_Step(',
        'b3CreateGridMesh(',
        'b3CreateMeshShape(',
        'b3DestroyMesh(',
        'b3Body_SetAwake(',
        'b3Body_Disable(',
        'cycle < 100',
        'world->contacts.count == 20',
        'NOT physics events',
        'STORAGE_OOM_UNEXPECTED_RETURN',
    ])
        assert.ok(native.includes(needle));
    assert.equal(
        contract.checks,
        Object.values(contract.groups).reduce((sum, value) => sum + value, 0),
    );
    assert.equal(contract.runtimeQualification, 'NOT_RUN');
});
