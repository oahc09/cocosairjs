const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'docs/physics/box3d/contracts', name)));
const inventory = read('inventory-design.json');
const api = read('api-contract.json');
const mapping = read('public-spec-map.json');
test('all 91 original categories remain required and no historical PASS is imported', () => {
    assert.equal(inventory.parentCategories.length, 91);
    assert.equal(new Set(inventory.parentCategories.map((x) => x.id)).size, 91);
    for (const item of inventory.parentCategories) {
        assert.equal(item.required, true);
        assert.equal(item.status, 'NOT_RUN');
    }
    assert.equal(inventory.historical861CellsImported, false);
    assert.equal(inventory.inventoryFrozen, false);
    assert.equal(inventory.expandedRequiredCellCount, null);
});
test('fixed subcase references retain parents and the distinct real-device requirement', () => {
    const parents = new Set(inventory.parentCategories.map((x) => x.id));
    const cases = new Set(inventory.requiredSubcaseDesign.map((x) => x.id));
    assert(cases.has('WASM-13-AIR-ST-DEVICE'));
    assert(cases.has('WASM-13-AIR-ST-HOST'));
    assert(!cases.has('WASM-07-PACK'), 'Do not backtrack a token at a hyphen before adjacent Chinese text');
    for (const item of inventory.requiredSubcaseDesign) assert(parents.has(item.parent), item.id);
});
test('every explicit v1.2 acceptance ID is retained, including the two independent world fixtures', () => {
    const source = fs.readFileSync(path.join(root, 'ai/plans/box3d-v1.2-reference.md'), 'utf8');
    // A word boundary after an ASCII suffix can backtrack before adjacent Chinese prose.
    const mentioned = new Set(
        source.match(/\b(?:B3-(?:C|I|U|A|P|AG|BIZ)\d{2}|WASM-\d{2})(?:-[A-Z0-9]+)*(?![A-Z0-9-])/g),
    );
    const auxiliary = inventory.auxiliaryRequiredTests ?? [];
    assert.deepEqual(auxiliary.map((row) => row.id).sort(), ['B3-U01', 'B3-U02']);
    for (const row of auxiliary) {
        assert.equal(row.required, true);
        assert.equal(row.status, 'NOT_RUN');
        assert.equal(row.firstPhase, 'M2');
        assert.equal(row.realNativeRequired, true);
        assert.equal(row.countedAsNewParentCategory, false);
    }
    const retained = new Set(
        [...inventory.parentCategories, ...inventory.requiredSubcaseDesign, ...auxiliary].map((row) => row.id),
    );
    for (const id of mentioned) assert(retained.has(id), `Missing fixed acceptance ID: ${id}`);
    assert.equal(mentioned.has('WASM-07-PACK'), false);
});
test('engine methods have target capabilities and test references, never an implementation PASS', () => {
    assert.equal(mapping.members.length, 166);
    const keys = new Set();
    for (const item of mapping.members) {
        const key = item.interface + '.' + item.member;
        assert(!keys.has(key), key);
        keys.add(key);
        assert(item.signature.includes(item.member));
        assert(item.requiredTestParents.length > 0);
        assert.equal(item.implementation, 'NOT_IMPLEMENTED');
    }
});
test('unsupported box controller, D6 and infinite plane are not advertised as implemented', () => {
    for (const item of mapping.members.filter((x) =>
        ['IBoxCharacterController', 'IConfigurableConstraint', 'IPlaneShape'].includes(x.interface),
    )) {
        assert.equal(item.targetCapability, 'unsupported', item.interface + '.' + item.member);
    }
});
test('C16 new duration contract counts seven endpoints for six 60Hz intervals', () => {
    const c = api.c16Duration;
    assert.equal(c.sustainedMinimumConsecutiveSamples, 7);
    assert(
        Math.abs((c.sustainedMinimumConsecutiveSamples - 1) * c.fixedDtSeconds - c.sustainedFirstLastSpanSeconds) <
            1e-12,
    );
    assert((6 - 1) * c.fixedDtSeconds < c.sustainedFirstLastSpanSeconds);
    assert.equal(c.guaranteesSubstepPeak, false);
    assert.equal(c.status, 'NEW_EXPLICIT_CONTRACT_NOT_RECOVERED_OLD_DEFINITION');
});
test('movement, damping and initialization defaults stay explicit', () => {
    assert(api.extensions.some((x) => x.name === 'createKinematicTarget'));
    assert.deepEqual(api.extensions.find((x) => x.name === 'teleportRigidBody').defaults, {
        preserveVelocity: false,
        wake: true,
    });
    assert.equal(api.damping.c1MeansZeroVelocity, false);
    assert(api.prepareOrder.indexOf('selected 2D prepare') < api.prepareOrder.indexOf('selected 3D prepare'));
    assert(api.prepareOrder.indexOf('selected 3D prepare') < api.prepareOrder.indexOf('game.init'));
});
