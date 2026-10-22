const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {
    ROOT,
    INPUTS,
    OUTPUT,
    readInputs,
    validatePolicy,
    generateInventory,
    validateInventory,
    categoryReadiness,
    serialize,
} = require('./inventory-expansion.cjs');

const inputs = readInputs();
const inventory = generateInventory(inputs);
const clone = (value) => structuredClone(value);
const cellsFor = (id) => inventory.candidateCells.filter((row) => row.testId === id);
const set = (values) => [...new Set(values)].sort();
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const rejectInventoryMutation = (mutate) => {
    const bad = clone(inventory);
    mutate(bad);
    assert.throws(() => validateInventory(bad, inputs), /Inventory differs/);
};

// These are inventory-tool tests. None execute or certify a physics acceptance ID.
test('all original categories, fixed subcases and auxiliary IDs are retained exactly', () => {
    assert.deepEqual(inventory.sourceCounts, { parentCategories: 91, fixedSubcases: 84, auxiliaryTests: 2 });
    assert.equal(inventory.sourceReferences.length, 177);
    assert.equal(new Set(inventory.sourceReferences.map((row) => row.id)).size, 177);
    const expected = [
        ...inputs.design.parentCategories,
        ...inputs.design.requiredSubcaseDesign,
        ...inputs.design.auxiliaryRequiredTests,
    ];
    assert.deepEqual(set(inventory.sourceReferences.map((row) => row.id)), set(expected.map((row) => row.id)));
    const mentioned = new Set(
        inputs.reference.match(/\b(?:B3-(?:C|I|U|A|P|AG|BIZ)\d{2}|WASM-\d{2})(?:-[A-Z0-9]+)*(?![A-Z0-9-])/g),
    );
    for (const id of mentioned)
        assert(
            inventory.sourceReferences.some((row) => row.id === id),
            id,
        );
});

test('snapshot is byte-identical to deterministic complete expansion', () => {
    assert.equal(fs.readFileSync(path.join(ROOT, OUTPUT), 'utf8'), serialize(inventory));
    assert.equal(validateInventory(inventory, inputs), true);
    assert.equal(
        inventory.candidateRequiredCellCount,
        2128,
        'Candidate revision changed: review dimensions explicitly',
    );
    assert.equal(inventory.executionDefinitions.length, 186);
    assert.equal(new Set(inventory.candidateCells.map((row) => row.cellId)).size, 2128);
});

test('every explicit definition expands to every environment/variant/build Cartesian cell', () => {
    let expectedCount = 0;
    for (const def of inputs.policy.definitions) {
        const keys = [];
        for (const env of def.environmentIds) {
            for (const variant of def.variantIds) {
                for (const build of def.buildProfileIds) keys.push([def.caseKey, env, variant, build].join('|'));
            }
        }
        expectedCount += keys.length;
        assert.deepEqual(
            set(inventory.candidateCells.filter((row) => row.caseKey === def.caseKey).map((row) => row.cellId)),
            set(keys),
            def.caseKey,
        );
    }
    assert.equal(inventory.candidateRequiredCellCount, expectedCount);
});

test('parents are aggregation only and additive children cannot erase original parent assertions', () => {
    const keys = new Set(inventory.executionDefinitions.map((row) => row.caseKey));
    for (const parent of inventory.sourceReferences.filter((row) => row.referenceKind === 'parent-category')) {
        assert.equal(parent.aggregateOnly, true);
        assert.equal(parent.countedAsAdditionalExecutableCell, false);
        assert(parent.requiredCellIds.length > 0, parent.id);
        assert.equal(parent.status, 'NOT_RUN');
    }
    for (const id of inputs.policy.parentRemainderTestIds) assert(keys.has(`${id}::parent-table-remainder`), id);
    for (const id of ['WASM-13-AIR-ST', 'B3-C28-SENSOR-CCD']) {
        assert.equal(cellsFor(id).length, 0, 'Intermediate aggregate must not be counted twice');
        assert(inventory.sourceReferences.find((row) => row.id === id).requiredCellIds.length > 0);
    }
    assert.equal(cellsFor('WASM-15').length, 0);
    assert.equal(inventory.sourceReferences.find((row) => row.id === 'WASM-15').requiredCellIds.length, 89);
});

