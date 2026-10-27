/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Library adapter only: no CLI, host, build, app/clock/module factory, close, or authorization mechanism.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ORIGINAL_FILES, PROFILE, EXPECTED_RUNTIME_BUILD_NUMBER } from './profile.mjs';
import { createMemoryObserver, loadObserverLayout, preserveFixtureOutcome } from './observer.mjs';

export function verifyOriginalFiles(sourceRoot) {
    for (const entry of ORIGINAL_FILES) {
        const bytes = readFileSync(join(sourceRoot, entry.path));
        assert.equal(bytes.length, entry.bytes, 'Published APP v2 bytes changed: ' + entry.path);
        assert.equal(
            createHash('sha256').update(bytes).digest('hex'),
            entry.sha256,
            'Published APP v2 hash changed: ' + entry.path,
        );
    }
}

// Called only from a separately reviewed consumer with fresh full input lock + ESM/DTS/ST receipts.
// This adapter's checks are additional guardrails, NOT a replacement for that still-pending admission.
export async function runObservedSceneCycles({ sourceRoot, sdk, app, report, record, appendDiagnostic }) {
    verifyOriginalFiles(sourceRoot);
    const layout = loadObserverLayout(readFileSync(join(sourceRoot, 'tools/physics/box3d/abi-schema.json')));
    assert.equal(
        sdk.AIR_BUILD_NUMBER,
        EXPECTED_RUNTIME_BUILD_NUMBER,
        'Required future SDK228; old225/226/227 forbidden',
    );
    assert.equal(report.moduleFactoryReplaced, false);
    assert.equal(report.hostSha256, ORIGINAL_FILES.find((entry) => entry.path.endsWith('/host.mjs')).sha256);
    const { runSceneCycles } = await import(pathToFileURL(join(sourceRoot, ORIGINAL_FILES[0].path)).href);
    const world = sdk.PhysicsSystem.instance.physicsWorld;
    const observer = createMemoryObserver({
        world,
        getWorld: () => sdk.PhysicsSystem.instance.physicsWorld,
        primaryRecord: record,
        appendDiagnostic,
        layout,
        publicStep: () => report.frames.length,
    });
    report.diagnosticProfile = PROFILE;
    // Do not alter report.profile/configuration or any original assertion/return value.
    return preserveFixtureOutcome(
        (observedRecord) => runSceneCycles({ sdk, app, report, record: observedRecord }),
        observer,
        report,
    );
}
