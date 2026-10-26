// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Structural CPU controls, not C compilation or physical simulation.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, unlinkSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { applyProfile, assertBuildProfile, BASE_PATCH_SHA } from './profile.mjs';
import { stageIdentity } from './stage.mjs';
import { compareLedgers } from './compare-ledgers.mjs';

const root = process.env.AIR_IDENTITY_SOURCE_ROOT;
assert.ok(root, 'AIR_IDENTITY_SOURCE_ROOT must name the verified producer source');
const candidate = await applyProfile(root);
const control = await applyProfile(root, true);
const text = (path) => candidate.files.get(path).toString();
function ordered(source, ...needles) {
    let position = -1;
    for (const needle of needles) {
        const next = source.indexOf(needle, position + 1);
        assert.ok(next > position, `Missing/out-of-order: ${needle}`);
        position = next;
    }
}
function rules(files) {
    for (const [path, kind, firstMutation] of [
        ['src/body.c', 'body', 'world->locked = true;'],
        ['src/shape.c', 'shape', 'world->locked = true;'],
        ['src/joint.c', 'joint', 'b3DestroyContactsBetweenBodies( world, bodyA, bodyB );'],
    ]) {
        const source = files.get(path).toString();
        ordered(
            source,
            `b3PeekId( &world->${kind}IdPool )`,
            `b3NextIdentity( world, b3_${kind}Identity`,
            firstMutation,
        );
        assert.ok(source.includes(`.generation = (uint16_t)world->identity.floor[b3_${kind}Identity]`));
        assert.ok(source.includes(`${kind}->generation = (uint16_t)nextGeneration;`));
        assert.ok(source.includes(`b3CommitIdentity( world, b3_${kind}Identity, nextGeneration );`));
        assert.ok(!source.includes(`${kind}->generation += 1;`));
    }
    const contact = files.get('src/contact.c').toString();
    ordered(
        contact,
        'b3NextIdentity( world, b3_contactIdentity',
        'world->identity.contactExhausted = 1;',
        'b3AllocId( &world->contactIdPool )',
    );
    assert.ok(!contact.includes('int generation = contact->generation'));
    assert.ok(contact.includes('.generation = world->identity.floor[b3_contactIdentity]'));
    ordered(
        contact,
        'contact->generation = nextGeneration;',
        'b3CommitIdentity( world, b3_contactIdentity, nextGeneration );',
        'bodyA->headContactKey = keyA;',
    );
    const pairs = files.get('src/broad_phase.c').toString();
    ordered(
        pairs,
        'b3CreateContact( world, shapeA, shapeB, childIndex );',
        'if ( world->identity.contactExhausted != 0 )',
        'break; // Preserve',
        'b3StackFree( alloc, pairKeys );',
        'b3StackFree( alloc, bp->movedSiblings );',
    );
    const world = files.get('src/physics_world.c').toString();
    ordered(
        world.slice(world.indexOf('void b3World_Step(')),
        'b3UpdateBroadPhasePairs( world );',
        'if ( world->identity.contactExhausted != 0 )',
        'world->finishTaskFcn(',
        'world->activeTaskCount -= 1;',
        'world->locked = false;',
        'return; // No collide/solve/sensors',
        'b3Collide( &context );',
    );
    assert.ok(world.includes('uint64_t total = sizeof( world->identity );'));
    const header = files.get('src/physics_world.h').toString();
    assert.ok(header.includes('previous >= maximum'));
    assert.ok(header.includes('previous > world->identity.high[kind]'));
    assert.ok(header.includes('*next = previous + UINT32_C( 1 );'));
    assert.ok(header.includes('if ( world->identity.high[kind] < generation )'));
}
test('exact closure and all three original patches retained in order', () => {
    assert.equal(candidate.files.size, 111);
    assert.equal(control.files.size, 111);
    assert.equal(control.patchChainSha256, BASE_PATCH_SHA);
    assert.notEqual(candidate.patchChainSha256, BASE_PATCH_SHA);
    const changed = [...candidate.files]
        .filter(([path, bytes]) => !bytes.equals(control.files.get(path)))
        .map(([path]) => path)
        .sort();
    assert.equal(changed.length, 9);
    assert.deepEqual(
        changed,
        candidate.lock.patches
            .at(-1)
            .files.map((file) => file.path)
            .sort(),
    );
});
test('four-family source preflight, floor, commit, unsigned arithmetic and fault unwind', () => rules(candidate.files));
for (const [name, path, before, after] of [
    ['wrap', 'src/physics_world.h', 'previous >= maximum', 'previous > maximum'],
    ['generation history regression', 'src/physics_world.h', 'previous > world->identity.high[kind]', 'false'],
    [
        'failed shape loses floor',
        'src/shape.c',
        '.generation = (uint16_t)world->identity.floor[b3_shapeIdentity]',
        '.generation = 0',
    ],
    ['metadata omitted', 'src/physics_world.c', 'uint64_t total = sizeof( world->identity );', 'uint64_t total = 0;'],
    ['missing task join', 'src/physics_world.c', 'world->activeTaskCount -= 1;', '/* task not settled */'],
    [
        'signed contact',
        'src/contact.c',
        'contact->generation = nextGeneration;',
        'int generation = contact->generation; contact->generation = generation + 1;',
    ],
])
    test(`source negative control: ${name}`, () => {
        const files = new Map(candidate.files);
        const source = files.get(path).toString();
        assert.ok(source.includes(before));
        files.set(path, Buffer.from(source.replace(before, after)));
        assert.throws(() => rules(files));
    });