test('every fixed child reaches its own source reference and original parent aggregate', () => {
    for (const child of inputs.design.requiredSubcaseDesign) {
        const reference = inventory.sourceReferences.find((row) => row.id === child.id);
        const parent = inventory.sourceReferences.find((row) => row.id === child.parent);
        assert(reference.requiredCellIds.length > 0, child.id);
        for (const id of reference.requiredCellIds) assert(parent.requiredCellIds.includes(id), `${child.id}: ${id}`);
    }
});

test('six actual platform classes and distinct ST HOST/DEVICE coverage cannot be replaced by emulation', () => {
    assert.deepEqual(
        set(inputs.resources.requiredEnvironmentIds),
        set(inventory.environmentDefinitions.slice(0, 6).map((row) => row.id)),
    );
    assert.deepEqual(set(cellsFor('WASM-13-AIR-ST-HOST').map((row) => row.environmentId)), [
        'HOST-CHROME',
        'HOST-NODE',
    ]);
    assert.deepEqual(set(cellsFor('WASM-13-AIR-ST-DEVICE').map((row) => row.environmentId)), [
        'ANDROID-WEBVIEW',
        'DESKTOP-FIREFOX',
        'DESKTOP-SAFARI',
        'IOS-SAFARI',
    ]);
    assert(cellsFor('WASM-13-AIR-ST-DEVICE').every((row) => row.variantId === 'st'));
    assert(!inventory.environmentDefinitions.some((row) => /emulat|playwright|webkit/i.test(row.id)));
});

test('real resource blockers preserve exact known assignment, access, reason and recovery condition', () => {
    assert.deepEqual(inventory.resourcePlanSnapshot.resources.slice(0, 7), inputs.resources.resources);
    const map = new Map(inventory.resourcePlanSnapshot.resources.map((row) => [row.id, row]));
    for (const row of inventory.candidateCells) {
        assert.deepEqual(
            row.blockedResourceIds,
            row.resourceIds.filter((id) => map.get(id).status !== 'AVAILABLE'),
        );
    }
    assert.equal(inventory.summary.cellsWithResourceBlockers, 2056);
    for (const id of ['DESKTOP-SAFARI', 'ANDROID-WEBVIEW', 'IOS-SAFARI', 'BIZ07-FIRST-TIME-USERS']) {
        assert.equal(map.get(id).status, 'BLOCKED');
        assert.equal(map.get(id).assignment, 'UNASSIGNED');
        assert(map.get(id).reason.length > 30);
        assert(map.get(id).recoveryCondition.length > 20);
    }
});

test('resource or fixture unreadiness is not conflated with denominator technical freeze', () => {
    assert.deepEqual(inventory.denominatorDecisionIds, [
        'D01-ENVIRONMENT-SCOPE',
        'D02-MT-POSITIVE-TARGETS',
        'D03-DEBUG-RELEASE-CRITICAL',
        'D06-AGGREGATION-AND-CELL-KEY',
    ]);
    assert(inventory.readinessDecisions.every((row) => row.doesNotBlockEnumeratedDenominator === true));
    assert(!inventory.denominatorDecisionIds.includes('D05-FIXTURE-FREEZE'));
    assert(!inventory.denominatorDecisionIds.includes('D07-AGENT-AND-HUMAN-ASSIGNMENT'));
    assert.equal(inventory.inventoryFrozen, false, 'The author has not received technical review of this candidate');
    assert.equal(inventory.expandedRequiredCellCount, null);
});

