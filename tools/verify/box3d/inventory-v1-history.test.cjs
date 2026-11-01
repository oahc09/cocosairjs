/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Historical integrity only; no native execution or current capability acceptance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ROOT, FILES, PINNED_V1_BYTES, resolveDocuments, loadFrozenV1 } = require('./inventory-freeze-v1.cjs');
const { HISTORICAL_INPUTS, loadHistoricalV1 } = require('./inventory-v1-history.cjs');
const expansion = require('./inventory-expansion.cjs');

test('original v1 inputs recover every required cell while current API bytes remain distinct', () => {
    const documents = loadHistoricalV1();
    const resolved = resolveDocuments(documents);
    assert.equal(resolved.requiredCells.length, 2128);
    assert.equal(resolved.executionDefinitions.length, 186);
    assert(resolved.requiredCells.every((cell) => cell.executionStatus === 'NOT_RUN' && cell.evidence.length === 0));
    assert.equal(resolved.gateStatus, 'NOT_RUN');
    assert.equal(
        documents.candidate.sourceInputs.find((row) => row.id === 'api').sha256,
        '0e53683159e025ecdf07ae495abcf54e902529b51c6938ce3717fab4dd6e7fc9',
    );
    assert.equal(
        JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/physics/box3d/contracts/api-contract.json'))).contractVersion,
        'box3d-rebuild-contract-2',
    );
    assert.throws(() => loadFrozenV1(), /Pinned v1 bytes changed: docs\/physics\/box3d\/contracts\/api-contract.json/);

    const inputs = expansion.readInputs();
    inputs.bytes.api = fs.readFileSync(path.join(ROOT, HISTORICAL_INPUTS[expansion.INPUTS.api]), 'utf8');
    inputs.api = JSON.parse(inputs.bytes.api);
    assert.equal(
        expansion.serialize(expansion.generateInventory(inputs)),
        fs.readFileSync(path.join(ROOT, FILES.candidate), 'utf8'),
    );
});

test('historical archive is portable and missing or changed original bytes still reject', () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'box3d-v1-history-'));
    const documents = loadHistoricalV1();
    const paths = new Set([
        ...Object.keys(PINNED_V1_BYTES),
        ...documents.candidate.sourceInputs.map((row) => row.path),
    ]);
    try {
        for (const file of paths) {
            const storedPath = HISTORICAL_INPUTS[file] ?? file;
            const target = path.join(temporary, storedPath);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(path.join(ROOT, storedPath), target);
        }
        assert.deepEqual(resolveDocuments(loadHistoricalV1(temporary)), resolveDocuments(documents));
        const archived = path.join(temporary, Object.values(HISTORICAL_INPUTS)[0]);
        const bytes = fs.readFileSync(archived);
        fs.appendFileSync(archived, '\n');
        assert.throws(() => loadHistoricalV1(temporary), /Historical v1 input drift/);
        fs.unlinkSync(archived);
        assert.throws(() => loadHistoricalV1(temporary), { code: 'ENOENT' });
        fs.writeFileSync(archived, bytes);
        const candidate = path.join(temporary, FILES.candidate);
        fs.appendFileSync(candidate, '\n');
        assert.throws(() => loadHistoricalV1(temporary), /Historical v1 input drift/);
    } finally {
        // Only this test's directly allocated temporary directory is removed.
        assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});