test('all nine public joint wrappers reject a null pair', () => {
    assert.equal((text('src/joint.c').match(/b3JointPair pair = b3CreateJoint\(/g) || []).length, 9);
    assert.equal((text('src/joint.c').match(/if \( pair.joint == NULL \)/g) || []).length, 9);
});
test('all four event getters refuse faulted-world publication', () => {
    assert.equal(
        (text('src/physics_world.c').match(/world == NULL \|\| world->identity.contactExhausted != 0/g) || []).length,
        4,
    );
});
test('staging is exact, repeat-safe and rejects extra, changed and symlink files', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'box3d-identity-source-'));
    try {
        const destination = join(temporary, 'candidate');
        const receipt = await stageIdentity('--stage', root, destination);
        assert.equal(receipt.productionCompatible, false);
        assert.equal(receipt.trimEnabled, false);
        assert.equal(receipt.files, 111);
        await stageIdentity('--verify', root, destination);
        writeFileSync(destination + '.step-adapter.c', 'changed');
        await assert.rejects(stageIdentity('--verify', root, destination));
        writeFileSync(destination + '.step-adapter.c', candidate.adapter);
        await assert.rejects(stageIdentity('--stage', root, destination));
        const file = join(destination, 'extra');
        writeFileSync(file, 'extra');
        await assert.rejects(stageIdentity('--verify', root, destination));
        unlinkSync(file);
        const body = join(destination, 'src/body.c');
        writeFileSync(body, 'changed');
        await assert.rejects(stageIdentity('--verify', root, destination));
        unlinkSync(body);
        symlinkSync(join(destination, 'src/shape.c'), body);
        await assert.rejects(stageIdentity('--verify', root, destination));
        const prefix = await stageIdentity('--stage-control', root, join(temporary, 'control'));
        assert.equal(prefix.patchChainSha256, BASE_PATCH_SHA);
        await stageIdentity('--verify-control', root, join(temporary, 'control'));
    } finally {
        rmSync(temporary, { recursive: true, force: true }); // Only this test's own temporary files.
    }
});