test('positive MT candidates, legal-count coverage and fallback checks remain distinct', () => {
    const mt = inventory.candidateCells.filter((row) => row.variantId.startsWith('mt'));
    const positive = mt.filter((row) => row.positiveMtExecutionRequired);
    assert.equal(mt.length, 1349);
    assert.equal(positive.length, 1331);
    assert(positive.every((row) => row.variantExecutionRequirement.startsWith('POSITIVE_REAL_MT_EXECUTION_REQUIRED')));
    assert(positive.every((row) => row.pendingDecisionIds.includes('D02-MT-POSITIVE-TARGETS')));
    assert.deepEqual(
        set(cellsFor('WASM-13-AIR-MT').map((row) => row.environmentId)),
        set(inputs.resources.requiredEnvironmentIds),
    );
    assert.deepEqual(set(cellsFor('WASM-14-MT').map((row) => row.workerCount)), [2, 3, 4]);
    assert.deepEqual(set(cellsFor('B3-A06').map((row) => row.workerCount)), [1, 2, 4]);
    assert.equal(inventory.mtTargetReview.length, 6);
    assert.equal(
        inventory.mtTargetReview.reduce((n, row) => n + row.candidateCellCount, 0),
        mt.length,
    );
    for (const row of inventory.mtTargetReview) {
        assert(row.rationale.length > 50);
        assert(row.requiredVerification.length >= 3);
        assert(row.affectedCaseKeys.length > 0);
        assert.equal(row.candidateCellCount, row.positiveRuntimeCellCount + row.nonRuntimeOrNegativeMtCellCount);
        assert.equal(row.status, 'POSITIVE_TARGET_PROPOSAL_NOT_COMPATIBILITY_CLAIM');
    }
});

test('Debug/Release critical coverage is explicit and still needs technical review', () => {
    for (const id of inputs.policy.criticalDebugReleaseTestIds) {
        assert.deepEqual(set(cellsFor(id).map((row) => row.buildProfileId)), ['debug', 'release'], id);
        assert(cellsFor(id).every((row) => row.pendingDecisionIds.includes('D03-DEBUG-RELEASE-CRITICAL')));
    }
    assert.equal(inventory.summary.byBuildProfile.debug, 176);
});

test('fixture introduction, platform matrix, MT phase, checkpoints and final G8 stay separate', () => {
    for (const cell of inventory.candidateCells) {
        assert.equal(cell.finalGate, 'G8');
        assert.equal(cell.firstGate, cell.firstPhase.replace('M', 'G'));
        if (cell.variantId.startsWith('mt')) assert(Number(cell.firstPhase.slice(1)) >= 6);
    }
    assert.equal(
        cellsFor('B3-C01-TIME').find((row) => row.environmentId === 'HOST-CHROME' && row.variantId === 'st').firstGate,
        'G2',
    );
    assert.equal(
        cellsFor('B3-C01-EVENTS').find((row) => row.environmentId === 'HOST-CHROME' && row.variantId === 'st')
            .firstGate,
        'G3',
    );
    assert.equal(
        cellsFor('B3-C01-TIME').find((row) => row.environmentId === 'IOS-SAFARI' && row.variantId === 'st').firstGate,
        'G5',
    );
    for (const point of inventory.technicalCheckpoints) {
        assert.equal(point.isGate, false);
        assert.equal(point.status, 'NOT_RUN');
        assert(point.cannotComplete.includes('G5'));
        assert(point.requiredCellIds.length > 0);
        assert(
            !point.requiredCellIds.some(
                (id) => id.includes('B3-BIZ07') || id.includes('ST-DEVICE') || id.includes('|mt'),
            ),
        );
    }
});

test('BIZ07 keeps all required device QA plus one independent three-person cohort', () => {
    const rows = cellsFor('B3-BIZ07');
    assert.equal(rows.length, 4);
    assert.deepEqual(set(rows.map((row) => row.environmentId)), [
        'ANDROID-WEBVIEW',
        'HOST-CHROME',
        'HUMAN-COHORT-UNASSIGNED',
        'IOS-SAFARI',
    ]);
    const cohort = rows.find((row) => row.environmentId === 'HUMAN-COHORT-UNASSIGNED');
    assert(cohort.resourceIds.includes('BIZ07-FIRST-TIME-USERS'));
    assert(cohort.evidenceRequirementIds.includes('FIRST_TIME_HUMANS'));
    assert.equal(inventory.environmentDefinitions.at(-1).deviceAllocation, 'PENDING_D07_NOT_A_VIRTUAL_DEVICE');
    assert(inventory.evidenceRequirements.FIRST_TIME_HUMANS.some((text) => /three actual/.test(text)));
    assert(
        inventory.evidenceRequirements.FIRST_TIME_HUMANS.some((text) =>
            /two first orders unaided within 90 seconds/.test(text),
        ),
    );
});

