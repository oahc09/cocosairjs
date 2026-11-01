/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Read-only recovery of the frozen historical denominator. Never qualifies current APIs or changes v1 hashes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    ROOT,
    FILES,
    PINNED_V1_BYTES,
    digest,
    validateDocuments,
    resolveDocuments,
} = require('./inventory-freeze-v1.cjs');

const HISTORICAL_INPUTS = Object.freeze({
    'docs/physics/box3d/contracts/api-contract.json': 'docs/physics/box3d/contracts/archive/api-contract-v1.json',
});

function loadHistoricalV1(root = ROOT) {
    const read = (file, expected) => {
        assert(!path.isAbsolute(file) && !file.split('/').includes('..'), 'Unsafe historical input path');
        const storedPath = HISTORICAL_INPUTS[file] ?? file;
        const bytes = fs.readFileSync(path.join(root, storedPath));
        assert.equal(digest(bytes), expected, `Historical v1 input drift: ${file} (${storedPath})`);
        return bytes;
    };
    const pinned = Object.fromEntries(Object.entries(PINNED_V1_BYTES).map(([file, hash]) => [file, read(file, hash)]));
    const documents = Object.fromEntries(Object.entries(FILES).map(([id, file]) => [id, JSON.parse(pinned[file])]));
    for (const input of documents.candidate.sourceInputs) read(input.path, input.sha256);
    validateDocuments(documents);
    return documents;
}

if (require.main === module) {
    assert.deepEqual(
        process.argv.slice(2),
        ['--check'],
        'Use --check; historical recovery has no write/repair operation.',
    );
    const resolved = resolveDocuments(loadHistoricalV1());
    console.log(
        JSON.stringify({
            status: 'VERIFIED_HISTORICAL_V1_ONLY',
            requiredCells: resolved.requiredCells.length,
            gateStatus: resolved.gateStatus,
            historicalInputs: HISTORICAL_INPUTS,
            currentImplementationQualified: false,
        }),
    );
}

module.exports = { HISTORICAL_INPUTS, loadHistoricalV1 };