// These admission and parser fixtures are CPU controls, never native PASS evidence.
test('complete hash-bound bridge functions use valid/unlocked checks and sticky fault status', () => {
    assert.deepEqual(candidate.configuration.compiledBridgeFunctions, [
        'air_b3_world_valid',
        'air_b3_world_unlocked',
        'air_b3_world_step',
    ]);
    assert.equal(candidate.configuration.bridgeInputs.length, 12);
    assert.equal(new Set(candidate.configuration.bridgeInputs.map((entry) => entry.path)).size, 12);
    assert.equal(control.adapter, '');
    ordered(
        candidate.adapter,
        'int air_b3_world_valid(',
        'int air_b3_world_unlocked(',
        'int air_b3_world_step(',
        'b3World_Step(',
        'return b3World_HasIdentityFault(b3LoadWorldId(world)) ? AIR_B3_CAPACITY : AIR_B3_OK;',
    );
    assert.equal((candidate.adapter.match(/int air_b3_world_step\(/g) || []).length, 1);
});
const debug = { buildType: 'Debug', multiConfig: '', flags: ['', '', '-g', '-g'] };
test('qualification admission allows single-config Debug only', () => {
    assertBuildProfile(debug);
    for (const buildType of ['', 'Release', 'RelWithDebInfo', 'MinSizeRel'])
        assert.throws(() => assertBuildProfile({ ...debug, buildType }));
    assert.throws(() => assertBuildProfile({ ...debug, multiConfig: 'Debug;Release' }));
    assert.throws(() => assertBuildProfile({ ...debug, flags: [] }));
});
test('qualification admission rejects NDEBUG and unsafe thread/FP flags', () => {
    for (const flag of [
        '-DNDEBUG',
        '-DNDEBUG=0',
        '-D NDEBUG',
        '/DNDEBUG',
        '-g -DNDEBUG=1',
        '-pthread',
        '-sSHARED_MEMORY=1',
        '-sUSE_PTHREADS=1',
        '-ffast-math',
        '-Ofast',
    ]) {
        assert.throws(() => assertBuildProfile({ ...debug, flags: [flag, '', '', ''] }), flag);
    }
});
test('CMake admission executes the same strict CLI with empty arguments preserved', () => {
    const script = fileURLToPath(new URL('./profile.mjs', import.meta.url));
    const args = [
        '--check-build-profile',
        'buildType=Debug',
        'multiConfig=',
        'flag0=',
        'flag1=',
        'flag2=-g',
        'flag3=-g',
    ];
    const accepted = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.equal(JSON.parse(accepted.stdout).compilation, 'NOT_PERFORMED');
    for (const mutation of [
        args.map((x) => x.replace('buildType=Debug', 'buildType=Release')),
        args.map((x) => x.replace('flag0=', 'flag0=-DNDEBUG')),
        args.slice(0, -1),
    ]) {
        assert.notEqual(spawnSync(process.execPath, [script, ...mutation], { encoding: 'utf8' }).status, 0);
    }
});
function guardRules(cmake, guard) {
    ordered(
        cmake,
        'if(NOT CMAKE_BUILD_TYPE STREQUAL "Debug" OR CMAKE_CONFIGURATION_TYPES)',
        'project(',
        '--check-build-profile',
        'message(FATAL_ERROR "Identity qualification requires single-config Debug without NDEBUG")',
        'add_compile_options(-include "${CMAKE_CURRENT_LIST_DIR}/qualification-guard.h")',
        'add_subdirectory(',
    );
    assert.ok(/#ifdef NDEBUG\s+#error/.test(guard));
    assert.ok(!cmake.includes('-UNDEBUG') && !guard.includes('#undef NDEBUG'));
}
test('every core/fixture TU has an effective-macro guard, not just a flag regex', () => {
    const cmake = readFileSync(new URL('./CMakeLists.txt', import.meta.url), 'utf8');
    const guard = readFileSync(new URL('./qualification-guard.h', import.meta.url), 'utf8');
    guardRules(cmake, guard);
    assert.throws(() => guardRules(cmake.replace('add_compile_options(-include', 'removed(-include'), guard));
    assert.throws(() => guardRules(cmake, guard.replace('#ifdef NDEBUG', '#ifdef NEVER')));
});
const configuration = candidate.configuration;
const syntheticControl = {
    profile: 'air-box3d-identity-base-control-v1',
    status: 'PASS',
    checks: 4,
    identityMetadataLedgerBytes: 0,
    trimEnabled: false,
    initialLedgerBytes: 2000,
    moduleBeforeWorld: 0,
    moduleWithWorld: 9000,
    moduleAfterClose: 0,
};
const syntheticCandidate = {
    ...syntheticControl,
    profile: configuration.id,
    checks: 170,
    identityMetadataLedgerBytes: 36,
    initialLedgerBytes: 2036,
    groups: {
        body: 31,
        shape: 31,
        failedHullFloor: 8,
        joint: 40,
        contactHigh: 26,
        contactUnsigned: 8,
        contactFault: 20,
        main: 6,
    },
};
test('synthetic parser positive separates embedded ledger from actual allocator requests', () => {
    const result = compareLedgers(syntheticCandidate, syntheticControl);
    assert.equal(result.initialLedgerDelta, 36);
    assert.equal(result.moduleBytesComparedToLedger, false);
});
test('synthetic parser negative rejects incomplete/native-mismatched reports', () => {
    for (const change of [
        { profile: 'old-profile' },
        { status: 'NOT_RUN' },
        { checks: 171 },
        { identityMetadataLedgerBytes: 0 },
        { initialLedgerBytes: 2000 },
        { trimEnabled: true },
        { moduleAfterClose: 1 },
        { initialLedgerBytes: Number.MAX_SAFE_INTEGER + 1 },
        { extra: 'unknown' },
        { groups: { ...syntheticCandidate.groups, contactFault: 19 } },
    ]) {
        assert.throws(() => compareLedgers({ ...syntheticCandidate, ...change }, syntheticControl));
    }
    assert.throws(() => compareLedgers(syntheticCandidate, { ...syntheticControl, checks: 0 }));
});
