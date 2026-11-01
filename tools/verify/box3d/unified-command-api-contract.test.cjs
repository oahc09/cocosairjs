/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Design integrity only. No runtime API, native physics or acceptance claim.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const read = (name) => fs.readFileSync(path.join(root, name));
const digest = (name) => crypto.createHash('sha256').update(read(name)).digest('hex');
const contract = JSON.parse(read('docs/physics/box3d/contracts/unified-command-api-v1.json'));
const original = JSON.parse(read(contract.originalApi.path));
const inventory = JSON.parse(read('docs/physics/box3d/contracts/inventory-design.json'));
const source = ts.createSourceFile(
    contract.declarations.path,
    read(contract.declarations.path).toString(),
    ts.ScriptTarget.Latest,
    true,
);
test('additive contract binds exact retained API, decisions, declarations and frozen inventory', () => {
    for (const key of ['originalApi', 'decisionDocument', 'declarations', 'inventory']) {
        assert.equal(digest(contract[key].path), contract[key].sha256, key);
    }
    assert.equal(contract.originalApi.sha256, '0e53683159e025ecdf07ae495abcf54e902529b51c6938ce3717fab4dd6e7fc9');
    assert.deepEqual(contract.originalApi.preservedExtensions, original.extensions);
    assert.equal(contract.inventory.requiredCells, 2128);
    assert.equal(contract.inventory.statusChanges, 0);
});
test('contract-only declarations expose the exact three new signatures without implementation', () => {
    assert.equal(contract.status, 'FROZEN_SOURCE_CONTRACT_NOT_IMPLEMENTED');
    assert.equal(contract.implementation, 'NOT_IMPLEMENTED');
    assert.equal(contract.declarations.runtimeExported, false);
    assert.equal(source.parseDiagnostics.length, 0);
    const functions = source.statements.filter(ts.isFunctionDeclaration);
    assert.deepEqual(
        functions.map((node) => node.name.text),
        contract.extensions.map((entry) => entry.name),
    );
    assert(
        functions.every((node) => !node.body && node.modifiers.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)),
    );
    const cancel = functions.find((node) => node.name.text === 'cancelPendingBox3DCommands');
    assert.equal(cancel.parameters.length, 1);
    assert.equal(cancel.parameters[0].type.getText(source), 'RigidBody');
    assert.equal(cancel.type.getText(source), 'number');
    const continuous = functions.find((node) => node.name.text === 'createBox3DContinuousForce');
    assert.equal(continuous.parameters[1].type.getText(source), 'Box3DContinuousForceDescriptor');
    assert.equal(continuous.type.getText(source), 'Box3DContinuousForceHandle');
});
test('all new API test mappings resolve existing original required identities', () => {
    const ids = new Set(
        [...inventory.parentCategories, ...inventory.requiredSubcaseDesign, ...inventory.auxiliaryRequiredTests].map(
            (entry) => entry.id,
        ),
    );
    for (const entry of contract.extensions) {
        assert(entry.tests.length);
        assert.equal(new Set(entry.tests).size, entry.tests.length);
        for (const id of entry.tests) assert(ids.has(id), `${entry.name}: ${id}`);
    }
});
test('handles are explicit and copied metadata carries no native capability or fake expiry', () => {
    const interfaces = new Map(
        source.statements.filter(ts.isInterfaceDeclaration).map((node) => [node.name.text, node]),
    );
    for (const [name, methods] of Object.entries(contract.handleMethods)) {
        assert.deepEqual(
            interfaces
                .get(name)
                .members.filter(ts.isMethodSignature)
                .map((node) => node.name.getText(source)),
            methods,
        );
    }
    const metadata = interfaces.get('Box3DBeforeStepContext').members;
    assert.deepEqual(
        metadata.map((node) => node.name.getText(source)),
        ['tickIndex', 'attemptId', 'fixedDt', 'solverSubSteps'],
    );
    assert(metadata.every((node) => node.modifiers.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword)));
    assert.equal(metadata[3].type.getText(source), '1 | 2 | 4 | 8');
});
test('defaults, temporal migration and protected cleanup are not implicit', () => {
    const continuous = contract.extensions.find((entry) => entry.name === 'createBox3DContinuousForce');
    assert.deepEqual(continuous.defaults, {
        enabled: true,
        force: [0, 0, 0],
        torque: [0, 0, 0],
        relativePoint: [0, 0, 0],
        space: 'world',
    });
    assert.equal(continuous.update, 'complete-descriptor-replacement');
    assert.equal(contract.extensions[2].protectedLifecycleZeroRemovable, false);
    assert.equal(contract.temporalSemantics.ordinaryForceTorqueImpulse, 'next-executable-fixed-tick');
    assert.equal(contract.temporalSemantics.velocityReadback, 'last-committed-native-state');
    assert.equal(contract.temporalSemantics.constantForce, 'unchanged-frame-level-submissions');
    assert.equal(contract.temporalSemantics.teleportPreserveSuppressesSameTickIdleZero, true);
    assert.equal(contract.nativeWireStatus, 'SEPARATE_FREEZE_REQUIRED_BEFORE_IMPLEMENTATION');
});