test('EX09 business, performance and independent-theme acceptance remain ST', () => {
    for (const row of inventory.candidateCells.filter(
        (cell) => /^B3-BIZ/.test(cell.testId) || ['B3-P07', 'B3-AG05'].includes(cell.testId),
    )) {
        assert.equal(row.variantId, 'st', row.cellId);
    }
    assert(inventory.evidenceRequirements.PACK_CONSUMER.some((text) => /EX09 always ST/.test(text)));
    const core = inventory.executionDefinitions.find((row) => row.caseKey === 'B3-I08::core-examples');
    const advanced = inventory.executionDefinitions.find((row) => row.caseKey === 'B3-I08::advanced-examples');
    assert.deepEqual(core.exampleIds, ['EX01', 'EX02', 'EX03', 'EX04', 'EX05', 'EX06', 'EX09']);
    assert.deepEqual(advanced.exampleIds, ['EX07', 'EX08']);
    assert.equal(core.firstPhase, 'M5');
    assert.equal(advanced.firstPhase, 'M6');
});

test('performance cells preserve nine profiles and real browser/device scopes without fake baselines', () => {
    assert.deepEqual(
        set(inventory.executionDefinitions.map((row) => row.performanceProfileId).filter(Boolean)),
        set(inputs.budgets.profiles.map((row) => row.id)),
    );
    for (const def of inventory.executionDefinitions.filter((row) => row.performanceProfileId)) {
        const source = inputs.budgets.profiles.find((row) => row.id === def.performanceProfileId);
        assert.deepEqual(def.environmentIds, source.resources);
        assert(!def.environmentIds.includes('HOST-NODE'));
        const spec = inventory.fixtureSpecifications.find((row) => row.fixtureSpecId === def.fixtureSpecId);
        assert.deepEqual(spec.performanceProfile, source);
        assert.equal(spec.performanceProfile.baselineArtifactStatus, 'NOT_ESTABLISHED');
    }
    assert.deepEqual(set(cellsFor('B3-P07').map((row) => row.environmentId)), [
        'ANDROID-WEBVIEW',
        'HOST-CHROME',
        'IOS-SAFARI',
    ]);
});

test('all fixture assertions trace to exact immutable source lines and no executable proof is invented', () => {
    const lines = inputs.reference.split('\n');
    assert.equal(inventory.fixtureSpecifications.length, inventory.executionDefinitions.length);
    for (const fixture of inventory.fixtureSpecifications) {
        assert(fixture.sourceAssertionLines.length > 0, fixture.fixtureSpecId);
        for (const row of fixture.sourceAssertionLines) assert.equal(row.text, lines[row.line - 1]);
        assert.equal(fixture.fixtureHash, null);
        assert.equal(fixture.executableFixturePath, null);
        assert.equal(fixture.independentOracleHash, null);
        assert.deepEqual(fixture.acceptedEvidence, []);
    }
    for (const id of ['B3-C16-SAMPLED-PEAK', 'B3-C16-SUSTAINED-DURATION-1']) {
        const spec = inventory.fixtureSpecifications.find((row) => row.testId === id);
        assert.deepEqual(spec.c16DurationContract, inputs.api.c16Duration);
        assert.equal(spec.c16DurationContract.sustainedMinimumConsecutiveSamples, 7);
        assert.equal(spec.testIdOrigin, 'REBUILD_INVENTORY_ADDITION_NOT_AN_ORIGINAL_PLAN_QUOTE');
    }
});

test('narrow real-node results and aggregate-only evidence cannot promote a parent or Gate', () => {
    assert.equal(inventory.historicalAcceptanceImported, false);
    assert.equal(inventory.currentNarrowFixtureAcceptanceImported, false);
    assert.equal(inventory.summary.statuses.PASS, 0);
    assert.equal(inventory.gateStatus, 'NOT_RUN');
    for (const row of inventory.sourceReferences) {
        const result = categoryReadiness(inventory, row.id);
        assert.equal(result.status, 'NOT_RUN');
        assert.equal(result.acceptanceReady, false);
    }
    assert(inventory.candidateCells.every((row) => row.evidence.length === 0 && row.executedAt === null));
});

