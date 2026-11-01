// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Independent source qualification only. Never changes the production patch lock.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const candidateRoot = resolve(here, '../../../../..');
export const BASE_PATCH_SHA = '4c9d057fe6d7403f6f2c7672c4a7abe38041d845942540a6b5c5abbc6f4bc45c';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function regular(path) {
    assert.ok(lstatSync(path).isFile(), `Not a regular file: ${path}`);
    return readFileSync(path);
}
export async function applyProfile(sourceRoot, control = false) {
    assert.equal(typeof control, 'boolean');
    const source = resolve(sourceRoot);
    const intake = await import(pathToFileURL(resolve(source, 'tools/physics/box3d/patch-intake.mjs')));
    const base = intake.readPatchPlan();
    assert.equal(base.patchChainSha256, BASE_PATCH_SHA, 'Unreviewed production prefix');
    const lockBytes = regular(resolve(here, 'patch-lock.json'));
    const lock = JSON.parse(lockBytes);
    assert.deepEqual(lock.patches.slice(0, -1), base.lock.patches, 'Retain the full ordered production prefix');
    assert.equal(lock.patches.length, base.lock.patches.length + 1);
    const readPatch = (path) => regular(resolve(path === lock.patches.at(-1).path ? candidateRoot : source, path));
    const candidatePatchSha = intake.validatePatchLock(lock, base.lock.baseCoreCommit, readPatch);
    const profileBytes = regular(resolve(here, 'profile.json'));
    const configuration = JSON.parse(profileBytes);
    assert.equal(configuration.schemaVersion, 1);
    assert.equal(configuration.id, 'air-box3d-identity-native-rebuild-v1');
    assert.equal(configuration.productionCompatible, false);
    assert.equal(configuration.trimEnabled, false);
    assert.equal(configuration.corePatchChainSha256, candidatePatchSha);
    for (const input of configuration.bridgeInputs) {
        assert.equal(hash(regular(resolve(source, input.path))), input.sha256, input.path);
    }
    const manifest = JSON.parse(regular(resolve(source, 'vendor/box3d/source-manifest.json')));
    const files = new Map();
    for (const entry of manifest.files.filter((entry) => entry.path.startsWith('vendor/box3d/core/'))) {
        const bytes = regular(resolve(source, entry.path));
        assert.equal(bytes.length, entry.bytes);
        assert.equal(hash(bytes), entry.sha256);
        files.set(entry.path.slice('vendor/box3d/core/'.length), bytes);
    }
    assert.equal(files.size, 111, 'Pinned core closure changed');
    for (const patch of control ? lock.patches.slice(0, -1) : lock.patches) {
        for (const [path, bytes] of intake.applyExactPatch(readPatch(patch.path), patch.files, (path) =>
            files.get(path),
        )) {
            files.set(path, bytes);
        }
    }
    const patch = configuration.bridgePatch;
    const patchBytes = regular(resolve(candidateRoot, patch.path));
    assert.equal(hash(patchBytes), patch.sha256);
    const patched = intake.applyExactPatch(patchBytes, patch.files, (path) => regular(resolve(source, path)));
    const air = patched.get('tools/physics/box3d/native/air_box3d.c').toString();
    const body = regular(resolve(source, 'tools/physics/box3d/native/body_control.c')).toString();
    // These pinned complete functions have no braces inside strings/comments. Hash checks
    // above fail closed before accepting a different source that would require a C parser.
    const extract = (sourceText, name) => {
        const start = sourceText.indexOf(`int ${name}(`);
        assert.ok(start >= 0 && sourceText.indexOf(`int ${name}(`, start + 1) < 0);
        const open = sourceText.indexOf('{', start);
        let depth = 1;
        let end = open + 1;
        while (depth && end < sourceText.length) {
            if (sourceText[end] === '{') ++depth;
            if (sourceText[end] === '}') --depth;
            ++end;
        }
        assert.equal(depth, 0);
        return sourceText.slice(start, end) + '\n';
    };
    const adapter = control
        ? ''
        : '#include "air_box3d.h"\n#include <box3d/box3d.h>\n#include "physics_world.h"\n#include <math.h>\n' +
          extract(air, 'air_b3_world_valid') +
          extract(body, 'air_b3_world_unlocked') +
          extract(air, 'air_b3_world_step');
    return {
        configuration,
        profileSha256: hash(profileBytes),
        adapter,
        intake,
        lock,
        base,
        files,
        control,
        coreCommit: lock.baseCoreCommit,
        patchChainSha256: control ? base.patchChainSha256 : candidatePatchSha,
        patchLockSha256: control ? base.patchLockSha256 : hash(lockBytes),
    };
}

export function assertBuildProfile({ buildType, multiConfig, flags }) {
    assert.equal(buildType, 'Debug', 'Only Debug enables this qualification profile');
    assert.equal(multiConfig, '', 'Multi-config generators are not qualified');
    assert.ok(Array.isArray(flags) && flags.length === 4 && flags.every((flag) => typeof flag === 'string'));
    for (const flag of flags) {
        assert.ok(!/(?:^|[\s;])[-/]D\s*NDEBUG(?:[=\s;]|$)/.test(flag), 'NDEBUG is forbidden');
        assert.ok(!/pthread|SHARED_MEMORY|USE_PTHREADS|fast-math|Ofast/.test(flag), 'Forbidden ST/determinism flag');
    }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    assert.equal(process.argv[2], '--check-build-profile');
    const fields = process.argv.slice(3).map((argument) => {
        const split = argument.indexOf('=');
        assert.ok(split > 0);
        return [argument.slice(0, split), argument.slice(split + 1)];
    });
    assert.deepEqual(
        fields.map(([key]) => key),
        ['buildType', 'multiConfig', 'flag0', 'flag1', 'flag2', 'flag3'],
    );
    const values = Object.fromEntries(fields);
    assertBuildProfile({
        buildType: values.buildType,
        multiConfig: values.multiConfig,
        flags: [values.flag0, values.flag1, values.flag2, values.flag3],
    });
    console.log(JSON.stringify({ status: 'PASS_DEBUG_PROFILE_ADMISSION', compilation: 'NOT_PERFORMED' }));
}