test('source provenance hashes cover actual bytes, not just file names', () => {
    for (const input of inventory.sourceInputs)
        assert.equal(input.sha256, sha(fs.readFileSync(path.join(ROOT, input.path))));
    const changed = clone(inputs);
    changed.bytes.reference += '\n';
    assert.notEqual(
        generateInventory(changed).sourceInputs.find((row) => row.id === 'reference').sha256,
        inventory.sourceInputs.find((row) => row.id === 'reference').sha256,
    );
});

test('generator is checkout-location independent and does not read evidence directories', () => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'box3d-inventory-expansion-'));
    try {
        for (const file of Object.values(INPUTS)) {
            fs.mkdirSync(path.dirname(path.join(elsewhere, file)), { recursive: true });
            fs.copyFileSync(path.join(ROOT, file), path.join(elsewhere, file));
        }
        assert.equal(serialize(generateInventory(readInputs(elsewhere))), serialize(inventory));
        assert(!serialize(inventory).includes(ROOT));
        assert(!serialize(inventory).includes(elsewhere));
    } finally {
        fs.rmSync(elsewhere, { recursive: true, force: true });
    }
});

test('missing required cells, references, variants or proof requirements are rejected', () => {
    rejectInventoryMutation((bad) => bad.candidateCells.pop());
    rejectInventoryMutation((bad) => bad.sourceReferences.splice(0, 1));
    rejectInventoryMutation((bad) => {
        bad.candidateCells[0].required = false;
    });
    rejectInventoryMutation((bad) => {
        bad.candidateCells[0].evidenceRequirementIds = [];
    });
    rejectInventoryMutation((bad) => {
        bad.candidateCells[0].fixtureSpecId = 'one-small-fixture';
    });
    rejectInventoryMutation((bad) => {
        bad.candidateCells[0].artifactVariant = 'unsupported';
    });
});

test('invented approval, imported PASS, fake resource availability and denominator relabeling are rejected', () => {
    rejectInventoryMutation((bad) => {
        bad.inventoryFrozen = true;
        bad.expandedRequiredCellCount = bad.candidateRequiredCellCount;
    });
    rejectInventoryMutation((bad) => {
        bad.decisions[0].approvalEvidence = 'approved';
    });
    rejectInventoryMutation((bad) => {
        bad.candidateCells[0].executionStatus = 'PASS';
        bad.candidateCells[0].evidence = ['old-node-report'];
    });
    rejectInventoryMutation((bad) => {
        bad.resourcePlanSnapshot.resources.find((row) => row.id === 'IOS-SAFARI').status = 'AVAILABLE';
    });
    rejectInventoryMutation((bad) => {
        bad.sourceReferences[0].requiredCellIds = [bad.sourceReferences[0].requiredCellIds[0]];
    });
});

test('policy cannot silently drop device, positive MT, original remainder, auxiliary or critical coverage', () => {
    for (const mutate of [
        (bad) => {
            bad.policy.definitions.find((row) => row.testId === 'WASM-13-AIR-ST-DEVICE').environmentIds.pop();
        },
        (bad) => {
            bad.policy.definitions.find((row) => row.caseKey === 'B3-C04::parent-table-remainder').caseKey =
                'forgotten-remainder';
        },
        (bad) => {
            bad.policy.definitions = bad.policy.definitions.filter((row) => row.testId !== 'B3-U02');
        },
        (bad) => {
            bad.policy.definitions.find((row) => row.testId === 'B3-C24').buildProfileIds = ['release'];
        },
        (bad) => {
            bad.policy.definitions.find((row) => row.testId === 'WASM-13-AIR-MT').variantIds = ['unsupported'];
        },
        (bad) => {
            bad.policy.definitions.find((row) => row.testId === 'WASM-13-AIR-MT').environmentIds.pop();
        },
        (bad) => {
            bad.policy.definitions.find((row) => row.testId === 'WASM-14-MT').variantIds = ['mt2', 'mt4'];
        },
    ]) {
        const bad = clone(inputs);
        mutate(bad);
        assert.throws(() => validatePolicy(bad));
    }
});
